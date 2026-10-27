## How it works

The page's buttons and cards are read every frame (`src/gpu/dom-rects.ts`, marked `data-mt-target` or `data-mt-obstacle`). For each, the corner nearest the pointer gets a glint whose brightness falls off with that corner's distance from the pointer (a Gaussian `reach` wide, in image heights), set in a little from a rounded corner's tip, and twinkling on Fire Temple's capped flicker (story 2.9) with its own seed. A glint is a sharp point carrying 30% of its light and four diffraction spikes carrying the other 70% (`src/gpu/glare/glare.ts`), so its total light is what the distance says.

With no pointer, a slow wander moves round the page so the glints travel from element to element on their own. Where there is no page (the bare canvas, the tests and posters), four stand-in boxes stand in for cards and a button. The canvas is composited over the page with luminance alpha, so only the glints show.

## Cost

On an Apple M1 Max: 0.55 ms per frame at 1080p on Dawn ([docs/studies/epic-6.md](../../../docs/studies/epic-6.md)), the HDR tail alone, and 0.68 ms for one frame in Chrome on a 1920 × 1080 canvas (`npm run browser-check`). Tier A on this machine, provisional.

## Pitfalls

- The canvas sits behind the mock page's plates, so a glint's point can be hidden under an opaque button; its spikes reach out past the edge and show.
- Touch has no hover: on a phone the glints only follow a finger while it is down, and wander otherwise.
- Tested with the wandering stand-in, not a real hand.

## When to use it

A hover state with some sparkle on a dark page: jewellery, luxury and premium product pages. A CSS pseudo-element sparkle on `:hover` is close and needs no WebGPU; this one earns its place by glinting on the nearest corner of every element at once and by never flashing.

## References

- Fire Temple's flicker signal (its story 3.6).
