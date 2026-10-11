// Kiska Kachra: whose trash is this?
// Zero-shot CLIP (Transformers.js) runs in the browser; nothing is uploaded.

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const STORE_KEY = 'kiska-kachra-v1';

// Brands commonly found as litter in India. Add yours with a pull request.
const BRANDS = [
  "Lay's", 'Kurkure', 'Bingo', 'Uncle Chipps', "Haldiram's", 'Balaji', 'Parle-G',
  'Britannia', 'Sunfeast', 'Maggi', 'Cadbury Dairy Milk', 'KitKat', 'Amul',
  'Mother Dairy', 'Coca-Cola', 'Pepsi', 'Thums Up', 'Sprite', 'Fanta', 'Limca',
  'Mountain Dew', '7Up', 'Maaza', 'Frooti', 'Slice', 'Bisleri', 'Kinley',
  'Aquafina', 'Red Bull', 'Sting', 'Paper Boat', 'Real', 'Tropicana',
  'Gold Flake', 'Classic', 'Rajnigandha', 'Vimal', "McDonald's", "Domino's",
  'Swiggy', 'Zomato', 'Starbucks', 'Chai Point'
];
const UNKNOWN = 'Unbranded / unreadable';

const ITEMS = [
  ['chips / snack packet', 'a crumpled chips or snack packet'],
  ['plastic bottle', 'a plastic drink bottle'],
  ['glass bottle', 'a glass bottle'],
  ['aluminium can', 'an aluminium drink can'],
  ['candy / biscuit wrapper', 'a candy or biscuit wrapper'],
  ['tetra pak / juice box', 'a tetra pak juice box'],
  ['paper / plastic cup', 'a disposable cup'],
  ['plastic bag', 'a plastic carry bag'],
  ['food container / box', 'a takeaway food container'],
  ['cigarette pack / butt', 'a cigarette pack or cigarette butt'],
  ['gutka / pan masala sachet', 'a small gutka or pan masala sachet'],
  ['other', 'a piece of trash'],
];

const $ = (id) => document.getElementById(id);
const mock = new URLSearchParams(location.search).has('mock');

let classifier = null;
let current = null; // { brand, item }

// ---------- storage ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { entries: [] }; }
  catch { return { entries: [] }; }
}
function save(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
let state = load();

// ---------- model ----------
function setStatus(text, pct) {
  $('model-status').textContent = text;
  if (pct != null) $('model-bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
}

async function loadModel() {
  if (mock) {
    classifier = async (_img, labels) =>
      labels.map((label, i) => ({ label, score: i === 0 ? 0.6 : 0.4 / labels.length }));
    return ready();
  }
  let mod;
  try {
    mod = await import(TRANSFORMERS_URL);
  } catch (e) {
    setStatus('Could not download the AI library. Check your internet and reload. (' + e.message + ')');
    return;
  }
  const { pipeline, env } = mod;
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const files = {};
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let loaded = 0, total = 0;
      for (const [l, t] of Object.values(files)) { loaded += l; total += t; }
      setStatus(`Downloading the AI model… ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB (one time only)`,
        (loaded / total) * 100);
    } else if (p.status === 'ready') {
      setStatus('Starting the AI…', 100);
    }
  };

  try {
    // Quantized (q8) on WASM: about 90 MB and runs on almost any phone. WebGPU is
    // skipped on purpose: its fp32 weights are much larger and support is patchy.
    classifier = await pipeline('zero-shot-image-classification', MODEL_ID, { progress_callback });
    ready();
  } catch (e) {
    console.error(e);
    setStatus('The AI model failed to load: ' + e.message + '. Reload to retry. You can still log litter by hand below.');
    enableSnap();
  }
}

function enableSnap() {
  $('snap').classList.remove('disabled');
  $('snap').removeAttribute('aria-disabled');
  $('photo').disabled = false;
}

function ready() {
  setStatus('✅ AI ready, running on your phone. Works offline from now on.', 100);
  enableSnap();
  setTimeout(() => { $('model-card').hidden = true; }, 2500);
}

// Downscale the photo; CLIP only needs 224px, and phones produce 12 MP images.
function toSmallDataURL(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = 448 / Math.max(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * Math.min(1, s));
      c.height = Math.round(img.height * Math.min(1, s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
    img.src = url;
  });
}

async function classify(dataURL) {
  const brandPrompts = BRANDS.map((b) => `a photo of a ${b} logo on litter`);
  brandPrompts.push('a photo of plain litter with no brand or logo');
  const itemPrompts = ITEMS.map(([, p]) => `a photo of ${p}`);

  const b = await classifier(dataURL, brandPrompts, { hypothesis_template: '{}' });
  const i = await classifier(dataURL, itemPrompts, { hypothesis_template: '{}' });

  const brandOf = (label) => {
    const k = brandPrompts.indexOf(label);
    return k < BRANDS.length ? BRANDS[k] : UNKNOWN;
  };
  const itemOf = (label) => ITEMS[itemPrompts.indexOf(label)][0];

  return {
    brands: b.sort((x, y) => y.score - x.score).slice(0, 4).map((r) => ({ name: brandOf(r.label), score: r.score })),
    items: i.sort((x, y) => y.score - x.score).slice(0, 3).map((r) => ({ name: itemOf(r.label), score: r.score })),
  };
}

