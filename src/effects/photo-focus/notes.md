## How it works

A photograph and a depth map go in; out comes the same photograph refocused at whatever distance the visitor clicks, with the rest of the frame falling away into bokeh. Epic 3's chosen method does the blurring: gather, the default (`src/gpu/dof/gather.ts`), with sprite bokeh, the separable kernels and layers a control away.

Three steps each frame (`prepare.wgsl`):

- **Prepare.** The photo is scaled to cover the canvas and turned back into linear light. A photo is display-referred, so its highlights are clipped at white: a street lamp a hundred times brighter than the wall beside it is stored as barely brighter, and blurred as it is it spreads into a grey smudge rather than a bright disc. So the brightest pixels are opened back up: above `threshold` in their largest channel, light grows steeply (as the fourth power of a smoothstep) to `highlight gain` times at white. That is a guess at the light the camera threw away, and the reason bokeh in the highlights reads as real.
- **Depth.** The map is disparity, as depth estimators and phones' portrait modes write it: white near, black far, linear in one over the distance between `map near` and `map far` metres. It is read without filtering, since an edge averaged between near and far is neither.
- **Refocus.** The depth-of-field method with an 85 mm lens at the chosen f-number, focused where the visitor last clicked; the focus eases there in log distance, as a focus motor moves (as in `focus-cursor`). The click reads the depth map back on the CPU once per map and takes the nearest thing within two pixels, so a click on a thin wire means the wire.

The sample is not a photograph: it is the depth-of-field test shot (`src/gpu/dof/scene.wgsl`) through a pinhole, developed on the GPU at load like a camera's JPEG, clipped highlights and all, and written as an 8-bit photo and an 8-bit disparity map. It then goes through exactly the path a dropped photo does. Before the first click the demo racks between the subject card, the neon sign, the lit block and the city; for a dropped photo, between its depth map's near, middle and far.

Drop a photo and its depth map onto the canvas together to try your own. The map is the file whose name contains `depth`, `disparity` or `map`, or else the second; set `map near` and `map far` to the distances it spans.

## Cost

On an Apple M1 Max at 1080p on Dawn: 1.44 ms per frame with gather (an Epic 6 study run, `npm run study -- --epic 6`; not yet in its report, which wants a re-run on an idle GPU), against about 0.5 ms for the HDR tail alone. Gather alone is 1.2 to 1.4 ms there ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)). The layered method read about 6 ms and sprite bokeh about 13: a photo's lit areas make thousands of large sprites. Not measured in Chrome yet. The sample costs one traced pinhole frame at 1600 × 1000 when the effect loads, and an 8-bit photo and map of that size, 12.8 MB between them; gather's targets add 16.6 MB at 1080p.

## Pitfalls

- A depth map's edges never line up with the photo's exactly, and every estimator's maps are soft at silhouettes: hair, leaves and wires get the wrong blur in a band a few pixels wide. Nothing here fixes that; a sharper map does.
- What a blurred foreground hid is not in the photo. Gather fills it from the background just outside the foreground's outline, which is right for plain backgrounds and smeared for busy ones.
- The highlight gain is a guess. Too high and every white shirt becomes a lamp; too low and lamps blur grey. `clipped highlights` shows the photo with none.
- At this size blurs reach 48 pixels, three times the depth-of-field lab's, and gather's 49 taps sit several texels apart: before its spread prefilter, small lamps blurred into concentric rings. A faint grain remains in dim discs at the largest sizes.
- 8-bit maps have 256 distance steps, closest together near the camera. A 16-bit PNG map loads as 8 bits too: the browser decodes it that way.

## When to use it

Photography, product and portfolio pages where the picture is the point: a click on a photo pulls focus the way the camera would have. Tier B: one full-screen depth-of-field pass at 1080p on top of the tail. It needs a depth map, from a phone's portrait mode or an estimator such as Depth Anything; without one, blur the photo by height with the tilt-shift band (`dof-lab`'s `tilt-shift` method) instead.

## References

- Jimenez, [_Next Generation Post Processing in Call of Duty: Advanced Warfare_](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/) (SIGGRAPH 2014): the gather method.
- Yang et al., [_Depth Anything_](https://arxiv.org/abs/2401.10891) (2024): monocular depth maps of the kind this takes.
- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981): the thin lens.
