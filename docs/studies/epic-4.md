# Cost study: Epic 4

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
| (tail) | constant scene + bloom + output | 11 | 0.79 | 0.48 | 0.09 to 0.63 |
| bokeh-drift | default | 12 | 0.72 | 0.52 | 0.28 to 0.83 |
| bokeh-drift | preset violet night | 12 | 0.72 | 0.59 | 0.28 to 0.79 |
| bokeh-drift | preset city lights | 12 | 0.98 | 0.55 | 0.33 to 0.72 |
| bokeh-drift | preset gold hexagons | 12 | 0.79 | 0.52 | 0.28 to 0.76 |
| bokeh-drift | preset soap bubbles | 12 | 1.05 | 0.68 | 0.33 to 1.14 |
| bokeh-drift | preset swirly lens | 12 | 0.72 | 0.68 | 0.48 to 0.92 |
| bokeh-drift | preset pulled focus | 12 | 1.11 | 0.52 | 0.13 to 0.83 |
| bokeh-drift | preset rgb sweep | 12 | 0.92 | 0.50 | 0.35 to 0.83 |
| fairy-lights | default | 11 | 0.59 | 0.44 | 0.33 to 0.81 |
| fairy-lights | preset warm white | 11 | 0.52 | 0.44 | 0.28 to 0.87 |
| fairy-lights | preset multicolour | 11 | 0.66 | 0.42 | 0.20 to 0.59 |
| fairy-lights | preset cool white | 11 | 0.59 | 0.50 | 0.31 to 0.59 |
| fairy-lights | preset one string sharp | 11 | 0.59 | 0.46 | 0.35 to 0.59 |
| fairy-lights | preset hexagonal lens | 11 | 0.66 | 0.46 | 0.24 to 0.66 |
| fairy-lights | preset still | 11 | 0.59 | 0.44 | 0.24 to 0.59 |
| snow-at-night | default | 12 | 0.92 | 0.52 | 0.35 to 0.72 |
| snow-at-night | preset sodium lamp | 12 | 0.66 | 0.59 | 0.35 to 0.81 |
| snow-at-night | preset led lamp | 12 | 0.92 | 0.52 | 0.37 to 1.11 |
| snow-at-night | preset blizzard | 12 | 1.05 | 0.61 | 0.33 to 0.85 |
| snow-at-night | preset still air | 12 | 0.92 | 0.52 | 0.37 to 0.85 |
| snow-at-night | preset near flakes sharp | 12 | 0.66 | 0.76 | 0.61 to 1.00 |
| snow-at-night | preset lamp in focus | 12 | 1.11 | 0.42 | 0.09 to 0.70 |
| bokeh-drift | count=50 | 12 | 0.72 | 0.66 | 0.28 to 0.92 |
| bokeh-drift | count=220 | 12 | 0.98 | 0.57 | 0.31 to 0.66 |
| bokeh-drift | count=440 | 12 | 1.11 | 0.59 | 0.33 to 0.70 |
| bokeh-drift | blur=0.02 | 12 | 0.92 | 0.42 | -0.04 to 0.72 |
| bokeh-drift | blur=0.09 | 12 | 1.11 | 0.59 | 0.31 to 0.83 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | -0.02 to 0.20 |
| (tail) | constant scene + bloom + output | 9 | 0.33 | 0.39 | 0.35 to 0.57 |
| bokeh-drift | default | 10 | 0.46 | 0.39 | 0.13 to 0.61 |
| bokeh-drift | preset violet night | 10 | 0.46 | 0.42 | 0.28 to 0.57 |
| bokeh-drift | preset city lights | 10 | 0.52 | 0.46 | 0.22 to 0.57 |
| bokeh-drift | preset gold hexagons | 10 | 0.52 | 0.39 | 0.15 to 0.57 |
| bokeh-drift | preset soap bubbles | 10 | 0.52 | 0.44 | 0.17 to 0.55 |
| bokeh-drift | preset swirly lens | 10 | 0.52 | 0.37 | 0.22 to 0.63 |
| bokeh-drift | preset pulled focus | 10 | 0.52 | 0.39 | 0.24 to 0.46 |
| bokeh-drift | preset rgb sweep | 10 | 0.72 | 0.35 | 0.09 to 0.48 |
| fairy-lights | default | 9 | 0.46 | 0.37 | 0.20 to 0.59 |
| fairy-lights | preset warm white | 9 | 0.59 | 0.33 | 0.13 to 0.39 |
| fairy-lights | preset multicolour | 9 | 0.39 | 0.37 | 0.20 to 0.46 |
| fairy-lights | preset cool white | 9 | 0.46 | 0.33 | 0.26 to 0.44 |
| fairy-lights | preset one string sharp | 9 | 0.39 | 0.37 | 0.15 to 0.52 |
| fairy-lights | preset hexagonal lens | 9 | 0.39 | 0.37 | 0.13 to 0.48 |
| fairy-lights | preset still | 9 | 0.46 | 0.35 | 0.13 to 0.52 |
| snow-at-night | default | 10 | 0.46 | 0.37 | 0.28 to 0.52 |
| snow-at-night | preset sodium lamp | 10 | 0.85 | 0.42 | 0.09 to 0.52 |
| snow-at-night | preset led lamp | 10 | 0.59 | 0.44 | 0.22 to 0.74 |
| snow-at-night | preset blizzard | 10 | 1.11 | 0.33 | 0.09 to 0.68 |
| snow-at-night | preset still air | 10 | 0.46 | 0.44 | 0.09 to 0.55 |
| snow-at-night | preset near flakes sharp | 10 | 0.59 | 0.37 | 0.22 to 0.57 |
| snow-at-night | preset lamp in focus | 10 | 0.72 | 0.44 | 0.33 to 0.63 |
| bokeh-drift | count=50 | 10 | 0.66 | 0.42 | 0.15 to 0.52 |
| bokeh-drift | count=220 | 10 | 0.85 | 0.26 | 0.22 to 0.57 |
| bokeh-drift | count=440 | 10 | 0.66 | 0.35 | 0.22 to 0.48 |
| bokeh-drift | blur=0.02 | 10 | 0.46 | 0.42 | 0.33 to 0.46 |
| bokeh-drift | blur=0.09 | 10 | 0.72 | 0.33 | 0.07 to 0.57 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (15.7 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| bokeh-drift | 9 | 2.1 | 22.1 |
| fairy-lights | 6 | 1.5 | 19.9 |
| snow-at-night | 8 | 1.8 | 21.3 |
