# Glass: the traced body, its caustics and its film (stories 9.4 to 9.6)

`glass-solid` traces a turning glass Platonic solid per pixel against a night backdrop, through `createGlassBody` in `src/gpu/glass/body.ts`, the layer the showpiece (10.5) will build on. This note records the two comparisons the plan asks for, spectral sampling against three channels (9.4) and traced caustics against a screen-space stand-in (9.5), with the decision for each, and what the thin film (9.6) does. Numbers are from Dawn on the M1 Max (`experiments/glass-solid-cost.test.ts`, marginal frame time including the HDR tail) unless stated.

## Spectral against three channels

Both trace the same split-at-every-face path through the solid (`body_trace` in `src/wgsl/glass-body.wgsl`); they differ in what a ray carries.

- **Spectral**: a hero sample is four wavelengths a quarter of 400 to 700 nm apart (Wilkie et al.), each with its own Sellmeier index, its own absorption, and its own look at the backdrop, which is RGB uplifted to a spectrum exactly (three soft boxes mixed by a matrix that makes the round trip through `spectral_rgb` the identity; `BODY_UPLIFT`). The hero steps through an R2 sequence per pixel and frames are blended into a history.
- **Three channels**: red, green and blue traced at 650, 550 and 450 nm, each seeing only its own channel.

| At 1080p, trace at half resolution | Cost    | At full resolution |
| ---------------------------------- | ------- | ------------------ |
| Spectral, 1 hero (4 wavelengths)   | 1.97 ms | not measured       |
| Spectral, 2 heroes                 | 3.80 ms | 7.65 ms            |
| Three channels, 1 sample           | 1.66 ms | 3.06 ms            |
| Three channels, 2 samples          | 3.39 ms | not measured       |

A hero costs about four thirds of a three-channel sample, as the count of traced wavelengths says. What each looks like:

- **Dispersion.** Spectral splits an edge or the refracted horizon line into a continuous rainbow fringe. Three channels split it into three separate ghosts, red, green and blue, with gaps between; at flint's dispersion the ghosts are a pixel or two apart and read as coloured specks on the facets rather than spectra.
- **Body colour.** Three channels give a deeper, more saturated blue: each channel absorbs on its own, so the red channel can go nearly black while blue keeps everything. In the spectrum the absorption is smooth and every wavelength contributes to two channels, so the same settings give a paler, cyan-leaning glass. Neither is wrong; they are different materials for the same three numbers.
- **Noise.** Three channels are deterministic: jitter for antialiasing is the only thing that changes from frame to frame. One hero a pixel a frame is visibly grainy alone and needs the history (a tenth to a fifth of the new frame while turning slowly); then it is smooth. At a fast turn the history has to shorten and the grain shows.

**Decision.** Spectral by default: the continuous fringes are the reason for the epic, and at half resolution with one hero it costs 0.3 ms more than three channels. Three channels is the setting for a lower tier, a fast turn, or a deliberately saturated look (`three channels` preset).

## Caustics at the corners: traced against a stand-in

**Traced** (`src/gpu/glass/caustics.wgsl`, CPU twin `traceCaustics` in `src/gpu/glass/solid.ts`). 65 536 rays a frame from the key light (the moon), in the solid's frame, refracted in and followed through up to the set reflections; where one lands on the inside of a face after at least one reflection, it is splatted into that face's 32 × 32 tile of an atlas and averaged over frames (a fifth of a new frame while turning). The body's rays read the atlas at every face they meet, as light scattered by a slightly diffusing face.

**Stand-in.** A glow at each corner's position on screen, weighted by the square of the mean of max(0, n · L) over the faces round it, a tight core in a softer skirt, masked to the solid's outline.

**Where does light inside an icosahedron gather?** (`experiments/glass-caustics-survey.test.ts`, flint at 550 nm, 30 random light directions, 100 000 rays each.) For each direction, the brightest 1% of the atlas texels' mean distance to the nearest corner, against all texels':

