# bokeh-drift against CSS

Story 4.1. The same look two ways, in headless Chrome at 1280 × 720 on this machine, 2026-10-27: `experiments/css-bokeh.html` (discs as screen-blended radial gradients drifting on CSS keyframes, the same seeded layout and sizes) and the `bokeh-drift` effect page with its stage made the whole viewport. Each ran for 5 seconds; main-thread time is Chrome's Performance metrics, in milliseconds per second of running. `node experiments/css-compare.mjs` re-runs it.

| Case | Frames a second | Main thread (ms/s) | Script | Style | Layout |
| --- | ---: | ---: | ---: | ---: | ---: |
| CSS, 110 discs | 60 | 40.5 | 1.1 | 15.7 | 0.0 |
| CSS, 440 discs | 60 | 140.0 | 1.1 | 58.1 | 0.0 |
| WebGPU bokeh-drift, 110 orbs | 60 | 25.9 | 12.5 | 0.0 | 0.0 |
| WebGPU bokeh-drift, 440 orbs | 60 | 27.3 | 13.8 | 0.0 | 0.0 |

Chrome reports no GPU time for the CSS page: its discs are layers the compositor draws, which no WebGPU timestamp sees. The shader's GPU time is in the browser check and the cost studies.

## What the comparison says

The CSS version is close at a glance: the same seeded layout, sizes and drift, soft discs that brighten where they overlap. What it does not have:

- **The lens.** Every disc is a flat circle: no cat's eye towards the corners, no rim, no aperture shape, and nothing that changes when the focus does. The effect's discs are the aperture at each light's circle of confusion and keep each light's energy as it blurs.
- **Light.** Screen blending brightens overlaps but saturates to flat colour; there is no HDR, tonemap or bloom, so the bright light is a gradient, not a light.
- **A cost that holds.** The CSS page's main-thread time grows with the discs, about 40 ms a second at 110 and 140 ms at 440, most of it style recalculation even with one fixed keyframe travel for every disc (a travel from a custom property cost more still). The shader page holds at about 26 ms a second at either count, half of it the page's own script, and its GPU time is about the HDR tail's (`docs/studies/epic-4.md`).

Verdict: for a dozen static or slowly drifting discs on a hero, use the CSS; it needs no WebGPU and no fallback. The shader earns its place with hundreds of lights, an aperture, a focus that moves, and a light that blooms.
