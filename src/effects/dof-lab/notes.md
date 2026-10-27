## How it works

One fixed night shot, built from analytic shapes so it can be traced through a real lens (`src/gpu/dof/scene.wgsl`): a sharp checkered subject with a row of small LEDs at 2.5 m, a dark post and rail at 0.9 m in front of it, neon signs at 4 and 6 m, a lit block at 12 m, a string of bulbs at 18 m, a city of windows and bright point lights at 60 m, and a road from under the camera to the city. The lens is an 85 mm on a full-frame sensor.

Two renderings of it:

- **The sharp image and its depth**, as a renderer hands a post chain: every ray through the centre of the lens, 4 × 4 per pixel, `rgba16float` colour and `r32float` depth. This is the input to every method.
- **The reference**: the same shot through the whole aperture. Each pixel sends rays from points spread over the aperture (an R2 low-discrepancy sequence, rotated per pixel) towards the plane of focus, and the batches are averaged over frames until `reference rays in all` is reached. This is Cook, Porter and Carpenter's distributed ray tracing. It sees round the edge of a blurred foreground, which no post-process given one sharp image can, so the gap between a method and it includes that limit too.

The reference's lens radius is set so a point at depth z blurs to exactly `blur at infinity × (1 − focus / z)` pixels, the same model the methods use (`src/gpu/optics/lens.ts`). `tests/dof.test.ts` checks it with one bright point: traced through a round lens and a hexagonal one, in front of and behind focus, the light's spread gives the predicted radius within 1%, centred to a tenth of a pixel at 8 192 rays.

The methods (`src/gpu/dof/`) each take the sharp image, its depth and the lens, and write a defocused image. So far:

- **sharp** hands the input through: the floor.
- **separable hexagon** (White and Barré-Brisebois): one-sided line blurs along three directions 120° apart, in two passes, whose rhombi tile a hexagon. Each line is as long as the pixel's own circle of confusion, and a tap counts only where its own circle reaches back to the pixel. A hexagon-only method is scored against a reference with a hexagonal aperture, corners at 30°.

The views: **split** (reference on the left, the method on the right; the pointer moves the line), the method alone, the reference alone, the sharp input, and the **difference**, four times the absolute difference from the reference. A held frame traces the reference to its full count before showing it.

Scores (`src/gpu/dof/compare.ts`) compare the images as displayed: RMSE in 8-bit levels and SSIM on luminance. At 640 × 400 against a 1 024-ray reference:

| Focus            | Method            | RMSE |  SSIM |
| ---------------- | ----------------- | ---: | ----: |
| subject, 2.5 m   | sharp             | 39.9 | 0.647 |
| subject, 2.5 m   | separable hexagon | 10.7 | 0.915 |
| background, 40 m | sharp             | 32.5 | 0.670 |
| background, 40 m | separable hexagon | 15.3 | 0.866 |

## Cost

On an Apple M1 Max at 1080p on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): the sharp shot alone (17 traced rays a pixel) and the tail read 3.0 ms per frame; the hexagon adds about 1.2 ms (4.2 ms); the reference adds about 3.5 ms at 8 rays a frame and 9.5 ms at 32. The default split view, with the reference still accumulating, reads 7.7 ms. A research tool, so Tier C; the hexagon's own 1.2 ms at full resolution is the number that matters for Epic 3.

## Pitfalls

- **The foreground.** With the background in focus, the reference spreads the blurred post and the edges of the subject card over what is behind them and makes them see-through; the hexagon blurs them inside their own outline, with a hard, opaque edge. That is why its score is worse at background focus. Near-field handling (3.2) is the cure; 3.8 measures it on dedicated shots.
- **The sharp subject's edge** picks up a dark fringe where the blurred background next to it gathers from the subject's dark border: the gather test helps but does not remove it.
- The reference is noisy for its first few hundred rays: compare against it only once `reference rays a pixel` has reached its total.
- The scene is fixed. Every method is judged on one shot; 3.8 adds more.

## When to use it

To choose a depth-of-field method, and to see what each one gets wrong. Not an effect to ship.

## References

- Cook, Porter and Carpenter, _Distributed Ray Tracing_ (SIGGRAPH 1984).
- Martin Roberts, _The Unreasonable Effectiveness of Quasirandom Sequences_ (2018) — the R2 sequence.
- John White and Colin Barré-Brisebois, _More Performance! Five Rendering Ideas from Battlefield 3 and Need for Speed: The Run_ (SIGGRAPH 2011).
- Wang, Bovik, Sheikh and Simoncelli, _Image Quality Assessment: From Error Visibility to Structural Similarity_ (IEEE Transactions on Image Processing, 2004).
