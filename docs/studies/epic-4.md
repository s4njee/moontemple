# Cost study: Epic 4

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.02 to 0.37 |
| (tail) | constant scene + bloom + output | 11 | 0.59 | 0.42 | 0.39 to 0.96 |
| aperture-lab | default | 11 | 0.72 | 0.74 | 0.31 to 0.96 |
| aperture-lab | preset every aperture | 11 | 0.72 | 0.68 | 0.24 to 0.94 |
| aperture-lab | preset five blades | 11 | 0.72 | 0.81 | 0.42 to 0.94 |
| aperture-lab | preset soap bubble | 11 | 0.72 | 0.72 | 0.39 to 0.83 |
| aperture-lab | preset cat's eye | 11 | 0.85 | 0.92 | 0.50 to 1.16 |
| aperture-lab | preset mirror lens | 11 | 0.72 | 0.74 | 0.50 to 0.96 |
| aperture-lab | preset heart | 11 | 0.98 | 1.00 | 0.74 to 1.51 |
| bokeh-drift | default | 12 | 1.38 | 1.33 | 0.85 to 2.88 |
| bokeh-drift | preset violet night | 12 | 1.11 | 1.09 | 0.85 to 1.38 |
| bokeh-drift | preset city lights | 12 | 1.31 | 1.25 | 1.03 to 1.57 |
| bokeh-drift | preset gold hexagons | 12 | 1.05 | 1.00 | 0.87 to 2.56 |
| bokeh-drift | preset soap bubbles | 12 | 1.51 | 1.03 | 0.85 to 1.16 |
| bokeh-drift | preset swirly lens | 12 | 1.11 | 1.27 | 1.05 to 1.51 |
| bokeh-drift | preset pulled focus | 12 | 0.98 | 1.14 | 0.94 to 1.33 |
| bokeh-drift | preset rgb sweep | 12 | 1.11 | 1.20 | 1.05 to 1.59 |
| bokeh-drift | preset forward haze | 12 | 1.11 | 1.18 | 0.92 to 2.47 |
| bokeh-text | default | 11 | 1.38 | 1.33 | 0.94 to 1.92 |
| bokeh-text | preset moonlight | 11 | 0.79 | 0.96 | 0.68 to 1.97 |
| bokeh-text | preset reveal once | 11 | 0.92 | 0.79 | 0.70 to 2.23 |
| bokeh-text | preset left to right | 11 | 1.38 | 1.49 | 0.96 to 2.14 |
| bokeh-text | preset gold hexagons | 11 | 1.51 | 1.11 | 0.90 to 2.01 |
| bokeh-text | preset city lights | 11 | 1.77 | 1.33 | 1.18 to 2.08 |
| bokeh-text | preset fine dust | 11 | 1.18 | 1.20 | 0.81 to 2.53 |
| bokeh-text | preset few and large | 11 | 0.85 | 0.81 | 0.68 to 1.84 |
| bokeh-text | preset held half way | 11 | 1.18 | 1.27 | 0.85 to 1.66 |
| dust-in-light | default | 12 | 1.05 | 1.07 | 0.66 to 1.18 |
| dust-in-light | preset afternoon sun | 12 | 0.92 | 1.14 | 0.66 to 1.22 |
| dust-in-light | preset thick dust | 12 | 1.11 | 1.22 | 0.92 to 1.51 |
| dust-in-light | preset narrow beam | 12 | 0.72 | 0.59 | 0.35 to 1.05 |
| dust-in-light | preset deep focus | 12 | 1.11 | 0.96 | 0.63 to 1.31 |
| dust-in-light | preset focus near | 12 | 0.66 | 0.85 | 0.48 to 1.38 |
| fairy-lights | default | 11 | 1.70 | 0.90 | 0.79 to 1.09 |
| fairy-lights | preset warm white | 11 | 0.66 | 0.61 | 0.48 to 1.09 |
| fairy-lights | preset multicolour | 11 | 0.66 | 0.81 | 0.55 to 0.96 |
| fairy-lights | preset cool white | 11 | 1.77 | 0.87 | 0.76 to 1.14 |
| fairy-lights | preset one string sharp | 11 | 0.92 | 0.90 | 0.63 to 1.38 |
| fairy-lights | preset hexagonal lens | 11 | 0.92 | 1.14 | 0.72 to 1.40 |
| fairy-lights | preset still | 11 | 0.79 | 0.87 | 0.74 to 1.11 |
| fairy-lights | preset over a light page | 11 | 0.79 | 0.90 | 0.59 to 1.11 |
| fireflies | default | 11 | 0.79 | 0.72 | 0.39 to 1.03 |
| fireflies | preset meadow | 11 | 0.52 | 0.48 | 0.26 to 0.90 |
| fireflies | preset swarm | 11 | 0.79 | 0.87 | 0.68 to 1.20 |
| fireflies | preset focus near | 11 | 0.85 | 0.70 | 0.42 to 1.05 |
| fireflies | preset focus far | 11 | 0.79 | 0.74 | 0.55 to 0.98 |
| fireflies | preset deep focus | 11 | 0.66 | 0.72 | 0.31 to 0.83 |
| fireflies | preset warm white | 11 | 0.59 | 0.63 | 0.48 to 0.87 |
| glitter | default | 11 | 0.79 | 0.90 | 0.74 to 1.07 |
| glitter | preset gold | 11 | 0.79 | 0.81 | 0.44 to 1.18 |
| glitter | preset silver | 11 | 0.79 | 0.81 | 0.42 to 1.20 |
| glitter | preset holographic | 11 | 0.79 | 0.90 | 0.46 to 1.09 |
| glitter | preset all in focus | 11 | 0.79 | 0.96 | 0.76 to 1.14 |
| glitter | preset hexagonal lens | 11 | 0.79 | 0.85 | 0.52 to 1.05 |
| night-street | default | 11 | 1.38 | 1.44 | 1.20 to 2.53 |
| night-street | preset focused close | 11 | 1.38 | 1.33 | 1.03 to 1.53 |
| night-street | preset focused on the street | 11 | 0.46 | 0.46 | 0.33 to 0.57 |
| night-street | preset nine blades | 11 | 1.38 | 1.38 | 1.29 to 1.77 |
| night-street | preset swirly 85 | 11 | 1.64 | 1.57 | 1.44 to 1.90 |
| night-street | preset slow traffic | 11 | 1.18 | 1.33 | 1.20 to 1.38 |
| night-street | preset dry road | 11 | 0.98 | 0.81 | 0.72 to 1.03 |
| snow-at-night | default | 12 | 0.72 | 1.05 | 0.83 to 1.18 |
| snow-at-night | preset sodium lamp | 12 | 1.05 | 1.29 | 0.59 to 2.10 |
| snow-at-night | preset led lamp | 12 | 1.05 | 0.98 | 0.76 to 2.12 |
| snow-at-night | preset blizzard | 12 | 1.38 | 1.49 | 1.20 to 1.94 |
| snow-at-night | preset still air | 12 | 0.85 | 0.76 | 0.37 to 1.62 |
| snow-at-night | preset near flakes sharp | 12 | 1.70 | 1.51 | 1.11 to 2.05 |
| snow-at-night | preset lamp in focus | 12 | 1.18 | 1.31 | 0.96 to 2.16 |
| bokeh-drift | count=50 | 12 | 1.25 | 1.29 | 0.85 to 1.64 |
| bokeh-drift | count=220 | 12 | 1.18 | 1.05 | 0.94 to 1.57 |
| bokeh-drift | count=440 | 12 | 1.44 | 1.49 | 1.09 to 1.62 |
| bokeh-drift | blur=0.02 | 12 | 1.18 | 1.14 | 1.05 to 1.38 |
| bokeh-drift | blur=0.09 | 12 | 1.38 | 1.09 | 0.85 to 1.86 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.02 to 0.07 |
| (tail) | constant scene + bloom + output | 9 | 0.46 | 0.31 | 0.24 to 0.50 |
| aperture-lab | default | 9 | 0.39 | 0.37 | 0.28 to 0.59 |
| aperture-lab | preset every aperture | 9 | 0.39 | 0.39 | 0.24 to 0.61 |
| aperture-lab | preset five blades | 9 | 0.39 | 0.35 | -0.07 to 0.46 |
| aperture-lab | preset soap bubble | 9 | 0.39 | 0.42 | 0.35 to 0.66 |
| aperture-lab | preset cat's eye | 9 | 0.39 | 0.37 | 0.11 to 0.76 |
| aperture-lab | preset mirror lens | 9 | 0.46 | 0.37 | 0.26 to 0.74 |
| aperture-lab | preset heart | 9 | 0.66 | 0.50 | 0.33 to 0.85 |
| bokeh-drift | default | 10 | 0.72 | 0.66 | 0.48 to 0.90 |
| bokeh-drift | preset violet night | 10 | 0.72 | 0.72 | 0.50 to 1.00 |
| bokeh-drift | preset city lights | 10 | 0.46 | 0.55 | 0.37 to 1.07 |
| bokeh-drift | preset gold hexagons | 10 | 0.46 | 0.59 | 0.28 to 0.72 |
| bokeh-drift | preset soap bubbles | 10 | 0.79 | 0.76 | 0.44 to 1.03 |
| bokeh-drift | preset swirly lens | 10 | 0.46 | 0.48 | 0.33 to 0.57 |
| bokeh-drift | preset pulled focus | 10 | 0.79 | 0.66 | 0.44 to 1.33 |
| bokeh-drift | preset rgb sweep | 10 | 0.46 | 0.61 | 0.39 to 1.05 |
| bokeh-drift | preset forward haze | 10 | 0.46 | 0.50 | 0.42 to 0.70 |
| bokeh-text | default | 9 | 0.72 | 0.83 | 0.76 to 0.98 |
| bokeh-text | preset moonlight | 9 | 1.44 | 0.50 | 0.39 to 0.92 |
| bokeh-text | preset reveal once | 9 | 0.72 | 0.74 | 0.66 to 1.09 |
| bokeh-text | preset left to right | 9 | 1.31 | 0.55 | 0.44 to 0.79 |
| bokeh-text | preset gold hexagons | 9 | 0.72 | 0.81 | 0.63 to 1.14 |
| bokeh-text | preset city lights | 9 | 1.38 | 1.11 | 0.61 to 1.44 |
| bokeh-text | preset fine dust | 9 | 0.98 | 1.03 | 0.76 to 1.25 |
| bokeh-text | preset few and large | 9 | 0.72 | 0.81 | 0.59 to 1.00 |
| bokeh-text | preset held half way | 9 | 1.38 | 0.55 | 0.46 to 0.66 |
| dust-in-light | default | 10 | 0.52 | 0.44 | 0.02 to 0.70 |
| dust-in-light | preset afternoon sun | 10 | 0.52 | 0.46 | 0.35 to 0.79 |
| dust-in-light | preset thick dust | 10 | 0.72 | 0.57 | 0.39 to 0.81 |
| dust-in-light | preset narrow beam | 10 | 0.52 | 0.48 | 0.20 to 0.90 |
| dust-in-light | preset deep focus | 10 | 0.52 | 0.50 | 0.15 to 0.79 |
| dust-in-light | preset focus near | 10 | 0.66 | 0.59 | 0.20 to 0.83 |
| fairy-lights | default | 9 | 0.46 | 0.42 | 0.24 to 0.79 |
| fairy-lights | preset warm white | 9 | 0.46 | 0.42 | 0.17 to 0.74 |
| fairy-lights | preset multicolour | 9 | 0.46 | 0.61 | 0.15 to 0.79 |
| fairy-lights | preset cool white | 9 | 0.46 | 0.42 | 0.13 to 0.79 |
| fairy-lights | preset one string sharp | 9 | 0.46 | 0.39 | 0.26 to 0.76 |
| fairy-lights | preset hexagonal lens | 9 | 0.46 | 0.50 | 0.09 to 0.74 |
| fairy-lights | preset still | 9 | 0.46 | 0.52 | 0.39 to 0.76 |
| fairy-lights | preset over a light page | 9 | 0.46 | 0.42 | 0.07 to 0.76 |
| fireflies | default | 9 | 0.39 | 0.48 | 0.37 to 0.74 |
| fireflies | preset meadow | 9 | 0.39 | 0.44 | 0.24 to 0.76 |
| fireflies | preset swarm | 9 | 0.46 | 0.39 | 0.22 to 0.74 |
| fireflies | preset focus near | 9 | 0.46 | 0.44 | 0.22 to 0.76 |
| fireflies | preset focus far | 9 | 0.39 | 0.42 | 0.17 to 0.76 |
| fireflies | preset deep focus | 9 | 0.39 | 0.44 | 0.33 to 0.72 |
| fireflies | preset warm white | 9 | 0.39 | 0.37 | 0.28 to 0.57 |
| glitter | default | 9 | 0.46 | 0.39 | 0.11 to 0.74 |
| glitter | preset gold | 9 | 0.39 | 0.37 | 0.11 to 0.76 |
| glitter | preset silver | 9 | 0.39 | 0.37 | 0.07 to 0.66 |
| glitter | preset holographic | 9 | 0.39 | 0.35 | -0.07 to 0.61 |
| glitter | preset all in focus | 9 | 0.39 | 0.55 | 0.24 to 0.70 |
| glitter | preset hexagonal lens | 9 | 0.39 | 0.37 | 0.09 to 0.72 |
| night-street | default | 9 | 0.79 | 0.63 | 0.39 to 0.87 |
| night-street | preset focused close | 9 | 1.18 | 1.05 | 0.85 to 1.35 |
| night-street | preset focused on the street | 9 | 0.46 | 0.42 | 0.33 to 0.66 |
| night-street | preset nine blades | 9 | 0.72 | 0.70 | 0.37 to 1.64 |
| night-street | preset swirly 85 | 9 | 1.05 | 1.03 | 0.85 to 1.33 |
| night-street | preset slow traffic | 9 | 1.11 | 0.96 | 0.57 to 1.16 |
| night-street | preset dry road | 9 | 0.79 | 0.81 | 0.37 to 0.92 |
| snow-at-night | default | 10 | 0.66 | 0.90 | 0.61 to 1.07 |
| snow-at-night | preset sodium lamp | 10 | 0.72 | 0.79 | 0.52 to 0.96 |
| snow-at-night | preset led lamp | 10 | 0.79 | 0.72 | 0.44 to 0.94 |
| snow-at-night | preset blizzard | 10 | 0.79 | 0.90 | 0.76 to 1.18 |
| snow-at-night | preset still air | 10 | 0.72 | 0.72 | 0.44 to 1.00 |
| snow-at-night | preset near flakes sharp | 10 | 0.98 | 1.11 | 0.72 to 1.46 |
| snow-at-night | preset lamp in focus | 10 | 0.66 | 0.74 | 0.39 to 0.98 |
| bokeh-drift | count=50 | 10 | 0.72 | 0.72 | 0.48 to 0.98 |
| bokeh-drift | count=220 | 10 | 0.46 | 0.48 | 0.37 to 0.94 |
| bokeh-drift | count=440 | 10 | 0.59 | 0.66 | 0.42 to 0.85 |
| bokeh-drift | blur=0.02 | 10 | 0.72 | 0.61 | 0.42 to 0.96 |
| bokeh-drift | blur=0.09 | 10 | 0.72 | 0.79 | 0.52 to 1.27 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (35.2 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| aperture-lab | 10 | 1.2 | 24.4 |
| bokeh-drift | 12 | 2.2 | 27.0 |
| bokeh-text | 12 | 4.0 | 71.6 |
| dust-in-light | 11 | 1.8 | 26.0 |
| fairy-lights | 10 | 1.6 | 25.1 |
| fireflies | 11 | 1.3 | 24.8 |
| glitter | 11 | 1.6 | 25.1 |
| night-street | 11 | 1.7 | 25.2 |
| snow-at-night | 11 | 1.9 | 26.2 |
