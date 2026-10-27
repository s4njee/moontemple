## How it works

A transition between two views of a page: the outgoing view racks out of focus until its lights are discs, the cut happens inside the blur, and the incoming view focuses out of its own bokeh. A canvas cannot read the page's pixels ([backdrop strategy](../../../docs/backdrop-strategy.md)), so the transition works on two images it is handed or draws itself. The demo draws its own: two sections of an imagined night-market site (`views.wgsl`), a hero with a moon, fairy lights and stall lamps, and a gallery of three cards of lit cities, drawn once per resize as 8-bit sRGB images with every lamp clipped at white, the way a screenshot or photograph arrives. Drop two images on the canvas together to use your own (name order; the first is outgoing). They go up as a page's would: `createImageBitmap`, then `copyExternalImageToTexture`.

Each frame (`compose.wgsl`, `index.ts`):

- **Compose.** Both views are scaled to cover the frame and turned back into linear light, and their clipped highlights are opened back up as `photo-focus` does: above `threshold` in the largest channel, light grows steeply to `highlight gain` times at white. That is what makes a blurred lamp a bright disc instead of a grey smudge. The two are then crossfaded.
- **Blur.** One depth plane for the whole frame: a flat view has no depth, so a rack focus through it takes all of it out of focus together. Epic 3's light-tier method, the separable hexagon (`src/gpu/dof/hexagon.ts`), does the blurring, with gather a control away. With one radius everywhere the method is a linear filter, so blurring the crossfade is the crossfade of the two blurs: one pass a frame, not one per view.
- **Half resolution.** From a radius of 8 pixels the compose pass draws at half size, each pixel the average of the four under it, each opened up first (averaging a lamp's clipped edge with the dark beside it before opening it up loses most of its light). The method runs at half the radius and a bilinear pass brings the result back. Below half a pixel the frame is the view itself, copied.
- **The tail.** Bloom after the blur, as Epic 3 orders it, then tonemap.

The rack is `rackFocus(p)` for progress `p` from 0 (outgoing, sharp) to 1 (incoming, sharp): the blur rises as a smoothstep over the first half and falls over the second, and the crossfade is a smoothstep `crossfade` of the progress wide, centred on the cut, so the views change while both are nearly two thirds of the peak blur or more. The demo loops it (`loopProgress`): hold, rack, hold, rack back. Turn `loop the transition` off to scrub `progress` by hand.

Under reduced motion the host holds a frame (`FrameTime.still`), and that frame is the view a cut would land on, the one being held or the one the rack is heading to, never a frame mid-blur. A page using it should not play it at all under `prefers-reduced-motion`: cut. The CSS version does exactly that.

## Cost

GPU time on the Apple M1 Max on Dawn, from the benchmark harness (`tests/bench.ts`, frame slope) run from a scratch test, not yet from `npm run study`, with other test runs sharing the GPU, so the ranges are wide and the numbers want an idle re-run:

| Frame, 1920 × 1080                                       |  Per frame |
| -------------------------------------------------------- | ---------: |
| settled: compose, copy, tail                             | 0.3–0.5 ms |
| mid-rack, hexagon at full resolution (the first version) | 3.4–3.6 ms |
| mid-rack, hexagon at half resolution                     | 0.6–1.2 ms |
| mid-rack, gather at half resolution                      | 1.2–1.5 ms |

At 390 × 844 every case read under 0.6 ms. A uniform 43-pixel blur over the whole frame is the hexagon's worst case, much dearer than the depth-of-field test shot Epic 3 timed it on, where most of the frame has small circles: the taps reach far and the texture cache misses. Half resolution is what brings it into the light tier. In Chrome the performance HUD read 1.1–2.6 ms looping and 1.6–2.6 ms held mid-rack at 1280 × 720 (one frame alone, timing floor included; 2.45 and 3.27 ms before the half-resolution path). The transition runs only for its 1.2 seconds; a page would stop the canvas and show its own DOM once the incoming view is sharp.

Texture memory at 1080p: the two drawn views 16.6 MB, full-resolution colour and depth 24.9 MB, half-resolution colour, depth and result 10.4 MB, and the hexagon's own targets, 33.2 MB at full resolution (used only for radii from 0.5 to 8 pixels) and 8.3 MB at half: about 93 MB before the tail. Bundle size not measured yet.

**Against CSS.** `experiments/css-rack-focus.html` is the same transition as a front-end developer would write it: the same two views as HTML (with real text), the same loop and blur curve as `filter: blur()` keyframes (a Gaussian of deviation half the hexagon's radius), and the incoming view's `opacity` crossfaded over the outgoing one. `node experiments/css-rack-focus.mjs` times each case for one loop in headless Chrome at 1280 × 720 under a trace, as `experiments/css-blur-cost.mjs` does; ranges over three runs on 27 October 2026, CPU time per thread in ms a second, all at 60 frames a second:

| Case                                     | Main thread | Compositor | GPU process |
| ---------------------------------------- | ----------: | ---------: | ----------: |
| CSS, no transition (floor)               |       10–34 |          6 |         5–6 |
| CSS, one blur on the stack of both views |       19–21 |      10–11 |       22–26 |
| CSS, a blur on each view                 |       23–24 |         12 |       30–33 |
| WebGPU effect page, looping, no HUD      |       33–37 |      19–29 |      91–225 |
| WebGPU effect page, held mid-rack        |       41–46 |      18–24 |      90–233 |

CSS is the cheaper by a wide margin on the CPU: the transition adds about 10 ms a second of main thread and 20 of GPU process to an idle page, and blurring the stack once is cheaper than blurring each view. The WebGPU rows are the gallery's effect page, shell and controls included, not a bare page, so their main-thread floor is not the CSS page's, and the GPU process carries the canvas's command submission; an embed on a bare page was not measured. Neither side's GPU execution time is comparable: Chrome reports none for the CSS page.

What each can do, from screenshots of both at the same moments of the loop: at the peak of the rack the CSS version has lost every light. A Gaussian of 14 pixels spreads a lamp 8 pixels across over about 25 times its area, so its brightness falls 25-fold and the fairy lights, stall lamps and city windows become a dim haze; the moon and headline remain as grey blobs. The shader's lamps become bright hexagons (or round discs with gather) holding their colour, which is the whole look of a rack focus. CSS cannot open highlights back up (`brightness()` lifts everything), cannot shape the aperture, and blurs in sRGB rather than linear light, which darkens edges between light and dark. CSS keeps text real and selectable through the transition, works on the live DOM with nothing handed over, costs nothing at rest, and cuts under reduced motion with one media query.

## Pitfalls

- It cannot transition the live page. It needs the two views as images: a route's hero photo, a canvas the page draws, or a snapshot rendered ahead of time. Text in a handed-over image is pixels until the cut is over; swap the real DOM back in when the incoming view is sharp.
- The highlight gain is a guess, as in `photo-focus`: anything above `threshold` becomes a light. The demo keeps its headline at 0.82 linear so it does not bloom into discs; white text or a light page would. On light content raise `threshold` towards 0.99 or set `highlight gain` to 1. Light pages untested.
- The hexagon only draws hexagons. `round discs (gather)` is round but softer and dimmer at half resolution, with a hint of rings in the dimmer discs.
- Switching to half resolution at 8 pixels widened the blur by about a pixel and brightened the frame by 1.2 levels of 255 in one frame. Taking half a pixel off the half-resolution radius brought that to 0.2, against 0.3 a frame from the rack itself; the frame-to-frame change at the switch is still about twice its neighbours' (compared on 960 × 540 renders), not visible at speed but not zero.
- The depth plane is a whole `r32float` texture of one value, because the method interface takes depth. A method taking a constant radius would save it and the coc reads.
- Mid-rack the frame is a little brighter than either view: the tonemap compresses a sharp lamp more than the same light spread over a disc. Flash analysis (`tests/flash.ts`, 8 s at 480 × 270) rates every preset `low`: at most one transition pair in any cell per second, no flashing area.
- Memory, about 93 MB at 1080p, is high for the light tier: the full-resolution hexagon targets are kept for the few frames at small radii.

## When to use it

Route and slide transitions between two images the page already has, where the lights in them are the point: night photography, events, film and camera sites, a gallery stepping from one hero to the next. Tier A: under a millisecond and a half a frame at 1080p on this machine while it runs, nothing at rest. For transitions over live text and layout, use the CSS blur and fade: far cheaper and the text stays real, at the cost of every highlight. Under reduced motion, cut.

## References

- John White and Colin Barré-Brisebois, _More Performance! Five Rendering Ideas from Battlefield 3 and Need for Speed: The Run_ (SIGGRAPH 2011): the separable hexagon.
- Jimenez, [_Next Generation Post Processing in Call of Duty: Advanced Warfare_](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/) (SIGGRAPH 2014): the gather method.
- [Filter Effects Module Level 1](https://www.w3.org/TR/filter-effects-1/#funcdef-filter-blur), `blur()`: the Gaussian the CSS version uses.
- [WCAG 2.2, 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html): why it cuts under reduced motion.
