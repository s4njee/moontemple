## How it works

The epic's reference picture, built from the parts Epics 9 and 10 made. Each frame, back to front:

1. **The backdrop and the glass body** (`src/gpu/glass/body.ts`, stories 9.4 to 9.6): a night sky with a bright horizon straight across the middle, horizon lights, stars and the moon as the key light; the icosahedron traced per pixel at half size with spectral sampling, refracting and splitting the horizon into colour, reflecting inside up to five times, absorbing red so it glows cyan, and lighting its corners with the screen-space caustic glow 9.5 chose. The body goes to a layer of its own rather than onto the backdrop.
2. **The body out of focus** (story 10.4): that layer blurred as an image and laid over the backdrop, premultiplied, so its outline softens into the sky. The wire is the subject in focus in front of it. Blurring the layer is right here because the body is one object at one depth: a depth-of-field method with one circle of confusion everywhere is a blur. A body generated already soft could not show the horizon bent through it.
3. **The wire** (10.1), sharp, with the hidden edges faded, and **starbursts on the corners** that face the light (10.3).
4. **The halo** (10.2): spectral bloom over everything, red spreading four times as wide as violet, so the bright wire and the moon wear a rim that warms through gold and orange to red. Spectral depth of field (9.7) found that a lens's colour error puts the red rim in front of focus, not behind, so the reference's red rim is halation, and this is what makes it.

The wire and the body share one rotation, one view and one geometry: the body's planes are built from the wire's own faces. The two modules each had an icosahedron of unit circumradius, in different orientations, and the first composite showed the glass turned against its edges.

The halo's bands take their colours from the CIE colour-matching functions clamped into sRGB, not from the fit the sky optics use: that fit keeps green and blue out to 640 nm, which turned the halo's rim brown. With the CIE colours the rim reads orange, then red.

Drag to turn it; the turn eases towards the pointer at no more than half a turn a second, inside the corner flares' flash limit. Without a pointer it turns slowly on its own.

## Cost

Not measured on a quiet GPU. The glass trace is the cost: 1.97 ms at 1080p for the body at half size with one hero sample on Dawn on the Apple M1 Max (`docs/studies/glass.md`), and the spectral bloom 1.3 to 1.5 ms; the wire, flares and blur are small beside them. Tier C: a showpiece, not a drop-in.

## Pitfalls

- The red rim round the solid itself is subtle: the cyan glass has absorbed most of its red, so only the white wire's light reddens at the edge. The moon's halo shows the colour turn plainly. "Wide halo" pushes it.
- Spectral sampling is noisy while the solid turns quickly; the history hides it at the default turn and a drag.
- The body's blur is a Gaussian, not the aperture's disc; at this size the difference is invisible, on a larger blur it would show.
- On a phone the trace at half size is likely over budget: lower `glass resolution`, or use `wire-loader`.

## When to use it

A hero for a launch, a product in glass, anything about light, on a desktop. For a page element use `wire-loader` (Tier A) or `glass-badge`.

## References

- Wilkie, Nawaz, Droske, Weidlich and Hanika, _Hero Wavelength Spectral Sampling_ (EGSR 2014).
- Wyman, Sloan and Shirley, _Simple Analytic Approximations to the CIE XYZ Color Matching Functions_ (JCGT 2013).
- Fresnel, Snell and Sellmeier, as in `src/gpu/optics/glass.ts`.
