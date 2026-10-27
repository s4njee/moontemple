## How it works

One lens (85 mm, focused at 1 m) and every aperture the shared point layer can draw: round; five, six, seven and nine blades, straight to rounded; the bright rim of over-corrected spherical aberration (soap bubble) and the soft edge of under-correction; onion rings from aspherical elements; and the cat's eye of mechanical vignetting. The pointer's position picks the aperture, left to right, and the f-number, top to bottom (1 to 5.6); with no pointer it steps through them every three seconds; a select fixes one.

A grid of eighteen lights stands at 40 m, far behind the focus, and a row of five at 0.6 m, in front of it. The near row is drawn flipped, as a lens flips the near field: odd blade counts show it at once (the pentagon points down in the grid and up in the row). With the cat's eye, the discs are clipped more the further they are from the centre, into lens shapes whose long axis runs round the centre.

## Cost

On an Apple M1 Max: 0.48 ms per frame at 1080p on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)), the tail alone. Twenty-three large discs. In Chrome, 0.81 ms for one frame on a 1920 × 1080 canvas (`npm run browser-check`, median of three loads; [docs/studies/browser-check.md](../../../docs/studies/browser-check.md)).

## Pitfalls

- Nothing on the canvas says which aperture is showing; the HUD's stats do (`?hud=1`), and the select and presets name them.
- The onion rings and the rim are drawn on the same light; real lenses rarely show both strongly.

## When to use it

To choose an aperture for another effect. It is the page every bokeh effect's notes can point to.

## References

- McIntosh, Riecke and DiPaola, _Efficiently Simulating the Bokeh of Polygonal Apertures in a Post-Process Depth of Field Shader_ (Computer Graphics Forum, 2012).
