## Verdict

**Gather is the default** wherever there is a depth buffer and a desktop budget: Jimenez's half-resolution method with tiles, separate near and far fields and a 49-tap ring kernel (`src/gpu/dof/gather.ts`). It has the lowest error, or close to it, on every shot and focus distance tried. It is the steadiest under a slow pan, and the only method here that both spreads a blurred foreground over a sharp edge and keeps a sharp foreground clean. At 1080p it costs the same as the separable hexagon, and it needs the least texture memory of any method that blurs at all. On a phone-sized frame its six passes cost twice the hexagon's two, so the hexagon is the light tier's pick.

| Tier                            | Use                                     | Instead, when                                                                                                 |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A (phone, integrated GPU)       | separable hexagon                       | gather where 1.5 ms fits: much better with the background in focus; over budget, a smaller blur, then a still |
| B (desktop)                     | gather                                  | the aperture's shape must show in the highlights: sprite bokeh, if the highlights are points, not areas       |
| No depth (flat layers, the DOM) | layers with assigned depths, tilt-shift | a handful of layers: CSS `filter: blur()` (not yet timed against it; see 3.6)                                 |
| Reference only                  | the traced reference                    | never shipped                                                                                                 |

Circular separable convolution is not recommended for any tier. It costs two to three times the gather, holds four full-resolution targets, scores no better, and rings at large radii, where its 17 taps stretch to 48 pixels.

Depth of field goes **before bloom**, as the colour pipeline already has it. A lens forms the defocused image and the glare of the lens and eye spreads that image's light afterwards, so the bloom of a defocused lamp should take the disc's shape and size. Bloom first would spread the sharp point's concentrated light and then blur the glow a second time. This was not measured against a reference, which has no glare model, but the order is not in doubt.

## Error against the reference

Every method on the same sharp image and depth, against 1 024-ray references traced through a round lens at 640 × 400 (85 mm, f/1.8). RMSE is in 8-bit levels as displayed (lower is better); SSIM is on displayed luminance (higher is better). Scores: `tests/dof-methods.test.ts`, `tests/dof-edges.test.ts` and `tests/dof-score.ts`, with `DOF_SCORES=<file>` to write them out.

| Shot, focus              | sharp       | hexagon     | gather          | circular    | sprites         | layers      | tilt-shift  |
| ------------------------ | ----------- | ----------- | --------------- | ----------- | --------------- | ----------- | ----------- |
| night, subject (2.5 m)   | 41.4, 0.636 | 12.4, 0.896 | 11.8, **0.916** | 11.5, 0.903 | **10.7**, 0.911 | 14.8, 0.860 | 31.9, 0.692 |
| night, background (40 m) | 33.4, 0.659 | 16.0, 0.853 | **10.2, 0.914** | 14.7, 0.876 | 14.5, 0.865     | 15.5, 0.867 | 30.2, 0.652 |
| edges, post (1 m)        | 75.1, 0.288 | 22.3, 0.713 | **17.2, 0.763** | 21.1, 0.685 | 18.8, 0.762     | 19.3, 0.662 | 44.9, 0.450 |
| edges, panel (3 m)       | 42.1, 0.796 | 18.3, 0.908 | **15.1**, 0.917 | 18.0, 0.905 | 17.7, **0.919** | 19.5, 0.852 | 42.2, 0.613 |
| edges, lamps (30 m)      | 45.0, 0.592 | 20.2, 0.906 | **10.2, 0.932** | 19.4, 0.915 | 16.8, 0.909     | 15.5, 0.897 | 41.8, 0.654 |

The hexagon is scored against a round lens here, which costs it about 1.7 RMSE on the night shot against its own hexagonal reference (10.7 there). Tilt-shift is there to show what no depth costs: it has none to go on.

## Edges (story 3.8)

