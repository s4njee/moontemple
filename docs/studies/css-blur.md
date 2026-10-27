# CSS blur on a long page

Story 6.1. `experiments/css-blur-page.html`: sixty sections of headings, paragraphs, a gradient "photo" and three cards, scrolled by script at 6 px a frame, in headless Chrome at 1280 × 800 CSS pixels on this machine (Apple M1 Max), 2026-10-27. Each case ran for 5 seconds under a Chrome trace. Times are milliseconds of work per second of scrolling: the union of each thread's top-level tasks, so a thread that is busy 1 000 ms a second is saturated. `node experiments/css-blur-cost.mjs` re-runs it.

- **none**: no blur.
- **static**: every section blurred by a fixed 0 to 12 px.
- **scroll**: each section's blur set every frame from its distance to a focal band, as a focus pull in CSS alone.
- **scroll-wc**: the same, with `will-change: filter` on every section.
- **visible**: the same as scroll, writing only the sections on screen.

| Device pixels per CSS pixel | Case      | Frames a second | Main thread | Compositor | Raster workers | GPU process |
| --------------------------: | --------- | --------------: | ----------: | ---------: | -------------: | ----------: |
|                           1 | none      |              61 |          18 |         15 |              0 |          25 |
|                           1 | static    |              60 |          15 |         14 |              0 |          19 |
|                           1 | scroll    |              60 |          43 |         30 |              1 |          91 |
|                           1 | scroll-wc |              60 |          36 |         25 |              0 |          86 |
|                           1 | visible   |              60 |          32 |         39 |              0 |          88 |
|                           2 | none      |              60 |          14 |         14 |              0 |          21 |
|                           2 | static    |              60 |          16 |         16 |              0 |          23 |
|                           2 | scroll    |              60 |          48 |         28 |              0 |          81 |
|                           2 | scroll-wc |              60 |          38 |         27 |              0 |          94 |
|                           2 | visible   |              60 |          36 |         45 |              0 |          91 |
