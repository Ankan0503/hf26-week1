# Kiska Kachra (किसका कचरा?): whose trash is this?

Go for a walk and pick up litter. Snap each piece, and an **open-weight AI model running inside your phone's browser** guesses which brand made it. You confirm the guess with one tap, and the app keeps the tally. At the end of the walk you have a brand audit of your street that you can share or export as CSV.

**Live app:** https://ankan0503.github.io/hf26-week1/  ·  **Demo video:** [`media/demo.mp4`](media/demo.mp4)  ·  **Eval:** [`eval/RESULTS.md`](eval/RESULTS.md)

Built for the Hacktoberfest 2026 DEV Open-Source AI Challenge, Week 1: *Touch Grass*.

## Why

Clean-up drives count kilos. Kilos don't tell anyone *whose* packaging keeps ending up in the drain. Brand audits do, but they mean clipboards and tally sheets. Kiska Kachra turns any phone into the clipboard, and it only works if you go outside.

## What it does

- **📷 Snap or 🖼️ pick a photo.** The AI ranks about 40 brands that are common in Indian litter, plus "unbranded", and guesses the item type (chips packet, PET bottle, gutka sachet…).
- **A human confirms every entry.** The top guesses appear as chips with confidence scores. Below 50% confidence nothing is pre-selected, so you choose. The threshold comes from the calibration table in the eval: above it, the pre-selected brand was right about 9 times in 10.
- **Teach it a brand.** Type a brand that isn't listed. It's logged, and the AI embeds the new name on the device so it can suggest it next time.
- **Brand audit.** You get a live ranking with counts and percentages, a share text, a CSV export, and per-entry delete.
- **Offline after the first load.** Photos never leave the phone, and there are no accounts and no server.

## How it works

| Piece | What |
|---|---|
| Model | [OpenAI CLIP ViT-B/16](https://huggingface.co/openai/clip-vit-base-patch16) (open weights, MIT), quantized ONNX port [`Xenova/clip-vit-base-patch16`](https://huggingface.co/Xenova/clip-vit-base-patch16). Picked over ViT-B/32 by the eval: about 2× the top-1 accuracy, same download size. |
| Runtime | [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 + ONNX Runtime Web (WASM), **vendored in `vendor/`**, so there's no CDN at runtime |
| Recognition | Zero-shot. Each brand gets several prompt templates ("a crumpled {} wrapper"…) whose text embeddings are averaged. A photo is matched by cosine similarity to the class embeddings, then softmax at CLIP's temperature. |
| Speed trick | Text embeddings are computed **once**. CI precomputes them for the built-in labels (`data/embeddings/`), so a phone downloads only the **vision** encoder, and each photo costs one vision pass. Brands you teach it are embedded on the device and cached. |
| Labels | `data/labels.json`: brands, prompt templates and item types are data, not code |
| Offline | A service worker caches the app and runtime. Transformers.js caches the weights. Embeddings are cached in `localStorage`. |

```
photo ─► resize (canvas) ─► CLIP vision encoder (q8, WASM) ─► image vector
                                                                   │ cosine × 100, softmax
label prompts ─► CLIP text encoder (once, or precomputed) ─► class vectors ─► ranked brands + items
```

## Verified in CI, with the real model

`.github/workflows/verify.yml` runs on every push. GitHub Actions does what a phone does:

0. It runs logic tests with a stand-in model (`tools/unit.mjs`): seeded embeddings skip the text model, offline start works, a taught brand can't block loading, and only changed labels are recomputed.
1. It downloads freely licensed brand and product photos from Wikimedia Commons and Open Food Facts (`tools/fetch_images.py`).
2. It runs the **same `ai.js`** in headless Chromium to measure top-1 and top-3 accuracy and speed for a few model and prompt configs, and writes [`eval/RESULTS.md`](eval/RESULTS.md).
3. It writes the precomputed prompt embeddings.
4. It drives the real app on a phone-sized screen and records [`media/demo.mp4`](media/demo.mp4): snap, guess, correct a wrong guess, teach a brand, go offline, share.

## Run locally

```sh
python3 -m http.server 8000
# http://localhost:8000          real model (downloads from Hugging Face once)
# http://localhost:8000/?mock    fake model, for UI work
```

## Limits (honest ones)

- **CLIP reads logos by looks, not by text.** It's good on big, iconic packaging and weak on crumpled, faded, or regional brands. That's why a human confirms every entry. See [`eval/RESULTS.md`](eval/RESULTS.md) for real numbers.
- **The first load is a large download** (the vision encoder). Use Wi-Fi. The app shows the exact size while downloading.
- **CPU (WASM) inference.** Multi-threading needs cross-origin isolation, which GitHub Pages can't enable, so it runs single-threaded.
- **One person's tally.** There's no shared map or leaderboard yet.

## Contributing

- **Add a brand:** add its name to `brands` in `data/labels.json`. CI regenerates the embeddings and the eval.
- **Other ideas:** an OCR pass for text logos, GPS + a map, UI translations.

## Credits & licenses

- Code: MIT (`LICENSE`).
- CLIP weights: MIT, © OpenAI. ONNX conversion: Xenova / Hugging Face.
- Transformers.js: Apache-2.0, Hugging Face (`vendor/LICENSE-transformers.js.txt`). ONNX Runtime Web: MIT, Microsoft.
- Demo and eval photos: Wikimedia Commons, under their own licenses (see [`media/CREDITS.md`](media/CREDITS.md)). They aren't stored in this repo.
- Brand names are trademarks of their owners and are used only to identify litter.
