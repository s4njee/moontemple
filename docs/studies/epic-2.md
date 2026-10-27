# Cost study: Epic 2

Measured 2026-10-27 on **Apple M1 Max** (apple-silicon), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | -0.50 to 0.35 |
| (tail) | constant scene + bloom + output | 11 | 0.59 | 0.46 | 0.20 to 0.68 |
| lens-light | default | 14 | 0.92 | 0.52 | 0.35 to 1.07 |
| lens-light | preset every artefact | 14 | 0.72 | 0.87 | 0.70 to 1.03 |
| lens-light | preset clean lens | 12 | 0.59 | 0.44 | 0.35 to 0.81 |
| lens-light | preset anamorphic | 14 | 0.72 | 0.72 | 0.50 to 1.03 |
| lens-light | preset vintage | 14 | 0.72 | 0.70 | 0.50 to 1.64 |
| lens-light | preset star filter | 14 | 0.66 | 0.66 | 0.26 to 0.96 |
| lens-model | default | 11 | 0.46 | 0.46 | -0.13 to 0.83 |
| lens-model | preset f/1.4 | 11 | 0.46 | 0.44 | 0.33 to 0.66 |
| lens-model | preset stopped down | 11 | 0.46 | 0.42 | 0.13 to 0.98 |
| lens-model | preset hexagon f/4 | 11 | 0.79 | 0.46 | 0.20 to 0.81 |
| lens-model | preset soap bubble | 11 | 0.66 | 0.72 | 0.50 to 1.20 |
| lens-model | preset swirly 85 | 11 | 0.66 | 0.74 | 0.37 to 1.18 |
| lens-model | preset old zoom | 11 | 0.59 | 0.42 | 0.15 to 0.79 |
| lens-model | preset light not conserved | 11 | 0.46 | 0.46 | 0.39 to 0.70 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.00 | 0.04 | -0.07 to 0.09 |
| (tail) | constant scene + bloom + output | 9 | 0.52 | 0.28 | 0.11 to 0.42 |
| lens-light | default | 12 | 0.52 | 0.52 | 0.42 to 0.92 |
| lens-light | preset every artefact | 12 | 0.66 | 0.50 | 0.39 to 0.76 |
| lens-light | preset clean lens | 10 | 0.39 | 0.37 | 0.15 to 0.61 |
| lens-light | preset anamorphic | 12 | 0.59 | 0.52 | 0.37 to 0.85 |
| lens-light | preset vintage | 12 | 0.59 | 0.55 | 0.42 to 0.85 |
| lens-light | preset star filter | 12 | 0.72 | 0.48 | 0.24 to 0.79 |
| lens-model | default | 9 | 0.39 | 0.35 | 0.22 to 0.66 |
| lens-model | preset f/1.4 | 9 | 0.33 | 0.39 | 0.20 to 0.57 |
| lens-model | preset stopped down | 9 | 0.59 | 0.42 | 0.07 to 1.31 |
| lens-model | preset hexagon f/4 | 9 | 0.46 | 0.31 | 0.20 to 0.42 |
| lens-model | preset soap bubble | 9 | 0.46 | 0.39 | 0.22 to 0.61 |
| lens-model | preset swirly 85 | 9 | 0.39 | 0.33 | 0.28 to 0.63 |
| lens-model | preset old zoom | 9 | 0.39 | 0.33 | 0.28 to 0.61 |
| lens-model | preset light not conserved | 9 | 0.46 | 0.35 | 0.20 to 0.52 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (20.8 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| lens-light | 12 | 1.7 | 28.1 |
| lens-model | 8 | 1.2 | 21.7 |
