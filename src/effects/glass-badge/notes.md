## How it works

A logo mark or a call to action as a thick piece of glass over the page's own image. The image is the page's, handed over the stable way (story 6.1): decoded to an `ImageBitmap` and copied into a texture with `copyExternalImageToTexture`; the gallery draws a sample page on the GPU once (a dusk gradient, a grid of fine lines, discs and bars of placeholder text, so refraction has straight lines to bend), and dropping an image on the canvas replaces it.

The badge is a convex outline (`shape.ts`: hexagon, octagon, shield, pill, diamond) extruded into a slab, each side's front edge cut by a bevel: at most nine sides, so the solid's 2n + 2 planes fit the shared tracer's twenty. One fullscreen pass (`badge.wgsl`): where a pixel's ray misses the badge, the image as it is; where it hits, Epic 9's tracer (`src/wgsl/glass.wgsl`) at three wavelengths with the glass's three indices, splitting at every face with Fresnel, total internal reflection and a faint tint. The flat front passes the page straight through, a few per cent darker; the bevels bend it sharply and split its lines into colour; light reflected towards the viewer picks up a soft room light from above. The badge leans towards the pointer, eased, and sways slowly without one.

The environment is the image looked up by direction from the camera, so an unbent ray lands exactly on its own pixel and the page reads as continuous through the glass. A bent ray really leaves the glass a few pixels from where the camera would put it; that parallax is ignored.

## Cost

Not measured on a quiet GPU. Three traced wavelengths over the badge's pixels only (rays that miss cost one texture read); with planes read from a uniform through `glass_plane`, as Epic 9 found it must be.

## Pitfalls

- Three wavelengths, not a spectrum: the bevels split lines into red, green and blue copies rather than a continuous rainbow. `glass-solid` compares the two; for a badge the three are enough.
- A flat front is a window: the badge reads as glass only at its bevels and edges. Thicker glass and wider bevels make more of it bend.
- Debugging this effect, its 1-pixel lines through the glass vanished in a downscaled preview and looked like a blank window; they were there in the pixels. Check refraction at full size.
- The image must be the page's own background, aligned to the canvas, or the badge shows a different picture from the page round it.

## When to use it

A logo or a badge on a hero image, a call to action that catches the light, on light or dark pages alike since it adds no light of its own. Tier B provisionally.

## References

- Fresnel, Snell and Sellmeier, as in `src/gpu/optics/glass.ts`.
- Fire Temple's backdrop strategy, for why the image must be handed over.
