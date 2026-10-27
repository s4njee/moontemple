## How it works

A moon through a 70 mm lens behind a thin sheet of cloud. The rings are not painted: they are the diffraction pattern of the cloud's droplets, worked out on the CPU and looked up per pixel.

**The pattern** (`src/gpu/optics/corona.ts`). A water droplet of radius a diffracts light like a hole of the same size (Babinet), into the Airy pattern [2 J1(x)/x]², x = 2πa sin θ / λ. As a phase function, per steradian, that is (ka)²/4π [2 J1(x)/x]², which integrates to one over the sphere (the test sums it to within 1%). Red light has the longest wavelength and spreads widest, so summed over the spectrum the pattern is a white aureole with a red-brown edge, then rings blue-green inside and red outside. The sum runs over 32 wavelengths, each coloured by Zucconi's spectral fit (copied from Light Temple's `spectral_rgb` into `src/gpu/optics/spectral.ts`) and scaled so a flat spectrum sums to white, and over a Gaussian spread of droplet radii weighted by cross-section, a². A narrow spread (**size spread** 0.06) keeps the rings; a wide one (0.35) averages them into a plain aureole, because each size draws its rings at its own radius. The radii are spaced so that neighbours stay within a quarter wave of each other at the widest angle drawn; coarser, they leave false rings at the edge of the frame.

**The table.** The pattern goes into 1 024 entries from 0 to 24°, blurred by the moon's own disc (0.26° radius, `smoothProfile` in `src/gpu/optics/profile.ts`), and is uploaded as a row of an rgba32float texture (`src/gpu/profile-texture.ts`). It is rebuilt only when the droplet radius or spread changes.

**The sky pass** (`corona.wgsl`, one fullscreen pass). Each pixel's angle from the moon comes from a pinhole view ray, and `profile_at` (`src/wgsl/profile.wgsl`) looks the pattern up. The cloud is fractal noise drifting with the wind: its optical depth τ sets how much moonlight it scatters once towards the eye, τe^−τ, as in `moon-through-cloud`; half of that is diffraction (the table), half a broad Henyey–Greenstein forward lobe. A second, larger-scale noise sets the droplet size across the cloud: where droplets are s times the mean, the pattern is s times smaller and s² brighter, so the rings wobble and break as the cloud passes, which real coronas do. The moon is the shared one (`moon.wgsl`), dimmed by e^−τ, and the scattered light scales with how much of the face is lit (`moonLight`).

**Checks** (`tests/lunar-corona.test.ts`). For 10 µm droplets the aureole's red edge is at 1.7°, between the first dark ring of blue and of red light (sin θ = 0.61 λ/a: 1.57° at 450 nm, 2.27° at 650 nm), and the first full red ring is at 3.2°, between red's first dark ring and blue's second (sin θ = 1.117 λ/a). Halving the droplets doubles the ring radius (about 3.3° for 5 µm, 0.87° for 20 µm). A narrow spread has three or more red bands within 8° and a dark gap outside the aureole; a spread of 0.35 has neither. The GPU lookup matches the CPU's to 10⁻⁴.

## Cost

GPU time not measured yet: one fullscreen pass of about fourteen octaves of noise and one table lookup, and the tail. The CPU builds the table when the droplets change: 12 ms on an M1 Max for the defaults, 50 to 60 ms for large droplets or a wide spread, 150 ms at the extremes of both sliders (25 µm, spread 0.5), since the radius steps have to get finer as the pattern gets finer. The table is 16 kB of texture.

## Pitfalls

- **Exposure is a choice, and the default is a photograph's.** The rings are a fiftieth of the aureole and the moon a thousand times brighter than both, so with the moon at 24 the default exposure of 18 burns the moon and inner aureole to white to show two rings, as a photograph of a corona does. The sky colours are set low to match: a moonlit sky is a few millionths of the moon's radiance.
- The rings are colour more than light: luminance barely dips between the first and second rings. On a dim or desaturated display only the aureole's brown edge and the first ring show.
- The moon's disc blurs the pattern along the radius only (a line through the disc), exact far from the moon and slightly too soft within a degree of it, where the burnt-out aureole hides it.
- The crescent's light is spread as if from a full disc: the table assumes a round source.
- Dragging the droplet sliders rebuilds the table on the main thread each change, up to 150 ms at the extremes.
- Diffraction alone: no glory, no iridescence from the cloud's edges beyond what the size variation gives, and no polarisation.

## When to use it

A calm night hero or section background, or a page that explains the corona. Tier A provisionally: one fullscreen pass and a lookup. For a wide aureole with no rings, `moon-through-cloud` is cheaper and looks the same.

## References

- Laven, _Simulation of rainbows, coronas and glories using Mie theory_ (Applied Optics, 2003), and his Philiplaven.com corona pages: the Airy approximation and its limits.
- Lynch and Livingston, _Color and Light in Nature_ (2001): coronas, ring radii and droplet size.
- Minnaert, _Light and Color in the Outdoors_ (1993).
- Press et al., _Numerical Recipes_: `bessj1`.
- Alan Zucconi, _Improving the Rainbow_ (2017): the spectral colour fit, by way of Light Temple's `optics.wgsl`.
