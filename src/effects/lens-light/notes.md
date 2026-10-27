## How it works

A few bright lights through a 50 mm lens, and one much brighter far light that follows the pointer (or wanders round the upper frame), with each of the lens's artefacts on its own control:

- **Colour fringes and spread** (story 2.4), in the shared point layer: `axial` gives each colour its own focus distance (red farther, blue nearer), so out of focus each channel's disc is its own size and fringes one colour outside and its complement inside; `lateral` magnifies each colour differently about the centre. Each channel is drawn with its own normalised disc, so each keeps its light (`tests/points.test.ts`).
- **Halation** (story 2.5, `src/gpu/post/halation.ts`): film's red halo. It moves light rather than adding it: each channel keeps (1 − spread) of itself and gets back `spread` of its blurred self, red most, green a third, blue a twentieth, so every channel's light is unchanged (`tests/halation.test.ts`).
- **Diffraction spikes** (story 2.6, `src/gpu/glare/glare.ts`): rays from the blades, n for an even blade count and 2n for odd, each with a Gaussian cross-section and an exponential fall along it, whose integral is known, so the rays carry exactly their share of the light; red's run longest, as diffraction spreads it furthest (`tests/glare.test.ts`). Spikes belong to a sharp image of a point, so they fade as a light's blur grows, half gone by 3 px.
- **Ghosts** (story 2.7, `src/gpu/glare/flare.ts`): seven images of the aperture strung along the line from the light through the centre, each with its own place, size and coating tint, drawn as aperture-shaped discs through the point layer, about 4% of the light in all.
- **Anamorphic streak** (story 2.7): the same rays as the spikes, two of them along x, long.

## Cost

On an Apple M1 Max: 0.52 ms per frame at 1080p on Dawn ([docs/studies/epic-2.md](../../../docs/studies/epic-2.md)) and 1.68 ms for one frame in Chrome on a 1920 × 1080 canvas (`npm run browser-check`); 0.37 to 0.44 ms on Dawn with every artefact off. The first version drew each light's spikes as one square round all its rays, most of a frame tall, and every pixel of it worked out every ray in three colours: 4.78 ms on Dawn and 4.6 in Chrome. One thin quad per ray brought it to the numbers above. Tier A on this machine, provisional.

## Pitfalls

- The ghosts are a fixed set placed by hand, not traced through a lens prescription (Hullin et al.); a different lens would place them differently.
- The spikes do not come from the Fourier transform of the aperture (Ritschel et al.), only from its blade count; a curved-blade aperture still gets straight spikes.
- Halation runs over the whole frame, not only highlights: it is gentle where the frame is dim because there is little light to move.

## When to use it

To choose which artefacts another effect should have; `flare-cursor` and `glint-hover` are built from these pieces.

## References

- Hullin, Eisemann, Seidel and Lee, _Physically-Based Real-Time Lens Flare Rendering_ (SIGGRAPH 2011).
- John Chapman, _Pseudo Lens Flare_ (2013).
- Ritschel, Ihrke, Frisvad, Coppens, Myszkowski and Seidel, _Temporal Glare_ (Eurographics 2009).
