# Cost study: Epic 1

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.02 to 0.39 |
| (tail) | constant scene + bloom + output | 11 | 0.72 | 0.44 | 0.00 to 1.03 |
| hello | default | 11 | 1.18 | 1.44 | 0.70 to 1.55 |
| hello | preset deep blue | 11 | 1.51 | 0.98 | 0.76 to 1.84 |
| hello | preset sparse | 11 | 1.11 | 1.25 | 0.72 to 1.44 |
| hello | preset nearly in focus | 11 | 1.18 | 1.49 | 0.72 to 1.81 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.02 to 0.09 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.33 | 0.26 to 0.50 |
| hello | default | 9 | 0.59 | 0.28 | 0.11 to 0.35 |
| hello | preset deep blue | 9 | 0.39 | 0.39 | 0.26 to 0.70 |
| hello | preset sparse | 9 | 0.46 | 0.39 | 0.11 to 0.55 |
| hello | preset nearly in focus | 9 | 0.52 | 0.48 | 0.13 to 0.79 |