The `edges` shot puts three planes behind one another with hard edges between them: a wall of bright lamps at 30 m, a striped panel at 3 m whose right edge is a vertical line against the wall, and a grey post with a bulb and a dark rail at 1 m. Focusing on each plane in turn makes each of the classic failures. The RMSE below is over the bands 32 pixels either side of every depth edge (`depthEdgeBands` in `src/gpu/dof/compare.ts`): the near side, then the far side.

| Failure                                                          | Focus | hexagon     | gather          | circular    | sprites     | layers         |
| ---------------------------------------------------------------- | ----- | ----------- | --------------- | ----------- | ----------- | -------------- |
| Sharp foreground haloed by the blurred background behind it      | 1 m   | 8.4 / 31.1  | 7.3 / 22.9      | 7.9 / 27.1  | 17.8 / 22.6 | **6.6** / 22.7 |
| Blurred foreground over a sharp edge, background leaking through | 3 m   | 30.5 / 23.1 | **23.2 / 16.5** | 33.0 / 22.1 | 33.8 / 20.9 | 27.7 / 21.0    |
| Both nearer planes blurred over bright lights                    | 30 m  | 22.6 / 37.2 | 23.4 / **6.8**  | 19.0 / 37.1 | 27.6 / 26.4 | 29.3 / 14.5    |

Which method handles which:

- **A sharp foreground** (1 m) stays cleanest under layers and gather: neither lets the blurred wall into the post's outline. Sprites are worst here by far, because the wall's lamps are drawn as sprites over everything and land on the sharp post. A sprite has no depth test against what is in front of it.
- **A blurred foreground over a sharp edge** (3 m) is where the near field earns its keep. Gather spreads the post over the panel's edge with soft coverage and fills the hole behind it from the wall just outside; it is best on both sides. The gather-only methods (hexagon, circular, sprites' gather) blur the post inside its own outline and leave a hard, opaque edge. Layers spread it too, but its slices quantise the blur.
- **Everything near blurred over bright lights** (30 m): gather's far side is far the best; the separable kernels smear the panel's stripes into the wall. Circular is slightly ahead inside the blurred planes.
- **What a foreground hid is not in the image.** The reference sees round the post; every method here has to guess. Gather and layers both fill from just outside the outline. Before layers had its fill slice, it divided by its own alpha and turned the blurred rail into an opaque bar.

## Temporal stability (story 3.7)

The camera pans to the right a quarter of a pixel a frame at the plane of focus, with parallax, for six frames at 320 × 200 (`tests/dof-temporal.test.ts`). The reference uses the same lens samples every frame, so its noise holds still and its change between frames is the motion. **Shimmer** is a method's mean change between frames over the reference's: 1 moves as much as the truth, more is crawling, less is smearing. **Error** is the RMS difference between the method's change and the reference's, in 8-bit levels.

| Shot, focus            | sharp      | hexagon    | gather         | circular   | sprites    | layers     | tilt-shift |
| ---------------------- | ---------- | ---------- | -------------- | ---------- | ---------- | ---------- | ---------- |
| night, subject (2.5 m) | 1.42, 5.98 | 1.15, 3.29 | **1.02, 3.11** | 1.13, 3.49 | 1.15, 3.46 | 1.06, 3.34 | 1.01, 4.82 |
| edges, panel (3 m)     | 0.99, 7.64 | 1.00, 5.86 | 0.98, **5.25** | 1.01, 6.26 | 0.99, 5.37 | 0.97, 5.31 | 0.74, 8.84 |

No method crawls: all are within 15% of the truth's own change. The sharp image is the one that shimmers, its small lamps stepping from pixel to pixel; every blur calms it. None of the methods jitters its samples from frame to frame, so there was nothing for temporal accumulation to settle, and the question of jitter with and without accumulation did not arise. Gather turns its kernel per pixel but not per frame, and its noise holds still. Sprite bokeh's split between sprite and remainder is continuous in brightness, so a twinkling light grows and shrinks its sprite rather than popping it in and out. That was checked in the code, not on a twinkling shot.

## Cost and memory

