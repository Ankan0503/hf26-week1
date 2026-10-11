---
title: Kiska Kachra: an on-device AI that asks "whose trash is this?" while you pick it up
published: false
tags: devchallenge, hf26challenge, ai, opensource
---

*This is a submission for the [Hacktoberfest 2026 Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges).*

## What I Built

**Kiska Kachra** (किसका कचरा, Hindi for *"whose trash is this?"*) turns a litter pick-up walk into a brand audit.

1. Go outside and pick up a piece of litter.
2. Snap it. An AI **running inside your phone's browser** guesses the brand (Lay's? Bisleri? Kurkure?) and the item type.
3. Confirm or correct the guess with one tap and log it.
4. At the end of the walk you have a ranked list of *who* is littering your street, ready to share or export as CSV.

Every clean-up drive I've seen reports kilos: "we removed 40 kg of waste." Kilos don't put pressure on anyone. "38% of what we picked up was from two snack brands" does. Groups like Break Free From Plastic run brand audits with clipboards and tally sheets. I wanted that clipboard to be the phone in your pocket, with the AI doing the squinting at logos.

There's no "indoor mode." The app is useless until you step outside and bend down.

## Demo

**Live app:** https://ankan0503.github.io/hf26-week1/

<!-- TODO: add a screenshot or short screen recording from your phone here -->

Open it on your phone, let the model download once (about 90 MB, use Wi-Fi), then switch to airplane mode. It still works.

## Code

{% github Ankan0503/hf26-week1 %}

Plain HTML/CSS/JS, no build step, MIT licensed. About 300 lines of app code.

## How I Built It

**The model: CLIP, zero-shot.** I didn't have a labelled dataset of crushed chips packets, and I wasn't going to make one in a week. So I used OpenAI's [CLIP ViT-B/32](https://huggingface.co/openai/clip-vit-base-patch32), which scores an image against arbitrary text. Each photo is scored against prompts like `a photo of a Lay's logo on litter` for about 45 brands that turn up in Indian litter, plus `a photo of plain litter with no brand or logo`. A second pass scores the item type: chips packet, PET bottle, tetra pak, gutka sachet, and so on. Adding a brand means adding one string. No retraining.

**The runtime: Transformers.js in the browser.** The quantized ONNX port ([`Xenova/clip-vit-base-patch32`](https://huggingface.co/Xenova/clip-vit-base-patch32)) runs through [Transformers.js](https://github.com/huggingface/transformers.js) on ONNX Runtime Web (WASM). I tried to keep it light:

- Photos are downscaled to 448 px on a canvas before inference. CLIP only looks at 224 px, and phone photos are 12 MP.
- I chose q8 on WASM over WebGPU. The WebGPU path wants fp32 weights, which are several times larger, and support on budget Android phones is patchy. A model that loads on *every* phone beats a fast one that loads on some.
- A service worker caches the app and the pinned library files, and Transformers.js caches the weights. After the first visit it works offline, which matters because the best litter is never where the signal is.

**Human in the loop, on purpose.** The AI never logs anything by itself. It shows its top guesses as chips with confidence percentages, and you tap to confirm, pick another, or type a brand it doesn't know. The AI makes the job fast. The human keeps the data honest.

**Privacy.** Photos never leave the device. The only thing stored is `{time, brand, item}` in `localStorage`. There are no accounts and no server.

### What it can't do (yet)

- **CLIP reads logos by vibe, not by text.** Big, iconic packaging (Coca-Cola red, Lay's yellow) gets recognised well. A sun-bleached, muddy, regional-brand wrapper often doesn't. The confirm step exists because of this.
- **The brand list is hard-coded.** Anything not on it has to be typed by hand. An OCR pass would help.
- **It's one person's tally.** There's no shared map or city leaderboard yet. That's the obvious next step, and the hard part is doing it without collecting people's locations carelessly.
- **The first load is heavy.** About 90 MB is a lot on a prepaid data pack.
- **Speed:** roughly 1–4 seconds per photo on CPU. Fine for a walk, not for a conveyor belt.

## Why Does Open Innovation Matter?

None of this would exist as a weekend project without open work. OpenAI released CLIP's weights under MIT. Xenova converted them to ONNX. Hugging Face made Transformers.js so a browser tab can run them. Everyone in that chain gave something away, and the result is that a student with a phone and no GPU budget can ship an AI app that costs nothing to host and nothing per inference.

Open source matters even more here because the *data* is civic. Brand audit numbers are only persuasive if people can check how they were counted. With an open model, an open prompt list, and open code, anyone can see exactly how "Lay's: 7" was produced, and anyone can add the brands that litter *their* street with a one-line pull request.

## Prize Categories

<!-- Edit to match the prize categories listed on the challenge page -->
- **Best use of Hugging Face / Transformers.js:** the whole AI runs in-browser via Transformers.js.
- **Overall Touch Grass:** it only works outside, with your hands dirty.

Thanks for reading. Now go pick something up. 🌳
