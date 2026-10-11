// Photo preprocessing shared by the app and the eval harness, so the eval
// measures exactly the pixels the app classifies. CLIP looks at 224 px; phone
// photos are 12 MP, so shrink first (saves memory and time).
export const MAX_SIDE = 512;

/** @param {Blob} blob  a photo file  @returns {Promise<string>} JPEG data URL, longest side <= MAX_SIDE */
export async function shrink(blob) {
  const bmp = await createImageBitmap(blob).catch(() => null);
  const src = bmp || await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that photo')); };
    img.src = url;
  });
  const s = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  bmp?.close();
  return c.toDataURL('image/jpeg', 0.9);
}
