## How it works

A focus pull driven by the scroll, done the way [docs/backdrop-strategy.md](../../../docs/backdrop-strategy.md) says a page can be defocused: CSS blurs the page, the canvas draws the light. `focus.html` is the whole thing on a long page; in the gallery the lens racks through the sections' distances on its own.

One lens decides everything (`lens.ts`): an 85 mm thin lens, the model in `src/gpu/optics/lens.ts`. The page's sections stand one behind another, each half again as far as the last (1.5 m, 2.3 m, 3.4 m … 17 m). The page works out where the middle of the screen falls between two sections' middles, and focuses between their distances in log distance, as a focus ring turns. Then:

- **The page's sections** are blurred with CSS `filter: blur()` by what that lens does at their distance: the circle of confusion's radius over two (a disc of radius r has the variance of a Gaussian of sigma r / 2), in CSS pixels, capped at 12. The text stays real text. Only sections on screen are written, and only when their blur moves, because a CSS blur that changes every frame costs the browser about a millisecond a frame and an unchanging one costs nothing.
- **The lights behind the page** are a few hundred points from 1.2 to 60 m, drawn by the shared point layer as discs the shape of the aperture at the same lens's circle of confusion, each keeping its light. Lights at the focused section's distance come sharp with it.

The effect takes the focus as a parameter (`drive: page`), so any page can set it from anything: the scroll here, a hash change or a slider elsewhere.

## Cost

Not measured on Dawn or in Chrome yet. It draws one quad per light and the HDR tail, as `focus-cursor` does (0.46 ms at 1080p on Dawn on the Apple M1 Max), so it should sit with it. The page's CSS blur is the browser's cost, not the GPU's: about 1.1 ms a frame of the GPU process's time and 0.4 ms of the main thread while blurs change, nothing while they hold ([docs/studies/css-blur.md](../../../docs/studies/css-blur.md)).

## Pitfalls

- CSS blur is a Gaussian: a bright point in the page's own content dims into a smudge rather than a disc. Only the canvas's lights make bokeh.
- Blurred text is unreadable on purpose. The page keeps the sections far enough apart that the one in focus stands alone in the band, offers a switch to turn the page's blur off, and turns it off with the rack under reduced motion (WCAG 2.3.3: motion from interaction).
- Scroll events can arrive faster than frames; the page coalesces them into one update a frame.
- A section's depth is its order, not its content: a page whose sections vary a lot in height racks unevenly. Focusing between section middles keeps the rack tied to the reading position.

## When to use it

Long-form pages, product stories and portfolios read one section at a time, on a dark page. Tier A on the GPU side. Skip it where the reader needs to scan, such as documentation or tables: unfocused sections are hard to skim by design.

## References

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981): the thin lens.
- W3C, [_Understanding Success Criterion 2.3.3: Animation from Interactions_](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
- MDN, [`filter: blur()`](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/blur).
