# Cost study: Epic 6

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.04 to 0.42 |
| (tail) | constant scene + bloom + output | 11 | 0.59 | 0.42 | 0.37 to 0.55 |
| bokeh-loader | default | 11 | 0.85 | 0.85 | 0.42 to 1.11 |
| bokeh-loader | preset moon ring | 11 | 0.52 | 0.52 | 0.20 to 0.66 |
| bokeh-loader | preset progress bar | 11 | 0.85 | 0.87 | 0.52 to 1.16 |
| bokeh-loader | preset spinner | 11 | 0.52 | 0.50 | 0.31 to 0.68 |
| bokeh-loader | preset bar spinner | 11 | 0.66 | 0.63 | 0.35 to 0.74 |
| bokeh-loader | preset at 30% | 11 | 0.66 | 0.61 | 0.24 to 1.09 |
| bokeh-loader | preset gold hexagons | 11 | 0.79 | 0.66 | 0.13 to 1.07 |
| bokeh-loader | preset few and large | 11 | 0.59 | 0.72 | 0.59 to 0.94 |
| flare-cursor | default | 14 | 1.38 | 1.29 | 0.92 to 2.05 |
| flare-cursor | preset modern lens | 14 | 1.38 | 1.22 | 0.98 to 1.64 |
| flare-cursor | preset anamorphic | 14 | 1.31 | 1.27 | 0.94 to 1.84 |
| flare-cursor | preset vintage zoom | 14 | 1.31 | 1.27 | 0.98 to 1.66 |
| flare-cursor | preset clean light | 12 | 0.72 | 0.72 | 0.48 to 0.79 |
| focus-cursor | default | 11 | 0.72 | 0.85 | 0.68 to 0.96 |
| focus-cursor | preset f/1.4 | 11 | 0.85 | 0.85 | 0.35 to 0.98 |
| focus-cursor | preset f/4 | 11 | 0.79 | 0.87 | 0.68 to 1.07 |
| focus-cursor | preset slow focus motor | 11 | 1.70 | 0.72 | 0.59 to 0.94 |
| focus-cursor | preset nine blades | 11 | 0.52 | 0.55 | 0.28 to 0.70 |
| focus-cursor | preset lantern festival | 11 | 1.05 | 1.11 | 0.39 to 1.49 |
| focus-pull | default | 11 | 0.59 | 0.59 | 0.31 to 0.76 |
| focus-pull | preset racking through sections | 11 | 1.77 | 0.87 | 0.72 to 1.00 |
| focus-pull | preset f/1.4 | 11 | 1.11 | 1.09 | 0.74 to 1.62 |
| focus-pull | preset f/8 | 11 | 0.66 | 0.70 | 0.52 to 0.90 |
| focus-pull | preset nine blades | 11 | 0.59 | 0.61 | 0.35 to 0.79 |
| glint-hover | default | 12 | 0.85 | 0.66 | 0.46 to 1.16 |
| glint-hover | preset white glint | 12 | 0.66 | 0.50 | 0.35 to 0.74 |
| glint-hover | preset gold | 12 | 0.85 | 0.87 | 0.39 to 1.14 |
| glint-hover | preset long spikes | 12 | 0.85 | 0.72 | 0.44 to 0.96 |
| glint-hover | preset still glints | 12 | 0.79 | 0.76 | 0.48 to 0.94 |
| halation-text | default | 13 | 1.44 | 1.22 | 1.03 to 2.47 |
| halation-text | preset tungsten marquee | 13 | 1.18 | 1.35 | 0.90 to 1.59 |
| halation-text | preset white lightbox | 13 | 1.25 | 1.22 | 1.03 to 1.57 |
| halation-text | preset red neon | 13 | 1.44 | 1.33 | 1.07 to 1.62 |
| halation-text | preset ice on film | 13 | 1.38 | 1.11 | 0.87 to 2.69 |
| halation-text | preset wide halation | 13 | 1.25 | 1.22 | 0.72 to 2.16 |
| halation-text | preset tired sign | 13 | 1.05 | 1.33 | 0.94 to 1.44 |
| halation-text | preset no halation | 11 | 0.66 | 0.48 | 0.39 to 0.79 |
| light-leak | default | 14 | 0.92 | 0.94 | 0.81 to 1.77 |
| light-leak | preset film leaks | 14 | 0.98 | 0.92 | 0.63 to 2.27 |
| light-leak | preset golden hour | 14 | 0.98 | 0.98 | 0.66 to 1.92 |
| light-leak | preset red burn | 14 | 1.31 | 1.20 | 0.94 to 1.35 |
| light-leak | preset rose leaks | 14 | 0.92 | 0.98 | 0.72 to 2.05 |
| light-leak | preset flare only | 14 | 0.92 | 0.98 | 0.68 to 2.10 |
| photo-focus | default | 17 | 1.51 | 1.25 | 1.09 to 1.84 |
| photo-focus | preset f/1.4 | 17 | 1.84 | 1.59 | 1.16 to 2.05 |
| photo-focus | preset f/4 | 17 | 1.57 | 1.53 | 1.27 to 3.39 |
| photo-focus | preset clipped highlights | 17 | 1.64 | 1.35 | 0.87 to 1.75 |
| photo-focus | preset layered method | 19 | 2.95 | 3.12 | 2.84 to 3.63 |
| rack-focus-transition | default | 12 | 0.59 | 0.46 | 0.42 to 0.57 |
| rack-focus-transition | preset rack focus | 12 | 0.52 | 0.55 | 0.26 to 0.59 |
| rack-focus-transition | preset round discs (gather) | 12 | 0.66 | 0.55 | 0.39 to 1.53 |
| rack-focus-transition | preset clipped highlights | 12 | 1.90 | 0.81 | 0.63 to 1.11 |
| rack-focus-transition | preset quick cut | 12 | 0.98 | 1.11 | 0.68 to 1.38 |
| rack-focus-transition | preset slow rack | 12 | 0.79 | 0.83 | 0.57 to 1.03 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.00 | 0.07 | -0.13 to 0.17 |
| (tail) | constant scene + bloom + output | 9 | 0.52 | 0.50 | 0.31 to 0.94 |
| bokeh-loader | default | 9 | 0.39 | 0.42 | 0.35 to 0.76 |
| bokeh-loader | preset moon ring | 9 | 0.39 | 0.48 | 0.37 to 0.79 |
| bokeh-loader | preset progress bar | 9 | 0.46 | 0.35 | 0.26 to 0.74 |
| bokeh-loader | preset spinner | 9 | 0.39 | 0.44 | 0.33 to 0.74 |
| bokeh-loader | preset bar spinner | 9 | 0.46 | 0.42 | 0.15 to 0.74 |
| bokeh-loader | preset at 30% | 9 | 0.39 | 0.37 | 0.28 to 0.85 |
| bokeh-loader | preset gold hexagons | 9 | 0.39 | 0.42 | 0.31 to 0.76 |
| bokeh-loader | preset few and large | 9 | 0.39 | 0.48 | 0.31 to 0.63 |
| flare-cursor | default | 12 | 0.66 | 0.66 | 0.37 to 0.90 |
| flare-cursor | preset modern lens | 12 | 0.59 | 0.63 | 0.44 to 0.87 |
| flare-cursor | preset anamorphic | 12 | 0.66 | 0.61 | 0.42 to 0.94 |
| flare-cursor | preset vintage zoom | 12 | 0.59 | 0.61 | 0.24 to 1.03 |
| flare-cursor | preset clean light | 10 | 0.59 | 0.33 | 0.04 to 0.39 |
| focus-cursor | default | 9 | 0.39 | 0.37 | 0.07 to 1.00 |
| focus-cursor | preset f/1.4 | 9 | 0.39 | 0.46 | 0.22 to 0.79 |
| focus-cursor | preset f/4 | 9 | 0.39 | 0.37 | 0.28 to 0.48 |
| focus-cursor | preset slow focus motor | 9 | 0.39 | 0.39 | 0.33 to 0.72 |
| focus-cursor | preset nine blades | 9 | 0.46 | 0.42 | 0.04 to 0.76 |
| focus-cursor | preset lantern festival | 9 | 0.72 | 0.48 | 0.33 to 0.76 |
| focus-pull | default | 9 | 0.46 | 0.42 | 0.28 to 0.72 |
| focus-pull | preset racking through sections | 9 | 0.46 | 0.39 | 0.11 to 0.70 |
| focus-pull | preset f/1.4 | 9 | 0.59 | 0.50 | 0.24 to 0.79 |
| focus-pull | preset f/8 | 9 | 0.39 | 0.39 | 0.35 to 0.76 |
| focus-pull | preset nine blades | 9 | 0.46 | 0.50 | 0.26 to 0.79 |
| glint-hover | default | 10 | 0.46 | 0.33 | 0.28 to 0.72 |
| glint-hover | preset white glint | 10 | 0.46 | 0.42 | 0.13 to 0.81 |
| glint-hover | preset gold | 10 | 0.46 | 0.44 | 0.09 to 0.76 |
| glint-hover | preset long spikes | 10 | 0.52 | 0.42 | 0.26 to 0.70 |
| glint-hover | preset still glints | 10 | 0.46 | 0.42 | 0.28 to 0.72 |
| halation-text | default | 11 | 0.66 | 0.50 | 0.39 to 0.68 |
| halation-text | preset tungsten marquee | 11 | 0.59 | 0.57 | 0.35 to 0.98 |
| halation-text | preset white lightbox | 11 | 0.72 | 0.63 | 0.37 to 1.03 |
| halation-text | preset red neon | 11 | 0.66 | 0.59 | 0.48 to 0.85 |
| halation-text | preset ice on film | 11 | 0.66 | 0.74 | 0.04 to 0.85 |
| halation-text | preset wide halation | 11 | 0.79 | 0.76 | 0.42 to 0.94 |
| halation-text | preset tired sign | 11 | 0.72 | 0.70 | 0.22 to 0.92 |
| halation-text | preset no halation | 9 | 0.52 | 0.50 | 0.35 to 0.68 |
| light-leak | default | 12 | 0.66 | 0.74 | 0.44 to 0.96 |
| light-leak | preset film leaks | 12 | 0.66 | 0.70 | 0.33 to 1.16 |
| light-leak | preset golden hour | 12 | 0.66 | 0.59 | 0.24 to 0.72 |
| light-leak | preset red burn | 12 | 0.59 | 0.57 | 0.37 to 0.68 |
| light-leak | preset rose leaks | 12 | 0.59 | 0.63 | 0.37 to 0.96 |
| light-leak | preset flare only | 12 | 0.72 | 0.72 | 0.26 to 0.94 |
| photo-focus | default | 15 | 1.11 | 1.20 | 0.87 to 1.68 |
| photo-focus | preset f/1.4 | 15 | 1.31 | 1.18 | 0.76 to 1.57 |
| photo-focus | preset f/4 | 15 | 1.44 | 1.40 | 0.98 to 1.66 |
| photo-focus | preset clipped highlights | 15 | 0.92 | 0.87 | 0.68 to 1.66 |
| photo-focus | preset layered method | 17 | 1.51 | 1.53 | 1.05 to 2.18 |
| rack-focus-transition | default | 10 | 0.46 | 0.39 | 0.20 to 0.68 |
| rack-focus-transition | preset rack focus | 10 | 0.46 | 0.46 | 0.26 to 0.76 |
| rack-focus-transition | preset round discs (gather) | 10 | 0.52 | 0.52 | 0.35 to 0.79 |
| rack-focus-transition | preset clipped highlights | 10 | 0.52 | 0.48 | 0.15 to 0.72 |
| rack-focus-transition | preset quick cut | 10 | 0.52 | 0.44 | 0.37 to 0.83 |
| rack-focus-transition | preset slow rack | 10 | 0.46 | 0.46 | 0.28 to 0.61 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (35.2 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| bokeh-loader | 10 | 1.9 | 25.4 |
| flare-cursor | 13 | 1.2 | 29.7 |
| focus-cursor | 11 | 1.4 | 25.4 |
| focus-pull | 10 | 1.3 | 24.8 |
| glint-hover | 12 | 1.3 | 29.3 |
| halation-text | 12 | 4.4 | 68.9 |
| light-leak | 20 | 3.2 | 43.9 |
| photo-focus | 14 | 2.8 | 48.3 |
| rack-focus-transition | 16 | 2.7 | 49.8 |
