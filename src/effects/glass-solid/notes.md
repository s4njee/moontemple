## How it works

A glass icosahedron turns slowly in front of a night horizon. Every pixel the solid can reach is traced through it, one wavelength at a time, against the same backdrop the rest of the frame shows. The effect is a thin wrapper round a reusable layer, `createGlassBody` in `src/gpu/glass/body.ts`, which the showpiece (10.5) will put under the wireframe and the spectral bloom.

**The backdrop** (`body.wgsl`, `night_backdrop`) is a function of direction: a sky darkening upwards with sparse stars, a thin horizon line bright enough to bloom with a narrow glow either side, dark water below, seven small lights on the horizon, and the moon (`moon.wgsl`'s `moon_disc`), which is also the key light. The camera looks level, so the horizon runs straight across the middle of the solid, and refraction bends and breaks it there. Pixels the solid cannot reach (outside the box round its bounding sphere) get the backdrop alone from a light pass of their own.

**The trace** (`src/wgsl/glass-body.wgsl`, `body_trace`) is the tracer of story 9.2 (`glass.wgsl`) widened: at the face the ray meets, unpolarised Fresnel splits it into a reflection (looked up in the backdrop) and a refracted ray; inside, at every face, what escapes is refracted out and looked up, and the rest reflects on, totally past the critical angle, up to **bounces** reflections, after which the remainder is dropped. Beer–Lambert absorption by wavelength along each leg tints it (the **colour through one radius**, raised to the power **absorption**), and a faint **glow** is added along each leg and absorbed on its way out like everything else, so the glass reads as lit from within.

**Spectral or three channels.** The backdrop is RGB, so to look at it one wavelength at a time it is uplifted to a spectrum: three soft-edged boxes mixed by a matrix chosen so that the spectrum, summed back through `spectral_rgb`, gives the RGB exactly (`BODY_UPLIFT`; a test keeps it equal to `upliftInverse` in `src/gpu/glass/solid.ts`). In **spectral** sampling each sample is a hero of four wavelengths a quarter of the visible range apart (`hero_wavelengths`), each traced with its own index (Sellmeier: crown, flint or diamond), and the four summed by `hero_to_rgb`. The hero and the position inside the pixel step through an R2 sequence from frame to frame, offset per pixel, and the frames are blended into a history (a fifth to a tenth of the new frame while the solid turns, a true average while it holds still), so a single hero a pixel a frame averages to a smooth spectrum. **Three channels** is the cheap version: three rays, red at 650 nm, green at 550 and blue at 450, each seeing only its own channel of the backdrop.

**Caustics at the corners** (9.5) come two ways. **Traced** (`src/gpu/glass/caustics.wgsl`): 65 536 rays a frame from the moon's direction, in the solid's own frame, refracted in and followed through their reflections; wherever one lands on the inside of a face after at least one reflection it is added, bilinearly with atomics, into that face's 32 × 32 tile of an atlas, and averaged over frames. The body's rays read the atlas at every face they meet, as light scattered there by a face that diffuses a share (**caustic strength**) of what falls on it. **Stand-in**: a glow at each corner's place on screen, weighted by how squarely the faces round it meet the light, a tight core in a softer skirt, inside the solid's outline only. The stand-in is the default; [docs/studies/glass.md](../../../docs/studies/glass.md) has the comparison.

**Thin film** (9.6, `src/wgsl/thinfilm.wgsl`): a soap film on every face, its reflectance the full Airy sum per wavelength (`thin_film_reflectance`; Light Temple's three-wavelength `thin_film` is copied alongside it, credited). The film does not absorb, so a face still conserves light. It thins towards the top of the solid (**film thinner at the top**), as a draining film does, so the colours band across the faces. With **glass** set to **air** the solid is a hollow film, a bubble.

**Resolution.** The trace runs at **trace resolution** of the frame (half by default) into a layer holding the body alone, premultiplied, with its coverage in alpha, and that is scaled up and laid over the backdrop. The layer is what a defocused body (10.4) would take.

**Held frame.** Reduced motion holds the solid at its resting angle, a corner up and a face towards the viewer, traced with eight times the samples in the one frame (and eight times the caustic rays) so it is clean without a history.

**Checks** (`tests/glass-solid.test.ts`): the uplift matrix in WGSL matches TypeScript, white uplifts to a flat 1 and three colours come back within 0.001; `body_trace` matches the CPU `traceRays` against the same backdrop within 0.5% for fifteen rays (spectral and one channel, with absorption, 3 to 8 bounces); a pixel of the body module matches the CPU trace of its own view ray in all three channels; with no absorption a white backdrop seen through the solid comes out white, 0.93 to 1.005 in every channel (the light still inside after the eighth reflection is what is missing) and neutral within 0.02, spectral and three-channel; the Airy film equals bare Fresnel at zero thickness and the closed form for a symmetric film; over twelve random light directions the brightest 1% of a traced atlas lies on average under 0.8 of the mean texel's distance from the nearest corner; and the GPU atlas holds the same light as the CPU twin (`traceCaustics`) within 5%, in total and face by face.

## Cost

Measured on Dawn on the M1 Max (marginal frame time, `experiments/glass-solid-cost.test.ts`), including the HDR tail:

| Settings                                           | 1920 × 1080 | 390 × 844 |
| -------------------------------------------------- | ----------- | --------- |
| Default: half resolution, spectral, 1 hero         | 1.97 ms     | 1.31 ms   |
| Half resolution, spectral, 2 heroes                | 3.80 ms     | 2.42 ms   |
| Half resolution, three channels, 1 sample          | 1.66 ms     | 1.29 ms   |
| Half resolution, traced caustics (2 heroes)        | 4.85 ms     | 2.86 ms   |
| Half resolution, 8 bounces (2 heroes)              | 5.07 ms     | 3.34 ms   |
| Full resolution, spectral, 2 heroes                | 7.65 ms     | 5.33 ms   |
| Full resolution, three channels, 1 sample          | 3.06 ms     | 2.05 ms   |
| Backdrop and tail alone (solid shrunk out of view) | 1.81 ms     | 1.53 ms   |

The cost is the trace: pixels covered × wavelengths × (bounces + 2) plane tests against up to 20 faces and as many backdrop lookups. A spectral hero traces four wavelengths, three channels trace three, so spectral costs about a third more a sample, and twice the samples or the bounces nearly double it. Not measured yet in a browser. Texture memory: the layer and two history targets, rgba16float at the trace resolution (6 MB at half of 1080p), and 0.6 MB of caustic atlas. Bundle size not measured yet.

## Pitfalls

- **Passing the solid by value.** A first version passed glass.wgsl's `GlassSolid` (336 bytes) to every interval test; Metal copied it to private memory each call, and the trace was three times slower. The body reads planes through `body_plane(i)` straight from the uniform instead.
- **Noise.** One hero a pixel a frame is grainy on its own; the history hides it while the turn is slow. A faster turn shortens the history (**turn** above about 0.5 rad/s shows grain). The spectral uplift clamps the negative lobes of saturated colours, so a saturated backdrop comes back slightly off; the night sky is not saturated enough to show it.
- **Three channels look different, not just cheaper**: a deeper, more saturated blue body (each channel absorbs alone, with no overlap between them) and dispersion as three separate ghosts, red, green and blue, instead of a rainbow. It is noise-free.
- **Traced caustics are a wash, not spots.** A flat face does not focus light; what gathers near the corners is where several reflected beams overlap, a patchwork of polygons. Spread over the faces as diffuse light it reads as a haze over the body. The stand-in looks like the reference; it is not physics.
- **The bubble** is faint against a night sky: a soap film reflects at most about 8%, and there is little here to reflect. It reads where it catches the horizon and the moon.
- **The trace stops after the set bounces**: with 5, a few per cent of the light (more in diamond) is still inside and is lost, slightly darkening the most internally reflective facets.
- **Flash**: the analyser rates the defaults `low`: a facet turning to catch the horizon brightens a cell once over seconds. Faster turns have not been swept.

## When to use it

A hero for a page about light, optics, glass or crystal; a logo mark as a glass object; teaching refraction and dispersion. Tier B at half resolution with one hero (about 2 ms at 1080p on the M1 Max), Tier C at full resolution with two. Use three channels for a cheaper, noise-free and more saturated look; drop the glass entirely (the wireframe and bloom of Epic 10) for a loader or an icon. Where WebGPU is missing, a still of the solid at rest, or a short loop.

## References

- Wilkie, Nawaz, Droske, Weidlich and Hanika, [Hero Wavelength Spectral Sampling](https://jo.dreggn.org/home/2014_herowavelength.pdf) (EGSR 2014).
- Alan Zucconi, [Improving the Rainbow](https://www.alanzucconi.com/2017/07/15/improving-the-rainbow-2/): the `spectral_rgb` fit, via Light Temple.
- Light Temple, `src/shaders/optics.wgsl`: `thin_film` and `spectral_rgb`.
- Born and Wolf, _Principles of Optics_: Fresnel equations and the Airy formula for a thin film.
- Schott, optical glass data sheets: Sellmeier coefficients for N-BK7 and F2.
- Smits, [An RGB-to-Spectrum Conversion for Reflectances](https://www.cs.utah.edu/~bes/papers/color/) (1999): the idea of the box-basis uplift.
- Pharr, Jakob and Humphreys, [Physically Based Rendering](https://pbr-book.org/), dielectric BSDFs and light tracing.
