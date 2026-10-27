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
| (floor) | one constant-colour pass | 1 | 0.20 | 0.07 | -0.13 to 0.33 |
| (tail) | constant scene + bloom + output | 11 | 0.72 | 0.42 | 0.07 to 0.76 |
| aperture-lab | default | 11 | 0.59 | 0.48 | 0.33 to 1.22 |
| aperture-lab | preset every aperture | 11 | 0.59 | 0.42 | 0.24 to 0.59 |
| aperture-lab | preset five blades | 11 | 0.66 | 0.39 | 0.00 to 0.66 |
| aperture-lab | preset soap bubble | 11 | 0.46 | 0.42 | 0.22 to 0.70 |
| aperture-lab | preset cat's eye | 11 | 0.52 | 0.42 | 0.20 to 0.76 |
| bokeh-drift | default | 12 | 0.52 | 0.61 | 0.28 to 0.79 |
| bokeh-drift | preset violet night | 12 | 0.85 | 0.61 | 0.26 to 1.09 |
| bokeh-drift | preset city lights | 12 | 0.72 | 0.48 | 0.26 to 0.83 |
| bokeh-drift | preset gold hexagons | 12 | 0.66 | 0.72 | 0.35 to 0.94 |
| bokeh-drift | preset soap bubbles | 12 | 1.05 | 0.57 | 0.24 to 0.81 |
| bokeh-drift | preset swirly lens | 12 | 0.85 | 0.37 | 0.15 to 0.55 |
| bokeh-drift | preset pulled focus | 12 | 0.72 | 0.48 | 0.26 to 0.76 |
| bokeh-drift | preset rgb sweep | 12 | 0.59 | 0.52 | 0.39 to 0.70 |
| dust-in-light | default | 12 | 0.66 | 0.48 | 0.17 to 0.57 |
| dust-in-light | preset afternoon sun | 12 | 0.66 | 0.44 | 0.13 to 0.72 |
| dust-in-light | preset thick dust | 12 | 0.92 | 0.59 | 0.35 to 1.90 |
| dust-in-light | preset narrow beam | 12 | 0.59 | 0.52 | 0.20 to 1.00 |
| dust-in-light | preset deep focus | 12 | 0.66 | 0.50 | 0.35 to 0.68 |
| dust-in-light | preset focus near | 12 | 0.59 | 0.48 | 0.22 to 0.70 |
| fairy-lights | default | 11 | 0.52 | 0.52 | 0.37 to 0.68 |
| fairy-lights | preset warm white | 11 | 0.52 | 0.48 | 0.22 to 0.59 |
| fairy-lights | preset multicolour | 11 | 0.52 | 0.42 | 0.31 to 0.59 |
| fairy-lights | preset cool white | 11 | 0.52 | 0.44 | 0.13 to 0.63 |
| fairy-lights | preset one string sharp | 11 | 0.72 | 0.50 | 0.11 to 0.68 |
| fairy-lights | preset hexagonal lens | 11 | 0.92 | 0.42 | 0.13 to 0.63 |
| fairy-lights | preset still | 11 | 0.72 | 0.39 | 0.13 to 0.52 |
| fireflies | default | 11 | 0.59 | 0.44 | 0.33 to 0.57 |
| fireflies | preset meadow | 11 | 0.59 | 0.48 | 0.28 to 0.70 |
| fireflies | preset swarm | 11 | 0.52 | 0.44 | 0.31 to 0.59 |
| fireflies | preset focus near | 11 | 0.52 | 0.42 | 0.20 to 0.55 |
| fireflies | preset focus far | 11 | 0.46 | 0.44 | 0.28 to 0.55 |
| fireflies | preset deep focus | 11 | 0.59 | 0.35 | 0.13 to 0.68 |
| glitter | default | 11 | 0.66 | 0.50 | 0.13 to 2.08 |
| glitter | preset gold | 11 | 0.85 | 0.50 | -0.09 to 0.96 |
| glitter | preset silver | 11 | 0.66 | 0.55 | -0.15 to 0.90 |
| glitter | preset holographic | 11 | 0.85 | 0.46 | 0.22 to 1.62 |
| glitter | preset all in focus | 11 | 0.79 | 0.46 | 0.11 to 0.72 |
| glitter | preset hexagonal lens | 11 | 0.72 | 0.48 | 0.09 to 0.79 |
| night-street | default | 11 | 0.98 | 0.81 | 0.55 to 1.79 |
| night-street | preset focused close | 11 | 0.92 | 0.72 | 0.59 to 0.98 |
| night-street | preset focused on the street | 11 | 0.79 | 0.61 | 0.15 to 0.79 |
| night-street | preset nine blades | 11 | 1.11 | 1.03 | 0.31 to 1.38 |
| night-street | preset swirly 85 | 11 | 1.57 | 0.85 | 0.33 to 1.09 |
| night-street | preset slow traffic | 11 | 1.05 | 0.74 | 0.42 to 0.94 |
| night-street | preset dry road | 11 | 0.46 | 0.48 | 0.13 to 0.87 |
| snow-at-night | default | 12 | 0.52 | 0.55 | 0.15 to 1.03 |
| snow-at-night | preset sodium lamp | 12 | 0.52 | 0.61 | 0.28 to 1.00 |
| snow-at-night | preset led lamp | 12 | 0.92 | 0.59 | 0.31 to 1.22 |
| snow-at-night | preset blizzard | 12 | 0.52 | 0.63 | 0.22 to 0.79 |
| snow-at-night | preset still air | 12 | 0.92 | 0.59 | 0.24 to 0.90 |
| snow-at-night | preset near flakes sharp | 12 | 1.25 | 0.83 | 0.46 to 1.38 |
| snow-at-night | preset lamp in focus | 12 | 0.85 | 0.76 | -0.50 to 1.22 |
| bokeh-drift | count=50 | 12 | 1.57 | 0.52 | -0.26 to 1.57 |
| bokeh-drift | count=220 | 12 | 1.84 | 0.98 | -0.31 to 1.64 |
| bokeh-drift | count=440 | 12 | 2.29 | 0.87 | 0.11 to 1.97 |
| bokeh-drift | blur=0.02 | 12 | 1.84 | 0.59 | 0.35 to 1.55 |
| bokeh-drift | blur=0.09 | 12 | 1.25 | 0.74 | 0.07 to 1.59 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.09 | -0.17 to 0.20 |
| (tail) | constant scene + bloom + output | 9 | 0.98 | 0.20 | -0.20 to 0.61 |
| aperture-lab | default | 9 | 0.33 | 0.37 | -0.11 to 0.57 |
| aperture-lab | preset every aperture | 9 | 0.59 | 0.42 | -0.04 to 0.59 |
| aperture-lab | preset five blades | 9 | 0.52 | 0.35 | 0.24 to 0.87 |
| aperture-lab | preset soap bubble | 9 | 0.59 | 0.28 | 0.13 to 1.55 |
| aperture-lab | preset cat's eye | 9 | 0.66 | 0.37 | 0.09 to 0.87 |
| bokeh-drift | default | 10 | 0.85 | 0.31 | 0.11 to 0.66 |
| bokeh-drift | preset violet night | 10 | 0.85 | 0.42 | -0.15 to 0.66 |
| bokeh-drift | preset city lights | 10 | 0.72 | 0.50 | 0.24 to 1.14 |
| bokeh-drift | preset gold hexagons | 10 | 0.59 | 0.33 | 0.07 to 0.92 |
| bokeh-drift | preset soap bubbles | 10 | 0.59 | 0.42 | 0.15 to 0.70 |
| bokeh-drift | preset swirly lens | 10 | 0.59 | 0.44 | 0.09 to 0.70 |
| bokeh-drift | preset pulled focus | 10 | 1.25 | 0.37 | -0.02 to 0.79 |
| bokeh-drift | preset rgb sweep | 10 | 1.11 | 0.35 | -0.17 to 1.07 |
| dust-in-light | default | 10 | 0.72 | 0.42 | -0.02 to 0.94 |
| dust-in-light | preset afternoon sun | 10 | 0.79 | 0.35 | -0.22 to 0.83 |
| dust-in-light | preset thick dust | 10 | 0.79 | 0.31 | -0.17 to 0.74 |
| dust-in-light | preset narrow beam | 10 | 0.79 | 0.37 | -0.02 to 0.76 |
| dust-in-light | preset deep focus | 10 | 1.05 | 0.31 | 0.22 to 1.00 |
| dust-in-light | preset focus near | 10 | 0.79 | 0.28 | -0.02 to 0.79 |
| fairy-lights | default | 9 | 0.66 | 0.37 | 0.04 to 0.87 |
| fairy-lights | preset warm white | 9 | 0.79 | 0.35 | -0.04 to 0.46 |
| fairy-lights | preset multicolour | 9 | 1.05 | 0.31 | -0.35 to 0.79 |
| fairy-lights | preset cool white | 9 | 0.85 | 0.35 | 0.07 to 0.83 |
| fairy-lights | preset one string sharp | 9 | 0.79 | 0.57 | -0.07 to 1.07 |
| fairy-lights | preset hexagonal lens | 9 | 1.11 | 0.37 | -0.02 to 0.79 |
| fairy-lights | preset still | 9 | 0.72 | 0.35 | -0.46 to 0.70 |
| fireflies | default | 9 | 1.18 | 0.31 | -0.59 to 0.83 |
| fireflies | preset meadow | 9 | 0.39 | 0.52 | 0.15 to 1.11 |
| fireflies | preset swarm | 9 | 0.59 | 0.46 | 0.11 to 1.33 |
| fireflies | preset focus near | 9 | 0.66 | 0.42 | -0.28 to 0.57 |
| fireflies | preset focus far | 9 | 1.05 | 0.46 | -0.59 to 0.70 |
| fireflies | preset deep focus | 9 | 1.97 | 0.24 | -0.31 to 0.94 |
| glitter | default | 9 | 0.98 | 0.39 | -0.04 to 0.81 |
| glitter | preset gold | 9 | 1.11 | 0.35 | -0.55 to 1.25 |
| glitter | preset silver | 9 | 1.11 | 0.39 | -0.44 to 1.03 |
| glitter | preset holographic | 9 | 0.85 | 0.46 | -0.17 to 0.81 |
| glitter | preset all in focus | 9 | 1.44 | 0.20 | -0.44 to 0.48 |
| glitter | preset hexagonal lens | 9 | 1.18 | 0.28 | -0.72 to 0.52 |
| night-street | default | 9 | 0.92 | 0.74 | -0.20 to 1.27 |
| night-street | preset focused close | 9 | 0.66 | 0.61 | -0.46 to 1.35 |
| night-street | preset focused on the street | 9 | 0.92 | 0.42 | -0.39 to 0.68 |
| night-street | preset nine blades | 9 | 1.77 | 0.63 | -0.39 to 1.31 |
| night-street | preset swirly 85 | 9 | 2.03 | 0.37 | -0.20 to 1.55 |
| night-street | preset slow traffic | 9 | 1.38 | 0.55 | 0.13 to 1.79 |
| night-street | preset dry road | 9 | 0.66 | 0.46 | -0.72 to 1.66 |
| snow-at-night | default | 10 | 0.92 | 0.52 | -0.09 to 1.09 |
| snow-at-night | preset sodium lamp | 10 | 1.84 | 0.39 | -0.28 to 1.35 |
| snow-at-night | preset led lamp | 10 | 1.70 | 0.42 | -0.02 to 1.27 |
| snow-at-night | preset blizzard | 10 | 1.51 | 0.50 | 0.09 to 0.87 |
| snow-at-night | preset still air | 10 | 1.70 | 0.37 | -0.07 to 1.57 |
| snow-at-night | preset near flakes sharp | 10 | 1.84 | 0.70 | -0.35 to 1.18 |
| snow-at-night | preset lamp in focus | 10 | 1.38 | 0.39 | -0.11 to 1.05 |
| bokeh-drift | count=50 | 10 | 1.64 | 0.39 | -0.26 to 0.55 |
| bokeh-drift | count=220 | 10 | 1.31 | 0.33 | -0.92 to 1.05 |
| bokeh-drift | count=440 | 10 | 1.57 | 0.37 | -0.17 to 0.85 |
| bokeh-drift | blur=0.02 | 10 | 0.98 | 0.35 | 0.11 to 0.98 |
| bokeh-drift | blur=0.09 | 10 | 1.57 | 0.33 | -0.44 to 0.68 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (18.8 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| aperture-lab | 8 | 1.1 | 19.7 |
| bokeh-drift | 11 | 2.1 | 22.5 |
| dust-in-light | 10 | 1.8 | 21.9 |
| fairy-lights | 8 | 1.5 | 20.3 |
| fireflies | 9 | 1.2 | 20.1 |
| glitter | 9 | 1.6 | 20.4 |
| night-street | 9 | 1.7 | 20.5 |
| snow-at-night | 10 | 1.9 | 21.8 |
