// Kiska Kachra: whose trash is this?
// UI + storage. The AI lives in ai.js and runs entirely in this browser.

import { shrink } from './image.js';

const STORE_KEY = 'kiska-kachra-v1';
// Below this probability the AI's top guess is not pre-selected; the user picks.
// Chosen from the calibration table in eval/RESULTS.md: at 0.5 a pre-selected
// brand was right about 9 times in 10 (at 0.35 only about 7 in 10).
const CONFIDENT = 0.5;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mock = params.has('mock');

let labels, recognizer = null, NO_BRAND = 'Unbranded / unreadable';
let current = null; // { brand, item, typed }

// ---------- storage ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.entries)) return { customBrands: [], ...s };
  } catch {}
  return { entries: [], customBrands: [] };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
let state = load();

// ---------- model ----------
function setStatus(text, pct) {
  $('model-status').textContent = text;
  if (pct != null) $('model-bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
}
const mb = (b) => (b / 1e6).toFixed(0);

let barPct = 0; // keep the bar monotonic: the total grows as new model files start downloading
function onProgress(p) {
  if (p.phase === 'download') {
    barPct = Math.max(barPct, (p.loaded / p.total) * 90);
    setStatus(p.total < 1e6
      ? 'Downloading the open-weight AI model…'
      : `Downloading the open-weight AI model… ${mb(p.loaded)} / ${mb(p.total)} MB (one time only, use Wi-Fi)`, barPct);
  } else if (p.phase === 'prompts') {
    setStatus(`Teaching the AI ${labels.brands.length} brands… ${p.done}/${p.of}`, 90 + (p.done / p.of) * 10);
  }
}

class MockRecognizer {
  async init() {}
  async addBrand() {}
  async classify() {
    const rank = (names) => names.map((name, i) => ({ name, score: i === 0 ? 0.62 : 0.38 / (names.length - 1) }));
    return {
      brands: rank([labels.brands[0], ...labels.brands.slice(1), NO_BRAND]),
      items: rank(labels.items.map(([n]) => n)),
      ms: 5,
    };
  }
}

async function loadModel() {
  setStatus('Loading the AI…', 2);
  try {
    if (mock) {
      recognizer = new MockRecognizer();
    } else {
      const ai = await import('./ai.js');
      NO_BRAND = ai.NO_BRAND;
      recognizer = new ai.Recognizer({ labels, modelId: params.get('model') || ai.DEFAULT_MODEL, onProgress });
    }
    await recognizer.init(state.customBrands);
    setStatus('✅ AI ready, running on your phone. Works offline from now on.', 100);
    $('model-card').classList.add('ok');
    setTimeout(() => { $('model-card').hidden = true; }, 2500);
  } catch (e) {
    console.error(e);
    recognizer = null;
    const offline = !navigator.onLine || /fetch|network/i.test(e.message);
    setStatus(offline
      ? 'No internet to download the AI model (needed only once). You can still log litter by hand; reload when you are online.'
      : `The AI couldn't start (${e.message}). You can still log litter by hand. Reload to retry.`);
    $('model-card').classList.add('err');
  }
  enableSnap();
  try { navigator.storage?.persist?.(); } catch {}
  // Registered after the model loads so the offline precache reuses files the
  // browser just downloaded instead of fetching the 21 MB runtime a second time.
  if ('serviceWorker' in navigator && !mock) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
  }
}

function enableSnap() {
  $('snap').disabled = false;
  $('pick').disabled = false;
}
$('snap').addEventListener('click', () => $('photo').click());
$('pick').addEventListener('click', () => $('gallery').click());

// ---------- UI ----------
function renderChips(el, options, key) {
  el.innerHTML = '';
  for (const o of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (current[key] === o.name ? ' on' : '');
    btn.append(o.name);
    if (o.score != null) {
      const s = document.createElement('small');
      s.textContent = ` ${Math.round(o.score * 100)}%`;
      btn.append(s);
    }
    btn.onclick = () => {
      current[key] = o.name;
      if (key === 'brand') { current.typed = false; $('brand-other').value = ''; }
      for (const c of el.children) c.classList.toggle('on', c === btn);
    };
    el.append(btn);
  }
}

