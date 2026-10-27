# Moon Temple

A research gallery of WebGPU effects for light seen through a lens: out-of-focus orbs, depth of field, halos, glints, flares and night haze. Each one comes with a live demo, readable source, a write-up and a practicality scorecard, and is judged the way the temples judge theirs: **would you actually ship this on a website?**

It is built on Fire Temple's page structure and the shared temple core (`@mk7s/hologpu-temple-core`), from Storm Temple's copy of the shell. The accent is violet-blue, the colour of the orbs in the reference picture. See [plan.md](./plan.md) for the roadmap.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5450
npm test           # lens and point-light tests, the WCAG 2.3.1 flash analyser and the held-frame audit
npm run build      # registry, typecheck, static build to dist/ and the bundle check
npm run study -- --epic 4   # cost study on Dawn: docs/studies/epic-4.md and the Scorecard numbers
npm run shot -- glitter --times 2   # render an effect headlessly to PNG (output/shots)
npm run browser-check -- --report docs/studies/browser-check.md   # every effect in headless Chrome (dev server running)
npm run posters -- --force   # fallback posters from held frames, as WebP
```

`?effect=<id>` opens an effect, `&hud=1` the performance HUD, and `&p.<param>=<value>` sets a parameter.

## Effects

`spectrum.html` ("Slow spectrum") is a standalone page with `bokeh-drift` fixed behind the whole page on its `rgb` palette: the field turns slowly round the colour wheel, a turn a minute, and the page's accents turn with it.

| Id              | What                                                                                                           | Tier |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| `hello`         | The smallest effect: layers of drifting violet orbs under a haloed light                                       | B    |
| `lens-model`    | A night street through a lens: the circle of confusion and every aperture shape, focus walking                 | A    |
| `fairy-lights`  | Strings of bulbs at several depths behind a close focus, swaying and twinkling under the flash cap             | A    |
| `snow-at-night` | Snow past a street lamp in fog: specks far off, huge faint discs near the lens                                 | A    |
| `night-street`  | Headlights, tail lights, lamps and neon behind a fast lens, mirrored in a wet road; the pointer pulls focus    | A    |
| `glitter`       | Thousands of tilted facets that glint as a moving light passes, sharp in focus and discs out of it             | A    |
| `fireflies`     | Fireflies glowing on their own rhythms in depth; the pointer moves the plane of focus                          | A    |
| `dust-in-light` | Dust in a shaft of sunlight, the beam's glow in closed form                                                    | A    |
| `aperture-lab`  | Every aperture shape and aberration, chosen with the pointer; the near field flipped                           | A    |
| `lens-light`    | Colour fringes, halation, diffraction spikes, flare ghosts and an anamorphic streak, each on its own control   | A    |
| `glint-hover`   | Star glints on the corners of the page's buttons and cards nearest the pointer                                 | A    |
| `flare-cursor`  | The pointer as a light: spikes and aperture-shaped ghosts swinging through the centre                          | A    |
| `dof-lab`       | The depth-of-field methods on a night shot and an edges shot, beside a reference traced through the whole lens | C    |
| `photo-focus`   | A photo and its depth map refocused with a click, highlights opened back into bokeh; drop in your own          | B    |
| `focus-cursor`  | Floating lanterns, and a lens whose focus racks to whatever the pointer is on                                  | A    |
| `bokeh-drift`   | The reference picture: orbs at many depths behind a close focus, keeping their light                           | A    |

Tiers come from `npm run study` on Dawn and `npm run browser-check` in Chrome on an Apple M1 Max (`src/effects/measured.json`, `docs/studies/`): the lowest tier both readings fit. No integrated GPU or phone has been measured, so they are provisional.

## Shared pieces

- `src/gpu/post/`: the HDR tail every effect ends with (bloom, tonemap, sRGB).
- `src/gpu/optics/lens.ts` and `src/wgsl/coc.wgsl`: the thin-lens circle of confusion, from a camera or from two numbers.
- `src/gpu/points.ts` and `src/wgsl/aperture.wgsl`: points of light drawn as the aperture's shape at their circle of confusion, each adding exactly its own light at any size and position (`tests/points.test.ts`). Shared controls in `src/gpu/optics/aperture.ts`.
- `src/gpu/strokes.ts`: Storm Temple's stroke renderer: instanced segments or a polyline, shaded by a caller's WGSL chunk, with `max` or `add` blending and an afterglow. For streaks, flare spikes and trails.
- `src/gpu/dof/`: six depth-of-field post-processes behind one interface (`DOF_METHODS`): gather (the desktop default), separable hexagon (the light-tier one), circular separable, sprite bokeh, layers, and the depthless tilt-shift band; the ray-traced reference they are scored against, and the scoring (`tests/dof-*.test.ts`). Which to use when: [docs/studies/epic-3.md](docs/studies/epic-3.md).
- `src/gpu/dom-rects.ts`: the page's marked elements (`data-mt-obstacle`, `data-mt-target`) as rectangles in canvas uv, read every frame.
- `tests/flash.ts`: Fire Temple's flash analyser, run on Dawn over every effect and preset by `npm test`.
- Reduced motion: a paused host draws one frame and holds it, and tells the effect so (`FrameTime.still`); `tests/still.test.ts` checks every effect and preset shows its subject, never a frozen flare.

## Licence

MIT. See [LICENSE](./LICENSE).
