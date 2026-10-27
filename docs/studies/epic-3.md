# Cost study: Epic 3

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | -0.15 to 0.37 |
| (tail) | constant scene + bloom + output | 11 | 0.66 | 0.46 | 0.31 to 0.76 |
| dof-lab | default | 15 | 5.96 | 7.69 | 5.92 to 8.19 |
| dof-lab | preset subject in focus | 15 | 6.42 | 6.60 | 5.90 to 7.73 |
| dof-lab | preset background in focus | 15 | 6.29 | 6.79 | 6.34 to 7.80 |
| dof-lab | preset foreground in focus | 15 | 5.37 | 6.51 | 5.92 to 7.34 |
| dof-lab | preset difference | 15 | 5.57 | 6.16 | 5.94 to 6.75 |
| dof-lab | preset one point | 15 | 3.08 | 2.51 | 2.03 to 3.74 |
| dof-lab | view=method method=sharp | 13 | 2.03 | 2.97 | 2.64 to 3.71 |
| dof-lab | view=method method=hexagon | 14 | 4.39 | 4.17 | 3.82 to 4.59 |
| dof-lab | view=method focus=40 method=sharp | 13 | 2.29 | 2.93 | 2.08 to 3.32 |
| dof-lab | view=method focus=40 method=hexagon | 14 | 4.39 | 4.39 | 3.89 to 4.81 |
| dof-lab | view=reference rays=1000000000 samples=8 | 15 | 5.51 | 6.44 | 5.88 to 6.84 |
| dof-lab | view=reference rays=1000000000 samples=32 | 15 | 12.52 | 12.47 | 11.84 to 13.13 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.00 | 0.07 | -0.17 to 0.20 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.35 | 0.28 to 0.50 |
| dof-lab | default | 13 | 1.31 | 1.51 | 0.92 to 2.05 |
| dof-lab | preset subject in focus | 13 | 1.31 | 1.77 | 1.27 to 2.12 |
| dof-lab | preset background in focus | 13 | 1.25 | 1.64 | 1.07 to 2.03 |
| dof-lab | preset foreground in focus | 13 | 1.51 | 1.51 | 1.33 to 2.25 |
| dof-lab | preset difference | 13 | 1.31 | 1.68 | 1.22 to 2.12 |
| dof-lab | preset one point | 13 | 0.66 | 1.00 | 0.81 to 1.09 |
| dof-lab | view=method method=sharp | 11 | 0.72 | 0.87 | 0.35 to 1.00 |
| dof-lab | view=method method=hexagon | 12 | 0.92 | 1.29 | 0.74 to 1.51 |
| dof-lab | view=method focus=40 method=sharp | 11 | 0.66 | 0.76 | 0.28 to 0.90 |
| dof-lab | view=method focus=40 method=hexagon | 12 | 0.79 | 1.00 | 0.50 to 1.25 |
| dof-lab | view=reference rays=1000000000 samples=8 | 13 | 1.44 | 1.66 | 0.90 to 2.12 |
| dof-lab | view=reference rays=1000000000 samples=32 | 13 | 3.21 | 3.30 | 2.71 to 3.54 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (16.4 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| dof-lab | 9 | 6.8 | 26.3 |
