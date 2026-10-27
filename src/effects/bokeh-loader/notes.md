## How it works

A loader drawn as lights through a lens. Each of N orbs (32 by default) has a slot in the focal plane, on a ring clockwise from twelve o'clock or along a bar from the left, and a depth of its own off that plane: three in five behind focus (1.6 to 4 focus distances), the rest in front (0.55 to 0.8), where the lens flips their disc. Everything is generated on the CPU each frame and drawn by the shared point layer (`src/gpu/points.ts`); there is no frame to blur, so it is Tier A by construction.

An orb's _gather_ (0 to 1) moves it in log depth from its own depth to the focal plane. The thin-lens model (`src/gpu/optics/lens.ts`, `cocRadius`) turns that depth into a signed circle of confusion, so the disc shrinks to a point; perspective about the image centre (scaled down by **parallax**) closes it onto its slot; and a slow wander and a faint breathing (the capped flicker signal, `src/gpu/optics/flicker.ts`, rate 1.5, no shimmer) die away as it arrives. Progress gathers the orbs in order, with a front about two and a half orbs wide so it never steps. The point layer keeps each orb's light whatever its size, so a gathered orb is a bright sharp point and a waiting one a dim soft disc: progress reads in brightness as well as in sharpness, with no light added.

**progress** is a live parameter a page can set. In `auto` mode the effect runs a demo (4.5 s rise in surges, 1 s full, 1.5 s letting every orb go soft together) until the page first sets a non-zero progress, and follows it from then; a page's jumps are eased with a 0.2 s time constant (**ease**). `spinner` is the indeterminate mode: a sharp head runs round the ring (or along the bar and off its end), orbs ahead of it sharpen over 5% of the track and the trail softens back over half of it. On the held frame of reduced motion, the demo shows 70% progress and a driven loader its progress as it is.

## Cost

Not measured yet: no `npm run study` or browser-check run has timed it. It is one instanced quad per orb (32 to 120) plus the shared HDR tail, the same work as `bokeh-drift` without its haze pass and with fewer, smaller discs, so it should sit at or below that effect's cost; the bundle size is not measured yet either.

## Pitfalls

- The orbs are added light on an opaque night, so on a light page this is a dark block; give it a dark region of its own.
- A sharp orb carries the same light as a soft one in a pixel or two, so it clips to white and leans on the bloom for its glow. The tonemapped frame is therefore not exactly energy-conserving even though the scene is.
- Perspective pulls far orbs towards the centre and pushes near ones out, so the waiting part of a ring is ragged and on the bar they bunch; **parallax** 0 keeps each orb wandering round its own slot.
- The flash sweep (`tests/flash.test.ts`) measures it as `low`, not `none`: one cell sees a pair of brightness changes as an orb arrives, over no measurable flashing area.
- The demo starts when nothing has set progress; a page that wants to sit at exactly 0 should use `progress` mode, or the demo plays until its first update.

## When to use it

A loading screen, splash or progress bar on a dark page, where a CSS spinner would do the job but a loader that looks photographed is wanted. Tier A. For a plain spinner on a light page, or anywhere WebGPU may be missing, a CSS ring of blurred dots with the blur driven by a custom property gets most of the look; it loses only the brightening as each dot gathers its light.

## References

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981): the circle of confusion used for each orb.
- W3C, [WCAG 2.2 success criterion 2.3.1, Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html): the cap behind the breathing signal.
