// On-device zero-shot recognizer built on the open-weight CLIP model.
//
// Text prompts for every brand / item are embedded ONCE (and cached in
// localStorage), so each photo only needs one pass of the vision encoder.

import {
  env, AutoTokenizer, AutoProcessor, RawImage,
  CLIPTextModelWithProjection, CLIPVisionModelWithProjection,
} from './vendor/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
// Serve ONNX Runtime's WASM from this site instead of a CDN (works offline, no third party).
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;

export const DEFAULT_MODEL = 'Xenova/clip-vit-base-patch32';
export const NO_BRAND = 'Unbranded / unreadable';

const CACHE_PREFIX = 'kk-emb-v1:';

function normalize(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

function mean(vectors) {
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return normalize(out);
}

function softmax(xs) {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export class Recognizer {
  /**
   * @param {object} o
   * @param {object} o.labels  contents of data/labels.json
   * @param {string} [o.modelId]
   * @param {(p:{phase:string, loaded?:number, total?:number, done?:number, of?:number}) => void} [o.onProgress]
   */
  constructor({ labels, modelId = DEFAULT_MODEL, onProgress = () => {}, seed = true }) {
    this.labels = labels;
    this.modelId = modelId;
    this.onProgress = onProgress;
    this.seed = seed;
    this.seeded = new Map(); // cacheKey -> embedding, from data/embeddings/<model>.json
    this.files = {};
    this.classes = { brand: [], item: [] }; // [{ name, emb }]
    this.logitScale = 100; // CLIP's learned temperature
  }

  _fileProgress = (p) => {
    if (p.status === 'progress' && p.total) {
      this.files[p.file] = [p.loaded, p.total];
      let loaded = 0, total = 0;
      for (const [l, t] of Object.values(this.files)) { loaded += l; total += t; }
      this.onProgress({ phase: 'download', loaded, total });
    }
  };

  async _loadText() {
    if (!this.textModel) {
      const opts = { progress_callback: this._fileProgress };
      [this.tokenizer, this.textModel] = await Promise.all([
        AutoTokenizer.from_pretrained(this.modelId, opts),
        CLIPTextModelWithProjection.from_pretrained(this.modelId, { ...opts, dtype: 'q8' }),
      ]);
    }
  }

  async _embedTexts(texts) {
    await this._loadText();
    const out = [];
    const BATCH = 16;
    for (let i = 0; i < texts.length; i += BATCH) {
      const chunk = texts.slice(i, i + BATCH);
      const inputs = this.tokenizer(chunk, { padding: true, truncation: true });
      const { text_embeds } = await this.textModel(inputs);
      const dim = text_embeds.dims[1];
      for (let j = 0; j < chunk.length; j++) out.push(normalize(text_embeds.data.slice(j * dim, (j + 1) * dim)));
      this.onProgress({ phase: 'prompts', done: Math.min(i + BATCH, texts.length), of: texts.length });
    }
    return out;
  }

  _promptsFor(kind, name) {
    const L = this.labels;
    if (kind === 'item') return [`a photo of ${L.items.find(([n]) => n === name)[1]}`];
    if (name === NO_BRAND) return L.noBrandPrompts;
    return L.brandPrompts.map((t) => t.replace('{}', name));
  }

  _cacheKey(kind, name) {
    return CACHE_PREFIX + this.modelId + ':' + kind + ':' + hash(this._promptsFor(kind, name).join('|'));
  }

  /** Embed (or fetch from cache) the class vectors for the given [kind, name] pairs. */
  async _ensureClasses(pairs) {
    const missing = [];
    for (const [kind, name] of pairs) {
      if (this.classes[kind].some((c) => c.name === name)) continue;
      const key = this._cacheKey(kind, name);
      let emb = null;
      try {
        const hit = localStorage.getItem(key);
        if (hit) emb = new Float32Array(JSON.parse(hit));
        else if (this.seeded.has(key)) {
          emb = new Float32Array(this.seeded.get(key));
          // Keep a local copy so the app still starts offline even if the seed file isn't cached.
          localStorage.setItem(key, JSON.stringify(this.seeded.get(key)));
        }
      } catch {
        if (!emb && this.seeded.has(key)) emb = new Float32Array(this.seeded.get(key));
      }
      if (emb) this.classes[kind].push({ name, emb });
      else missing.push([kind, name]);
    }
    if (!missing.length) return;

    const texts = [], owners = [];
    for (const [kind, name] of missing) {
      for (const t of this._promptsFor(kind, name)) { texts.push(t); owners.push(`${kind}\u0000${name}`); }
    }
    const embs = await this._embedTexts(texts);
    for (const [kind, name] of missing) {
      const key = `${kind}\u0000${name}`;
      const emb = mean(embs.filter((_, i) => owners[i] === key));
      this.classes[kind].push({ name, emb });
      try {
        localStorage.setItem(this._cacheKey(kind, name), JSON.stringify(Array.from(emb, (x) => +x.toFixed(5))));
      } catch {}
    }
  }

  /** Text embeddings precomputed in CI for the built-in labels: the phone then
   *  only downloads the vision model. Stale or missing entries are computed here. */
  async _loadSeed() {
    if (!this.seed) return;
    try {
      const file = this.modelId.replace(/[^\w.-]+/g, '_') + '.json';
      const res = await fetch(new URL(`./data/embeddings/${file}`, import.meta.url));
      if (!res.ok) return;
      for (const [k, v] of Object.entries(await res.json())) this.seeded.set(k, v);
    } catch {}
  }

  /** Embeddings of all built-in labels, keyed like the cache (used by CI to write the seed file). */
  exportEmbeddings() {
    const out = {};
    for (const kind of ['brand', 'item']) {
      for (const c of this.classes[kind]) out[this._cacheKey(kind, c.name)] = Array.from(c.emb, (x) => +x.toFixed(5));
    }
    return out;
  }

  async init(extraBrands = []) {
    const opts = { progress_callback: this._fileProgress };
    [this.processor, this.visionModel] = await Promise.all([
      AutoProcessor.from_pretrained(this.modelId, opts),
      CLIPVisionModelWithProjection.from_pretrained(this.modelId, { ...opts, dtype: 'q8' }),
      this._loadSeed(),
    ]);
    await this._ensureClasses([
      ...[...this.labels.brands, NO_BRAND].map((b) => ['brand', b]),
      ...this.labels.items.map(([n]) => ['item', n]),
    ]);
    // Brands the user taught it: nice to have, never a reason to fail (e.g. offline).
    for (const b of extraBrands) {
      try { await this._ensureClasses([['brand', b]]); } catch (e) { console.warn('could not learn', b, e); }
    }
    this.onProgress({ phase: 'ready' });
  }

  /** Teach the recognizer a brand the user typed. */
  async addBrand(name) {
    await this._ensureClasses([['brand', name]]);
  }

  /** @param {string|Blob} image  data URL, URL or Blob */
  async classify(image) {
    const t0 = performance.now();
    const img = image instanceof Blob ? await RawImage.fromBlob(image) : await RawImage.read(image);
    const inputs = await this.processor(img);
    const { image_embeds } = await this.visionModel(inputs);
    const v = normalize(image_embeds.data);

    const rank = (list) => {
      const logits = list.map((c) => {
        let s = 0;
        for (let i = 0; i < v.length; i++) s += v[i] * c.emb[i];
        return s * this.logitScale;
      });
      return softmax(logits)
        .map((score, i) => ({ name: list[i].name, score }))
        .sort((a, b) => b.score - a.score);
    };
    return { brands: rank(this.classes.brand), items: rank(this.classes.item), ms: performance.now() - t0 };
  }
}
