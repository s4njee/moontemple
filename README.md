# Moon Temple

A research gallery of WebGPU effects for light seen through a lens: out-of-focus orbs, depth of field, halos, glints, flares and night haze. Each one comes with a live demo, readable source, a write-up and a practicality scorecard, and is judged the way the temples judge theirs: **would you actually ship this on a website?**

It is built on Fire Temple's page structure and the shared temple core (`@mk7s/hologpu-temple-core`), from Storm Temple's copy of the shell. The accent is violet-blue, the colour of the orbs in the reference picture. See [plan.md](./plan.md) for the roadmap.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5450
npm test           # lens and point-light tests, the WCAG 2.3.1 flash analyser and the held-frame audit
npm run build      # registry, typecheck and static build to dist/
```

`?effect=<id>` opens an effect, `&hud=1` the performance HUD, and `&p.<param>=<value>` sets a parameter.

## Effects

| Id            | What                                                                                           | Tier |
| ------------- | ---------------------------------------------------------------------------------------------- | ---- |
| `hello`       | The smallest effect: layers of drifting violet orbs under a haloed light                       | A    |
| `lens-model`  | A night street through a lens: the circle of confusion and every aperture shape, focus walking | A    |
| `bokeh-drift` | The reference picture: orbs at many depths behind a close focus, keeping their light           | A    |

Nothing has been measured yet; the tiers are guesses until the cost harness (plan story 1.7) runs.

## Shared pieces

- `src/gpu/post/`: the HDR tail every effect ends with (bloom, tonemap, sRGB).
- `src/gpu/optics/lens.ts` and `src/wgsl/coc.wgsl`: the thin-lens circle of confusion, from a camera or from two numbers.
- `src/gpu/points.ts` and `src/wgsl/aperture.wgsl`: points of light drawn as the aperture's shape at their circle of confusion, each adding exactly its own light at any size and position (`tests/points.test.ts`). Shared controls in `src/gpu/optics/aperture.ts`.
- `src/gpu/strokes.ts`: Storm Temple's stroke renderer: instanced segments or a polyline, shaded by a caller's WGSL chunk, with `max` or `add` blending and an afterglow. For streaks, flare spikes and trails.
- `src/gpu/dom-rects.ts`: the page's marked elements (`data-mt-obstacle`, `data-mt-target`) as rectangles in canvas uv, read every frame.
- `tests/flash.ts`: Fire Temple's flash analyser, run on Dawn over every effect and preset by `npm test`.
- Reduced motion: a paused host draws one frame and holds it, and tells the effect so (`FrameTime.still`); `tests/still.test.ts` checks every effect and preset shows its subject, never a frozen flare.

## Licence

MIT. See [LICENSE](./LICENSE).
