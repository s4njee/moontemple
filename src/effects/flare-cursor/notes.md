## How it works

The pointer is a bright light shining into the lens, eased a little so the flare swings rather than jumps; with no pointer, the light drifts round the upper half of the frame. It is drawn as a small hot disc, with diffraction spikes from the lens's blades (`src/gpu/glare/glare.ts`, six by default), the lens's ghosts strung along the line from the light through the centre (`src/gpu/glare/flare.ts`: aperture-shaped, so a hexagonal lens gives hexagonal ghosts, and tinted by the coatings), an optional anamorphic streak, and film halation (`src/gpu/post/halation.ts`). Every piece conserves or carries a set share of the light: the ghosts about 4%, the spikes `spikes`, the streak `anamorphic streak`.

The canvas is composited over the page with luminance alpha, so only the light and its flare show.

## Cost

On an Apple M1 Max: 0.83 ms per frame at 1080p on Dawn ([docs/studies/epic-6.md](../../../docs/studies/epic-6.md)) and 1.40 ms for one frame in Chrome on a 1920 × 1080 canvas (`npm run browser-check`); 0.50 ms on Dawn with no ghosts or halation. Tier A on this machine, provisional.

## Pitfalls

- **Flash.** A bright light moving fast across the frame swings its ghosts the other way, twice as fast near the far side; the easing and the ghosts' 4% share keep it under the threshold at every preset, and a faster pointer than the analyser assumed is the case to watch.
- The ghosts are placed by hand, not traced through a lens.
- On touch there is no pointer to follow between taps.

## When to use it

A cinematic hero for film, games and music sites. A PNG of a lens flare following the cursor in CSS is the cheap version; this one makes the ghosts swing through the centre as a lens does and takes the lens's shape.

## References

- Hullin, Eisemann, Seidel and Lee, _Physically-Based Real-Time Lens Flare Rendering_ (SIGGRAPH 2011).
- John Chapman, _Pseudo Lens Flare_ (2013).
