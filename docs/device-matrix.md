# Device matrix (story 8.2)

Every tier in Moon Temple so far rests on one machine, an Apple M1 Max. This page is the protocol for the other three classes the plan names, and the table they fill in. The Apple Silicon column is complete for all 35 effects; **the other three are not measured**: they need the devices.

## The devices

| Class                 | Example                                              | Why it matters                             |
| --------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Integrated-GPU laptop | Intel Iris Xe or AMD Radeon 680M, Chrome on Windows  | the budget Tier A and B are written for    |
| Apple Silicon         | M1 Max (done), and a base M1 or M2 if one is to hand | the reference so far                       |
| Mid-range Android     | a Pixel 7a or Galaxy A54 class phone, Chrome         | the phone the "untested" scorecards mean   |
| iPhone                | iPhone 13 or later, Safari 26                        | WebGPU on iOS, and the only Safari reading |

## Protocol

On each device, with nothing else open and the device on mains power (a phone on charge, its screen held on):

1. **Serve the build on the network.** On the development machine, `npm run build`, then `npx vite preview --host --port 5450`, and note its address on the LAN (`http://<machine>.local:5450/`).
2. **The gallery's own reading.** Open each effect at `/?effect=<id>&hud=1` and read the HUD's GPU time and frame rate after ten seconds, at the device's native canvas size. Note whether the effect started, and anything that looks wrong.
3. **The scripted check, where Chrome can be driven.** On the laptop: `npm run browser-check -- --base http://<machine>.local:5450 --views hud-1080p --hud-runs 3 --device "<name>" --class <integrated|apple-silicon>`. Its report lists start-up, errors and the HUD's numbers per effect.
4. **The quality ladder.** On the phones, open `focus.html`, scroll for a minute, and note which rung `adaptQuality` settles on (7.2): the status line names it after the focus distance when it is below full quality.
5. **Flash and comfort.** Look at every effect with twinkles or glints at arm's length and close up. The analyser's limits assume a desktop viewing distance (`docs/accessibility.md`).

Record each reading in `src/effects/measured.json` under the device's name and class (the Scorecard tab reads it), and in the table below.

## Results

Each cell is Dawn per frame / Chrome's HUD for one frame, at 1920 × 1080 and default settings: the same two readings the tier rule takes. Apple M1 Max, measured 2026-10-29 by `npm run study` and `npm run browser-check` (`docs/studies/README.md` has them with downloads and tiers).

| Effect                  | Apple M1 Max (Dawn / Chrome) | Integrated laptop | Android | iPhone |
| ----------------------- | ---------------------------- | ----------------- | ------- | ------ |
| `aperture-lab`          | 0.74 / 0.84 ms               | —                 | —       | —      |
| `bokeh-drift`           | 1.33 / 1.68 ms               | —                 | —       | —      |
| `bokeh-loader`          | 0.85 / 0.78 ms               | —                 | —       | —      |
| `bokeh-text`            | 1.33 / 0.93 ms               | —                 | —       | —      |
| `dof-lab`               | 7.69 / 7.61 ms               | —                 | —       | —      |
| `dust-in-light`         | 1.07 / 0.94 ms               | —                 | —       | —      |
| `fairy-lights`          | 0.90 / 0.86 ms               | —                 | —       | —      |
| `fireflies`             | 0.72 / 0.72 ms               | —                 | —       | —      |
| `flare-cursor`          | 1.29 / 1.47 ms               | —                 | —       | —      |
| `focus-cursor`          | 0.85 / 0.86 ms               | —                 | —       | —      |
| `focus-pull`            | 0.59 / 0.95 ms               | —                 | —       | —      |
| `glass-badge`           | 1.57 / 4.06 ms               | —                 | —       | —      |
| `glass-solid`           | 1.94 / 5.10 ms               | —                 | —       | —      |
| `glint-hover`           | 0.66 / 0.40 ms               | —                 | —       | —      |
| `glitter`               | 0.90 / 0.79 ms               | —                 | —       | —      |
| `halation-text`         | 1.22 / 1.25 ms               | —                 | —       | —      |
| `hello`                 | 1.44 / 3.49 ms               | —                 | —       | —      |
| `ice-halo`              | 1.29 / 3.37 ms               | —                 | —       | —      |
| `lamp-in-fog`           | 0.85 / 1.89 ms               | —                 | —       | —      |
| `lens-light`            | 0.52 / 1.24 ms               | —                 | —       | —      |
| `lens-model`            | 0.46 / 0.78 ms               | —                 | —       | —      |
| `light-leak`            | 0.94 / 1.81 ms               | —                 | —       | —      |
| `lunar-corona`          | 1.35 / 3.75 ms               | —                 | —       | —      |
| `moon-through-cloud`    | 0.52 / 1.16 ms               | —                 | —       | —      |
| `moonbow`               | 1.53 / 3.97 ms               | —                 | —       | —      |
| `moonlit-water`         | 9.79 / 9.45 ms               | —                 | —       | —      |
| `night-street`          | 1.44 / 2.98 ms               | —                 | —       | —      |
| `photo-focus`           | 1.25 / 3.12 ms               | —                 | —       | —      |
| `prism`                 | 1.64 / 4.15 ms               | —                 | —       | —      |
| `prism-icosahedron`     | 2.86 / 5.59 ms               | —                 | —       | —      |
| `rack-focus-transition` | 0.46 / 1.44 ms               | —                 | —       | —      |
| `snow-at-night`         | 1.05 / 1.35 ms               | —                 | —       | —      |
| `spectral-bokeh`        | 0.50 / 1.33 ms               | —                 | —       | —      |
| `spectral-halo`         | 0.79 / 1.25 ms               | —                 | —       | —      |
| `wire-loader`           | 0.90 / 0.88 ms               | —                 | —       | —      |

The tiers stay provisional until at least the integrated laptop and one phone are in this table.
