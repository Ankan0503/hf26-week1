# Kiska Kachra (किसका कचरा?): whose trash is this?

Go for a walk and pick up litter. Snap each piece with your phone, and an AI **running in your phone's browser** guesses which brand made it. You confirm or correct the guess, and the app keeps a running tally. When you're done, you have a brand audit of your street that you can share or export as CSV.

**Live app:** https://ankan0503.github.io/hf26-week1/

Built for the Hacktoberfest 2026 DEV Open-Source AI Challenge, Week 1: *Touch Grass*.

## Why

Clean-up drives count kilos. Kilos don't tell anyone *whose* packaging keeps ending up in the drain. Brand audits (popularised by Break Free From Plastic) do, but they mean clipboards and tally sheets. This turns any phone into the clipboard, and it only works if you go outside.

## How it works

- **Model:** [OpenAI CLIP ViT-B/32](https://huggingface.co/openai/clip-vit-base-patch32), using the ONNX/quantized port [`Xenova/clip-vit-base-patch32`](https://huggingface.co/Xenova/clip-vit-base-patch32), about 90 MB at q8.
- **Runtime:** [Transformers.js](https://github.com/huggingface/transformers.js) v3 (ONNX Runtime Web, WASM) loaded from jsDelivr.
- **Zero-shot:** the photo is scored against text prompts such as "a photo of a Lay's logo on litter" for about 45 brands common in Indian litter, plus a second pass for the item type (chips packet, PET bottle, gutka sachet…). No training, no labelled dataset.
- **Human in the loop:** the AI shows its top guesses with confidence scores. Nothing is counted until you tap **Log it**, and you can pick another chip or type any brand.
- **Private and offline:** photos are downscaled on the device and never uploaded. Counts live in `localStorage`. A service worker caches the app and the library, and Transformers.js caches the model, so after the first load it works with no signal.
- **No build step, no server:** plain HTML, CSS, and JS on GitHub Pages.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000          (real model)
# open http://localhost:8000/?mock    (fake model, for UI work)
```

## Limits (honest ones)

- CLIP reads logos by *looks*. It's decent on big, iconic brands (Coca-Cola, Lay's, Pepsi) and weak on crumpled, faded, or regional ones. That's why a human confirms every entry.
- The brand list is hard-coded in `app.js`. A brand that isn't on the list can only be typed in by hand.
- The first load downloads about 90 MB. Do it on Wi-Fi.
- Inference uses WASM on the CPU: roughly 1–4 s per photo on a mid-range phone. WebGPU is skipped on purpose for now (its fp32 weights are much larger).
- The tally lives in one browser. There's no shared map or leaderboard yet.

## Contributing

Good first issues: add brands from your city to `BRANDS` in `app.js`, translate the UI, add GPS and a map view, add an OCR pass for text logos.

## Credits & licenses

- Code: MIT (see `LICENSE`).
- CLIP model weights: MIT, © OpenAI. ONNX conversion by Xenova (Hugging Face).
- Transformers.js: Apache-2.0, Hugging Face.
- Brand names are trademarks of their owners and are used only to identify litter.
