## How it works

One fullscreen pass (`fog.wgsl`) and the shared HDR tail. Each pixel is a view ray from an eye 1.6 m above a road. It ends on the ground, on a lamp post or its arm, or where the fog ends at 120 m, and four things are added along it.

**The cone under the shade** is single scattering from a spot light, done the way 2.8 did the bare light. `src/gpu/optics/beam.ts` has the derivation. 2.8's substitution (θ the angle at the lamp, measured from the ray's closest approach) turns the scattering integral along the ray into one smooth one-dimensional integral. A cone does not change the integrand. It only moves the limits: a ray meets a cone of half-angle under 90° in a single interval, found from a quadratic. The interval's ends go through `atan` to the angles at the lamp, and a Gauss–Legendre sum is taken between them. The shade's soft edge is a smoothstep in the angle from the axis, evaluated at each node. The edge stays well sampled because the direction from the lamp turns exactly as fast as θ does, so no node spacing can skip it. `src/wgsl/beam.wgsl` is the WGSL twin.

**The halo** comes from the light the glass bowl spills in every direction (5% of the beam). It uses the same sum with no cone: from the eye to where the ray stops, rather than 2.8's whole infinite ray, so the ground cuts it off. Without forward scattering it equals `airlight_forward` from 2.8.

**The drifting density** uses two fetches of the baked noise tile (`noisetex.wgsl`, now with `src/gpu/emission/noise-texture.ts` ported from Fire Temple). The tile is read on two planes, one lying flat and one standing, so the fog varies in all three directions. The two layers slide across the road at different speeds (0.4 m/s by default), so patches change shape as well as travel. The density scales the scattering at every cone node and, sampled once at the closest approach, the halo. The extinction stays uniform. The march in the tests makes the same assumption, so they check the quadrature and not that approximation.

**The rest:**

- A dim sky glow scattered by all the fog. It is patchy by the density at its median depth.
- Pools on the wet road from each lamp's beam (inverse square, cosine, extinction).
- A faint, energy-normalised Phong reflection of each bowl in the water film.
- The posts, lit by their own beams.
- The bowl itself as a small antialiased disc that blooms.
- With `moon`, `moon_disc` beyond the fog with its own 2.8 halo. It only shows through thin fog, which is what a real moon does.

The breath is the flicker module's slow signal at 0.3 knots a second with no shimmer. Its depth defaults to 5%, and a held frame shows the mean. A taller lamp stands further off, so its head keeps the same place in the frame. A canvas taller than 5:4 widens the view instead of cropping the lamp.

## Cost

Measured in Chrome's HUD on the M1 Max at 932 × 883 (DPR 2), as the browser reports one frame (`browser-span`):

| Configuration                                | GPU per frame | Fog pass                 | Budget               |
| -------------------------------------------- | ------------- | ------------------------ | -------------------- |
| One lamp                                     | 1.96 ms       | 1.31 ms                  | 98% of Tier A's 2 ms |
| `a row receding` (six lamps)                 | 3.78 ms       | 2.04 ms                  | over budget          |
| `snow-at-night`, side by side for comparison | 1.88 ms       | 1.08 ms (its night pass) | —                    |

Other agents were using the GPU during these runs, so the numbers are rough. The Dawn marginal cost and 1080p are not measured yet.

The first version used haze.ts's 12-point rule, and the fog pass took 1.48 ms for one lamp and 2.77 ms for six. Going to 8 points saved about a quarter. The error rose from under 0.5% to under 3% of a march, which is smooth and invisible.

Cost scales with the lamp count: every lamp adds a halo sum to every pixel, plus a cone sum with two texture fetches per node on the pixels inside its cone. Textures: the shared 256² noise tile (about 0.7 MB with mips, shared by the device) and the tail's targets (the HUD shows about 9 MB in all). Bundle size: not measured yet.

## Pitfalls

- **One noise plane makes streaks.** The first density read the tile on the (x, z) plane only. Seen through thin fog, up into the sky, that turned into vertical curtains. Two planes fixed it.
- **The noise at the scale of the scene is invisible.** At 7 m a cell, the fog looked uniform. It needed 3.5 m cells and about ±25% density before it read as drifting fog. It is still subtle on purpose.
- **A wet road shows its lamps' reflections only far off.** The near lamp's mirror point is below the frame. With an energy-normalised lobe, the reflections are faint glints, not the long streaks of a photograph. The bowl here is not as bright as a real one.
- **The posts are lit by their own beams.** That is right, but they read as pale lines, not silhouettes. Their albedo is 0.05.
- **Brightness drifts with the number of lamps.** Each lamp adds its halo to every pixel, so a row is brighter overall than one lamp.
- **The poster is captured from the effect page.** `npm run posters` opens it in its page layout (here the backdrop), not the bare canvas. This poster was taken with `layout` removed for the capture.
- **Light pages: untested.** The backdrop layout over a dark page reads well: the lamp shows through the veil and the text stays clear.

## When to use it

Behind an article, a quiet landing page, or a night, noir or travel hero. It is dark on the left two thirds, where text sits, and it changes slowly enough that the flash analyser rates it `none`. With one lamp it is Tier A at the edge of the budget. A row of lamps is a hero piece, over the A budget in Chrome.

For a halo alone, 2.8's `airlight_forward`, as in `bokeh-drift` and `snow-at-night`, is cheaper. For a still page, the poster is nearly the effect: it barely moves.

## References

- B. Sun, R. Ramamoorthi, S. Narasimhan, S. Nayar, [A Practical Analytic Single Scattering Model for Real Time Rendering](https://www.cs.columbia.edu/CAVE/projects/ss_model/) (SIGGRAPH 2005): the airlight substitution this extends to a cone.
- L. G. Henyey, J. L. Greenstein, [Diffuse radiation in the galaxy](https://doi.org/10.1086/144246) (1941): the phase function.
- V. Pegoraro, S. G. Parker, An Analytical Solution to Single Scattering in Homogeneous Participating Media (Eurographics 2009): a closed form for a point light, the route not taken here (the quadrature is short and also takes a cone and a varying density).
- Moon Temple 2.8, `src/gpu/optics/haze.ts`, `src/wgsl/scatter.wgsl`; Fire Temple's baked noise, `src/gpu/emission/noise-texture.ts`.
