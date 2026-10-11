// Stand-in for vendor/transformers.min.js used by tools/unit.mjs: a bag-of-words
// "CLIP" so the recognizer's caching/seeding/offline logic can be tested without a download.
export const env = { backends: { onnx: { wasm: {} } } };
const DIM = 2048;
function vecFor(text) {
  const v = new Array(DIM).fill(0);
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 7; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % DIM] += 1;
  }
  return v;
}
export class RawImage { static async read(u) { return { u }; } static async fromBlob(b) { return { b }; } }
export const AutoTokenizer = { from_pretrained: async () => (texts) => ({ texts }) };
export const CLIPTextModelWithProjection = { from_pretrained: async () => {
  if (globalThis.FAIL_TEXT) throw new Error('Failed to fetch');
  globalThis.TEXT_LOADS = (globalThis.TEXT_LOADS || 0) + 1;
  return async ({ texts }) => ({ text_embeds: { dims: [texts.length, DIM], data: Float32Array.from(texts.flatMap(vecFor)) } });
} };
export const AutoProcessor = { from_pretrained: async () => async (img) => ({ img }) };
export const CLIPVisionModelWithProjection = { from_pretrained: async () =>
  async () => ({ image_embeds: { data: Float32Array.from(vecFor(globalThis.IMAGE_TEXT || 'pepsi pepsi pepsi')) } }) };
