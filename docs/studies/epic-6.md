# Cost study: Epic 6

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | -0.11 to 0.26 |
| (tail) | constant scene + bloom + output | 11 | 0.59 | 0.42 | 0.20 to 0.70 |
| focus-cursor | default | 11 | 0.66 | 0.46 | -0.11 to 0.52 |
| focus-cursor | preset f/1.4 | 11 | 0.72 | 0.39 | 0.31 to 0.55 |
| focus-cursor | preset f/4 | 11 | 0.79 | 0.39 | 0.11 to 0.98 |
| focus-cursor | preset slow focus motor | 11 | 0.72 | 0.37 | 0.20 to 0.57 |
| focus-cursor | preset nine blades | 11 | 0.66 | 0.46 | 0.28 to 0.59 |
| focus-cursor | preset lantern festival | 11 | 0.66 | 0.42 | 0.33 to 0.61 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.00 | 0.07 | -0.15 to 0.20 |
| (tail) | constant scene + bloom + output | 9 | 0.52 | 0.31 | 0.20 to 0.48 |
| focus-cursor | default | 9 | 0.59 | 0.28 | 0.22 to 0.46 |
| focus-cursor | preset f/1.4 | 9 | 0.39 | 0.33 | 0.13 to 0.44 |
| focus-cursor | preset f/4 | 9 | 0.46 | 0.33 | 0.09 to 0.55 |
| focus-cursor | preset slow focus motor | 9 | 0.46 | 0.35 | 0.11 to 0.52 |
| focus-cursor | preset nine blades | 9 | 0.52 | 0.33 | 0.24 to 0.68 |
| focus-cursor | preset lantern festival | 9 | 0.52 | 0.35 | 0.20 to 0.55 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (15.7 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| focus-cursor | 7 | 1.4 | 20.2 |
