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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | -0.17 to 0.42 |
| (tail) | constant scene + bloom + output | 11 | 0.79 | 0.44 | 0.09 to 0.59 |
| flare-cursor | default | 14 | 0.66 | 0.83 | 0.68 to 1.07 |
| flare-cursor | preset modern lens | 14 | 0.66 | 0.83 | 0.72 to 1.07 |
| flare-cursor | preset anamorphic | 14 | 1.38 | 0.66 | 0.22 to 0.87 |
| flare-cursor | preset vintage zoom | 14 | 0.72 | 0.83 | 0.26 to 1.07 |
| flare-cursor | preset clean light | 12 | 0.59 | 0.50 | 0.22 to 0.70 |
| focus-cursor | default | 11 | 0.46 | 0.48 | 0.28 to 0.66 |
| focus-cursor | preset f/1.4 | 11 | 0.52 | 0.44 | 0.28 to 0.68 |
| focus-cursor | preset f/4 | 11 | 0.46 | 0.59 | 0.31 to 0.70 |
| focus-cursor | preset slow focus motor | 11 | 0.59 | 0.48 | 0.17 to 0.68 |
| focus-cursor | preset nine blades | 11 | 0.72 | 0.42 | 0.24 to 0.63 |
| focus-cursor | preset lantern festival | 11 | 0.52 | 0.61 | 0.33 to 0.79 |
| glint-hover | default | 12 | 0.59 | 0.55 | 0.39 to 0.81 |
| glint-hover | preset white glint | 12 | 0.59 | 0.50 | 0.26 to 0.76 |
| glint-hover | preset gold | 12 | 0.59 | 0.68 | 0.28 to 0.76 |
| glint-hover | preset long spikes | 12 | 0.59 | 0.70 | 0.22 to 0.76 |
| glint-hover | preset still glints | 12 | 0.72 | 0.52 | 0.24 to 0.72 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | -0.17 to 0.11 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.48 | 0.04 to 0.63 |
| flare-cursor | default | 12 | 0.79 | 0.70 | 0.31 to 0.83 |
| flare-cursor | preset modern lens | 12 | 0.59 | 0.59 | 0.35 to 0.79 |
| flare-cursor | preset anamorphic | 12 | 0.66 | 0.57 | 0.46 to 0.81 |
| flare-cursor | preset vintage zoom | 12 | 0.59 | 0.59 | 0.37 to 0.81 |
| flare-cursor | preset clean light | 10 | 0.46 | 0.39 | 0.20 to 0.83 |
| focus-cursor | default | 9 | 0.39 | 0.35 | 0.20 to 0.55 |
| focus-cursor | preset f/1.4 | 9 | 0.66 | 0.35 | -0.44 to 0.94 |
| focus-cursor | preset f/4 | 9 | 0.39 | 0.35 | -0.02 to 0.55 |
| focus-cursor | preset slow focus motor | 9 | 0.39 | 0.42 | 0.31 to 0.70 |
| focus-cursor | preset nine blades | 9 | 0.59 | 0.28 | 0.11 to 0.55 |
| focus-cursor | preset lantern festival | 9 | 0.33 | 0.39 | 0.04 to 0.74 |
| glint-hover | default | 10 | 0.39 | 0.46 | 0.26 to 0.61 |
| glint-hover | preset white glint | 10 | 0.46 | 0.39 | 0.15 to 0.59 |
| glint-hover | preset gold | 10 | 0.33 | 0.42 | 0.31 to 0.68 |
| glint-hover | preset long spikes | 10 | 0.52 | 0.33 | 0.26 to 0.68 |
| glint-hover | preset still glints | 10 | 0.46 | 0.39 | 0.07 to 0.76 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (20.8 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| flare-cursor | 10 | 1.2 | 27.1 |
| focus-cursor | 10 | 1.4 | 23.0 |
| glint-hover | 10 | 1.3 | 26.5 |
