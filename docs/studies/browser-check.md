# Browser check

Every registered effect, loaded in Google Chrome 156.0.8078.48 (headless, this machine's GPU) on 2026-10-27 by `npm run browser-check`.

Views per effect: `hero-light` (1280 × 900), `hero-dark` (1280 × 900), `cards-dark` (1280 × 900), `band-light` (1280 × 900), `backdrop-dark` (1280 × 900), `phone-light` (390 × 844 at 2x), `phone-dark` (390 × 844 at 2x), `hud-1080p` (1920 × 1080). The layouts are the mock pages of the effect page; "light" and "dark" are the page tone of the stage.

- **Started** counts the views in which the effect got a canvas and drew more than a flat fill, with no fallback notice and no console error.
- **Animates** means two captures a second apart differ by more than dither in at least one view.
- **HUD** is what the performance HUD showed on a 1920 × 1080 canvas: frames per second, and the GPU time of one frame as the browser reports it (first pass start to last pass end), as the median of several page loads with the range beside it. The range is wide for the lightest effects: when there is little to draw the GPU idles, and the same page reads either near the timing floor or about twice that from one load to the next.

The HUD time is not the number the cost studies report. It is one frame measured alone, through Chrome's coarse timestamps, on a GPU that idles between frames, so it carries a floor and reads higher than the per-frame cost in `docs/studies/epic-*.md`. It is here because it is what a visitor's browser actually does. This check says nothing about how an effect looks: the screenshots do.

| Effect | Started | Animates | HUD at 1080p |
| --- | ---: | --- | --- |
| aperture-lab | 8 of 8 | no (a still picture) | 60 fps, 0.81 ms (0.79 to 0.87 over 3 loads) |
| bokeh-drift | 8 of 8 | yes | 60 fps, 1.61 ms (1.45 to 1.73 over 3 loads) |
| dof-lab | 8 of 8 | yes | 60 fps, 6.13 ms (3.56 to 6.36 over 3 loads) |
| dust-in-light | 8 of 8 | yes | 60 fps, 0.82 ms (0.79 to 0.89 over 3 loads) |
| fairy-lights | 8 of 8 | yes | 60 fps, 1.16 ms (1.02 to 1.20 over 3 loads) |
| fireflies | 8 of 8 | yes | 60 fps, 0.78 ms (0.71 to 0.87 over 3 loads) |
| focus-cursor | 8 of 8 | yes | 60 fps, 0.95 ms (0.70 to 1.09 over 3 loads) |
| glitter | 8 of 8 | yes | 60 fps, 0.93 ms (0.77 to 0.95 over 3 loads) |
| hello | 8 of 8 | yes | 60 fps, 2.11 ms (1.97 to 2.25 over 3 loads) |
| lens-model | 8 of 8 | yes | 60 fps, 1.03 ms (0.88 to 1.05 over 3 loads) |
| night-street | 8 of 8 | yes | 60 fps, 1.16 ms (1.12 to 1.56 over 3 loads) |
| snow-at-night | 8 of 8 | yes | 60 fps, 0.83 ms (0.80 to 0.87 over 3 loads) |

No view logged a console error.
