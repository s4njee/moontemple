## How it works

Newton's experiment, set up so it can be checked against 9.2's tracer. A prism stands upright on the floor with its refracting edges vertical. A slit lights it with a level sheet of white light, 0.05 units wide and 0.22 tall (the prism's side is the unit; call it 5 cm). Every face but the top and bottom is vertical, so a level ray stays level through every refraction and reflection. The light on the back wall is then a band: a profile across the wall times the slit's height.

`scene.ts` lays the scene out at minimum deviation for the sodium D line (589.3 nm). The prism's base is set so the ray inside runs parallel to it. The beam comes in at whatever angle sends 589.3 nm off 65° from the wall's normal. The beam and the wall are fixed by that. Changing the glass moves the beam, but turning the prism (`turn`, and the slow `sweep`) only turns the prism, as on a real table. Away from the minimum the spectrum swings along the wall and comes back. Then it goes out at total internal reflection.

Whenever the prism turns or a setting changes, `tracePrism` traces the scene on the CPU with `traceRays` from `src/gpu/optics/glass.ts`:

- 96 wavelengths from `spectralSamples`, whose colours sum to white, or the lines of a lamp: hydrogen's Balmer lines at the Balmer decrement, mercury's visible lines, or the sodium doublet.
- Four rays across the slit for each wavelength. Parallel light through flat faces is an affine map, so each pair of neighbouring rays brackets a strip of light. A prism that catches only part of the beam is handled slice by slice, and light that misses goes on past.
- Every ray the tracer splits off: the front reflection, light that leaves through any face after reflecting inside, and the beam straight through.

Each strip's power is spread evenly over where it lands, box-filtered into a 4096-texel profile of power per unit length across the wall. The same traces give up to 48 level beams for the haze: the beam coming in, its path inside the glass, the front reflection, the fan in 24 colour bins, the first light out after one reflection inside, and light that missed.

`prism.wgsl` is one fullscreen pass into the HDR tail:

- The wall's irradiance is the profile times the slit's height profile. The floor gets the band's light bounced off the wall, treated as a Lambertian patch at its centroid. A faint fill keeps the room there at all.
- The prism is traced at 610, 545 and 465 nm against that room by `prism-trace.wgsl`, a line-for-line copy of glass.wgsl's `glass_trace` that reads the planes from the uniform buffer (see Pitfalls). A bounding sphere keeps the rest of the frame from looking for glass. The glass also glows where light scattered out of the beam escapes: at the edges, faintly through the body, and as a dim spot where a beam crosses a face.
- Each beam in the haze is a box, so the view ray's path through it is an interval: the slab of the beams' height, intersected with the strip's length and width, minus the glass. Single scattering is that length times the extinction, the phase function, the beam's irradiance and the extinction along both legs, in closed form. A drifting noise tile varies the haze.

Energy is accounted for. The table sums to the power the tracer says reaches the wall, to 1e-4, and it is white to 1%. With the haze off, the wall gets 93.8% of the beam through crown at minimum deviation, 90.8% through flint and 66.9% through diamond. The rest is the faces' Fresnel reflections, which go elsewhere. Across the wall the band is exactly as wide as the glass makes it. In `tests/prism.test.ts` the rendered hydrogen lines land within 0.4 px of where `traceRays` puts them at 960 × 540. Measured from the picture, the angle between H-alpha and H-delta is 1.348° through crown (1.349° traced), 3.415° through flint (3.405°) and 3.587° through a 40° diamond prism (3.583°).

A held frame (`FrameTime.still`) stands at minimum deviation plus the manual turn: the sweep starts from there, so the first frame it plays is the frame it holds.

## Cost

Measured on the M1 Max, with other agents using the GPU at the same time, so the numbers are rough:

| Measurement                        | Configuration                  | GPU per frame                               |
| ---------------------------------- | ------------------------------ | ------------------------------------------- |
| Dawn, marginal (`bench.ts`), 1080p | defaults                       | 2.3 to 2.5 ms                               |
| Dawn, marginal, 1080p              | no bloom                       | 2.0 ms                                      |
| Dawn, marginal, 1080p              | `diamond`                      | 2.4 ms                                      |
| Dawn, marginal, 1080p              | `moonbow`, same run, for scale | 1.5 ms                                      |
| Chrome HUD (`browser-span`), 1080p | defaults                       | 3.89 ms (3.54 to 4.65 over 3 loads), 60 fps |

That is 65% of Tier B's 6 ms in Chrome. The tier is provisional until an integrated GPU has been measured (not measured yet).

Most of the scene pass is the haze: every pixel whose view ray crosses the beams' height tests all of the beams (32 at the defaults). The prism costs only on its own pixels, three traces of up to seven bounces each. The CPU retraces 96 wavelengths × 4 rays whenever the prism turns: about 1.6 ms in Node, and the HUD shows 1.28 ms of CPU a frame while the default sweep runs. A still prism costs nothing on the CPU.

Textures: the wall profile is 4096 × 1 `rgba32float` (64 KB). There is also the shared noise tile and the tail's targets; the HUD shows about 21.8 MB in all at 1080p. Bundle size: not measured yet.

## Pitfalls

- **`GlassSolid` by value is expensive.** glass.wgsl's `glass_interval` and `glass_trace` take the solid (20 planes) by value. Every call copies it into private memory, and the inner loops then index it dynamically. Three `glass_trace` calls over the prism's pixels cost about 3.3 ms at 1080p on the M1 Max. The same algorithm reading the planes from the uniform buffer (`prism-trace.wgsl`) costs a few tenths of a millisecond, and the test checks the two agree to 1e-5. This is a finding for 9.2's chunk: an accessor, or a solid in a module-scope uniform, would avoid the copy for every glass effect.
- **Real dispersion is small.** From 410 to 656 nm, crown glass spreads the light by 1.35°. A spectrum seen square-on from across the room is a small strip. The wall stands at 65° to the light, which draws the band out 2.4 times. Flint is the default (2.5 times crown's spread), and the camera is framed for the band.
- **The tonemap moves hues.** Per-channel ACES flattens a bright band's yellow-green towards white. Through it, H-alpha reads orange rather than red, because red clips while green keeps climbing. The lamp presets lower the exposure. `spectral_rgb` divided by the spectrum's white also gives yellow a fair amount of blue (about 0.9 at 580 nm), which whitens it further.
- **Diamond needs a sharper prism.** At 60°, n sin 30° = 1.21 > 1: no ray gets through both faces, and there is no minimum deviation. The `diamond` preset uses 40°. At apex angles past total internal reflection, the scene is laid out as if the glass were just weak enough to pass light, and the beam meets total reflection.
- **Turning far enough puts the spectrum out.** For flint, past about +15° the light meets the second face beyond the critical angle, violet first: it is bent most. Red follows by +18°. At −18° part of the beam misses the prism. `turning wide` (±18°) shows both. The front reflection swings across the wall at twice the turn rate, and at some turns it lands in view as a bright white bar. That is real, but it can look like a glitch.
- **The haze is theatrical.** β = 0.1 per unit is about 2 per metre at a 5 cm unit, the density of a fog machine. Clean air would show no beam at all. The haze scatters isotropically (g = 0): forward scattering left the fan, which travels away from the camera, nearly invisible. The light the beams scatter does not light the room.
- **The view through the prism is approximate.** The environment it sees is looked up by direction from where the view ray enters the glass. Haze behind the prism is drawn along the straight view ray, not the refracted one.
- **Tall canvases leave a small subject.** The scene is a wide strip. Below an aspect of 1.4 the view keeps its width, and towards a phone it narrows to just the prism and the band. Even then they fill only the middle of a 390 × 844 canvas.

## When to use it

A Tier B hero for optics, physics and science-education pages, or as an interactive figure: change the glass, the lamp or the slit and the band changes as it would on a bench. A wide slit shows Newton's own puzzle: a white middle with only the edges coloured. It is dark and its subject is small and off-centre, so it is not a backdrop for text.

Where it does not fit, the poster (the held frame at minimum deviation) carries most of it, since the light is steady and the motion is slow. For a decorative rainbow strip, a CSS gradient costs nothing; it is not this.

## References

- Isaac Newton, _Opticks_ (1704), Book I, Part I: the experiment with the prism, and the wide slit's white middle.
- Eugene Hecht, _Optics_, 5th ed., §5.5.1: minimum deviation, D = 2 asin(n sin(A/2)) − A.
- Schott optical glass data sheets for N-BK7 and F2 (Sellmeier coefficients), via [refractiveindex.info](https://refractiveindex.info/).
- Alan Zucconi, [Improving the Rainbow](https://www.alanzucconi.com/2017/07/15/improving-the-rainbow/): the `spectral_rgb` fit.
- L. G. Henyey and J. L. Greenstein, "Diffuse radiation in the Galaxy", _Astrophysical Journal_ 93 (1941): the phase function.
- Osterbrock and Ferland, _Astrophysics of Gaseous Nebulae and Active Galactic Nuclei_ (2006): the Balmer decrement.
- [NIST Atomic Spectra Database](https://physics.nist.gov/PhysRefData/ASD/lines_form.html): the hydrogen, mercury and sodium lines.
