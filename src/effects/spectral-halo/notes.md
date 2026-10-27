## How it works

Three white lines of light, a ring, a starburst point and a turning hexagon, drawn as HDR radiance into the tail's scene (`shapes.wgsl`), and a halo made by moving some of that light outwards before the tail tonemaps it. The **halo** control switches between four ways of making it, all on the same light: the spectral bloom, a bloom with a radius per channel, 2.5's film halation, and a plain bloom.

**The spectral bloom** (`src/gpu/post/spectral-bloom.ts` and `.wgsl`) treats each channel's light as spread over 16 wavelengths in the white-balanced proportions of `spectralSamples`. Each wavelength scatters a share of its light into a Gaussian whose sigma grows as a power of the wavelength, `radius * (nm / 700)^k`, with k chosen so violet's is `spread` times narrower than red's. With **balance** at 1 each wavelength's share grows with its sigma squared, so every band's halo starts equally bright: next to the line the halo is white, and outwards, as the narrow blue and green halos run out, it turns gold, orange and a red-orange. The light is moved, not added: each channel keeps (1 − its scattered share) and gets the share back spread out, so every channel's total is unchanged and white light integrates to white (within 0.1% measured, `tests/spectral-bloom.test.ts`). The blue the halo does not take stays in the line, which is burnt white anyway.

**Cheap.** Since the scene is RGB, the sixteen bands collapse into one kernel per channel, a mixture of Gaussians, and the mixture is fitted to at most six blurs ("anchors"), spaced evenly in log sigma; each band's weight is split between the two anchors round its width so that its variance is kept. Each anchor is blurred at the coarsest level of a small pyramid that still holds it at 2.5 texels or more (a quarter or an eighth of the size for the defaults), with a separable Gaussian (the core's `createBlur`), and one composite pass reads all of them and blends over the scene with a per-channel blend constant, in place. The number of bands costs CPU only.

The comparisons go through the same passes: **per-channel** is one Gaussian per channel with the share and variance the spectral kernel gives that channel; **plain bloom** is one white Gaussian; **halation** is 2.5's pass (red 1, green 0.35, blue 0.05 of the scatter) at the per-channel bloom's red sigma. The tail's own bloom is off by default so the halo is only the one chosen.

## Cost

GPU time not measured yet with the study's method (`npm run study`). A rough wall-clock time on Dawn on the development machine (M1 Max) at 1920 × 1080, best of five runs of 100 frames of the pass alone, was 1.3 to 1.5 ms for the spectral bloom, about 1.0 ms for the per-channel one, 0.9 to 1.0 ms for halation and 0.6 ms for the plain bloom, against 0.1 ms for an empty pass (`experiments/spectral-bloom.test.ts`, docs/studies/spectral-bloom.md). At the defaults at 1080p the spectral bloom makes five anchors at pyramid levels 2, 2, 3, 3 and 4 with 9 to 14 taps a side: one pyramid of up to four levels, ten blur passes and the composite. Its cost grows with the number of anchors (up to six, more for a wider `spread`), not with `bands`. Texture memory at 1080p, all rgba16float: the pyramid (half, quarter, eighth and sixteenth size, about 5.5 MB) and each anchor's target and its blur's intermediate at the anchor's level (about 5.3 MB for the default five), so about 11 MB, most of it the half-size level that only feeds the quarter one.

## Pitfalls

- **With Zucconi's fit the rim never reached red.** That fit (`spectralRgb`) gives the longest wavelengths some green, and blue a small bump at 560 to 640 nm, so the outermost halo's hue stopped at about 19° and, dim under the tonemap, read amber-brown. Since the showpiece (10.5) the bands take their colours from the CIE functions clamped into sRGB (`cieSamples`, the `colours` setting), whose red end is red, and the rim turns orange and then red. The study's numbers in docs/studies/spectral-bloom.md were measured with the old fit; `colours: 'zucconi'` restores it.
- **Equal shares put a blue ring inside the halo.** With **balance** 0 every wavelength scatters the same share, so the narrow blue halo is the densest next to the line and the halo goes white, pale blue, white, then orange (the "even scatter" preset). That is what energy conservation with a width alone does; balance 1 moves the colour into the amounts instead.
- **Spectral and per-channel look nearly the same.** For RGB input both are one kernel per channel; with the same share and variance the visible halos differ by a couple of degrees of hue. The difference is the tail: the per-channel Gaussians' R/B shoots up past two sigma (24 at 32 px, 468 at 40 px in the study) to a hard saturated edge where the halo fades, while the spectral mixture's climbs steadily (6.5, 9.4) and reaches further for a bright source.
- The blurs are cut at three sigma of their level (renormalised, so no light is lost), which ends each halo at about 10⁻⁵ of its peak: a very bright source shows the edge.
- No threshold: like 2.5's halation it scatters every pixel's light, so dim parts of a scene soften by the scattered share too. Use it on light, not on a whole photograph.
- Pyramid levels are averaged over each texel's exact footprint, not bilinearly: at 960 × 540 the bilinear version skipped rows of the 135-row level and lost 1% of the red.

## When to use it

The halo of a bright line drawing, a glowing wireframe, a neon or a lamp, where the warm, widening rim is the point: the halo the reference picture of Epic 10 has. Tier B provisionally: about a millisecond at 1080p on an M1 Max. Where the colour of the rim matters less than the cost, the per-channel version through the same module (`mode: 'channel'`) looks almost the same for three anchors instead of five; for a strong film look with one orange tone, 2.5's halation; for a white glow, the tail's bloom.

## References

- Alan Zucconi, _Improving the Rainbow_ (2017): the spectral colour fit, by way of `src/gpu/optics/spectral.ts`.
- Spencer, Shirley, Zimmerman and Greenberg, _Physically-Based Glare Effects for Digital Images_ (SIGGRAPH 1995): scatter in the eye and the lens as a point spread function, wider in red.
- Kodak, _Kodak Motion Picture Film_ (H-1) on halation and the anti-halation backing: why the red layer's halo is widest.
- Jorge Jimenez, _Next Generation Post Processing in Call of Duty: Advanced Warfare_ (SIGGRAPH 2014): bloom from a mip pyramid with energy-preserving filters, the model for the pyramid here.
