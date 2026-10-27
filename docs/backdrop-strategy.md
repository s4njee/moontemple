# Backdrop strategy (story 6.1)

What "defocusing the page" can mean when the effect is a WebGPU canvas and the page is HTML. Fire Temple's [backdrop strategy](../../firetemple/docs/backdrop-strategy.md) and Water Temple's capture study settled the hard part: a canvas cannot read what the browser painted. HTML-in-Canvas, the one API that would let it, is a Chromium origin trial that Fire Temple's re-probe on 26 October 2026 found absent without a token, with no signal from Safari or Firefox. Moon Temple adopts their finding: **geometry yes, pixels no**. Effects know where the page's elements are (`src/gpu/dom-rects.ts`) and draw light over or behind them, but blur only pixels they own.

That leaves three meanings of a defocused page, and every Epic 6 story picks one.

| Route                                | What blurs                                                                                                  | Bokeh in the highlights                                               | Text stays real                                    | Used by                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| **CSS `filter: blur()` per element** | the element itself, by the compositor                                                                       | no: a Gaussian dims a bright point into a grey smudge                 | yes: selectable, focusable, read by screen readers | 6.2 `focus-pull`, 6.8's CSS comparison                                |
| **Re-rendered content**              | the canvas's own copy of it: glyphs from an MSDF atlas, shapes drawn again                                  | yes, in linear light                                                  | the DOM copy stays under the canvas for semantics  | 6.6 `halation-text`, `glint-hover` and `flare-cursor` (geometry only) |
| **Images the page hands over**       | an image, video or canvas the page owns, uploaded with `createImageBitmap` and `copyExternalImageToTexture` | yes: any of Epic 3's methods, highlights reopened as in `photo-focus` | n/a                                                | 6.10 `photo-focus`, 6.9 `light-leak`, 6.8 `rack-focus-transition`     |

Rules of thumb that follow:

- **Blur the page with CSS, light it with the canvas.** The focus pull blurs sections with `filter: blur()` and draws the bokeh behind them in the canvas, both from one focus value. CSS can blur text cheaply and keeps it real. It cannot make a bright point into a disc: that is the canvas's job, drawing only lights it generates.
- **Upload with `ImageBitmap`.** `copyExternalImageToTexture` from an `HTMLImageElement` or `ImageData` is unsupported in Safari and Firefox (Fire Temple's support matrix); decode with `createImageBitmap` first, with `colorSpaceConversion: 'none'` for depth maps.
- **Never pretend to blur what the canvas cannot see.** A transition between two views works on two views the effect is handed (6.8), not on the live DOM.

## What CSS blur costs

No WebGPU timestamp sees CSS blur: it is the compositor's work, split between the renderer and the GPU process. `experiments/css-blur-cost.mjs` scrolls a long page of sixty sections (headings, paragraphs, a gradient "photo", three cards) at a steady speed under a Chrome trace and counts each thread's busy time; full table in [studies/css-blur.md](studies/css-blur.md). Headless Chrome on the Apple M1 Max, 1280 × 800:

| Case                                                    | Main thread (ms/s) | Compositor (ms/s) | GPU process (ms/s) |
| ------------------------------------------------------- | -----------------: | ----------------: | -----------------: |
| no blur                                                 |              14–18 |             14–15 |              21–25 |
| every section blurred, unchanging                       |              15–16 |             14–16 |              19–23 |
| blur set every frame from the scroll (a CSS focus pull) |              43–48 |             28–30 |              81–91 |
| the same, with `will-change: filter`                    |              36–38 |             25–27 |              86–94 |
| the same, writing only sections on screen               |              32–36 |             39–45 |              88–91 |

What it says:

- **A fixed blur is free while scrolling.** Chrome blurs once and moves the result.
- **A blur that changes every frame is not.** It adds about 65 ms a second to the GPU process and 20–30 to the main thread: roughly 1.1 ms and 0.4 ms a frame at 60 frames a second. Every case held 60 frames a second here; on a phone the GPU process's share is what will show.
- **`will-change: filter` and skipping off-screen sections help the main thread a little** (the style writes) and nothing else: the cost is the blurring, not the bookkeeping. Write only what changed, and only on screen.
- Two device pixels per CSS pixel cost no more than one here. Chrome may blur at a reduced resolution; this was not checked.
- "GPU process" is CPU time on the GPU process's threads (command building and submission), not GPU execution time, which Chrome does not report per page. Other apps were using the GPU during the run.

So CSS blur stays the right tool for blurring page content, as long as only the few sections near the focal band change their blur each frame, and the effect's own canvas stays cheap beside it.