async function onPhoto(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  $('result').hidden = false;
  $('answer').hidden = true;
  $('thinking').textContent = 'Looking at it…';
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });

  let guess = null;
  try {
    const dataURL = await shrink(file);
    $('preview').src = dataURL;
    if (recognizer) guess = await recognizer.classify(dataURL);
  } catch (e) {
    console.error(e);
    $('thinking').textContent = `The AI couldn't read this photo (${e.message}). Pick the brand yourself.`;
  }

  const brands = guess ? guess.brands.slice(0, 4) : [];
  const items = guess ? guess.items.slice(0, 3) : [];
  const sure = brands[0] && brands[0].score >= CONFIDENT;
  current = { brand: sure ? brands[0].name : null, item: items[0]?.name || null, typed: false };

  if (guess) {
    $('thinking').textContent = sure
      ? `AI's guess in ${(guess.ms / 1000).toFixed(1)} s. Tap to correct it, then log it.`
      : `The AI isn't sure (best guess ${Math.round(brands[0].score * 100)}%). Pick the brand, or type it.`;
  } else if (!recognizer) {
    $('thinking').textContent = 'AI not loaded. Pick the brand yourself.';
  }

  const brandOpts = [...brands];
  if (!brandOpts.some((o) => o.name === NO_BRAND)) brandOpts.push({ name: NO_BRAND });
  const itemOpts = [...items];
  for (const [name] of labels.items) if (!itemOpts.some((o) => o.name === name)) itemOpts.push({ name });

  renderChips($('brand-chips'), brandOpts, 'brand');
  renderChips($('item-chips'), itemOpts, 'item');
  $('brand-other').value = '';
  $('answer').hidden = false;
}
$('photo').addEventListener('change', onPhoto);
$('gallery').addEventListener('change', onPhoto);

$('brand-other').addEventListener('input', (e) => {
  const v = e.target.value.trim().replace(/\s+/g, ' ');
  if (!v) return;
  current.brand = v;
  current.typed = true;
  for (const c of $('brand-chips').children) c.classList.remove('on');
});

function knownBrand(name) {
  const all = [...labels.brands, ...state.customBrands, NO_BRAND];
  return all.find((b) => b.toLowerCase() === name.toLowerCase());
}

$('log-btn').addEventListener('click', async () => {
  if (!current?.brand) { alert(`Pick a brand first, or choose "${NO_BRAND}".`); return; }
  let brand = current.brand;
  if (current.typed) {
    const known = knownBrand(brand);
    if (known) brand = known;
    else {
      state.customBrands.push(brand);
      // Teach the AI the new brand so it can suggest it next time.
      recognizer?.addBrand(brand)
        .then(() => toast(`The AI now knows "${brand}" too.`))
        .catch(() => toast(`Saved. The AI will learn "${brand}" next time you're online.`));
    }
  }
  state.entries.push({ t: new Date().toISOString(), brand, item: current.item || 'other' });
  save();
  current = null;
  $('result').hidden = true;
  render();
  toast(`Logged: ${brand}`);
  if (navigator.vibrate) navigator.vibrate(40);
});

$('skip-btn').addEventListener('click', () => { current = null; $('result').hidden = true; });

$('reset-btn').addEventListener('click', () => {
  if (state.entries.length && !confirm('Start a new walk? This clears the tally (export the CSV first if you want it).')) return;
  state.entries = [];
  save();
  render();
});

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

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
  for (const id of ['share-btn', 'csv-btn', 'reset-btn']) $(id).disabled = n === 0;
  const max = rows[0]?.[1] || 1;
  $('board').innerHTML = '';
  for (const [brand, count] of rows) {
    const li = document.createElement('li');
    const name = document.createElement('span'); name.textContent = brand;
    const c = document.createElement('strong'); c.textContent = `${count} · ${Math.round((count / n) * 100)}%`;
    const bar = document.createElement('div'); bar.className = 'b'; bar.style.width = (count / max) * 100 + '%';
    li.append(name, c, bar);
    $('board').append(li);
  }
  $('log').innerHTML = '';
  state.entries.forEach((e, idx) => {
    const li = document.createElement('li');
    const txt = document.createElement('span');
    txt.textContent = `${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${e.brand} · ${e.item}`;
    const del = document.createElement('button');
    del.className = 'del';
    del.setAttribute('aria-label', `Delete ${e.brand} entry`);
    del.textContent = '✕';
    del.onclick = () => { state.entries.splice(idx, 1); save(); render(); };
    li.append(txt, del);
    $('log').prepend(li);
  });
}

function reportText() {
  const rows = tally().filter(([b]) => b !== NO_BRAND);
  const n = state.entries.length;
  const top = rows.slice(0, 5).map(([b, c], i) => `${i + 1}. ${b}: ${c}`).join('\n');
  return `I picked up ${n} piece${n === 1 ? '' : 's'} of litter on my walk today. Whose trash was it?\n\n${top || '(no brands identified)'}\n\nCounted with Kiska Kachra, an on-device AI litter audit: ${location.origin}${location.pathname}\n#KiskaKachra #BrandAudit`;
}

$('share-btn').addEventListener('click', async () => {
  const text = reportText();
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Report copied. Paste it anywhere.'); }
  catch { prompt('Copy your report:', text); }
});

$('csv-btn').addEventListener('click', () => {
  const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const csv = 'time,brand,item\n' + state.entries.map((e) => [e.t, e.brand, e.item].map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `kiska-kachra-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- boot ----------
(async () => {
  render();
  try {
    labels = await (await fetch('data/labels.json')).json();
  } catch (e) {
    setStatus(`Couldn't load the brand list (${e.message}). Reload to retry.`);
    return;
  }
  loadModel();
})();

