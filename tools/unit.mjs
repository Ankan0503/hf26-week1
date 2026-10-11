// Logic tests for ai.js with a fake model (fast, no download). Usage: node tools/unit.mjs <baseURL>
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:8000';
const FAKE = fs.readFileSync(new URL('./fake-transformers.js', import.meta.url), 'utf8');
let failed = 0;
let seed = null; // served as data/embeddings/<model>.json when set
{
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.route('**/vendor/transformers.min.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await ctx.route('**/data/embeddings/*.json', (r) => seed ? r.fulfill({ contentType: 'application/json', body: seed }) : r.fulfill({ status: 404, body: '' }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const run = (code) => p.evaluate(code);
  await p.goto(`${base}/tools/eval.html`); await p.waitForFunction(() => window.harnessReady);
  const check = (name, ok, extra = '') => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name, extra); };

  // a) no seed, eval harness (seed:false) computes text embeddings on device
  await run(`(async () => { const { Recognizer } = await import('/ai.js'); const labels = await (await fetch('/data/labels.json')).json();
    window.Recognizer = Recognizer; window.labels = labels; })()`);
  let r = await run(`(async () => { localStorage.clear(); globalThis.TEXT_LOADS = 0; const rec = new Recognizer({ labels, seed: false }); await rec.init();
    const out = await rec.classify('data:x'); window.exported = rec.exportEmbeddings();
    return { loads: globalThis.TEXT_LOADS, top: out.brands[0].name, n: Object.keys(window.exported).length, lsKeys: Object.keys(localStorage).length }; })()`);
  check('fresh device computes embeddings', r.loads === 1 && r.top === 'Pepsi', JSON.stringify(r));
  seed = JSON.stringify(await run('window.exported'));

  // b) seed available, empty localStorage -> no text model download
  r = await run(`(async () => { localStorage.clear(); globalThis.TEXT_LOADS = 0; const rec = new Recognizer({ labels }); await rec.init();
    const out = await rec.classify('data:x'); return { loads: globalThis.TEXT_LOADS, top: out.brands[0].name, ls: Object.keys(localStorage).filter(k => k.startsWith('kk-emb')).length }; })()`);
  check('seeded start skips text model', r.loads === 0 && r.top === 'Pepsi' && r.ls > 40, JSON.stringify(r));

  // c) offline: seed file unreachable, text model unreachable, but localStorage copy exists; plus a custom brand that was never learned
  seed = null;
  r = await run(`(async () => { globalThis.TEXT_LOADS = 0; globalThis.FAIL_TEXT = true; const rec = new Recognizer({ labels });
    let initErr = null; try { await rec.init(['Kwality Walls']); } catch (e) { initErr = e.message; }
    let addErr = null; try { await rec.addBrand('Kwality Walls'); } catch (e) { addErr = e.message; }
    const out = await rec.classify('data:x'); return { initErr, addErr, top: out.brands[0].name, loads: globalThis.TEXT_LOADS }; })()`);
  check('offline start works; unlearned custom brand is non-fatal', r.initErr === null && r.addErr && r.top === 'Pepsi', JSON.stringify(r));

  // d) online again: custom brand gets learned and can win
  r = await run(`(async () => { globalThis.FAIL_TEXT = false; globalThis.IMAGE_TEXT = 'kwality walls kwality walls'; const rec = new Recognizer({ labels });
    await rec.init(['Kwality Walls']); const out = await rec.classify('data:x'); globalThis.IMAGE_TEXT = null;
    return { top: out.brands[0].name, score: +out.brands[0].score.toFixed(3), sum: +out.brands.reduce((a, b) => a + b.score, 0).toFixed(4), nb: out.brands.length, ni: out.items.length }; })()`);
  check('custom brand learned and recognised; probabilities sum to 1', r.top === 'Kwality Walls' && r.sum === 1, JSON.stringify(r));

  // e) a label-list change invalidates only the changed class (hash in cache key)
  r = await run(`(async () => { globalThis.TEXT_LOADS = 0; const L = structuredClone(labels); L.brands.push('Brand New Co'); const rec = new Recognizer({ labels: L });
    await rec.init(); return { loads: globalThis.TEXT_LOADS }; })()`);
  check('new label triggers one text-model load, others cached', r.loads === 1, JSON.stringify(r));
  console.log('page errors:', errs);
  await b.close();
  if (failed || errs.length) process.exit(1);
}
