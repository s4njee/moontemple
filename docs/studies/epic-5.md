# Cost study: Epic 5

Measured 2026-10-29 on **Apple M1 Max** (apple-silicon), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.04 to 0.26 |
| (tail) | constant scene + bloom + output | 11 | 0.52 | 0.48 | 0.31 to 0.98 |
| ice-halo | default | 11 | 1.51 | 1.29 | 1.07 to 1.64 |
| ice-halo | preset halo and dogs | 11 | 1.44 | 1.27 | 1.11 to 1.68 |
| ice-halo | preset halo alone | 11 | 1.57 | 1.33 | 1.05 to 1.59 |
| ice-halo | preset bright moon dogs | 11 | 1.25 | 1.22 | 1.16 to 2.14 |
| ice-halo | preset low moon | 11 | 1.44 | 1.22 | 1.14 to 1.81 |
| ice-halo | preset high moon | 11 | 1.51 | 1.25 | 1.07 to 2.05 |
| ice-halo | preset thick veil | 11 | 1.51 | 1.51 | 1.07 to 1.81 |
| lamp-in-fog | default | 11 | 0.92 | 0.85 | 0.61 to 1.14 |
| lamp-in-fog | preset one lamp | 11 | 0.98 | 1.00 | 0.70 to 1.44 |
| lamp-in-fog | preset a row receding | 11 | 2.36 | 2.25 | 2.21 to 2.42 |
| lamp-in-fog | preset led street | 11 | 1.70 | 1.64 | 1.40 to 1.73 |
| lamp-in-fog | preset thick fog | 11 | 0.79 | 0.74 | 0.63 to 0.79 |
| lamp-in-fog | preset thin fog, moon | 11 | 1.57 | 1.59 | 1.46 to 1.73 |
| lamp-in-fog | preset behind text | 11 | 0.79 | 0.74 | 0.61 to 0.96 |
| lunar-corona | default | 11 | 1.38 | 1.35 | 1.09 to 1.59 |
| lunar-corona | preset clear rings | 11 | 1.51 | 1.38 | 1.29 to 1.68 |
| lunar-corona | preset plain aureole | 11 | 1.64 | 1.42 | 1.20 to 2.05 |
| lunar-corona | preset small droplets | 11 | 1.31 | 1.38 | 1.25 to 1.81 |
| lunar-corona | preset large droplets | 11 | 1.31 | 1.40 | 1.31 to 2.51 |
| lunar-corona | preset iridescent cloud | 11 | 1.51 | 1.44 | 1.16 to 1.94 |
| lunar-corona | preset gibbous moon | 11 | 1.31 | 1.42 | 1.29 to 1.94 |
| moon-through-cloud | default | 12 | 0.52 | 0.52 | 0.44 to 0.68 |
| moon-through-cloud | preset thin cloud | 12 | 0.66 | 0.76 | 0.57 to 0.87 |
| moon-through-cloud | preset silver edges | 12 | 1.25 | 1.18 | 1.03 to 1.49 |
| moon-through-cloud | preset veiled moon | 12 | 0.72 | 0.68 | 0.31 to 1.57 |
| moon-through-cloud | preset breaking cloud | 12 | 0.98 | 0.92 | 0.66 to 1.49 |
| moon-through-cloud | preset crescent | 12 | 0.79 | 0.94 | 0.76 to 1.27 |
| moon-through-cloud | preset wide lens | 12 | 0.98 | 1.07 | 0.63 to 1.38 |
| moon-through-cloud | preset exposed for the face | 12 | 0.85 | 0.83 | 0.46 to 1.11 |
| moonbow | default | 11 | 1.64 | 1.53 | 1.42 to 2.32 |
| moonbow | preset by eye | 11 | 1.51 | 1.53 | 1.35 to 1.81 |
| moonbow | preset long exposure | 11 | 1.51 | 1.55 | 1.38 to 1.59 |
| moonbow | preset heavy spray | 11 | 1.51 | 1.53 | 1.35 to 2.03 |
| moonbow | preset higher moon | 11 | 1.51 | 1.57 | 1.38 to 2.12 |
| moonbow | preset second bow | 11 | 1.84 | 1.53 | 1.33 to 3.04 |
| moonlit-water | default | 12 | 9.44 | 9.79 | 9.09 to 11.12 |
| moonlit-water | preset river of discs | 12 | 9.57 | 9.39 | 8.17 to 10.84 |
| moonlit-water | preset sharp sparkle | 12 | 2.16 | 2.21 | 1.92 to 3.95 |
| moonlit-water | preset calm sea | 12 | 9.76 | 9.87 | 9.07 to 10.81 |
| moonlit-water | preset windy night | 12 | 8.65 | 9.02 | 8.43 to 10.05 |
| moonlit-water | preset high moon | 12 | 2.75 | 2.58 | 2.27 to 2.88 |
| moonlit-water | preset half moon | 12 | 2.23 | 2.69 | 1.73 to 3.98 |
| moonlit-water | preset nine blades | 12 | 9.37 | 9.37 | 8.54 to 11.38 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.02 to 0.09 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.31 | 0.17 to 0.50 |
| ice-halo | default | 9 | 0.72 | 0.55 | 0.46 to 1.22 |
| ice-halo | preset halo and dogs | 9 | 0.66 | 0.70 | 0.28 to 1.49 |
| ice-halo | preset halo alone | 9 | 0.52 | 0.52 | 0.37 to 1.16 |
| ice-halo | preset bright moon dogs | 9 | 0.46 | 0.46 | 0.31 to 1.27 |
| ice-halo | preset low moon | 9 | 0.39 | 0.39 | 0.31 to 0.57 |
| ice-halo | preset high moon | 9 | 0.39 | 0.35 | 0.26 to 0.52 |
| ice-halo | preset thick veil | 9 | 0.39 | 0.37 | 0.33 to 0.55 |
| lamp-in-fog | default | 9 | 0.59 | 0.37 | 0.24 to 0.52 |
| lamp-in-fog | preset one lamp | 9 | 0.92 | 0.66 | 0.50 to 0.83 |
| lamp-in-fog | preset a row receding | 9 | 0.92 | 0.90 | 0.72 to 0.96 |
| lamp-in-fog | preset led street | 9 | 0.66 | 0.66 | 0.33 to 0.79 |
| lamp-in-fog | preset thick fog | 9 | 0.39 | 0.39 | 0.24 to 0.52 |
| lamp-in-fog | preset thin fog, moon | 9 | 0.98 | 0.83 | 0.35 to 1.20 |
| lamp-in-fog | preset behind text | 9 | 0.52 | 0.48 | 0.26 to 0.83 |
| lunar-corona | default | 9 | 1.31 | 0.81 | 0.50 to 1.14 |
| lunar-corona | preset clear rings | 9 | 0.85 | 0.85 | 0.35 to 1.70 |
| lunar-corona | preset plain aureole | 9 | 0.79 | 0.76 | 0.46 to 1.07 |
| lunar-corona | preset small droplets | 9 | 0.79 | 0.87 | 0.55 to 0.92 |
| lunar-corona | preset large droplets | 9 | 0.79 | 0.72 | 0.37 to 1.62 |
| lunar-corona | preset iridescent cloud | 9 | 0.72 | 0.68 | 0.39 to 1.73 |
| lunar-corona | preset gibbous moon | 9 | 0.66 | 0.70 | 0.37 to 1.64 |
| moon-through-cloud | default | 10 | 0.46 | 0.57 | 0.42 to 0.61 |
| moon-through-cloud | preset thin cloud | 10 | 0.59 | 0.44 | 0.07 to 0.81 |
| moon-through-cloud | preset silver edges | 10 | 0.52 | 0.50 | -0.13 to 1.03 |
| moon-through-cloud | preset veiled moon | 10 | 0.52 | 0.46 | -0.09 to 0.98 |
| moon-through-cloud | preset breaking cloud | 10 | 0.52 | 0.46 | 0.42 to 1.00 |
| moon-through-cloud | preset crescent | 10 | 0.52 | 0.52 | 0.15 to 0.76 |
| moon-through-cloud | preset wide lens | 10 | 0.52 | 0.55 | 0.22 to 0.76 |
| moon-through-cloud | preset exposed for the face | 10 | 0.52 | 0.44 | 0.24 to 0.81 |
| moonbow | default | 9 | 0.79 | 0.68 | 0.46 to 1.62 |
| moonbow | preset by eye | 9 | 0.66 | 0.63 | 0.39 to 1.16 |
| moonbow | preset long exposure | 9 | 0.79 | 0.72 | 0.61 to 1.20 |
| moonbow | preset heavy spray | 9 | 0.92 | 0.92 | 0.76 to 1.27 |
| moonbow | preset higher moon | 9 | 0.72 | 0.76 | 0.37 to 0.98 |
| moonbow | preset second bow | 9 | 0.92 | 0.87 | 0.61 to 1.86 |
| moonlit-water | default | 10 | 3.74 | 3.71 | 3.43 to 4.96 |
| moonlit-water | preset river of discs | 10 | 3.67 | 3.69 | 3.36 to 4.13 |
| moonlit-water | preset sharp sparkle | 10 | 2.03 | 2.10 | 1.27 to 3.06 |
| moonlit-water | preset calm sea | 10 | 4.13 | 4.17 | 4.04 to 4.46 |
| moonlit-water | preset windy night | 10 | 3.60 | 3.54 | 3.30 to 3.82 |
| moonlit-water | preset high moon | 10 | 1.77 | 2.05 | 1.05 to 3.58 |
| moonlit-water | preset half moon | 10 | 1.70 | 2.14 | 1.90 to 3.52 |
| moonlit-water | preset nine blades | 10 | 3.80 | 3.60 | 3.32 to 4.87 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (35.2 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| ice-halo | 16 | 2.7 | 32.7 |
| lamp-in-fog | 18 | 1.9 | 37.7 |
| lunar-corona | 16 | 2.5 | 32.1 |
| moon-through-cloud | 12 | 1.7 | 28.4 |
| moonbow | 14 | 1.9 | 29.6 |
| moonlit-water | 14 | 4.1 | 31.9 |
