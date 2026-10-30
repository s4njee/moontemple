# Browser check

Every registered effect, loaded in Google Chrome 156.0.8078.48 (headless, this machine's GPU) on 2026-10-29 by `npm run browser-check`.

Views per effect: `hero-light` (1280 × 900), `hero-dark` (1280 × 900), `cards-dark` (1280 × 900), `band-light` (1280 × 900), `backdrop-dark` (1280 × 900), `phone-light` (390 × 844 at 2x), `phone-dark` (390 × 844 at 2x), `hud-1080p` (1920 × 1080). The layouts are the mock pages of the effect page; "light" and "dark" are the page tone of the stage.

- **Started** counts the views in which the effect got a canvas and drew more than a flat fill, with no fallback notice and no console error.
- **Animates** means two captures a second apart differ by more than dither in at least one view.
- **HUD** is what the performance HUD showed on a 1920 × 1080 canvas: frames per second, and the GPU time of one frame as the browser reports it (first pass start to last pass end), as the median of several page loads with the range beside it. The range is wide for the lightest effects: when there is little to draw the GPU idles, and the same page reads either near the timing floor or about twice that from one load to the next.

The HUD time is not the number the cost studies report. It is one frame measured alone, through Chrome's coarse timestamps, on a GPU that idles between frames, so it carries a floor and reads higher than the per-frame cost in `docs/studies/epic-*.md`. It is here because it is what a visitor's browser actually does. This check says nothing about how an effect looks: the screenshots do.

| Effect | Started | Animates | HUD at 1080p |
| --- | ---: | --- | --- |
| aperture-lab | 8 of 8 | no (a still picture) | 60 fps, 0.84 ms (0.83 to 0.87 over 3 loads) |
| bokeh-drift | 8 of 8 | yes | 60 fps, 1.68 ms (1.63 to 1.74 over 3 loads) |
| bokeh-loader | 8 of 8 | yes | 60 fps, 0.78 ms (0.74 to 0.81 over 3 loads) |
| bokeh-text | 8 of 8 | yes | 60 fps, 0.93 ms (0.84 to 0.94 over 3 loads) |
| dof-lab | 8 of 8 | yes | 60 fps, 7.61 ms (7.21 to 7.77 over 3 loads) |
| dust-in-light | 8 of 8 | yes | 60 fps, 0.94 ms (0.92 to 0.95 over 3 loads) |
| fairy-lights | 8 of 8 | yes | 60 fps, 0.86 ms (0.85 to 0.89 over 3 loads) |
| fireflies | 8 of 8 | yes | 60 fps, 0.72 ms (0.70 to 0.73 over 3 loads) |
| flare-cursor | 8 of 8 | yes | 60 fps, 1.47 ms (1.36 to 1.49 over 3 loads) |
| focus-cursor | 8 of 8 | yes | 60 fps, 0.86 ms (0.84 to 0.86 over 3 loads) |
| focus-pull | 8 of 8 | yes | 60 fps, 0.95 ms (0.86 to 0.96 over 3 loads) |
| glass-badge | 8 of 8 | yes | 60 fps, 4.06 ms (3.61 to 4.36 over 3 loads) |
| glass-solid | 8 of 8 | yes | 60 fps, 5.10 ms (4.78 to 5.23 over 3 loads) |
| glint-hover | 8 of 8 | yes | 60 fps, 0.40 ms (0.39 to 0.42 over 3 loads) |
| glitter | 8 of 8 | yes | 60 fps, 0.79 ms (0.79 to 0.80 over 3 loads) |
| halation-text | 8 of 8 | no (a still picture) | 60 fps, 1.25 ms (1.25 to 1.28 over 3 loads) |
| hello | 8 of 8 | yes | 60 fps, 3.49 ms (3.40 to 3.56 over 3 loads) |
| ice-halo | 8 of 8 | no (a still picture) | 60 fps, 3.37 ms (3.26 to 3.37 over 3 loads) |
| lamp-in-fog | 8 of 8 | yes | 60 fps, 1.89 ms (1.77 to 2.00 over 3 loads) |
| lens-light | 8 of 8 | yes | 60 fps, 1.24 ms (1.18 to 1.25 over 3 loads) |
| lens-model | 8 of 8 | yes | 60 fps, 0.78 ms (0.74 to 0.79 over 3 loads) |
| light-leak | 8 of 8 | yes | 60 fps, 1.81 ms (1.80 to 1.81 over 3 loads) |
| lunar-corona | 8 of 8 | no (a still picture) | 60 fps, 3.75 ms (3.59 to 3.76 over 3 loads) |
| moon-through-cloud | 8 of 8 | yes | 60 fps, 1.16 ms (1.12 to 1.26 over 3 loads) |
| moonbow | 8 of 8 | yes | 60 fps, 3.97 ms (3.71 to 4.00 over 3 loads) |
| moonlit-water | 8 of 8 | yes | 60 fps, 9.45 ms (9.37 to 9.57 over 3 loads) |
| night-street | 8 of 8 | yes | 60 fps, 2.98 ms (2.96 to 3.12 over 3 loads) |
| photo-focus | 8 of 8 | yes | 60 fps, 3.12 ms (3.10 to 3.42 over 3 loads) |
| prism | 8 of 8 | yes | 60 fps, 4.15 ms (4.10 to 4.22 over 3 loads) |
| prism-icosahedron | 8 of 8 | yes | 60 fps, 5.59 ms (5.55 to 5.69 over 3 loads) |
| rack-focus-transition | 8 of 8 | yes | 60 fps, 1.44 ms (1.35 to 1.48 over 3 loads) |
| snow-at-night | 8 of 8 | yes | 60 fps, 1.35 ms (1.32 to 1.38 over 3 loads) |
| spectral-bokeh | 8 of 8 | yes | 60 fps, 1.33 ms (1.32 to 1.37 over 3 loads) |
| spectral-halo | 8 of 8 | yes | 60 fps, 1.25 ms (1.24 to 1.27 over 3 loads) |
| wire-loader | 8 of 8 | yes | 60 fps, 0.88 ms (0.84 to 0.90 over 3 loads) |

No view logged a console error.
