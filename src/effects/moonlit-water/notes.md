## How it works

A low full moon over a moving sea, seen from 2.5 m up through an 85 mm lens at f/1.8 focused at 1.5 m. Every glint on the water is a point of light at a known distance, so with the focus pulled close they all become aperture-shaped discs of the same light, and the glitter path becomes a river of discs; pull the focus out to sea (the pointer's height, or `focus`) and they gather back into sparkle. Three parts:

1. **The glints** (`glints.ts`, on the CPU). Built on Water Temple's `sun-glint` "stable glitter": the sea is cut into cells fixed in the world, and a cell glints when the slope its facets need to mirror the moon into the lens (the half vector between moon and lens) is near the slope the sea has there. The sea's slope is the five swells of Water Temple's `waterplane.wgsl`, ported as `swell.ts`, plus the small waves as a Gaussian spread with Cox and Munk's wind-speed variances. Each cell's expected light is the classic glitter formula, `E_moon F p / (4 cos⁴β)` times its solid angle, with water's Fresnel reflectance and the moon's irradiance from the shared moon model (`moonLight`, `MOON_ANGULAR_RADIUS`). Swells shorter than a cell go into the Gaussian, so far cells see a rougher sea. Each glinting cell goes to the shared point layer at its distance with the thin lens's signed circle of confusion.
2. **The moon's disc** is points too: up to about 1 800 samples of the shared moon (`moonRadiance`, the TypeScript twin of `moon.wgsl`'s `moon_disc`) at infinity, so out of focus it becomes the same aperture-shaped disc as the glints.
3. **The sea and sky** (`sea.wgsl`, one fullscreen pass behind the points): a dark sky gradient with the moon's aureole from `moon.wgsl`, and the sea mirroring it through the same swells with Fresnel over a near-black body. The disc is left out of the reflected sky because the glints carry it (Water Temple's rule: count the light source once). Depth of field is faked: each swell fades out where it is shorter than the circle of confusion at its distance, the aureole's peak is flattened inside the blur angle, and the horizon is softened over the blur at infinity.

The cells are laid out so every cell carries about the same expected light. With cells of one angular size, the path's radiance (which grows many times towards the horizon, from Fresnel at grazing) put a third of the light in ten far cells, and their twinkle moved the whole path's brightness by 6% in a frame. Now the cell size is set per distance level from each level's measured light per cell, the total by the `glint cells` budget, and the top ten cells carry under 2%. Levels are blended with hat weights, so the light per area is the same whatever the budget: 1 500 cells and 15 000 agree within 15% (`tests/moonlit-water.test.ts`).

**Flash safety.** Many small bright changes is the risk here. Instead of sun-glint's circling facets, whose twinkle rate has no bound, each cell's brightness is a peaked, monotone function of the capped flicker signal (`src/gpu/optics/flicker.ts`, rate at most 4 knots a second), normalised to mean 1. A monotone function cannot reverse direction more often than the signal does, so a single glint cannot flash more than three times a second at any `twinkle` asked for (checked over 300 cells and four rates). The swell moves slowly, about one swing a second for the shortest wave. A held frame keeps the moment's pattern of glints but clips each at twice its mean.

## Cost

9.8 ms a frame at 1920 × 1080 on Dawn at the defaults (8.2 to 11.1 over the runs), an Apple M1 Max: over Tier B's 6 ms, so Tier C ([docs/studies/epic-5.md](../../../docs/studies/epic-5.md)). It is the points pass. At f/1.8 focused close every glint is a disc about 12% of the frame's height across, and about 2 400 of them overdraw each other. The presets with sharper glints, or fewer of them, cost a quarter of that: `sharp sparkle` (focused far, f/5.6) 2.2 ms, `half moon` 2.7, `high moon` (a shorter path) 2.6. For a Tier B page, start from those.

The CPU part, measured in Node: 1.8 ms a frame for the default 6 000 cells, most of it the flicker signal's hashes and the swell's sines; 13 ms to lay the cells out again when the moon, the waves, the wind, the budget or the frame's shape changes. Texture memory is the HDR tail's (about 8.7 MB at 0.85 Mpx).

## Pitfalls

- **The moon is drawn 20 times dimmer than the light that makes the path.** A camera exposed for the path clips the moon by far more than that; drawn at the path's radiance, its bloom filled the frame.
- **Held frame.** Held at every cell's mean, the path was a smooth smear with no discs, and read 7% brighter through the tone curve than any played frame (the reduced-motion audit caught it). It now keeps the moment's glints, clipped at twice their mean.
- **The sea is not really blurred.** Only the glints, the moon and (roughly) the aureole defocus; the sea's own reflections fade their small waves instead. Before the aureole was flattened in the blur, the wave crests mirroring it stayed sharp lines inside the river of discs in `windy night`.
- **The flash analyser's verdict is `low` at every preset** (peak 1 to 2 flashes in any one cell, no area over three a second), and still `low` pushed further: twinkle 4, 500 cells, brightness 4, the swell at 2 and the wind at 15 m/s gave at most 3 in a cell, over no area. Measured at 480 × 270 only.
- The twinkle is a stand-in for the small waves' motion, not their optics: where a glint is comes from the waves, when it shines from the capped signal. Real moon glitter twinkles faster than four times a second; this is calmer by design.
- A low moon puts most of the path's light in a thin, saturated strip at the horizon, as photographs show. The horizon is flat (no Earth curvature) and there is no shadowing by the waves.
- The far cells are kilometres deep and a pixel tall, so the strip's glints are scattered over a few rows; a change of frame size or moon height lays the cells out again, which pops the pattern once.

## When to use it

A night hero for travel, coastal, music or wellbeing sites, or a slow background behind a headline on a dark page. Tier B: the CPU time and the points pass's overdraw at large discs are the concern; lower `glint cells` on weak machines. Move the cell test to the GPU (compute writing the point buffer, drawn indirectly) before shipping it widely. For a plain glittering sea without the lens, Water Temple's `sun-glint` is one cheap fullscreen pass.

## References

- Water Temple's `sun-glint` and `waterplane.wgsl` (stable hashed glitter, the swell model).
- Cox and Munk, [Measurement of the Roughness of the Sea Surface from Photographs of the Sun's Glitter](https://opg.optica.org/josa/abstract.cfm?uri=josa-44-11-838) (JOSA 1954): the slope variances and the glitter formula.
- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981).
- WCAG 2.2, [Success Criterion 2.3.1, Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).
