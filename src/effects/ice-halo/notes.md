## How it works

A moon 24° up over a snowy field, seen through an 18 mm lens, behind a thin veil of cirrostratus. The halo and moon dogs are traced through ice crystals on the CPU and looked up per pixel.

**The optics** (`src/gpu/optics/halo.ts`). Light in at one side face of a hexagonal ice crystal and out at the next but one has passed a 60° prism. A prism turns light least, D_min = 2 asin(n sin 30°) − 60°, when the ray passes symmetrically, and near that minimum the deviation hardly changes as the crystal turns, so the light of many crystals piles up there. Ice's index (Cauchy, fitted to Warren and Brandt: 1.307 at 656 nm, 1.3133 at 486 nm) gives D_min = 21.6° for red, 21.75° at 589 nm and 22.3° for blue: a ring of radius about 22° with nothing inside, a red inner edge and a white tail fading outwards.

Rather than a formula for the ring's brightness, the trace does what the crystals do: a fine even grid of orientations of tumbling columns (120 tilts of the axis, uniform in cosine, by 72 turns about it, over 16 wavelengths), each lit side face refracted in and out by Snell's law in three dimensions, with Fresnel losses, and the share of the entry face whose light reaches the exit face worked out from the hexagon. The deviations fall into a histogram against angle, blurred by the moon's disc and by 0.25° of diffraction at crystals some 60 µm across, and turned into light per steradian. It integrates to 0.39: the share of the light on the side faces that takes the 60° path.

The **moon dogs** come from plates floating level. Through a vertical prism a ray climbing at elevation h behaves in plan like one through a prism of index n' = √(n² − sin² h)/cos h (Bravais), so the dogs stay at the moon's elevation and move out from the halo as it rises: 22.2° from the moon at 10°, 24.8° at 30°, 27.7° at 40°, and none above about 61°. Their profile is traced the same way, against azimuth, and retraced when the elevation changes; in the shader it is spread in elevation by the plates' **wobble**.

**The sky pass** (`halo.wgsl`). Each pixel's view ray is turned into the sky's frame, elevation and azimuth with the moon straight ahead, so the ring stays round and the dogs level in any lens (and the dogs' tails curve up at the sides for a high moon, as they do in wide photographs). The veil scatters τe^−τ of the moonlight towards the eye once; half of what ice takes out of a beam is diffraction, the other half the tables. **Columns** and **plates** scale the two. Near the moon the crystals' diffraction gives an aureole (`moon_aureole`) and a weak forward lobe. Below the horizon is snow lit by the moon, albedo 0.9 over π of its irradiance, and a far tree line.

**Checks** (`tests/ice-halo.test.ts`). D_min = 21.75° at 589 nm. No traced ray of 160 000 orientations turns less than D_min, and the least is within 0.05° of it. In the halo, each colour reaches half its peak at its own minimum (red 21.7°, green 21.8°, blue 22.0°), the sky at 20° is under a thousandth of the peak, the peak is at 22.45°, and the light falls to 55% of it by 25°, 18% by 30°, 5% by 35°. Every colour carries the same share within 2%. A grid twice as fine changes the profile by under 1% of its peak. The moon dogs' red edges sit within 0.4° of the Bravais minimum at elevations 0, 20 and 40°.

## Cost

GPU time not measured yet: one fullscreen pass (up to about sixteen octaves of noise, two table lookups) and the tail. The halo is traced once at load, 85 ms on an M1 Max; the dogs, 15 ms, again whenever the elevation changes. Two 2 048-entry rows of texture, 64 kB.

## Pitfalls

- **Exposure.** The halo is about 10⁻⁵ of the moon's radiance, so the default exposure of 90 burns the moon and shows the ring, as a long photograph does; the sky is set to a few millionths of the moon to match.
- Only the six side faces are traced: no basal faces, so no 46° halo, parhelic circle or arcs; no internal reflections; columns are treated as long (no light lost through the ends).
- The moon dogs' vertical spread is a Gaussian standing in for the plates' tilt, the moon's disc and diffraction together; a real dog smears more on the side away from the moon.
- The dog table is retraced on every change of the elevation slider (15 ms each).
- The moon's tilt and the veil's fibres are fixed in the frame; the veil drifts along the azimuth only.

## When to use it

A calm winter or night hero, or a page about halos. Tier A provisionally: one pass and two lookups. Without the moon dogs and veil it reduces to a ring a CSS radial gradient could almost fake, but not the red inner edge, the dark interior and the fade.

## References

- Greenler, _Rainbows, Halos, and Glories_ (1980): the 22° halo, parhelia and their distance with elevation.
- Tränkle and Greenler, _Multiple-scattering effects in halo phenomena_ (JOSA A, 1987).
- Les Cowley, _Atmospheric Optics_ (atoptics.co.uk): halo and parhelion geometry, Bravais' index.
- Warren and Brandt, _Optical constants of ice from the ultraviolet to the microwave_ (JGR, 2008).
- Tape, _Atmospheric Halos_ (AGU, 1994).
