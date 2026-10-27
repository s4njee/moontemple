## How it works

A couple of hundred white and warm-white lights between 1.5 and 60 m in front of an 85 mm lens at f/1.4, drawn by the shared point layer, as in `focus-cursor`. What is new is the lens: its power depends on the wavelength (longitudinal chromatic aberration, story 9.7), so each wavelength is in focus at its own distance.

With the sensor fixed, a wavelength whose power differs by a share δ from the green the lens is focused at (555 nm) draws a disc whose radius differs by δ times the aperture's radius on the sensor in pixels: the same number of pixels at every depth (`src/gpu/optics/lca.ts`). For a fast portrait lens that radius is several hundred pixels, so a δ of a few thousandths is a few pixels of fringe. Each light is handed to the point layer once per wavelength (`src/gpu/points-spectral.ts`, eight by default), at the same place, with its circle of confusion shifted by that wavelength's pixels and its light weighted by that wavelength's share of red, green and blue (`spectralSamples`, which sums to white). The layer keeps every disc's light, so each channel keeps its light: a white light out of focus is still white in total, only spread differently by colour. Nothing in the point layer changed.

Where a wavelength's disc is bigger than the others it rings them; where smaller, it sits in the middle. Which wavelengths those are flips as a light passes through focus, so the slow focus rack (`rack`, `swing`) swaps the rims over as you watch. The lenses:

- **fast lens** (default): the achromat's secondary spectrum as a parabola about 555 nm, without its violet curl, ten times over. Green has the most power, so behind focus green rims round magenta, in front of focus magenta rims round green: the purple-in-front, green-behind "bokeh fringing" of fast lenses. A stylised stand-in: in a real fast lens most of it is spherochromatism, which this model does not have.
- **achromat**: a real N-BK7 and F2 doublet, F and C lines brought together, at its real strength. At f/1.4 its fringes are under a pixel, except a faint violet halo from its blue end.
- **singlet**: one element of N-BK7, under-corrected. Blue focuses nearest, so in front of focus a red-orange rim round a blue middle, behind focus a cyan-blue rim round an orange middle, and even in focus a violet halo (about 5 % of the image height across at f/1.4 and 2.4 m).
- **over-corrected singlet**: the singlet's aberration reversed, which puts the red rim behind focus (the Epic 9 reference's red rim).

`split light into` switches between eight (or `wavelengths`) wavelengths, three channels each at its own focus, and none. Three channels get the colour order right but draw each rim as one hard, saturated ring; the study ([docs/studies/spectral-dof.md](../../../docs/studies/spectral-dof.md)) found it no closer to a spectrally traced reference than ignoring the aberration, while eight wavelengths come within the reference's own noise.

## Cost

On an Apple M1 Max at 1920 × 1080 on Dawn, timed with GPU timestamps in experiments/spectral-dof.test.ts: 0.74 ms a frame with eight wavelengths, 0.59 ms with three channels and 0.68 ms with none (the three are within the run's noise; the HDR tail is most of it). Eight wavelengths are eight discs a light, up to 1 600 at the defaults, which the point layer draws as instanced quads; the cost follows the total disc area, so a wider aperture or more lights cost more. Not measured yet in Chrome, on phones, or for bundle size.

## Pitfalls

- Half-float blending loses about 0.02 % of the light for every disc laid over the same pixels, so splitting a light into eight wavelengths dims it by about 1 % and sixteen by about 1.5 % (tests/spectral-dof.test.ts). Not visible here; it would be in a scene that adds thousands of discs over one place.
- The real achromat's blue end curls up steeply: scaled up, it is a violet halo round everything near focus before it is a green or magenta rim. That is why the default lens is the parabola rather than the achromat scaled up.
- The tonemap pushes the middle of a bright disc towards white, which hides the colour of its middle and leaves only the rim coloured. Lower `exposure` to see the middles.
- The lights are white or warm. A coloured light fringes only in the wavelengths it has, as it should, but the fringe is then hard to see.

## When to use it

A dark hero for a photography, lens or camera site, or a figure about chromatic aberration, where coloured rims read as a real lens rather than a fault. Tier B: the cost is the point layer's, a little more for the extra discs. Where the fringes are not the point, `bokeh-drift` or `focus-cursor` draw the same lights once each.

## References

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981).
- Wilkie, Nawaz, Droske, Weidlich and Hanika, _Hero Wavelength Spectral Sampling_ (EGSR 2014).
- Schott optical glass data sheets: N-BK7 and F2 Sellmeier coefficients.
- Kingslake and Johnson, _Lens Design Fundamentals_, chapter on chromatic aberration and the secondary spectrum.
