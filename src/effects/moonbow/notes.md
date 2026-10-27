## How it works

A waterfall across a gorge at night, its spray rising, seen through a 14 mm lens with the moon 8° up behind the camera. A rainbow is centred on the point opposite the light, so the moon is never in the frame: the bow arcs round a point 8° below the horizon ahead.

**The optics** (`src/gpu/optics/rainbow.ts`). A ray meeting a drop at incidence i refracts to r and leaves after p − 1 reflections inside, turned through D = 2(i − r) + (p − 1)(180° − 2r). For one reflection the turn has a minimum (Descartes' ray, cos² i = (n² − 1)/3) and the light of every drop piles up there: the primary bow, 42.1° from the antilunar point for water's 1.333 at 589 nm, red outside (42.4° at 656 nm) and blue inside (41.2° at 450 nm). For two reflections the turn has a maximum: the secondary, 50.9°, colours the other way round, and between them Alexander's dark band, which no ray reaches. The table is the drop's whole geometric phase function in the half of the sky facing away from the moon: 6 000 rays across the drop's face for each of 24 wavelengths, paths p = 0 to 3 with Fresnel's coefficients for each polarisation, into a histogram against angle from the antilunar point, blurred by the moon's disc and 0.15° for the wave optics of millimetre drops, per steradian.

**The scene** (`moonbow.wgsl`, one fullscreen pass). Sky with a few stars above the gorge's rim; wet rock and a curtain of falling water, lit by the moon as Lambertian surfaces; spray thick in the gorge and thinning upwards, billowing up and swaying slowly. Through spray of optical depth τ the background keeps e^−τ and the spray adds (1 − e^−τ) of its own light: half the phase function (the other half of what millimetre drops remove is diffraction, straight on and away from us), and a dim white mist for light scattered many times.

**Why it is white.** A moonbow is a rainbow, the same colours, but some 400 000 times dimmer than by day: below the cones' threshold, so the eye sees it with rods alone, nearly white. **Colour** mixes the bow towards its own luminance; the default 0.25 is the eye's, 1 is a long exposure's ("long exposure").

**Checks** (`tests/moonbow.test.ts`). Descartes' radii against a brute-force search of the deviation (to 10⁻⁶ rad); primary 42.1° and secondary 50.9° at 589 nm, red outside and inside respectively, a 1.2° spread between 450 and 656 nm; paths up to p = 3 carry over 97% of the light; in the profile the peak is at 41.7°, the sky inside at 38° is 23 times brighter than the dark band at 46.5°, and the sky outside the secondary 3.5 times; red leads on the outside of the primary and the inside of the secondary.

## Cost

GPU time not measured yet: one fullscreen pass of about twenty octaves of noise in all and one table lookup, and the tail. The table is traced once at load, 53 ms on an M1 Max; 32 kB of texture.

## Pitfalls

- **Exposure.** The bow is about 10⁻⁶ of the moon's radiance and the falls a few times brighter than the bow, so the default exposure is 850 with a sky to match. The faint bow is the point; the held-frame test needs the falls to stand out, which is what set that number.
- Geometric optics with a blur, not Airy theory or Mie: no supernumerary bows (millimetre spray drops hardly show them) and no drop-size dependence of the bow's width or colour.
- Single scattering through thick spray overstates the bow where τ is large, and the "mist" term is a constant stand-in for multiple scattering.
- The colour control desaturates the bow and mist only, not the scene; story 5.6's night-vision option in the tail does the whole frame.
- The gorge, rim and falls are noise, not a model: the falls are evenly streaked curtains.

## When to use it

A night hero for travel, outdoors and nature pages, or a page about rainbows and night vision. Tier A provisionally. It is the faintest of the Epic 5 effects by design, so it needs a dark page and does not suit sitting behind text.

## References

- Nussenzveig, _The Theory of the Rainbow_ (Scientific American, 1977).
- Lee, _Descartes' rainbow and the colors of the rainbow_; Lee and Fraser, _The Rainbow Bridge_ (2001).
- Laven, _Simulation of rainbows, coronas and glories using Mie theory_ (Applied Optics, 2003).
- Hale and Querry, _Optical constants of water in the 200-nm to 200-µm wavelength region_ (Applied Optics, 1973).
- Les Cowley, _Atmospheric Optics_: moonbows and Alexander's dark band.
