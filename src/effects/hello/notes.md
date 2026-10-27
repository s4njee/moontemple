## How it works

One fragment pass (`orbs.wgsl`) into the HDR scene, then the shared tail (bloom, tonemap, sRGB). Three layers of orbs, each a grid with at most one orb per cell at a hashed position, drifting slowly upwards. An orb is drawn the way a round aperture renders a defocused point: a flat disc with a slightly brighter rim, its edge softened by `defocus`. Nearer layers have bigger cells, softer edges and more light. A single light sits above them with a small hot core and a wide halo, and bloom does the rest.

Each pixel visits the nine cells around it in each layer, so the cost is fixed at 27 hash evaluations a pixel whatever the density. Nothing is stored between frames: the picture is a pure function of time, so a held frame and a poster are the same orbs.

This is the scaffold's smallest example, not the bokeh research. Story 4.1 (`bokeh-drift`) replaces the flat disc with a real aperture shape, energy-conserving brightness and a depth-of-field model.

## Cost

On an Apple M1 Max: 1.44 ms per frame at 1080p on Dawn ([docs/studies/epic-1.md](../../../docs/studies/epic-1.md)), against 0.44 ms for the HDR tail alone, and 1.84 ms for one frame in Chrome at 962 × 884, where the orbs pass alone reads 0.93 ms. That is more than twice `bokeh-drift`, which draws more orbs as instanced discs: 27 hash lookups a pixel cost more than a quad per orb. In Chrome, 2.11 ms for one frame on a 1920 × 1080 canvas (`npm run browser-check`), over Tier A's 2 ms: Tier B, by the rule that an effect takes the lowest tier both readings fit.

## Pitfalls

- The orbs are additive light on an opaque dark scene: on a light page this is a dark block, not decoration over the page.
- The disc's area grows with `defocus` but its brightness does not fall, so a more defocused orb carries more total light than a sharp one. A real lens spreads the same light over the larger disc (story 2.3).

## When to use it

As the template for a new effect. As decoration, a dark ambient hero where any soft moving light will do; story 2.1 is the one to ship.

## References

- Moon Temple [plan.md](../../../plan.md), Epics 1 and 2.
