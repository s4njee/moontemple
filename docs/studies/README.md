# Results

Story 8.1. Every effect on one table, and every study Moon Temple has run. Regenerate with `npm run results` after a study or a browser check.

## Every effect, on the Apple M1 Max

- **Dawn** is the cost of one more frame at 1920 × 1080, default settings, on Dawn under Node (`npm run study`, method in `tests/bench.ts`): the number to compare effects by.
- **Chrome** is the GPU time of one frame as Chrome's HUD reports it at 1080p, median of three page loads (`npm run browser-check`). It carries a timing floor and reads higher than Dawn.
- **Download** is the effect's own lazy chunks, gzipped, on top of the shared first load (`docs/studies/bundle-sizes.json`).
- **Tier** is the effect's label; the last column says when the numbers support a different one, by the plan's rule: the lowest tier whose budget (A 2 ms, B 6, C 12) neither number exceeds. The budgets are written for an integrated GPU, so on this machine a number can show an effect is over budget but not that it fits (story 8.2).

| Effect | Epic | Tier | Dawn (ms) | Chrome (ms) | Download (kB) | Numbers say |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| hello | 1 | B | 1.44 | 3.49 | 19.5 |  |
| lens-light | 2 | A | 0.52 | 1.24 | 30.5 |  |
| lens-model | 2 | A | 0.46 | 0.78 | 24.1 |  |
| dof-lab | 3 | C | 7.69 | 7.61 | 46.3 |  |
| aperture-lab | 4 | A | 0.74 | 0.84 | 24.4 |  |
| bokeh-drift | 4 | A | 1.33 | 1.68 | 27.0 |  |
| bokeh-text | 4 | B | 1.33 | 0.93 | 71.6 | fits A |
| dust-in-light | 4 | A | 1.07 | 0.94 | 26.0 |  |
| fairy-lights | 4 | A | 0.90 | 0.86 | 25.1 |  |
| fireflies | 4 | A | 0.72 | 0.72 | 24.8 |  |
| glitter | 4 | A | 0.90 | 0.79 | 25.1 |  |
| night-street | 4 | A | 1.44 | 2.98 | 25.2 | over its budget: B |
| snow-at-night | 4 | A | 1.05 | 1.35 | 26.2 |  |
| ice-halo | 5 | A | 1.29 | 3.37 | 32.7 | over its budget: B |
| lamp-in-fog | 5 | A | 0.85 | 1.89 | 37.7 |  |
| lunar-corona | 5 | A | 1.35 | 3.75 | 32.1 | over its budget: B |
| moon-through-cloud | 5 | A | 0.52 | 1.16 | 28.4 |  |
| moonbow | 5 | A | 1.53 | 3.97 | 29.6 | over its budget: B |
| moonlit-water | 5 | C | 9.79 | 9.45 | 31.9 |  |
| bokeh-loader | 6 | A | 0.85 | 0.78 | 25.4 |  |
| flare-cursor | 6 | A | 1.29 | 1.47 | 29.7 |  |
| focus-cursor | 6 | A | 0.85 | 0.86 | 25.4 |  |
| focus-pull | 6 | A | 0.59 | 0.95 | 24.8 |  |
| glint-hover | 6 | A | 0.66 | 0.40 | 29.3 |  |
| halation-text | 6 | B | 1.22 | 1.25 | 68.9 | fits A |
| light-leak | 6 | A | 0.94 | 1.81 | 43.9 |  |
| photo-focus | 6 | B | 1.25 | 3.12 | 48.3 |  |
| rack-focus-transition | 6 | A | 0.46 | 1.44 | 49.8 |  |
| glass-solid | 9 | B | 1.94 | 5.10 | 37.5 |  |
| prism | 9 | B | 1.64 | 4.15 | 42.0 |  |
| spectral-bokeh | 9 | B | 0.50 | 1.33 | 25.7 | fits A |
| glass-badge | 10 | B | 1.57 | 4.06 | 17.0 |  |
| prism-icosahedron | 10 | C | 2.86 | 5.59 | 62.3 | fits B |
| spectral-halo | 10 | B | 0.79 | 1.25 | 27.2 | fits A |
| wire-loader | 10 | A | 0.90 | 0.88 | 34.2 |  |

Shared first load: 26 chunks, 35.2 kB gzipped.

## Every study

- [Cost study: Epic 1](epic-1.md)
- [Cost study: Epic 2](epic-2.md)
- [Cost study: Epic 3](epic-3.md)
- [Cost study: Epic 4](epic-4.md)
- [Cost study: Epic 5](epic-5.md)
- [Cost study: Epic 6](epic-6.md)
- [Cost study: Epic 9](epic-9.md)
- [Cost study: Epic 10](epic-10.md)
- [Browser check](browser-check.md)
- [CSS blur on a long page](css-blur.md)
- [bokeh-drift against CSS](css-bokeh.md)
- [CSS fallbacks for the Tier A effects](css-fallbacks.md)
- [CSS versus WebGPU](css-vs-webgpu.md)
- [Glass and flash](glass-flash.md)
- [Glass: the traced body, its caustics and its film (stories 9.4 to 9.6)](glass.md)
- [Library sizes](library-sizes.md)
- [Bokeh on a light page](light-pages.md)
- [Live versus baked](live-vs-baked.md)
- [Spectral bloom against a radius per channel and halation](spectral-bloom.md)
- [Spectral depth of field (story 9.7)](spectral-dof.md)

