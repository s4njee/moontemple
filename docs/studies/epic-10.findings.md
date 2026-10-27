## Findings (story 10.8)

The glass-and-wire pieces of Epics 9 and 10, what each costs on its own, which a lighter version can keep, and how fast a bright solid may turn. Measured on the Apple M1 Max on Dawn (the tables below and [epic-9.md](epic-9.md)), marginal cost per frame including the HDR tail (0.4 to 0.6 ms on its own); the flash sweep is [glass-flash.md](glass-flash.md).

### What each piece costs

| Piece                                                   |            1080p |     1266 × 585 | How measured                                                      |
| ------------------------------------------------------- | ---------------: | -------------: | ----------------------------------------------------------------- |
| The showpiece, everything on                            |           2.9 ms |         2.3 ms | `prism-icosahedron` default                                       |
| Spectral halo (10.2)                                    | about 0.5 to 0.8 |      about 0.7 | halo 0.45 against 0                                               |
| Glass body at full size instead of half                 |             +2.6 |           +1.0 | resolution 1 against 0.5                                          |
| Glass body at a quarter instead of half                 |             −0.9 | about the same | resolution 0.25 against 0.5                                       |
| Body out of focus (10.4's blur)                         |     within noise |   within noise | focus 0.035 against 0                                             |
| Corner flares (10.3)                                    |     within noise |      about 0.3 | flares 0.9 against 0                                              |
| Spectral body against three channels (9.4)              |             +0.2 |           +0.4 | `glass-solid` sampling                                            |
| Traced caustics against the stand-in (9.5)              |             +0.4 |           +0.3 | `glass-solid` caustics                                            |
| `wire-loader` (wire, flares, bloom)                     |              0.9 |            0.5 | default                                                           |
| `glass-badge` (three traced wavelengths over the badge) |              1.6 |            0.8 | default                                                           |
| `prism`                                                 |              1.6 |            1.7 | default; its cost is the haze over the whole frame, not the glass |

Differences under about half a millisecond are inside this machine's run-to-run noise.

### What a lighter version keeps

- **Tier B (the showpiece on a desktop's integrated GPU):** the glass at half size with one hero sample, the stand-in caustics, the spectral halo and the soft body: about 3 ms here. Leave out the full-size trace (it more than doubles the glass) and traced caustics (+0.4 ms, grainy while turning, and the stand-in looks like the reference).
- **On a phone:** the glass at a quarter size, or three channels instead of the spectrum; the halo is the next thing to drop. `prism-icosahedron`'s scorecard says mobile `no` until a phone has been measured (8.2).
- **Tier A:** no glass. `wire-loader` (wire, corner flares and the tail's bloom) at under a millisecond is the web-sized version, and the spectral halo can join it for about half a millisecond more.

### How fast may it turn

A bright solid turning in front of a light swings the horizon and the moon's reflections across large areas, which is what the flash analyser counts. At every turn speed the controls allow (up to 0.6 rad/s, a turn in ten seconds), with the moon at its brightest, both `prism-icosahedron` and `glass-solid` read **low**: at most two flashes a second in any cell and no area flashing more than three times a second. The whole frame's mean luminance moves by under 2%. The corner flares, the riskiest part, are capped separately (10.3): a turntable turn of at most one turn a second, and a drag eased to half that.

### Other findings along the way

- **Pass the solid to the tracer by reference, not by value.** `glass_trace` taking 20 planes by value copied them into private memory on every call: three traces cost 3.3 ms at 1080p for the prism, and the glass body was three times slower (23 ms against 7.6 at full size). `glass.wgsl` now reads planes through `glass_plane(i)`.
- **One geometry for the wire and the glass.** Two modules each built a unit icosahedron, oriented differently; the showpiece builds the glass's planes from the wire's faces.
- **A halo's colours need a red end that is red.** The spectral fit the sky optics use keeps green and blue to 640 nm, which turned the halo's rim brown; the CIE functions clamped into sRGB give orange, then red.
- **The reference's red rim is halation, not chromatic aberration** (9.7): a real lens's colour error puts red in front of focus.
- **Check refraction at full size.** The badge's one-pixel lines through the glass vanished in a downscaled preview and looked like a bug.
