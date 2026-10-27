# Cost study: Epic 9

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.02 to 0.37 |
| (tail) | constant scene + bloom + output | 11 | 0.52 | 0.42 | 0.37 to 0.81 |
| glass-solid | default | 13 | 2.03 | 1.94 | 1.86 to 2.73 |
| glass-solid | preset flint icosahedron | 13 | 1.70 | 1.99 | 1.70 to 2.53 |
| glass-solid | preset three channels | 13 | 1.44 | 1.53 | 1.35 to 1.84 |
| glass-solid | preset crown | 13 | 1.70 | 1.92 | 1.70 to 2.88 |
| glass-solid | preset diamond | 13 | 2.03 | 1.99 | 1.79 to 2.18 |
| glass-solid | preset traced caustics | 14 | 1.90 | 2.32 | 1.97 to 2.73 |
| glass-solid | preset bubble | 13 | 1.44 | 1.57 | 1.38 to 1.94 |
| glass-solid | preset filmed glass | 13 | 1.77 | 2.08 | 1.86 to 2.38 |
| glass-solid | preset dodecahedron | 13 | 1.64 | 1.57 | 1.33 to 1.84 |
| prism | default | 11 | 1.44 | 1.64 | 1.42 to 4.30 |
| prism | preset flint prism | 11 | 1.44 | 1.64 | 1.42 to 1.75 |
| prism | preset crown glass | 11 | 1.77 | 1.66 | 1.44 to 1.90 |
| prism | preset diamond | 11 | 2.03 | 2.34 | 1.73 to 4.06 |
| prism | preset hydrogen lamp | 11 | 1.38 | 1.35 | 1.00 to 2.80 |
| prism | preset mercury lamp | 11 | 1.11 | 1.16 | 0.94 to 1.57 |
| prism | preset wide slit | 11 | 1.51 | 1.62 | 1.42 to 1.66 |
| prism | preset turning wide | 11 | 1.84 | 1.86 | 1.42 to 2.53 |
| spectral-bokeh | default | 11 | 0.52 | 0.50 | 0.17 to 0.90 |
| spectral-bokeh | preset fast lens | 11 | 0.59 | 0.68 | 0.44 to 0.85 |
| spectral-bokeh | preset three channels | 11 | 0.52 | 0.48 | 0.42 to 0.83 |
| spectral-bokeh | preset singlet | 11 | 1.31 | 1.16 | 0.61 to 1.94 |
| spectral-bokeh | preset red rim behind focus | 11 | 1.31 | 1.25 | 1.03 to 1.97 |
| spectral-bokeh | preset no aberration | 11 | 0.46 | 0.42 | 0.02 to 0.87 |
| spectral-bokeh | preset f/2.8 | 11 | 1.11 | 0.92 | 0.44 to 1.40 |
| spectral-bokeh | preset held focus | 11 | 0.98 | 1.09 | 0.59 to 1.49 |
| glass-solid | sampling=spectral | 13 | 2.16 | 1.49 | 1.33 to 1.77 |
| glass-solid | sampling=three-channel | 13 | 1.44 | 1.27 | 1.16 to 1.53 |
| glass-solid | resolution=0.25 | 13 | 1.70 | 1.55 | 0.96 to 2.51 |
| glass-solid | resolution=0.5 | 13 | 2.23 | 1.49 | 1.35 to 2.23 |
| glass-solid | resolution=1 | 13 | 4.13 | 3.98 | 3.84 to 4.48 |
| glass-solid | caustics=off | 13 | 1.70 | 1.53 | 1.31 to 1.81 |
| glass-solid | caustics=stand-in | 13 | 1.90 | 1.59 | 1.49 to 1.86 |
| glass-solid | caustics=traced | 14 | 1.90 | 1.99 | 1.88 to 2.18 |

## 1266 × 585

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.02 to 0.07 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.37 | 0.26 to 0.52 |
| glass-solid | default | 11 | 1.05 | 0.85 | 0.68 to 1.00 |
| glass-solid | preset flint icosahedron | 11 | 1.38 | 1.27 | 1.00 to 1.97 |
| glass-solid | preset three channels | 11 | 1.38 | 1.03 | 0.85 to 1.22 |
| glass-solid | preset crown | 11 | 1.38 | 1.20 | 0.90 to 1.62 |
| glass-solid | preset diamond | 11 | 1.11 | 0.96 | 0.74 to 3.45 |
| glass-solid | preset traced caustics | 12 | 1.51 | 1.35 | 1.14 to 2.86 |
| glass-solid | preset bubble | 11 | 1.25 | 1.11 | 0.66 to 2.27 |
| glass-solid | preset filmed glass | 11 | 1.25 | 1.25 | 0.87 to 1.59 |
| glass-solid | preset dodecahedron | 11 | 0.98 | 0.94 | 0.81 to 1.14 |
| prism | default | 9 | 1.51 | 1.70 | 1.25 to 4.04 |
| prism | preset flint prism | 9 | 1.70 | 1.79 | 1.31 to 3.34 |
| prism | preset crown glass | 9 | 1.64 | 1.81 | 1.31 to 2.82 |
| prism | preset diamond | 9 | 1.64 | 1.31 | 0.94 to 3.28 |
| prism | preset hydrogen lamp | 9 | 1.11 | 1.05 | 0.74 to 1.44 |
| prism | preset mercury lamp | 9 | 1.18 | 1.20 | 0.96 to 2.51 |
| prism | preset wide slit | 9 | 1.31 | 1.14 | 0.50 to 1.53 |
| prism | preset turning wide | 9 | 1.18 | 1.35 | 0.90 to 1.68 |
| spectral-bokeh | default | 9 | 0.92 | 0.85 | 0.76 to 0.98 |
| spectral-bokeh | preset fast lens | 9 | 0.92 | 0.87 | 0.81 to 1.03 |
| spectral-bokeh | preset three channels | 9 | 0.66 | 0.59 | 0.55 to 0.70 |
| spectral-bokeh | preset singlet | 9 | 1.11 | 1.05 | 1.00 to 1.16 |
| spectral-bokeh | preset red rim behind focus | 9 | 1.31 | 1.42 | 0.94 to 1.94 |
| spectral-bokeh | preset no aberration | 9 | 0.52 | 0.48 | 0.46 to 0.68 |
| spectral-bokeh | preset f/2.8 | 9 | 0.79 | 0.72 | 0.66 to 0.76 |
| spectral-bokeh | preset held focus | 9 | 0.92 | 0.87 | 0.81 to 0.98 |
| glass-solid | sampling=spectral | 11 | 1.57 | 1.66 | 0.96 to 2.42 |
| glass-solid | sampling=three-channel | 11 | 1.57 | 1.22 | 1.00 to 2.08 |
| glass-solid | resolution=0.25 | 11 | 1.51 | 1.35 | 0.90 to 2.03 |
| glass-solid | resolution=0.5 | 11 | 1.44 | 1.46 | 1.03 to 2.12 |
| glass-solid | resolution=1 | 11 | 2.10 | 1.62 | 1.27 to 2.03 |
| glass-solid | caustics=off | 11 | 1.18 | 0.90 | 0.79 to 1.20 |
| glass-solid | caustics=stand-in | 11 | 1.25 | 1.00 | 0.72 to 1.57 |
| glass-solid | caustics=traced | 12 | 1.31 | 1.29 | 1.07 to 2.42 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (20.8 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