| Light counted          | Median ratio | Range        | Directions under 0.8 | Peak / mean |
| ---------------------- | ------------ | ------------ | -------------------- | ----------- |
| From the first landing | 0.90         | 0.62 to 1.24 | 11 of 30             | 11.5        |
| After 1+ reflections   | 0.64         | 0.49 to 0.88 | 29 of 30             | 8.1         |
| After 2+ reflections   | 0.77         | 0.61 to 1.09 | 16 of 30             | 10.5        |

So the reflected light does gather towards the corners, for nearly every direction: its brightest texels sit at two thirds of the typical distance from a corner, which is why the atlas counts only light that has reflected at least once. But a flat face focuses nothing. A parallel beam through flat faces stays a set of polygons of even irradiance; the "hot spots" are where several of them overlap, which near a corner (several faces meeting, like a corner reflector) they often do. Seen in the render, spread over the faces as diffuse light, that patchwork reads as a pale haze over the body with brighter wedges, not as spots. It costs about 0.9 ms at 1080p (half resolution, two heroes): 0.3 ms of compute, the rest the atlas lookups at every face. It is grainy while turning, and needs the fiction of a diffusing face to be seen at all.

The stand-in costs nothing measurable (within the run-to-run noise of 0.2 ms), is deterministic, always sits on a corner, and gives the look of the reference: distinct points of light at the corners. It is not physics: its glows do not depend on the paths inside, and with the moon behind the solid they sit on the far corners, seen through the glass.

**Decision.** The showpiece uses the **stand-in**, placed at the corners the traced survey says the light favours. The traced caustics stay as the `traced caustics` preset and the reference for that placement: if the showpiece's light moves, the survey says which corners to light. A stand-in that read its weights from the traced atlas (the light near each corner, averaged slowly) would combine the two, at the traced cost; not built.

## Thin film

`src/wgsl/thinfilm.wgsl` holds Light Temple's two-beam `thin_film` (copied, credited) and the full Airy reflectance for one wavelength, `thin_film_reflectance`, which the trace uses on every face: s and p amplitude coefficients at both interfaces, summed with the phase 4πn d cos θ / λ, averaged. It is non-absorbing, so the faces still conserve light; at zero thickness it is bare Fresnel, and for a film in air it matches the closed form (tests). The film thins towards the top of the solid (`filmDrain`), so its colours band across the faces as a draining soap film's do.

On glass (`filmed glass`) the film shifts the faces' reflections to pinks and greens, subtly: an index-1.33 film on 1.52 glass changes a 4% reflection by a few per cent. As a hollow film (`bubble`: glass `air`, no absorption, no glow) the solid becomes a soap bubble. Against this night backdrop it is faint: a soap film reflects at most about 8%, and only the horizon and the moon are bright enough to show in it. A bubble needs a brighter, busier surround than this scene has.

## The body for the showpiece

```ts
const body = createGlassBody(device, { format: tail.scene.format });
body.resize(width, height);
body.encode(
  encoder,
  tail.scene.view,
  {
    solid: 'icosahedron', // or planes of any convex solid, up to 20
    rotation, // row-major Mat3, the wireframe's convention
    view: { center, size, distance }, // the wireframe's WireView
    frame: time.frame,
    glass: 'flint',
    sampling: 'spectral',
    samples: 1,
    bounces: 5,
    scale: 0.5,
    absorb,
    emission,
    caustics: 'stand-in',
    key,
    history,
    reset,
    drawBackdrop,
    composite,
  },
  profiler,
);
body.layer; // the body alone, premultiplied, coverage in alpha, at `scale`
```

The view and rotation follow `src/gpu/wire/solids.ts` (unit circumradius, camera on +z looking down -z, `size` the circumradius in pixels at the centre's depth), so the wireframe lays over it exactly. For 10.4, `composite: false` leaves the body in `layer` to be defocused and composited by the caller.

## Open

- Browser timings, phone timings on a phone, and the bundle size: not measured yet.
- Flash is measured only at the default turn (0.1 rad/s): `low`. The faster turns that 10.8 is to set the limit for are not swept.
- The trace drops what is still inside after the last reflection (a few per cent at 5 reflections in crown and flint, more in diamond).
