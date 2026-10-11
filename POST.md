---
title: "Kiska Kachra: an open-weight AI in your phone's browser that asks whose trash this is"
published:
tags: devchallenge, hf26challenge
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

**Kiska Kachra** (किसका कचरा, Hindi for *"whose trash is this?"*) turns a litter pick-up walk into a **brand audit**.

1. Go outside and pick up a piece of litter.
2. Snap it. An open-weight AI model **running inside your phone's browser** guesses the brand (Lay's? Bisleri? Kurkure?) and the item type.
3. Confirm or correct the guess with one tap, and it's logged.
4. When you get home, you have a ranked list of *who* is littering your street, ready to share or export as CSV.

Clean-up drives usually report kilos: "we removed 40 kg of waste." Kilos don't put pressure on anyone. "38% of what we picked up came from two snack brands" does. Brand audits already exist, but they run on clipboards and tally sheets. I wanted the clipboard to be the phone in your pocket, with the AI doing the squinting at logos.

**Who it's for:** clean-up volunteers, plogging and run clubs, school eco-clubs, anyone who already picks up litter on a walk.

**The screen is the shortest part.** Each piece of litter costs about five seconds of phone time: snap, glance, tap. The rest of the walk is eyes on the ground. There's no indoor mode: the app is useless until you step outside and bend down.

## Demo

**Live app:** https://ankan0503.github.io/hf26-week1/ (open it on your phone)

![Kiska Kachra demo: snap, guess, correct, teach, offline, share](https://raw.githubusercontent.com/Ankan0503/hf26-week1/main/media/demo.gif)

Full-quality video: [media/demo.mp4](https://github.com/Ankan0503/hf26-week1/blob/main/media/demo.mp4)

The demo isn't staged by hand. GitHub Actions recorded it while driving the real app with the real model on a phone-sized screen: snap, guess, fix a wrong guess, teach it a new brand, switch to airplane mode, and share.

## Code

{% github Ankan0503/hf26-week1 %}

Plain HTML/CSS/JS, no build step, MIT licensed. The interesting files are `ai.js` (the recognizer), `data/labels.json` (brands and prompts), `tools/e2e.mjs` (real-model eval + the demo recording) and `.github/workflows/verify.yml`.

## How I Built It

### One open-weight model, used zero-shot

I didn't have a labelled dataset of crushed chips packets, and I wasn't going to build one in a week. So the AI is **OpenAI's CLIP** (ViT-B/16), whose weights are open under MIT. I use the quantized ONNX port by Xenova and run it with **Transformers.js**. I first used the smaller ViT-B/32. The eval below showed B/16 roughly doubles top-1 accuracy for the same download size, at about 3.7× the compute per photo, so I switched. CLIP embeds images and text into the same space, which makes recognition a lookup:

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

The AI never logs anything by itself. The top guesses appear as chips with confidence percentages. Below 50% nothing is pre-selected, and the app says plainly that it isn't sure. I picked that threshold from the eval's calibration table: above 50%, the pre-selected brand was right 18 times out of 19. At 35% it was only 21 out of 30, and a wrong pre-selection that someone logs without looking corrupts the audit. The AI makes logging fast. The human keeps the data honest.

### Testing a phone AI without a phone

I built this from a cloud sandbox while away from my laptop, so the real test had to be automated. On every push, a GitHub Actions workflow:

1. downloads freely licensed product and brand photos from Wikimedia Commons and Open Food Facts,
2. runs the **same `ai.js` the app uses** in headless Chromium and measures accuracy and speed for a few model and prompt configs,
3. writes the precomputed embeddings,
4. drives the real app on a phone-sized screen and records the demo video above.

**Real results from CI** (headless Chromium on a GitHub runner CPU; a phone will be slower):

| Model | Prompts | Top-1 | Top-3 | ms / photo | Phone download |
|---|---|---|---|---|---|
| `Xenova/clip-vit-base-patch16` | ensemble | 33% | 47% | 812 | 87 MB |
| `Xenova/clip-vit-base-patch16` | single | 31% | 45% | 811 | 87 MB |
| `Xenova/clip-vit-base-patch32` | ensemble | 20% | 38% | 221 | 89 MB |

Test set: 122 freely licensed photos across 41 brands; chance level is about 2%. It's small and noisy (Commons search results aren't all litter), so treat it as a smoke test, not a benchmark. Full per-photo results: [`eval/RESULTS.md`](https://github.com/Ankan0503/hf26-week1/blob/main/eval/RESULTS.md).

### What it can't do (yet)

- **CLIP reads logos by looks, not by text.** Big, iconic packaging is recognised well. A sun-bleached, muddy, regional-brand wrapper often isn't. The confirm step exists because of this.
- **The first load is heavy** (the vision encoder). Do it on Wi-Fi. The app shows the exact size while it downloads.
- **Single-threaded WASM.** GitHub Pages can't send the headers multi-threading needs.
- **It's one person's tally.** There's no shared map or city leaderboard yet. That's the obvious next step, and the hard part is doing it without carelessly collecting where people walk.

## Why Does Open Innovation Matter?

The open pieces aren't a nice-to-have here. They're the only reason this works at all.

- **It works where litter is, with no signal.** The model runs in the browser tab. After the first load you can put the phone in airplane mode and keep logging. A closed vision API would need a connection for every single photo, in exactly the places (drains, empty lots, riverbanks) where there often isn't one.
- **The photos stay on the phone.** People photograph trash on *their* streets, sometimes with houses, cars or faces in the frame. With an open model, nothing leaves the device. There's no server, no account, nothing to leak.
- **It costs nothing to run, forever.** No API key, no per-image bill, no free tier to run out of. A clean-up drive with 200 volunteers snapping 50 items each is 10,000 inferences. With an open model that costs nothing, on hosting that's free (GitHub Pages).
- **I could measure and swap models.** Because the weights are open, I could run my own eval in CI and pick the model on evidence. The smaller ViT-B/32 got 20% top-1. ViT-B/16 got 33% for the same 87 MB download, so I switched. I could also precompute the text side of the model so phones download half as much, and tune the confidence threshold from real calibration data. A closed API gives you none of those knobs.
- **The audit is checkable.** A brand audit only persuades if people can check how it was counted. With an open model, an open label list, open code and a published eval, anyone can see exactly how "Lay's: 7" was produced, and anyone can add the brands littering *their* street with a one-line pull request.

This whole thing is a chain of things people gave away: OpenAI's CLIP weights, Xenova's ONNX conversion, Hugging Face's Transformers.js, Microsoft's ONNX Runtime, and Wikimedia and Open Food Facts contributors' freely licensed photos that let me test it honestly.

Thanks for reading. Now go pick something up. 🌳
