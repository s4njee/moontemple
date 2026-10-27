## How it works

A night street seen through a camera: two rows of sodium lamps above the road, a railing of small white lights beside the camera, and a city of a few hundred lights beyond. Each light is a point in metres, projected through a pinhole with the camera's focal length, and given the circle of confusion of a thin lens (`src/gpu/optics/lens.ts`):

`radius = blur at infinity × (1 − focus / depth)`

where the blur at infinity comes from the focal length, the f-number, the focus distance and a full-frame sensor. Points in front of the focus get a negative radius and their aperture image is flipped, as a lens flips it.

The points are drawn by the shared point layer (`src/gpu/points.ts`, `src/wgsl/aperture.wgsl`): one instanced quad each, just big enough for its disc, adding its light to the HDR scene. The light a point adds, summed over its pixels, is its own total, so a lamp that leaves focus spreads the same light over a larger disc instead of gaining it. Below about three pixels the share of each pixel is the exact area of the pixel inside a disc; above that it is the aperture's shape with a one-pixel edge, divided by the shape's area plus Steiner's edge term. `tests/points.test.ts` checks every shape at sizes from a point to 32 pixels and at five offsets between pixels: the total stays within 2%, and within 1% for a circle.

With **walk the focus** on, the focus moves from 0.8 m to 40 m and back every 12 seconds; off, it stays on the **focus** setting (1.5 m on the railing at f/1.4). **Conserve light** off shows what happens without it: every lamp keeps the brightness it has in focus however wide it spreads, and the blurred foreground floods the frame.

The aperture controls are the shared ones every bokeh effect has: blades (0 for round) and their rotation and curvature; a rim, bright for over-corrected spherical aberration (soap-bubble bokeh) or soft for under-corrected; onion rings; and the cat's eye, a second disc that clips each point more the further it is from the centre and removes the light it clips.

## Cost

On an Apple M1 Max: 0.50 ms per frame at 1080p on Dawn ([docs/studies/epic-2.md](../../../docs/studies/epic-2.md)), against 0.37 ms for the HDR tail alone, and 1.17 ms for one frame in Chrome at 962 × 884. The three hundred points are too few and mostly too small to cost anything measurable; the tail is the frame. Tier A on this machine, provisional until an integrated GPU is measured.

## Pitfalls

- Polygon edges are drawn from the distance along the ray from the centre, not the true distance to the edge, so corners are slightly sharper than sides. It shows nowhere at sizes a page uses.
- The onion rings and the rim conserve light only on average over the shape; a strong rim with strong rings clamps the profile at zero and loses a little.
- The lamps overlap additively with no occlusion: right for lights against a dark sky, wrong for a lamp behind a building.

## When to use it

To see what the lens model does and to choose aperture settings for another effect. The point layer is the piece to reuse: `bokeh-drift` and the later bokeh scenes draw with it.

## References

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981).
- McIntosh, Riecke and DiPaola, _Efficiently Simulating the Bokeh of Polygonal Apertures in a Post-Process Depth of Field Shader_ (Computer Graphics Forum, 2012).
- Steiner's formula for the area of a parallel set of a convex body.