Each method alone on the night shot's sharp image at f/1.8 on the Apple M1 Max, on Dawn: the marginal cost of one more frame, median of three runs of `tests/dof-cost.test.ts` (`DOF_COST=<file>`). That leaves out the traced scene and the tail, which the `dof-lab` rows below include and which made those rows too noisy to rank methods by. Runs disagreed by up to half again, so differences under about 0.5 ms mean nothing.

| Method     | Passes | 1080p, 2.5 m | 1080p, 40 m | 1266 × 585, 2.5 m | 1266 × 585, 40 m |
| ---------- | -----: | -----------: | ----------: | ----------------: | ---------------: |
| sharp      |      1 |         0.04 |        0.04 |              0.07 |             0.04 |
| hexagon    |      2 |         1.22 |        1.46 |              0.74 |             0.48 |
| gather     |      6 |         1.22 |        1.44 |              1.51 |             1.27 |
| circular   |      3 |         3.54 |        3.32 |              2.12 |             1.51 |
| sprites    |      3 |         2.36 |        2.23 |              0.92 |             0.63 |
| layers     |      8 |         3.82 |        3.80 |              1.94 |             2.05 |
| tilt-shift |      8 |         2.42 |        1.94 |              1.88 |             2.18 |

The `dof-lab` tables under "The measurements" were last taken while browsers on the same machine were drawing WebGPU pages: every row, the sharp image's included, reads two to three times the earlier runs of the same build. Read them for their passes and their order, not their milliseconds, until `npm run study -- --epic 3` is run on an idle GPU. The method-only table above was taken in a quiet spell.

1266 × 585 is a phone held sideways at 1.5 device pixels per CSS pixel; it is the size, not the GPU. Gather scales least with pixels, since its passes are at half resolution and its fixed costs dominate small frames.

Texture memory at 1920 × 1080, beyond the sharp image and depth a renderer hands over:

| Method             | Targets                                                                     |   MB |
| ------------------ | --------------------------------------------------------------------------- | ---: |
| hexagon            | 2 full-resolution `rgba16float`                                             | 33.2 |
| gather             | 4 half-resolution `rgba16float`, 2 tile maps                                | 16.6 |
| circular (2 parts) | 4 full-resolution `rgba16float` (2 per part; 1 part 33.2, 3 parts 99.5)     | 66.4 |
| sprites            | 1 full-resolution `rgba16float`, 16 384 sprite records (512 KiB)            | 17.1 |
| layers, tilt-shift | 15 half-resolution `rgba16float`: 7 slices, a scratch, 7 blur intermediates | 62.2 |

## What a hero canvas showed that the scores did not

The scores are taken at 640 × 400 at f/1.8, where the background blurs by about 14 pixels. `photo-focus` at 960 × 540 at f/1.4 blurs by 48. There gather's 49 taps sit several half-resolution texels apart, and a small lamp in the background came out as concentric rings. Turning the kernel per pixel only made the rings noisy. A kernel that grew to 225 taps with the blur fixed it, but quadrupled the method's cost at 1080p. A spread prefilter fixed it for one cheap pass: each half-resolution texel is spread over the cell one of its own taps stands for, from texels with a like circle of confusion (Jimenez's prefilter does the same). It cost 0.6 RMSE on the night shot with the subject in focus and nothing elsewhere. Check a method at the size and f-number it will run at.

Sprite bokeh on a photograph costs far more than on the night shot. A photo's lit windows and signs are areas, not points, and every 2 × 2 block of them over the threshold becomes its own large sprite: `photo-focus` with sprites read about 13 ms at 1080p in an Epic 6 study run, against 1.4 ms with gather, and the preset was dropped. Sprites are for scenes whose highlights are points.

## Still open

- 3.6's comparison of layers with CSS `filter: blur()` on the same layers, timed on both sides.
- The marriage the verdict suggests: sprite bokeh's aperture-shaped highlights over gather's fields, with the sprites depth-tested against the near field.
- No phone or integrated GPU has been measured; the phone rows are phone-sized frames on the M1 Max.
