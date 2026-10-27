## How it works

Two shots, built from analytic shapes so it can be traced through a real lens (`src/gpu/dof/scene.wgsl`): a sharp checkered subject with a row of small LEDs at 2.5 m, a dark post and rail at 0.9 m in front of it, neon signs at 4 and 6 m, a lit block at 12 m, a string of bulbs at 18 m, a city of windows and bright point lights at 60 m, and a road from under the camera to the city. The lens is an 85 mm on a full-frame sensor.

The second shot, **edges** (story 3.8), is made for the classic failures: a wall of bright lamps at 30 m, a striped panel at 3 m over the left of the frame whose right edge is a hard line against the wall, and a grey post with a bulb and a dark rail across the frame at 1 m. Its presets focus on each plane in turn: on the post (a sharp foreground against a blurred background: does the background halo it?), on the panel (a blurred foreground over a sharp edge: does it spread over the edge, and does the background leak through it?), and on the lamps (both nearer planes blurred over bright lights).

Two renderings of it:

- **The sharp image and its depth**, as a renderer hands a post chain: every ray through the centre of the lens, 4 × 4 per pixel, `rgba16float` colour and `r32float` depth. This is the input to every method.
- **The reference**: the same shot through the whole aperture. Each pixel sends rays from points spread over the aperture (an R2 low-discrepancy sequence, rotated per pixel) towards the plane of focus, and the batches are averaged over frames until `reference rays in all` is reached. This is Cook, Porter and Carpenter's distributed ray tracing. It sees round the edge of a blurred foreground, which no post-process given one sharp image can, so the gap between a method and it includes that limit too.

The reference's lens radius is set so a point at depth z blurs to exactly `blur at infinity × (1 − focus / z)` pixels, the same model the methods use (`src/gpu/optics/lens.ts`). `tests/dof.test.ts` checks it with one bright point: traced through a round lens and a hexagonal one, in front of and behind focus, the light's spread gives the predicted radius within 1%, centred to a tenth of a pixel at 8 192 rays.

The methods (`src/gpu/dof/`) each take the sharp image, its depth and the lens, and write a defocused image:

- **sharp** hands the input through: the floor.
- **separable hexagon** (White and Barré-Brisebois): one-sided line blurs along three directions 120° apart, in two passes, whose rhombi tile a hexagon. Each line is as long as the pixel's own circle of confusion, and a tap counts only where its own circle reaches back to the pixel. A hexagon-only method is scored against a reference with a hexagonal aperture, corners at 30°.
- **gather** (Jimenez): half resolution, tiles of the largest near blur dilated over their neighbours, and separate near and far fields on a 49-tap ring kernel turned per pixel. The near field spreads a blurred foreground over the sharp edge behind it with soft coverage; the far field under a foreground holds a guess at what it hides. A prefilter spreads each texel over its tap's cell, so a small lamp in a large blur makes a disc, not rings.
- **circular separable** (Garcia, after Niemitalo): a disc as the sum of two complex Gaussians, each separable: a horizontal pass per component and one vertical pass. One and three components are in `circularDof`.
- **sprite bokeh**: pixels brighter than a threshold give up their excess light to sprites appended in compute and drawn with an indirect draw in the aperture's shape; the rest is a 48-tap gather.
- **layers**: seven slices by circle of confusion, each blurred at half size by its own amount and composited back to front over an eighth slice that fills what a near object hid.
- **tilt-shift (no depth)**: the same layers with the blur taken from height in the frame alone: what flat layers and the DOM can have.

The views: **split** (reference on the left, the method on the right; the pointer moves the line), the method alone, the reference alone, the sharp input, and the **difference**, four times the absolute difference from the reference. A held frame traces the reference to its full count before showing it.

Scores (`src/gpu/dof/compare.ts`) compare the images as displayed: RMSE in 8-bit levels and SSIM on luminance, over the frame and over the bands 32 pixels either side of a depth edge. All of them against 1 024-ray references at 640 × 400 with a round lens, in [docs/studies/epic-3.md](../../../docs/studies/epic-3.md): gather has the lowest error or close to it on every shot.

## Cost

On an Apple M1 Max at 1080p on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): the sharp shot alone (17 traced rays a pixel) and the tail read about 3 ms per frame, and the reference adds about 3.5 ms at 8 rays a frame and 9.5 ms at 32, in the quieter runs. The methods alone, without the scene: hexagon and gather 1.2 to 1.5 ms, sprites 2.2 to 2.4, circular 3.3 to 3.5, layers 3.8. The default split view, with the reference still accumulating, reads 6 to 8 ms. A research tool, so Tier C; the methods' own costs are the numbers that matter for Epic 3.

## Pitfalls

- **The foreground.** With the background in focus, the reference spreads the blurred post and the edges of the subject card over what is behind them and makes them see-through. The hexagon, circular and sprite methods blur them inside their own outline, with a hard, opaque edge; gather's near field and the layers spread them, but neither can show what the foreground hid, which is not in the sharp image: both fill it from just outside the outline.
- **Sprites draw over everything.** A lamp behind a sharp foreground still draws its whole sprite on top of it: on the edges shot focused on the post, sprites score worst next to the post.
- **The sharp subject's edge** picks up a dark fringe where the blurred background next to it gathers from the subject's dark border: the gather test helps but does not remove it.
- The reference is noisy for its first few hundred rays: compare against it only once `reference rays a pixel` has reached its total.
- Two fixed shots at one size. The lab's 640 × 400 scores blur by about 14 pixels at most behind the subject; a hero canvas at f/1.4 blurs by 48, where a 49-tap gather first showed its rings (fixed with the spread prefilter). Check a method at the size it will run.

## When to use it

To choose a depth-of-field method, and to see what each one gets wrong. Not an effect to ship.

## References

- Cook, Porter and Carpenter, _Distributed Ray Tracing_ (SIGGRAPH 1984).
- Martin Roberts, _The Unreasonable Effectiveness of Quasirandom Sequences_ (2018) — the R2 sequence.
- John White and Colin Barré-Brisebois, _More Performance! Five Rendering Ideas from Battlefield 3 and Need for Speed: The Run_ (SIGGRAPH 2011).
- Wang, Bovik, Sheikh and Simoncelli, _Image Quality Assessment: From Error Visibility to Structural Similarity_ (IEEE Transactions on Image Processing, 2004).
