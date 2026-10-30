# Decision guide

Story 8.5. Which effect for which job, which depth-of-field method at which tier, and when not to use a shader at all. Every number here is from one machine, an Apple M1 Max (story 8.2 has not been run on other devices), so the tiers are provisional. An effect labelled A or B is known to fit there only on this machine; an integrated GPU or a phone may push it up a tier.

The numbers behind this page are in [studies/README.md](studies/README.md).

## Four questions first

1. **Is the page dark where the effect sits?** Bokeh is added light. On a white page it is invisible, or it turns to ink ([studies/light-pages.md](studies/light-pages.md)). Only a few effects work over a light page; give the rest a dark band of their own.
2. **Does the effect need to answer the visitor?** If it needs the pointer, the scroll or a click, it has to be the shader. If it only drifts, a looped video or the CSS version may do ([studies/live-vs-baked.md](studies/live-vs-baked.md), [studies/css-vs-webgpu.md](studies/css-vs-webgpu.md)).
3. **What GPU will it run on?** Tier A is for any page, phones included; Tier B for a desktop hero; Tier C for a page of its own. The budgets are 2, 6 and 12 ms a frame at 1080p, the HDR tail included.
4. **What is held when motion is reduced?** Every effect holds one still frame under `prefers-reduced-motion`, checked to show its subject and never a frozen flash (`tests/still.test.ts`). If the still is all most visitors on that page will see, a poster may be the better choice.

## Which effect for which job

| Job | First choice | Also | Tier | Light page |
| --- | --- | --- | --- | --- |
| A dark hero that moves without asking for attention | `bokeh-drift` | `fireflies`, `dust-in-light`, `snow-at-night` | A | Dark section; `fireflies` and `snow-at-night` read with luminance alpha |
| A night scene | `night-street` (city), `lamp-in-fog` (noir, article backdrops) | `moon-through-cloud`, `lunar-corona`, `ice-halo`, `moonbow` | A | Dark section (`lamp-in-fog` untested) |
| A festive or event hero | `fairy-lights` | `glitter` (fashion, jewellery) | A | `fairy-lights` has a light-page preset (underlay) |
| A night sea behind a headline | `moonlit-water` with `sharp sparkle` or `high moon` (2.2 to 2.6 ms) | its defaults, focused close (9.8 ms) | B at those presets, C at the defaults | Dark section |
| A title that arrives as light | `bokeh-text` | `halation-text` (a lit marquee) | B | Dark section |
| Answering the pointer | `focus-cursor` (focus follows the pointer) | `flare-cursor`, `glint-hover` (on cards) | A | Dark section; `focus-cursor` reads with luminance alpha |
| Answering a click on a photo | `photo-focus` | — | B | Dark section |
| Answering the scroll | `focus-pull` | — | A | Dark section |
| A transition between two views | `rack-focus-transition` | `light-leak` (over a still) | A | Untested; it draws the two views themselves |
| A loader | `bokeh-loader` (dark page), `wire-loader` (technical products) | — | A | Dark section; `bokeh-loader` reads with luminance alpha |
| A badge or call to action on a hero image | `glass-badge` | — | B | Yes |
| Light, optics and science pages | `prism`, `spectral-bokeh`, `glass-solid` | `prism-icosahedron` (a page of its own) | B (`prism-icosahedron` C) | Dark section |
| Building another effect | `lens-model`, `aperture-lab`, `lens-light`, `spectral-halo` (post pass), `dof-lab` (method choice) | — | labs | — |

Where the numbers and the labels disagree:

- `moonlit-water` measured 9.8 ms at its defaults and is now Tier C.
- `ice-halo`, `lunar-corona`, `moonbow` and `night-street` are labelled A and read 1.3 to 1.5 ms on Dawn, but 3.0 to 4.0 in Chrome's one-frame reading. Two of them are still pictures, where that reading is known to run high while the GPU idles between frames. Budget them as B until 8.2 measures one on an integrated GPU.
- Four Tier B effects (`bokeh-text`, `halation-text`, `spectral-bokeh`, `spectral-halo`) measure under 2 ms here on both readings. They stay B until an integrated GPU has been measured, because a fast GPU can show an effect is over a budget but not that it fits one.

## Which depth-of-field method at which tier

From story 3.9 ([studies/epic-3.md](studies/epic-3.md)). Gather and the hexagon are being moved into the temple core for other temples to use (story 7.6): copied and checked, not yet published.

| Tier | Method | Instead, when |
| --- | --- | --- |
| A (phone, integrated GPU) | Separable hexagon: two passes | gather where 1.5 ms fits, since it is much better with the background in focus; over budget, a smaller blur, then a still |
| B (desktop) | Gather (Jimenez 2014): half resolution, near and far fields | sprite bokeh, when the aperture's shape must show in point highlights |
| No depth (flat layers, the DOM) | Layers with assigned depths, or tilt-shift | a handful of layers: CSS `filter: blur()` |
| Never shipped | The traced reference | — |

- Depth of field goes before bloom.
- Circular separable convolution is not recommended at any tier.
- No post-process gets a blurred foreground right from one sharp image: what it hid is not in the image (the 10.7 against 15.3 RMSE in the findings). Where the foreground matters, draw the scene as points or layers, as the bokeh effects do.

## When not to use a shader

- **A still gradient is free.** `ice-halo` and `lunar-corona` held still cost nothing in CSS: a poster with no image to download (story 7.4).
- **A video loop, when nothing needs to answer.** A ten-second 1080p loop of `bokeh-drift` is about 290 kB in 10-bit AV1 (1.1 MB in H.264), against 27 kB of shader code. It plays at the empty page's main-thread cost and a fifth to a third of the shader's GPU-process time. It loses the pointer, the resolution of large screens, the framing of a phone held upright, and 60 frames a second. 8-bit encodes band the halos, so use 10-bit AV1. Use it for a backdrop that answers nothing, and as the no-WebGPU fallback of one that does ([studies/live-vs-baked.md](studies/live-vs-baked.md)).
- **CSS, for a few soft discs.** Under about fifty animated elements (a glint, a light leak, a loader's ring of discs), the CSS version costs less main thread than any WebGPU page, whose frame loop alone takes 40 to 70 ms a second. Past a hundred, CSS costs more, and past a few hundred it is the one that drops frames on a slow CPU: `bokeh-drift`'s CSS version fell to 30 frames a second at 1 152 discs with the CPU throttled four times, while the shader held 60 at its 600-orb maximum ([studies/css-vs-webgpu.md](studies/css-vs-webgpu.md)).
- **The poster, when the subject is what CSS cannot do:** a moving focus, glitter, the moon's face. That covers `focus-cursor`, `focus-pull`, `lens-model`, `glitter`, `moon-through-cloud` and `moonbow`.

## Caveats

- **Tiers rest on one machine.** Story 8.2's protocol ([device-matrix.md](device-matrix.md)) is ready; the integrated laptop and the phones are not measured.
- **Chrome's HUD reads high for light effects.** One frame alone carries a timing floor of about 1 ms here. Compare effects by the Dawn number, and use the HUD for what a visitor's browser does.
- **Half-float accumulation drops small light.** An effect that adds many small contributions over frames needs `rgba32float` without blending, or fixed-point atomics ([support-matrix.md](support-matrix.md)).
- **Flash.** Every preset is checked against WCAG 2.3.1 in `npm test`, but the analyser assumes a desktop viewing distance. Glints and glitter seen close up on a phone are untested.