// ---------- UI ----------
function chips(el, options, key) {
  el.innerHTML = '';
  for (const o of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (current[key] === o.name ? ' on' : '');
    btn.innerHTML = '';
    btn.append(o.name);
    if (o.score != null) {
      const s = document.createElement('small');
      s.textContent = ` ${Math.round(o.score * 100)}%`;
      btn.append(s);
    }
    btn.onclick = () => {
      current[key] = o.name;
      if (key === 'brand') $('brand-other').value = '';
      for (const c of el.children) c.classList.toggle('on', c === btn);
    };
    el.append(btn);
  }
}

$('photo').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  $('result').hidden = false;
  $('answer').hidden = true;
  $('thinking').hidden = false;
  $('thinking').textContent = 'Looking at it…';
  $('result').scrollIntoView({ behavior: 'smooth' });

  let guess;
  try {
    const dataURL = await toSmallDataURL(file);
    $('preview').src = dataURL;
    if (classifier) {
      const t0 = performance.now();
      guess = await classify(dataURL);
      $('thinking').textContent = `AI's guess (${((performance.now() - t0) / 1000).toFixed(1)}s). Tap to correct it, then log it.`;
    }
  } catch (e) {
    console.error(e);
    $('thinking').textContent = 'The AI could not read this photo (' + e.message + '). Pick the brand by hand.';
  }
  if (!guess) {
    guess = { brands: [], items: [] };
    if (!classifier) $('thinking').textContent = 'AI not loaded. Pick the brand by hand.';
  }

  current = { brand: guess.brands[0]?.name || null, item: guess.items[0]?.name || null };
  const brandOpts = [...guess.brands];
  if (!brandOpts.some((o) => o.name === UNKNOWN)) brandOpts.push({ name: UNKNOWN });
  const itemOpts = [...guess.items];
  for (const [name] of ITEMS) if (!itemOpts.some((o) => o.name === name)) itemOpts.push({ name });

  chips($('brand-chips'), brandOpts, 'brand');
  chips($('item-chips'), itemOpts, 'item');
  $('brand-other').value = '';
  $('answer').hidden = false;
});

$('brand-other').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  if (v) {
    current.brand = v;
    for (const c of $('brand-chips').children) c.classList.remove('on');
  }
});

$('log-btn').addEventListener('click', () => {
  if (!current?.brand) { alert('Pick a brand first, or choose "' + UNKNOWN + '".'); return; }
  state.entries.push({ t: new Date().toISOString(), brand: current.brand, item: current.item || 'other' });
  save(state);
  current = null;
  $('result').hidden = true;
  render();
  if (navigator.vibrate) navigator.vibrate(40);
});

$('skip-btn').addEventListener('click', () => { current = null; $('result').hidden = true; });

$('reset-btn').addEventListener('click', () => {
  if (state.entries.length && !confirm('Start a new walk? This clears today\'s tally (export the CSV first if you want it).')) return;
  state = { entries: [] };
  save(state);
  render();
});

function tally() {
  const m = new Map();
  for (const e of state.entries) m.set(e.brand, (m.get(e.brand) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function render() {
  const rows = tally();
  const n = state.entries.length;
  $('total').textContent = n;
  $('empty').hidden = n > 0;
  const max = rows[0]?.[1] || 1;
  $('board').innerHTML = '';
  for (const [brand, count] of rows) {
    const li = document.createElement('li');
    const name = document.createElement('span'); name.textContent = brand;
    const c = document.createElement('strong'); c.textContent = count;
    const bar = document.createElement('div'); bar.className = 'b'; bar.style.width = (count / max) * 100 + '%';
    li.append(name, c, bar);
    $('board').append(li);
  }
  $('log').innerHTML = '';
  for (const e of [...state.entries].reverse()) {
    const li = document.createElement('li');
    li.textContent = `${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${e.brand}, ${e.item}`;
    $('log').append(li);
  }
}

function reportText() {
  const rows = tally();
  const n = state.entries.length;
  const top = rows.filter(([b]) => b !== UNKNOWN).slice(0, 5).map(([b, c]) => `${b}: ${c}`).join('\n');
  return `I picked up ${n} pieces of litter on my walk today. Whose trash was it?\n\n${top || '(no brands identified)'}\n\nBrands: your packaging is on our streets. #KiskaKachra #BreakFreeFromPlastic`;
}

$('share-btn').addEventListener('click', async () => {
  if (!state.entries.length) { alert('Log some litter first!'); return; }
  const text = reportText();
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); alert('Report copied. Paste it anywhere.'); }
  catch { prompt('Copy your report:', text); }
});

$('csv-btn').addEventListener('click', () => {
  const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const csv = 'time,brand,item\n' + state.entries.map((e) => [e.t, e.brand, e.item].map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `kiska-kachra-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

render();
loadModel();

if ('serviceWorker' in navigator && !mock) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
}
