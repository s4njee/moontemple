# Cost study: Epic 10

Measured 2026-10-27 on **Apple M1 Max** (apple-silicon), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

## Findings (story 10.8)

The glass-and-wire pieces of Epics 9 and 10, what each costs on its own, which a lighter version can keep, and how fast a bright solid may turn. Measured on the Apple M1 Max on Dawn (the tables below and [epic-9.md](epic-9.md)), marginal cost per frame including the HDR tail (0.4 to 0.6 ms on its own); the flash sweep is [glass-flash.md](glass-flash.md).

### What each piece costs

| Piece | 1080p | 1266 × 585 | How measured |
| --- | ---: | ---: | --- |
| The showpiece, everything on | 2.9 ms | 2.3 ms | `prism-icosahedron` default |
| Spectral halo (10.2) | about 0.5 to 0.8 | about 0.7 | halo 0.45 against 0 |
| Glass body at full size instead of half | +2.6 | +1.0 | resolution 1 against 0.5 |
| Glass body at a quarter instead of half | −0.9 | about the same | resolution 0.25 against 0.5 |
| Body out of focus (10.4's blur) | within noise | within noise | focus 0.035 against 0 |
| Corner flares (10.3) | within noise | about 0.3 | flares 0.9 against 0 |
| Spectral body against three channels (9.4) | +0.2 | +0.4 | `glass-solid` sampling |
| Traced caustics against the stand-in (9.5) | +0.4 | +0.3 | `glass-solid` caustics |
| `wire-loader` (wire, flares, bloom) | 0.9 | 0.5 | default |
| `glass-badge` (three traced wavelengths over the badge) | 1.6 | 0.8 | default |
| `prism` | 1.6 | 1.7 | default; its cost is the haze over the whole frame, not the glass |

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

## The measurements

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.04 to 0.13 |
| (tail) | constant scene + bloom + output | 11 | 0.59 | 0.59 | 0.37 to 0.81 |
| glass-badge | default | 1 | 1.64 | 1.57 | 1.49 to 2.03 |
| glass-badge | preset hexagon | 1 | 1.64 | 1.66 | 1.53 to 1.86 |
| glass-badge | preset shield in crown | 1 | 1.38 | 1.38 | 1.27 to 1.49 |
| glass-badge | preset diamond pill | 1 | 1.25 | 1.22 | 1.05 to 1.46 |
| glass-badge | preset thin octagon | 1 | 2.10 | 2.27 | 2.05 to 2.58 |
| glass-badge | preset blue glass | 1 | 1.64 | 1.64 | 1.55 to 1.86 |
| prism-icosahedron | default | 19 | 2.42 | 2.86 | 2.25 to 3.19 |
| prism-icosahedron | preset showpiece | 19 | 2.29 | 2.69 | 2.38 to 3.28 |
| prism-icosahedron | preset body in focus | 19 | 2.10 | 1.94 | 1.66 to 2.45 |
| prism-icosahedron | preset diamond fire | 19 | 2.16 | 2.77 | 2.40 to 3.19 |
| prism-icosahedron | preset clear crown | 19 | 2.36 | 2.75 | 2.18 to 3.01 |
| prism-icosahedron | preset wire and halo only | 19 | 2.16 | 2.97 | 2.53 to 3.28 |
| prism-icosahedron | preset wide halo | 19 | 2.56 | 3.21 | 2.88 to 3.78 |
| spectral-halo | default | 4 | 0.79 | 0.79 | 0.52 to 0.87 |
| spectral-halo | preset spectral halo | 4 | 0.72 | 0.63 | 0.44 to 0.94 |
| spectral-halo | preset radius per channel | 4 | 0.52 | 0.52 | 0.42 to 0.70 |
| spectral-halo | preset film halation | 4 | 0.98 | 0.94 | 0.72 to 2.21 |
| spectral-halo | preset plain bloom | 4 | 0.59 | 0.74 | 0.48 to 0.92 |
| spectral-halo | preset even scatter (blue inside) | 4 | 0.85 | 0.81 | 0.72 to 1.59 |
| spectral-halo | preset diffraction (spread 1.75) | 4 | 1.05 | 0.81 | 0.37 to 1.22 |
| spectral-halo | preset wide red | 4 | 1.38 | 1.33 | 1.05 to 1.53 |
| spectral-halo | preset no halo | 2 | 0.52 | 0.46 | 0.33 to 0.63 |
| wire-loader | default | 14 | 0.85 | 0.90 | 0.76 to 1.11 |
| wire-loader | preset icosahedron | 14 | 0.85 | 0.76 | 0.52 to 0.90 |
| wire-loader | preset cyan halo | 14 | 0.66 | 0.61 | 0.33 to 0.81 |
| wire-loader | preset gold dodecahedron | 14 | 0.79 | 0.79 | 0.52 to 0.98 |
| wire-loader | preset cube icon | 14 | 0.85 | 0.79 | 0.55 to 1.07 |
| wire-loader | preset octahedron spinner | 14 | 0.85 | 0.79 | 0.59 to 1.07 |
| wire-loader | preset front edges only | 14 | 0.85 | 0.81 | 0.57 to 1.03 |
| prism-icosahedron | halo=0 | 17 | 1.97 | 2.08 | 1.77 to 3.15 |
| prism-icosahedron | halo=0.45 | 19 | 2.56 | 2.60 | 2.16 to 3.19 |
| prism-icosahedron | focus=0 | 19 | 2.62 | 2.32 | 2.01 to 2.77 |
| prism-icosahedron | focus=0.035 | 19 | 2.36 | 3.15 | 2.60 to 7.01 |
| prism-icosahedron | resolution=0.25 | 19 | 1.44 | 2.01 | 1.46 to 2.25 |
| prism-icosahedron | resolution=0.5 | 19 | 2.62 | 2.97 | 2.16 to 3.60 |
| prism-icosahedron | resolution=1 | 19 | 5.31 | 5.57 | 5.35 to 6.01 |
| prism-icosahedron | flares=0 | 19 | 2.29 | 2.88 | 2.47 to 3.06 |
| prism-icosahedron | flares=0.9 | 19 | 2.29 | 2.99 | 2.53 to 3.67 |

## 1266 × 585

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.00 | 0.07 | 0.02 to 0.09 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.33 | 0.22 to 0.50 |
| glass-badge | default | 1 | 0.72 | 0.79 | 0.63 to 1.22 |
| glass-badge | preset hexagon | 1 | 0.72 | 0.70 | 0.68 to 0.87 |
| glass-badge | preset shield in crown | 1 | 0.59 | 0.61 | 0.57 to 0.68 |
| glass-badge | preset diamond pill | 1 | 0.59 | 0.59 | 0.46 to 0.79 |
| glass-badge | preset thin octagon | 1 | 0.92 | 0.92 | 0.87 to 1.14 |
| glass-badge | preset blue glass | 1 | 0.72 | 0.70 | 0.63 to 0.81 |
| prism-icosahedron | default | 17 | 1.97 | 2.27 | 1.66 to 4.26 |
| prism-icosahedron | preset showpiece | 17 | 1.57 | 1.86 | 1.49 to 2.16 |
| prism-icosahedron | preset body in focus | 17 | 1.64 | 1.70 | 1.42 to 3.63 |
| prism-icosahedron | preset diamond fire | 17 | 1.51 | 1.70 | 0.98 to 2.51 |
| prism-icosahedron | preset clear crown | 17 | 1.64 | 1.81 | 1.42 to 3.04 |
| prism-icosahedron | preset wire and halo only | 17 | 1.64 | 1.86 | 1.40 to 2.16 |
| prism-icosahedron | preset wide halo | 17 | 2.16 | 2.36 | 1.29 to 2.91 |
| spectral-halo | default | 4 | 0.66 | 0.63 | 0.46 to 0.83 |
| spectral-halo | preset spectral halo | 4 | 1.05 | 0.94 | 0.79 to 1.22 |
| spectral-halo | preset radius per channel | 4 | 0.85 | 0.72 | 0.15 to 0.92 |
| spectral-halo | preset film halation | 4 | 0.46 | 0.37 | 0.28 to 0.55 |
| spectral-halo | preset plain bloom | 4 | 0.46 | 0.44 | 0.37 to 0.61 |
| spectral-halo | preset even scatter (blue inside) | 4 | 1.11 | 1.14 | 1.11 to 1.22 |
| spectral-halo | preset diffraction (spread 1.75) | 4 | 0.52 | 0.52 | 0.44 to 0.68 |
| spectral-halo | preset wide red | 4 | 0.98 | 0.94 | 0.74 to 1.09 |
| spectral-halo | preset no halo | 2 | 0.26 | 0.20 | 0.15 to 0.35 |
| wire-loader | default | 12 | 0.59 | 0.50 | 0.24 to 0.79 |
| wire-loader | preset icosahedron | 12 | 0.52 | 0.48 | 0.31 to 0.79 |
| wire-loader | preset cyan halo | 12 | 0.59 | 0.52 | 0.26 to 0.74 |
| wire-loader | preset gold dodecahedron | 12 | 0.59 | 0.52 | 0.24 to 0.79 |
| wire-loader | preset cube icon | 12 | 0.59 | 0.52 | 0.24 to 0.74 |
| wire-loader | preset octahedron spinner | 12 | 0.59 | 0.50 | 0.48 to 0.76 |
| wire-loader | preset front edges only | 12 | 0.52 | 0.50 | 0.42 to 0.76 |
| prism-icosahedron | halo=0 | 15 | 1.51 | 1.44 | 1.16 to 1.94 |
| prism-icosahedron | halo=0.45 | 17 | 2.10 | 2.18 | 1.59 to 3.12 |
| prism-icosahedron | focus=0 | 17 | 1.70 | 1.97 | 1.62 to 2.69 |
| prism-icosahedron | focus=0.035 | 17 | 1.70 | 1.97 | 1.64 to 2.47 |
| prism-icosahedron | resolution=0.25 | 17 | 1.70 | 2.14 | 1.64 to 3.78 |
| prism-icosahedron | resolution=0.5 | 17 | 1.57 | 2.01 | 1.53 to 2.97 |
| prism-icosahedron | resolution=1 | 17 | 2.29 | 2.97 | 2.49 to 3.34 |
| prism-icosahedron | flares=0 | 17 | 1.38 | 1.81 | 1.51 to 2.45 |
| prism-icosahedron | flares=0.9 | 17 | 1.90 | 2.16 | 1.81 to 2.91 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (20.8 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
