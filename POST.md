---
title: Kiska Kachra: an open-weight AI in your phone's browser that asks "whose trash is this?"
published: false
tags: devchallenge, hf26challenge, ai, opensource
---

*This is a submission for the [Hacktoberfest 2026 Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges).*

## What I Built

**Kiska Kachra** (किसका कचरा, Hindi for *"whose trash is this?"*) turns a litter pick-up walk into a **brand audit**.

1. Go outside and pick up a piece of litter.
2. Snap it. An open-weight AI model **running inside your phone's browser** guesses the brand (Lay's? Bisleri? Kurkure?) and the item type.
3. Confirm or correct the guess with one tap, and it's logged.
4. When you get home, you have a ranked list of *who* is littering your street, ready to share or export as CSV.

Clean-up drives usually report kilos: "we removed 40 kg of waste." Kilos don't put pressure on anyone. "38% of what we picked up came from two snack brands" does. Brand audits already exist, but they run on clipboards and tally sheets. I wanted the clipboard to be the phone in your pocket, with the AI doing the squinting at logos.

There's no indoor mode. The app is useless until you step outside and bend down.

## Demo

**Live app:** https://ankan0503.github.io/hf26-week1/ (open it on your phone)

DEMO_MEDIA

The demo isn't staged by hand. GitHub Actions recorded it while driving the real app with the real model on a phone-sized screen: snap, guess, fix a wrong guess, teach it a new brand, switch to airplane mode, and share.

## Code

{% github Ankan0503/hf26-week1 %}

Plain HTML/CSS/JS, no build step, MIT licensed.

## How I Built It

### One open-weight model, used zero-shot

I didn't have a labelled dataset of crushed chips packets, and I wasn't going to build one in a week. So the AI is **OpenAI's CLIP** (ViT-B/16), whose weights are open under MIT. I use the quantized ONNX port by Xenova and run it with **Transformers.js**. I first used the smaller ViT-B/32. The eval below showed B/16 roughly doubles top-1 accuracy for the same download size, at about 3–4× the compute per photo, so I switched. CLIP embeds images and text into the same space, which makes recognition a lookup:

- Every brand gets several prompt templates ("a photo of {} packaging", "the {} logo", "a crumpled {} wrapper, bottle or can"…). Their text embeddings are averaged into one vector per brand. Averaging prompts like this is a cheap, well-known way to make CLIP more reliable.
- A photo goes through the vision encoder once. Cosine similarity against every brand vector, softmax at CLIP's own temperature, and you have a ranked guess.
- A second set of vectors guesses the item type: chips packet, PET bottle, tetra pak, gutka sachet…

Brands live in `data/labels.json`. Adding your city's brands is a one-line pull request.

### Making it phone-friendly

- **Text embeddings are precomputed.** CI computes the vectors for the built-in labels and ships them as a small JSON file. A phone downloads only the CLIP **vision** encoder, not the text one, and each photo costs exactly one forward pass.
- **Teach it a brand.** If you type a brand it doesn't know, the text encoder is fetched lazily and the new brand is embedded on the device and cached, so next time it's one of the suggestions.
- **No CDN at runtime.** Transformers.js and the ONNX Runtime WASM are vendored into the repo and served by GitHub Pages. A service worker caches the app, Transformers.js caches the weights, and embeddings sit in `localStorage`. After the first load it works in airplane mode, which matters because the best litter is never where the signal is.
- **Photos never leave the phone.** They're downscaled on a canvas, embedded, and thrown away. The only thing stored is `{time, brand, item}`.

### Human in the loop, on purpose

The AI never logs anything by itself. The top guesses appear as chips with confidence percentages. Below 35% nothing is pre-selected, and the app says plainly that it isn't sure. The AI makes logging fast. The human keeps the data honest.

### Testing a phone AI without a phone

I built this from a cloud sandbox while away from my laptop, so the real test had to be automated. On every push, a GitHub Actions workflow:

1. downloads freely licensed product and brand photos from Wikimedia Commons and Open Food Facts,
2. runs the **same `ai.js` the app uses** in headless Chromium and measures accuracy and speed for a few model and prompt configs,
3. writes the precomputed embeddings,
4. drives the real app on a phone-sized screen and records the demo video above.

EVAL_TABLE

### What it can't do (yet)

- **CLIP reads logos by looks, not by text.** Big, iconic packaging is recognised well. A sun-bleached, muddy, regional-brand wrapper often isn't. The confirm step exists because of this.
- **The first load is heavy** (the vision encoder). Do it on Wi-Fi. The app shows the exact size while it downloads.
- **Single-threaded WASM.** GitHub Pages can't send the headers multi-threading needs.
- **It's one person's tally.** There's no shared map or city leaderboard yet. That's the obvious next step, and the hard part is doing it without carelessly collecting where people walk.

## Why Does Open Innovation Matter?

This project is a chain of things people gave away. OpenAI released CLIP's weights. Xenova converted them to ONNX. Hugging Face built Transformers.js so a browser tab can run them. Microsoft open-sourced ONNX Runtime. Wikimedia and Open Food Facts contributors photographed products under free licenses, which let me test the model honestly. Because of all that, someone with a phone and no GPU budget can ship an AI app that costs nothing to host, nothing per inference, and sends nothing to anyone's server.

Openness matters even more here because the *data* is civic. A brand audit only persuades if people can check how it was counted. With an open model, an open label list, open code and a published eval, anyone can see exactly how "Lay's: 7" was produced, and anyone can add the brands littering *their* street with a one-line pull request.

## Prize Categories

<!-- Edit to match the prize categories listed on the challenge page -->
- **Best use of open-weight models / Hugging Face:** CLIP via Transformers.js, fully on-device.
- **Overall Touch Grass:** it only works outside, with your hands dirty.

Thanks for reading. Now go pick something up. 🌳
