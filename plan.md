# Moon Temple — WebGPU bokeh and lens-light effects research site

A research site that implements, measures and documents effects made of light seen through a lens: out-of-focus orbs, depth of field, halos, glints, flares and night haze. It asks one question of each: **would you actually ship this on a website?** Every effect gets a live demo, readable source, a write-up and a practicality scorecard. Sibling of [Fire Temple](../firetemple/plan.md) and [Storm Temple](../stormtemple/plan.md), on the same page structure and the shared temple core.

The reference picture is a dark night scene. One bright source with a wide violet halo sits above a field of soft blue-violet discs at several depths, some overlapping, all drifting. Two things make it read as a photograph rather than as circles: each disc is the shape of the lens's aperture, and each conserves the light of the point it came from.

## Goals

- Cover the optics behind the look: the thin-lens circle of confusion, aperture shapes and their aberrations, energy-conserving point sources, diffraction glare, lens flare ghosts, halation, and light scattered by haze.
- Compare the real-time depth-of-field methods on one scene against a brute-force reference, for cost and error: gather, separable hexagonal and circular kernels, sprite scatter, and layer blur with no depth buffer.
- Ship effects shaped like website parts, not only full-screen scenes: bokeh heroes, a focus pull on scroll, glints on hover, a flare that follows the pointer, a loader that comes into focus.
- Say plainly when CSS (radial gradients, `filter: blur()`) or a looped video does the job as well as a shader.
- Build the optics once, shaped to move into `@mk7s/hologpu-temple-core`, so Eightfold Path's tilt-shift and bokeh stories (5.1, 5.2) and Light Temple's fireflies (E7-S2) can use them rather than build them again.

## Non-goals

- A camera simulator. Optics are in scope where they change what a visitor sees; ray-tracing a lens prescription is in scope only as the reference for a cheap approximation (story 2.7).
- Depth of field over live page content. A canvas cannot read the page's pixels (Fire Temple's [backdrop strategy](../firetemple/docs/backdrop-strategy.md)); defocusing the page means CSS, re-rendered content or images the page hands over (story 6.1).
- Photographic accuracy for its own sake. A plausible, stable, cheap disc beats a correct one that shimmers.
- Space subjects (stars, planets, moon phases as data). Those are research.md's Space family. Moon Temple keeps the moon as a light source seen through air and glass: its halo, corona and glitter path.

## Decisions

Defaults chosen so work can start. Each is cheap to revisit before Epic 1 is finished.

| Decision            | Default                                                                                                   | Why                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation          | Storm Temple's shell (from Fire Temple via The Bazaar) on `@mk7s/hologpu-temple-core`                     | research.md asks every new family to build on the shared core. Storm Temple's copy is the newest: held frames (`FrameTime.still`), the stroke renderer, the flash and still tests. |
| Build tooling       | Vite + TypeScript (strict), WGSL with `#include` resolved per effect at build time                        | Same as every temple; shader text never reaches the first load.                                                                                                                    |
| Rendering API       | Raw WebGPU + WGSL, thin helpers                                                                           | The research subject is WebGPU itself.                                                                                                                                             |
| Colour pipeline     | Linear HDR `rgba16float` scene → optics (depth of field, glare) → bloom → tonemap → sRGB                  | A defocused point keeps its energy only in linear light: blur after tonemapping turns bright orbs into grey smudges. Optics run before bloom; story 3.9 checks the order.          |
| Light units         | Points carry power, not brightness                                                                        | Spreading a point over its circle of confusion must divide its brightness by the disc's area. Every point-source chunk is tested for it (story 2.3).                               |
| Depth of field ref  | Brute-force scatter at low resolution                                                                     | Every method in Epic 3 is scored against the same picture rather than against the eye.                                                                                             |
| Depth source        | Effects own their scenes (3D points, layers) or take an image plus a depth map                            | The page has no depth buffer. DOM content gets layer blur only (story 3.6).                                                                                                        |
| Flash               | Twinkle and glints capped with Fire Temple's flicker limits; the analyser over every preset in `npm test` | Glints, glitter and flares crossing the view are this family's flash risks. The analyser and held-frame tests came with the shell and already run.                                 |
| Accent              | Violet-blue (`#9d94ff` dark, `#4b3bd6` light), taken from the reference picture; Tier B moved to teal     | The orbs' colour. Storm Temple's violet Tier B would sit on the accent, and teal is free now the cyan accent is gone.                                                              |
| Neutrals            | Dark first, a little violet                                                                               | Bokeh is light against night; the light theme is real because a light page is the hard test (story 7.5).                                                                           |
| CSS prefix, port    | `mt-`, dev port 5450                                                                                      | 5373 and 5390 to 5441 are taken by the other holofx projects.                                                                                                                      |
| Hosting             | Cloudflare Pages (classic) project `moontemple`, direct upload                                            | No server needed. Create the project with `wrangler pages project create --force`: without it wrangler 4.153 converts the repo to Workers (Storm Temple hit this).                 |
| No-WebGPU behaviour | Poster per effect; a CSS version where one is honest (story 7.4)                                          | Bokeh is unusually easy to fake in CSS, so the fallback can be good.                                                                                                               |

## Carried over from the other temples

Findings that shape this plan rather than being rediscovered.

- **Per-pass GPU timings are indicative only** (Fire Temple). Passes overlap on tile-based GPUs, the browser floor is about 1 ms on the development machine, and effects under about 2 ms cannot be ranked against each other. Cost studies run on Dawn under Node, and Chrome's own frame reading decides the tier.
- **A canvas cannot read the page** (Water and Fire Temple). Element geometry is available every frame (`src/gpu/dom-rects.ts`); element pixels are not, except an image or canvas the page owns, uploaded with `copyExternalImageToTexture`.
- **A baked noise texture beats procedural noise per pixel** (Fire Temple Epic 4). It moved six effects from Tier B to A. The same is likely for hashed orb fields at high density.
- **Bloom's level count must follow the canvas size** (Fire Temple 3.4), and a Karis average on the first downsample stops single bright pixels from flickering (Light Temple E1-S2). Both matter more here, where every highlight is a single bright pixel before it is defocused.
- **A frozen frame can be the hazard** (Storm Temple 6.2). A paused effect shows one frame for as long as the visitor looks. A flare or a glint at full brightness must not be the held frame.
- **Quick taps slip between frames** (Storm Temple's pages). An effect that reads a press once a frame misses a tap whose down and up land in the same frame; the page holds the release for two frames.
- **Stable glitter** (Water Temple `sun-glint`). Hashed cells that twinkle with the surface and stay put under camera motion. Glints here start from it.
- **Spectral optics exist** (Light Temple `holo-card`, `src/shaders/optics.wgsl`). The grating equation and `spectral_rgb` cover the diffraction colour in stories 2.4, 2.6 and 5.2.
- **Scratch work needs a home.** Long sweeps and probes go in `experiments/`, outside test, typecheck and lint.

## Findings so far

- **Generated discs beat per-pixel orbs.** `bokeh-drift` draws its orbs as one instanced quad each and costs about what the HDR tail does (0.4 to 0.6 ms at 1080p on Dawn, M1 Max), from 50 to 440 orbs. `hello`, which finds its orbs per pixel in a hashed grid (27 lookups a pixel), costs 1.44 ms. Fire Temple found the same of procedural noise per pixel.
- **Conservation needs the exact small case.** Above about three pixels a one-pixel edge divided by the shape's area plus Steiner's π/12 keeps a point's light within 2%; below it only the exact area of the pixel inside the disc does. Combining two clips by multiplying their edges squares the ramp and loses 0.33/r of the light; take the minimum.
- **Big bokeh needs close focus.** A 50 mm f/1.8 focused at 6 m blurs infinity to about 3 px at 700 px tall. The reference look is a lens focused within a metre or so, with the lights far behind it, which is also why its discs are all about the same size.
- **A sharp image cannot give the foreground back.** In `dof-lab`, the separable hexagon gets within 10.7 levels RMS of the ray-traced reference with the subject in focus but 15.3 with the background in focus, because a blurred foreground should spread over and show what is behind it, and a post-process given one sharp image has neither.
- **Points built on the CPU are cheap until they are not.** Hundreds to a few thousand points a frame cost 0.1 to 0.5 ms of main-thread time and nothing measurable on the GPU. `glitter`'s 24 000 facet tests cost 2.7 ms of CPU against 0.5 ms of GPU: past about ten thousand, the test belongs in a shader.
- **Real airlight is wide.** The glow of a light in fog falls off about as 1 / angle, so it lifts the whole frame long before it looks like a halo; the stand-in it replaced was too tight.

## Overlaps and who owns what

| Nearby work                                            | Where                       | Moon Temple's part                                                                       |
| ------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------- |
| `particle-drift`: quiet bokeh dust                     | hologpu                     | 4.1 is the measured, aperture-shaped, energy-conserving version; compare the two.        |
| `lens`: vignette, chromatic edges, grain               | hologpu                     | 2.4 covers aberration as optics; the film finish stays hologpu's.                        |
| `rain-glass`: drops as lenses over a blurred street    | Water Temple                | Its blurred street could take 4.2's bokeh as a backdrop; not rebuilt.                    |
| `sun-glint`, `hdr-bloom`                               | Water Temple                | 5.4 takes the glitter path to moonlight and defocus.                                     |
| Tilt-shift depth of field, bokeh highlights (5.1, 5.2) | Eightfold Path (unbuilt)    | Epic 3 builds the methods; Eightfold Path consumes them once they are in the core (7.6). |
| Fireflies as lights (E7-S2)                            | Light Temple (unbuilt)      | 4.4 does the optics of a firefly; lighting the scene from it stays Light Temple's.       |
| `text-outline-glow`; CRT glow and halation (4.7)       | hologpu; Void               | 6.6 is film halation, a different mechanism with a red fringe.                           |
| Moon phases, starfields                                | research.md Space; hologpu  | Not built here.                                                                          |
| `holo-card`: thin film, diffraction, `spectral_rgb`    | Light Temple                | 9.1 and 9.6 reuse its spectral chunk; Epic 9 adds refraction through a solid.            |
| `liquid-glass`, `liquid-blob`: refracting lenses       | Water Temple                | Screen-space refraction of a backdrop; 9.4 traces a real solid with dispersion.          |
| Shared stroke renderer                                 | Storm Temple (`strokes.ts`) | 10.1 draws the wireframe with it; already in this repo.                                  |

## Practicality tiers

Every effect is tagged with a tier. Budgets are starting targets to be validated in Epic 8.

| Tier            | Meaning                                             | Shape                                              | GPU budget @1080p                   |
| --------------- | --------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| **A** Drop-in   | Safe as ambient decoration, including mobile        | One or two fragment passes, no compute             | ≤ 2 ms on integrated GPU            |
| **B** Feature   | Hero sections and interactive set pieces            | Multi-pass, a depth-of-field pass or small compute | ≤ 6 ms on integrated GPU            |
| **C** Showpiece | Dedicated page or landing experience, desktop-first | Full-resolution scatter, FFT glare, a 3D scene     | ≤ 12 ms on discrete / Apple Silicon |

Budgets include the HDR tail. Depth of field is the stage most likely to push an effect up a tier, so its cost is a baseline row in every study, as the tail is.

## Architecture sketch

```
moontemple/
  index.html
  vite.config.ts
  src/
    main.ts            bootstrap: one shared GPU session, mounts an effect
    gpu/               device, canvas, frame loop, shaders, uniforms, targets, passes, post/
                       (bloom, tonemap), strokes, dom-rects, pointer, scroll, plus
                       optics/ (lens model, circle of confusion, aperture kernels),
                       dof/ (reference scatter, gather, separable, sprite scatter, layers),
                       points/ (energy-conserving point sources, glints) and
                       glare/ (spikes, FFT glare, flare ghosts, halation)
    wgsl/              shared chunks: hash, noise, sdf, colour, plus aperture, coc, points,
                       spectral and scatter (fog in-scattering)
    effects/<id>/      meta.ts (eager), index.ts + *.wgsl (lazy chunk), notes.md, poster.webp
    shell/             app frame, gallery, effect page, contexts, controls, notes, scorecard, HUD
    lib/               the library entry: mount an effect on a caller's canvas
  tests/               vitest on Dawn's Node bindings: real WebGPU, no browser
  experiments/         scratch sweeps and probes; not part of the test run
  docs/                research output: support matrix delta, cost studies, method comparison
```

Effect contract, unchanged from Storm Temple so effects and shell code move between the temples:

```ts
// src/effects/<id>/index.ts exports `effect`; meta.ts exports `meta`.
export interface EffectModule<S extends ParamSchema> {
  meta: EffectMeta; // id, title, epic, tier, tags, summary, scorecard, layout
  hdr?: boolean; // asks for the extended-range canvas where allowed
  params: S; // drives controls, docs table, URL state
  presets?: Record<string, Partial<ParamValues<S>>>;
  create(ctx: EffectContext<S>): Promise<EffectInstance>;
}

export interface EffectInstance {
  resize(width: number, height: number, dpr: number): void;
  frame(time: FrameTime, encoder: GPUCommandEncoder, target: GPUTextureView): void; // time.still: the held frame
  stats?(): Record<string, string | number>;
  destroy(): void;
}
```

The full types live in `src/effects/types.ts`. `tests/flash.test.ts` and `tests/still.test.ts` run over every registered effect and preset, so a new effect is covered as soon as its directory exists.

## Definition of done (per effect story)

1. Runs inside its tier budget on the reference devices, with numbers recorded. Until the device matrix exists (8.2) the only reference device is the development machine, an M1 Max: measured per frame on Dawn and as one frame in Chrome, taking the lowest tier whose budget neither number exceeds. An A or B label is provisional until 8.2, and the scorecard says so.
2. Parameters exposed through the schema, with at least two presets.
3. Handles resize, DPR changes, device loss, offscreen pause and `prefers-reduced-motion`. The held frame shows the subject, never a flare or glint frozen at its brightest (`tests/still.test.ts`).
4. Stays under the flash threshold (WCAG 2.3.1) at default settings and in every preset not declared in `scorecard.flashPresets`.
5. Conserves light where it defocuses: a point's total light is the same in focus and out of it, within 2%, checked numerically for every chunk that spreads a point.
6. Shown in at least one realistic web context, over both a dark and a light page and at phone size, and its screenshots looked at.
7. `notes.md` written: how it works, cost, pitfalls, when to use it, references. Where a CSS version exists, the notes say how close it gets.
8. Scorecard filled in and fallback poster captured.

## Milestones

| Milestone               | Scope                                    | Proves                                                   |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------- |
| **M0** Vertical slice   | Epic 1, stories 2.1–2.3, 4.1             | Tooling → lens model → energy-conserving orbs → deploy   |
| **M1** Drop-in set      | Rest of Epic 2, stories 4.2–4.8, 6.3–6.5 | Tier A bokeh and glare, and the shared optics chunks     |
| **M2** Depth of field   | Epic 3, story 6.10                       | Which method to use, measured against a reference        |
| **M3** Lens on the page | Rest of Epic 6, stories 7.1–7.5, 8.2     | Web-native usefulness, on more than one device           |
| **M4** Night sky        | Epic 5, rest of Epic 4                   | The moon as a light seen through air, glass and water    |
| **M5** Findings         | Rest of Epics 7 and 8                    | Published conclusions, optics moved into the temple core |
| **M6** Glass and wire   | Epics 9 and 10                           | Spectral light through glass, under a wire in focus      |

M6 depends on Epic 2 and on 3.9's choice of depth-of-field method, not on M3 to M5; it can run alongside them, and M5's findings come last.

Story format: `ID Title [tier] (size)`. Sizes: S ≈ a day or less, M ≈ a few days, L ≈ a week or more.

---

## Epic 1 — Foundation and tooling

Mostly done by copying Storm Temple's shell. What is left is the parts every temple needed before its first measured effect.

- [x] **1.1 Scaffold** (S) — Storm Temple's committed tree copied, lightning code removed (effects, demo pages, thunder, bolt, strike, zap, growth, the storm backdrop and sky), the `st-` prefix renamed `mt-`, violet-blue accent with Tier B in teal, dev port 5450, launch config `moontemple`. _Kept: the HDR tail, stroke renderer, DOM rects, pointer and scroll, library host, registry and catalogue scripts, the flash analyser and held-frame tests. Typecheck, lint and the 18 tests pass._
- [x] **1.2 `hello`** [A] (S) — the smallest effect: three layers of drifting violet orbs under one haloed light, one fragment pass through the tail. _A flat disc with a brighter rim stands in for an aperture; it does not yet conserve light (2.3). Checked in the browser with no console errors; flash and held-frame tests pass._
- [ ] **1.3 Repository and CI** (S) — its own git repository and GitHub remote, the CI workflow on software Vulkan (lint, format, typecheck, tests, build), green once.
- [ ] **1.4 Deploy** (S) — Cloudflare Pages project `moontemple` (classic, created with `--force`), an `npm run deploy` that builds, checks the bundle and uploads `dist`.
- [ ] **1.5 Posters, catalogue and the holofx site** (S) — posters from held frames, `catalogue.json`, and Moon Temple in the holofx site's dropdown, lab and effect pages, as Storm Temple did in its 1.6.
- [ ] **1.6 Support matrix delta** (S) — re-check what this family leans on beyond Fire Temple's [support matrix](../firetemple/docs/support-matrix.md): `float32-filterable` and `rgba16float` blending for scatter accumulation, storage atomics and indirect draws for sprite bokeh, `shader-f16`, `subgroups` (optional, for tile reductions), and the largest workgroup storage an FFT can count on.
- [x] **1.7 Cost study harness** (M) — port Fire Temple's `npm run study` (per-frame cost on Dawn, a floor row and a tail-only row, `docs/studies/epic-<n>.{json,md}`, `measured.json` for the Scorecard tab). Storm Temple read its costs from the HUD instead; this family compares methods, so it needs the harness. _Ported from Fire Temple as `tests/bench.ts`, `tests/study.test.ts`, `tests/studies.ts` (sweeps) and `scripts/study.mjs`, with `scripts/check-bundle.mjs`, which `npm run build` now runs. Its first run caught the Slow spectrum page importing `bokeh-drift` (and its shaders) up front for one colour function, now in `bokeh-drift/hue.ts`. Studies for Epics 1, 2 and 4 are in `docs/studies/`; the Chrome readings come from the HUD until the browser check (1.8) is ported._
- [ ] **1.8 Browser check** (M) — port Fire Temple's `npm run browser-check`: every effect in every mock layout, both page tones and a phone viewport in headless Chrome, failing on an effect that does not start, logs an error or draws nothing.
- [x] **1.9 Image comparison helpers** (S) — RMSE and a perceptual difference (FLIP or a simple SSIM) between two rendered frames, for Epic 3's method comparison and for visual regression. _`src/gpu/dof/compare.ts`: images compared as displayed (Reinhard and a 2.2 gamma per channel), RMSE in 8-bit levels and SSIM on luminance over 8 × 8 windows. FLIP is not done._

## Epic 2 — Optics building blocks

Shared WGSL and TypeScript that every later effect uses, each proven in a small test scene with numeric tests. Shaped from the start to move into the temple core (7.6).

- [x] **2.1 Thin-lens model** [—] (S) — circle of confusion from focal length, f-number, focus distance and depth, signed (near negative, far positive) and in pixels for a given sensor size and canvas. A "photographer's" parameter set (focal length, f-stop, focus distance) and an "artist's" one (focus depth, blur at infinity), both mapping to the same internal model. Scene: `lens-model`, a row of points walking through focus with the CoC plotted. _`src/gpu/optics/lens.ts` and `src/wgsl/coc.wgsl`: the whole model is two numbers, the focus distance and the radius of a point at infinity, `radius = blur at infinity × (1 − focus / depth)`, negative in front of focus. `lensFromCamera` maps focal length, f-number, focus and a full-frame sensor onto it (`tests/lens.test.ts` checks a 50 mm f/1.8 against the textbook disc). `lens-model` is a night street instead of a plot: two rows of lamps, a railing and a city, with the focus walking from 0.8 to 40 m. Big bokeh needs close focus: a 50 mm at f/1.8 focused at 6 m blurs infinity to only about 3 px at 700 px tall, so the scene focuses at 1.5 m at f/1.4._
- [~] **2.2 Aperture shapes** [—] (M) — circle; n-gon with rotation and blade curvature (5 to 9 blades); and the aberrations that make lenses recognisable: cat's-eye vignetting off-axis (the swirl of a Petzval), onion rings from aspherical elements, the bright rim of over-corrected spherical aberration (soap-bubble bokeh) and the soft rim of under-correction, the donut of a mirror lens, and a custom shape from an SVG path or a texture (the heart-shaped cut-out). Each as an analytic distance function and as a baked kernel texture; compare the two on cost and edge quality. _Analytic half done in `src/wgsl/aperture.wgsl` with the shared controls in `src/gpu/optics/aperture.ts`: circle, n-gon with rotation and curvature, a rim (soap bubble or soft edge), onion rings and the cat's eye, and the near field flipped. The shape is described by its radius at each angle, so any profile in the normalised radius has the same mean over the shape as over a disc, and the shape is normalised by its area alone. Still to do: the donut, a custom shape from an SVG path or texture, and the baked-kernel comparison._
- [x] **2.3 Energy-conserving point sources** [—] (M) — research.md's shared "point-source rendering": a point carries power, its disc's brightness is power over area, and a point smaller than a pixel is drawn with its exact pixel coverage, so a moving point neither crawls nor shimmers and its total light never changes as it moves or defocuses. Numeric test: total light constant within 2% from in focus to a 64 px disc, and from rest to moving at 0.3 px a frame. _`src/gpu/points.ts`: one instanced quad per point. Below about three pixels a pixel's share is the exact area of the pixel inside a disc (closed form from the antiderivative of a chord), which conserves the light of any point at any position; above that, the shape with a one-pixel edge, divided by its area plus Steiner's π/12 edge term. `tests/points.test.ts` sums the rendered light for six shapes, twelve radii from 0 to 32 px (in front of and behind focus) and five sub-pixel offsets: all within 2%, round within 1%. The first version multiplied the cat's-eye clip into the edge ramp even with no vignetting, squaring the ramp and losing 0.33/r of the light; intersections now take the minimum of the two coverages._
- [ ] **2.4 Chromatic aberration** [—] (S) — longitudinal (purple and green fringes that swap sides through focus) and lateral (colour spread towards the edges), on discs and on the whole frame. Three spectral samples against seven against a continuous spectrum, from Light Temple's `spectral_rgb`.
- [ ] **2.5 Halation and glow** [—] (S) — film halation (light through the emulsion reflected off the film base: a red-orange halo hugging highlights) against the tail's bloom and against a glow from a distance field. Energy-conserving: halation moves light, it does not add it.
- [ ] **2.6 Diffraction glare and starbursts** [—] (M) — the spikes a polygonal aperture gives a bright point (N spikes for even N blades, 2N for odd), as analytic spike sprites against the Fourier transform of the aperture image (Ritschel et al.) computed in compute, with spectral smearing of the spikes. Decide which a glint effect should use.
- [ ] **2.7 Lens flare ghosts** [—] (M) — a screen-space pseudo-flare (Chapman: downsample, threshold, flip through the centre, chromatic ghosts, halo ring) against per-ghost sprites from a small lens description (a simplified Hullin et al.), plus the anamorphic streak. The sprites follow a light the effect knows; the pseudo-flare works on any image.
- [~] **2.8 Light in haze** [—] (S) — the in-scattered glow of a point light in uniform fog, closed form (Sun et al.) against a short ray march; Henyey–Greenstein phase for forward scattering. This is the halo around the reference picture's light. _Closed form done: `src/gpu/optics/haze.ts` derives the single-scattering integral down to Sun et al.'s form, with the one remaining integral as a 12-point Gauss–Legendre sum, and `src/wgsl/scatter.wgsl` is its twin. Against a 200 000-step march it is within 0.14% for optical depths 0.1 to 4 and angles 0.02 to 3 radians (`tests/haze.test.ts`). `bokeh-drift` uses it. Still to do: Henyey–Greenstein forward scattering, which has no such closed form and needs the march._
- [x] **2.9 Flicker for points** [—] (S) — port Fire Temple's `flicker.wgsl` and its TypeScript twin: band-limited twinkle with the frequency and amplitude caps that keep a field of glints under the flash threshold by construction. _Ported as `src/gpu/optics/flicker.ts` and `src/wgsl/flicker.wgsl`. `tests/flicker.test.ts` checks the caps, that the worst safe settings make at most three flashes a second over 200 seeds, and that the WGSL twin gives the TypeScript's numbers. `fairy-lights` and `focus-cursor` twinkle with it._

## Epic 3 — Depth of field: the methods compared

The core research. One test scene with depth (points at many depths, an in-focus foreground edge, bright highlights behind it), every method on it, and each scored against the reference for error and cost. The scene is the `dof-lab` effect: a split view, the reference beside a method, and the difference.

- [x] **3.1 Reference scatter** [C] (M) — every pixel spreads its colour over its own circle of confusion with its aperture kernel, accumulated in compute, at low resolution, with near and far layers composited correctly. Slow on purpose; the ground truth every other method is scored against. _Built as a ray tracer instead: the shot is analytic shapes (`src/gpu/dof/scene.wgsl`), traced through the whole aperture with rays from an R2 sequence and averaged over frames: Cook et al.'s distributed ray tracing. That is the truth, where a scatter of the sharp image could not see round a blurred foreground either. Its lens radius matches the thin-lens model; one point traced through round and hexagonal lenses, in front of and behind focus, spreads to the predicted radius within 1% (`tests/dof.test.ts`). About 3.5 ms a frame at 8 rays at 1080p on the M1 Max._
- [ ] **3.2 Gather, the Call of Duty way** [B] (L) — half resolution, tiles of max and min CoC with neighbourhood dilation, presorted near and far fields, a ring kernel of about 49 taps, near-field bleed over the in-focus edge (Jimenez 2014).
- [x] **3.3 Separable hexagon** [B] (M) — three skewed one-dimensional blurs in two passes give a hexagonal kernel at the cost of a separable one (White and Barré-Brisebois). _`src/gpu/dof/hexagon.ts`: two passes of 16-tap one-sided line blurs at full resolution, each tap counted only where its own circle of confusion reaches back. Against a 1 024-ray reference at 640 × 400: RMSE 10.7 and SSIM 0.915 with the subject in focus (the sharp image: 39.9, 0.647), 15.3 and 0.866 with the background in focus (32.5, 0.670). The difference is the foreground: blurred inside its own outline with a hard, opaque edge, where the reference spreads it over the background and makes it see-through. About 1.2 ms at 1080p on the M1 Max. In `dof-lab`, with the method interface in `src/gpu/dof/types.ts` for the rest of the epic._
- [ ] **3.4 Circular separable convolution** [B] (M) — a disc kernel from a sum of complex Gaussian components, two passes per component (Garcia 2017); one, two and three components compared on ringing and cost.
- [ ] **3.5 Sprite bokeh** [B] (M) — bright pixels above a threshold appended in compute and drawn as aperture sprites with indirect draws; everything else from a cheap gather. The aperture's shape only shows on highlights, which is where the eye looks for it.
- [ ] **3.6 Layer blur with no depth** [A] (M) — for flat layers, images and anything DOM-shaped: a blur per layer from its assigned depth, and the tilt-shift band (blur growing from a focus line). Compared with CSS `filter: blur()` on the same layers, timed on both sides. The method Eightfold Path's 5.1 needs.
- [ ] **3.7 Temporal stability** [—] (M) — sample jitter with and without accumulation, on a slow camera move and on twinkling highlights. A defocused highlight that flickers is worse than a sharp one.
- [ ] **3.8 Foreground and edges** [—] (S) — the classic failures, each on a dedicated shot: sharp foreground haloed by blurred background, background leaking into the foreground, a near object blurred over a sharp edge without its silhouette spilling. Which method handles which.
- [ ] **3.9 Study and verdict** [—] (M) — cost at 1080p and phone resolution, error against 3.1, and texture memory for every method; the order of depth of field and bloom; a recommended default for each tier. `docs/studies/epic-3.md`.

## Epic 4 — Bokeh scenes

Effects meant to be shipped, most of them Tier A because the orbs are generated, not blurred: a generated orb is drawn at its final size, which costs a fraction of blurring a frame.

- [~] **4.1 `bokeh-drift`** [A] (S) — the reference picture: orbs at several depths drifting in the dark, each the aperture's shape at its own circle of confusion, conserving its light, under one light in haze. The M0 effect. Compared with hologpu `particle-drift` and with a CSS version (radial gradients, animated) at equal look. _Built: 110 orbs between 1.5 and 30 m behind a lens focused at 0.5 m, rising and swaying by perspective, parallax by depth from the pointer, a far bright light that blooms, and a haze glow standing in for 2.8. Palettes violet, city and gold; presets for hexagons, soap bubbles, a swirly lens and a pulled focus. Flash and held-frame tests pass. The haze is now 2.8's closed form. Measured on the M1 Max: 0.4 to 0.6 ms per frame on Dawn at 1080p across runs, about the tail alone, and 1.24 ms in Chrome at 962 × 884; Tier A there, provisional. Orb count and blur do not move the cost measurably. `spectrum.html` (Slow spectrum) puts it behind a whole page on an `rgb` palette that turns the hue wheel, deployed at https://bokehspectrum.pages.dev. Still to do: the comparison with `particle-drift` and a CSS version._
- [x] **4.2 `night-street`** [A] (M) — a city at night out of focus: street lights, headlights and tail lights moving in lanes, neon signs as clusters, all as point sources in 3D, with focus that can be pulled by scroll. After Steinrucken's "The Drive Home". _`night-street`: two lanes of headlights and tail lights, sodium lamps, neon rows, fading traffic lights and far windows behind an 85 mm f/1.4 focused at 1.5 m, with a wet road mirroring every light at 30%, which fills the lower half as a wet street does. The pointer's height pulls focus (0.8 to 120 m) rather than the scroll. 0.81 ms on Dawn at 1080p; 0.48 ms with a dry road, the reflections' discs being the cost._
- [x] **4.3 `fairy-lights`** [A] (S) — strings of lights hanging in catenaries across the frame, defocused by depth, twinkling under the 2.9 caps. A seasonal hero. _Strings 1.8 to 6.3 m behind a 35 mm lens focused at 0.7 m, dealt shuffled bands of the frame so near and far spread over it, swaying in depth. Warm, cool and multicolour; one preset puts a string in focus. 0.44 ms on Dawn at 1080p, about the tail alone; flash `low` at every preset._
- [x] **4.4 `fireflies`** [B] (M) — GPU particles wandering through a focal plane; each blinks on its own rhythm and gains its disc as it leaves focus. The pointer moves the focal plane. _`fireflies`: 180 points wandering on noise between 0.5 and 14 m, each glowing once every 2.5 to 6.5 s, the pointer moving the plane of focus. Built on the CPU, not GPU particles: a few hundred cost 0.13 ms of CPU a frame. 0.44 ms on Dawn, flash `low`._
- [x] **4.5 `dust-in-light`** [B] (M) — motes drifting through a beam, lit only inside it, sharp where they cross focus and broad discs where they pass near the lens. _`dust-in-light`: the beam's glow in closed form (a Gaussian profile integrated along each view ray is an error function, times a Henyey–Greenstein phase), and 2 500 motes round its axis lit by the same profile and phase. 0.48 ms on Dawn; 0.54 ms of CPU._
- [x] **4.6 `snow-at-night`** [A] (S) — snowfall lit by one street lamp: far flakes are points, near ones are huge faint discs crossing the frame. _Through an 85 mm f/1.8 focused at 5 m; each flake lit by the lamp with a Henyey–Greenstein forward-scattering phase, so flakes between lens and lamp shine; the lamp's glow is 2.8's closed form. Two findings: a volume-even snowfall leaves almost no flake near the lens (0.4 of 1 400), so 1.5% are placed in the first 4 m; and those near discs, falling at real speed, crossed seven view heights a second and flickered (the analyser measured three flashes in a cell, and `led lamp` over the limit), so no flake now crosses faster than 0.3 view heights a second. Flash `low`; 0.52 ms on Dawn, 0.76 ms when every far flake is a disc._
- [x] **4.7 `glitter`** [A] (S) — a field of sub-pixel glints that flash as their facets catch the light, stable under motion (from Water Temple's `sun-glint`), turning into discs out of focus. _`glitter`: 24 000 facets on a sheet receding from 0.7 to 2.5 m, each a mirror tilted about 20°, glinting as a Gaussian of the angle between its normal and the light–lens half vector, under a slowly sweeping light. 0.50 ms on Dawn, but 2.7 ms of CPU a frame for the facet test: the GPU should do it before this ships. Flash `low` at every preset._
- [x] **4.8 `aperture-lab`** [—] (S) — one scene, every aperture and aberration from 2.2 and 2.4 side by side, with the f-number and blade count under the pointer. The page to link from every notes file. _`aperture-lab`: a grid at 40 m and a row at 0.6 m through one lens; the pointer picks the aperture across and the f-number down, or it steps through all nine. The near row shows the flip. 0.48 ms on Dawn._
- [ ] **4.9 `bokeh-text`** [B] (M) — a headline made of orbs that pull into focus and become the letters, from Fire Temple's MSDF atlas. A reveal for a hero.

## Epic 5 — Moonlight

The moon as a light source seen through air, cloud, ice and water. Each is a known atmospheric optics phenomenon with a closed form or a small table.

- [ ] **5.1 `moon-through-cloud`** [A] (M) — a bright moon behind thin moving cloud: the aureole, the cloud's silver edges, and the brightness falling where the cloud thickens. The light source for the rest of the epic.
- [ ] **5.2 `lunar-corona`** [A] (S) — the coloured rings of diffraction by cloud droplets, their radius set by droplet size, as a spectral sum of Airy patterns over a droplet-size spread (narrow spread for clear rings, wide for a plain aureole).
- [ ] **5.3 `ice-halo`** [A] (S) — the 22° halo and moon dogs from hexagonal ice crystals, from the minimum-deviation profile, sharp red inner edge fading outwards.
- [ ] **5.4 `moonlit-water`** [B] (M) — the glitter path of moonlight on a moving sea, built on Water Temple's `sun-glint`, with the focus pulled so the glints become a river of discs.
- [ ] **5.5 `lamp-in-fog`** [A] (S) — a street lamp in fog: 2.8's halo, the visible cone under it, and drifting density. Calm enough to sit behind text.
- [ ] **5.6 Night vision** [—] (S) — a tail option for scenes lit at night: the Purkinje shift towards blue, scotopic loss of colour and acuity (Thompson, Shirley and Ferwerda). Decide whether every night scene should use it.
- [ ] **5.7 `moonbow`** [A] (S) — stretch goal: a faint, nearly white rainbow from moonlight on spray.

## Epic 6 — Lens light on the page

Effects shaped like website parts. The most directly useful group.

- [ ] **6.1 Backdrop strategy** [—] (S) — adopt Fire Temple's finding (geometry yes, pixels no) and write down what defocusing the page can mean: CSS `filter: blur()` per element, re-rendered content, or images the page hands over. Measure the main-thread and compositor cost of CSS blur on a long page, which no GPU timing sees.
- [ ] **6.2 `focus-pull`** [A] (M) — rack focus with the scroll: sections come into focus as they cross a focal band and drift out after it, CSS blur on the elements and bokeh behind them in the canvas, both from one focus value.
- [x] **6.3 `focus-cursor`** [A] (S) — the pointer as the point of focus: a bokeh background sharpens around the cursor, softening away from it. _Built as a lens would do it: focus is a distance, not a place in the frame, so the pointer pulls focus to the lantern it is on and everything at that distance sharpens. Lanterns 2 to 60 m in front of an 85 mm f/1.4 (a 50 mm blurred too little for the rack to read), picked by distance from the pointer against the size of their disc, focus eased in log distance with a quarter-second time constant; with no pointer it wanders. `tests/focus-cursor.test.ts` checks both with synthetic pointer events. 0.46 ms on Dawn._
- [ ] **6.4 `glint-hover`** [A] (S) — a star glint on a card's corner or a button's edge as the pointer crosses it, spikes from 2.6, capped by 2.9.
- [ ] **6.5 `flare-cursor`** [A] (S) — the pointer as a bright light: ghosts strung through the centre of the view, a halo ring and a streak, from 2.7's sprites.
- [ ] **6.6 `halation-text`** [B] (M) — a headline as film shows a bright sign: halation and a faint glow, from re-rendered MSDF text over the page's own type position.
- [ ] **6.7 `bokeh-loader`** [A] (S) — a loader or progress bar: orbs gathering from out of focus into a sharp ring or bar as progress rises.
- [ ] **6.8 `rack-focus-transition`** [A] (M) — a transition between sections or routes: the outgoing view dissolves into its own bokeh and the incoming one focuses out of it. Works on what the effect can draw (6.1); measured against a CSS-only version.
- [ ] **6.9 `light-leak`** [A] (S) — warm leaks and a sweeping flare across a hero image, the image uploaded the stable way.
- [ ] **6.10 `photo-focus`** [B] (M) — a photograph with a depth map: click to focus, with Epic 3's chosen method and real bokeh in the highlights. Ship one sample with its depth map; accept a dropped image and map.

## Epic 7 — Production readiness

What it takes to move an effect from demo to real site, kept short where the holofx backlog already plans it.

- [ ] **7.1 Embed API** (S) — every effect usable as `mount(canvas, options)` from the library build, with per-effect gzip size reported. Mostly there from the shell.
- [ ] **7.2 Adaptive quality** (M) — a ladder per effect: fewer orbs, a cheaper depth-of-field method (3.9's order), lower glare resolution, then the CSS version.
- [ ] **7.3 Accessibility** (M) — flash over every preset, held frames that show the subject and no flare, the focus pull and parallax checked against WCAG 2.3.3 (animation from interactions) and switched off under reduced motion, and text contrast over bright moving bokeh with the scrim the contexts already provide.
- [ ] **7.4 CSS fallbacks** (S) — for each Tier A effect, the best CSS version (radial gradients, blur, `mix-blend-mode`, a few keyframes) shown side by side, with its cost and what it cannot do. Bokeh is the family where CSS comes closest.
- [ ] **7.5 Light pages** (S) — bokeh is added light, and a white page has no room for it. Decide per effect: dark section only, darkening discs (a "shadow bokeh" that multiplies), or tinted discs with coverage, after Fire Temple's 3.3 compositing study.
- [ ] **7.6 Optics into the temple core** (M) — move the lens model, aperture kernels, point sources and the chosen depth-of-field method into `@mk7s/hologpu-temple-core`, and tell Eightfold Path (5.1, 5.2) and Light Temple (E7-S2) they are there.

## Epic 8 — Measurement and findings

Turn the demos into conclusions.

- [ ] **8.1 Cost studies** (M) — one study per effect epic from the 1.7 harness, collected into one results page.
- [ ] **8.2 Device matrix** (M) — an integrated-GPU laptop, Apple Silicon, a mid-range Android phone and an iPhone. Scheduled in M3 so the tiers stop resting on one machine.
- [ ] **8.3 Live versus baked** (S) — `bokeh-drift` and `night-street` as looped videos and as the shader: bytes, GPU cost, and what is lost (interaction, resolution, the focus pull).
- [ ] **8.4 CSS versus WebGPU** (M) — 7.4's pairs measured on the same devices: frame time, main-thread time, and where each breaks.
- [ ] **8.5 Decision guide** (S) — "which effect for which job" and "which depth-of-field method at which tier", with budgets and caveats.
- [ ] **8.6 Visual regression** (M) — screenshot tests with a fixed time seed, using 1.9's comparison.

## Epic 9 — Spectral light and glass

Light through a refracting solid, colour by colour. The reference for Epics 9 and 10 is a rotating wireframe icosahedron: sharp white edges over a glass body that glows cyan and blue inside, with hot spots of light near its corners, a horizon bent straight across its middle, and a soft halo that turns yellow, orange and finally red towards its rim. Read as optics that is four things: the backdrop refracted and dispersed through the glass (9.2 to 9.4), light gathered by internal reflection into caustics at the corners (9.5), the body out of focus behind a wire in focus (10.4), and a halo whose red spreads widest, as a lens's chromatic aberration and film's halation both make it (9.7, 10.2).

- [ ] **9.1 Spectral sampling** [—] (S) — light as wavelengths rather than three channels: wavelength to linear sRGB through Light Temple's `spectral_rgb` (or a CIE fit), and hero-wavelength sampling (Wilkie et al.), four wavelengths a sample spread over the visible range. Test: a flat spectrum integrates to white, and the colour of any single wavelength stays inside sRGB after the tonemap's clip.
- [ ] **9.2 Dispersive refraction** [—] (M) — index of refraction by wavelength (Cauchy for crown and flint glass, Sellmeier where Cauchy drifts; diamond for a stronger split), Snell's law, Fresnel reflectance and total internal reflection, and a ray tracer for convex polytopes as sets of planes (tetrahedron to icosahedron, prisms), several bounces inside. Test: a BK7 prism's minimum deviation at 589 nm and its spread from 486 to 656 nm against the textbook figures.
- [ ] **9.3 `prism`** [B] (M) — the classic: a beam of white light through a triangular prism opening into a spectrum on a wall behind it. The validation scene for 9.2, and a hero in its own right.
- [ ] **9.4 `glass-solid`** [B] (L) — a rotating glass Platonic solid (icosahedron by default) traced per pixel against a backdrop of sky, horizon and lights: refraction with dispersion, internal reflections to a set depth, Fresnel at every face, so edges split into spectra and the horizon bends through the body. Compare a fixed spectral sampling with three channels at three indices, the cheap version.
- [ ] **9.5 Caustics at the corners** [B] (M) — the bright spots where light inside the solid is reflected together near its vertices: traced from the light into a small caustic texture on the solid's faces, against a screen-space stand-in (a glow at each vertex weighted by how the faces around it face the light). Decide which the showpiece uses.
- [ ] **9.6 Thin-film colour** [A] (S) — soap-film iridescence on the faces, from Light Temple's thin-film chunk, as an option for a lighter, bubble-like solid.
- [ ] **9.7 Spectral depth of field** [B] (M) — longitudinal chromatic aberration: each wavelength focuses at a slightly different distance, so out of focus a bright object fringes one colour outside and its complement inside. The point layer and 3.9's chosen method with a circle of confusion per channel (three) against per wavelength (eight), checked against the 3.1 reference traced spectrally. This is the reference's red rim.

## Epic 10 — Glowing wireframes and halos

The other half of the reference: a sharp, bright line drawing of the solid, and the halo of light the whole thing throws.

- [ ] **10.1 HDR wireframe** [A] (S) — a solid's edges drawn with Storm Temple's stroke renderer (`src/gpu/strokes.ts`): constant width in pixels, energy per length so a long edge is not brighter than a short one, joints that do not double, hidden edges faded rather than removed, and a perspective that makes the solid read as turning.
- [ ] **10.2 Spectral bloom and halation** [B] (M) — bloom whose spread grows with wavelength, so a bright shape's halo goes white, yellow, orange and red outwards, as a real lens's scatter and film's halation both make it. Compared with three-channel bloom with a radius per channel, and with 2.5's halation; the colour must stay energy-conserving (white in, white integrated out).
- [ ] **10.3 Vertex flares** [A] (S) — a small starburst (2.6) where edges meet, brightest at the corners that face the light, capped by 2.9 so a turning solid never strobes.
- [ ] **10.4 Sharp wire over a soft body** [B] (M) — the reference's composition: the wire in focus in front, the glowing glass body behind or through it out of focus with its spectral fringes. Two layers, each with its own depth: the body through 9.7's spectral depth of field, the wire sharp over it. Decide whether the body is blurred as an image (3.9's method) or generated already soft.
- [ ] **10.5 `prism-icosahedron`** [C] (L) — the showpiece: a slowly rotating icosahedron, white wire edges and corner flares, a glass body that refracts and disperses the horizon behind it with caustic spots at its corners, all wrapped in a chromatic halo. The pointer turns it; reduced motion holds a still at a flattering angle. Built from 9.2, 9.4, 9.5, 9.7, 10.1 to 10.4, and judged against the reference picture side by side.
- [ ] **10.6 `wire-loader`** [A] (S) — the web-sized version: a small turning wireframe solid with its halo, as a loader or an icon, with no glass body (wire, flares and spectral bloom only) so it stays Tier A.
- [ ] **10.7 `glass-badge`** [B] (M) — the glass solid as a page element: a logo mark or a call-to-action extruded into a convex solid (the convex hull of its outline), refracting the page's own background image behind it. Uploads that image the stable way (6.1).
- [ ] **10.8 Study** [—] (M) — the cost of each piece at 1080p and phone size (traced glass, caustics, spectral bloom), which ones a Tier B version can keep, and flash: a bright solid turning in front of a light is a large area changing brightness, and the analyser decides how fast it may turn.

---

## Risks and open questions

- **CSS is a strong rival.** Soft circles drifting on a dark page are a few radial gradients and keyframes. A shader has to earn its place with things CSS cannot do: aperture shape, energy conservation as orbs overlap, real depth of field, thousands of points, focus that follows input. Stories 7.4 and 8.4 measure this directly, and some Tier A effects may end with "use the CSS".
- **Shimmer.** Highlights are single bright pixels before they are defocused, and they crawl and flicker under motion. Point sources with exact coverage (2.3), the Karis average and temporal stability (3.7) are requirements, not polish.
- **Flash.** Glints, glitter, twinkling lights and flares crossing the view all sit near WCAG 2.3.1. The flicker caps (2.9) and the analyser are in from the start.
- **Motion.** A focus pull and parallax on scroll can trouble visitors with vestibular disorders (WCAG 2.3.3). Every scroll-linked effect needs a still version.
- **Light pages.** Like fire, bokeh is light. Some effects will honestly be dark-section only (7.5).
- **No depth for the page.** Depth of field over DOM content is limited to layers and CSS blur. `photo-focus` needs a depth map the visitor will not have; the sample ships one.
- **Scatter cost.** Sprite bokeh and the reference scatter grow with the number of bright pixels and the disc area; the worst case (a night street fully defocused) may be over Tier B on an integrated GPU.
- **Overlap.** Several neighbours already exist or are planned (table above). The value here is the optics and the comparisons, not more orb backgrounds.
- **Measurement.** The same as every temple: one machine, a 1 ms browser floor, and effects under about 2 ms that cannot be ranked. The tiers stay provisional until 8.2.
- **Spectral cost.** Tracing a glass solid per pixel with several wavelengths and bounces is a Tier C budget at full resolution; the web-sized versions (10.6, 10.7) have to drop the glass or trace it at reduced resolution.
- **Open questions.** Is a generated orb field ever beaten by blurring a sharp render? Does a baked aperture kernel beat the analytic shape on a phone? Does depth of field belong before or after bloom (3.9)? How many glints a second can a field hold before the analyser objects?

## Starting references

These come from memory, not from a literature search in this session, as research.md warns for its own list. Confirm each before citing it in a notes file.

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981) — the circle of confusion in rendering.
- Cook, Porter and Carpenter, _Distributed Ray Tracing_ (SIGGRAPH 1984) — depth of field by sampling the lens.
- Jorge Jimenez, _Next Generation Post Processing in Call of Duty: Advanced Warfare_ (SIGGRAPH 2014) — gather depth of field.
- John White and Colin Barré-Brisebois, _More Performance! Five Rendering Ideas from Battlefield 3 and Need for Speed: The Run_ (SIGGRAPH 2011) — separable hexagonal bokeh.
- Kleber Garcia, _Circular Separable Convolution Depth of Field_ (SIGGRAPH 2017 talk).
- Guillaume Abadie, _A Life of a Bokeh_ (SIGGRAPH 2018, Advances in Real-Time Rendering) — Unreal Engine's depth of field.
- Tiago Sousa, _CryENGINE 3 Graphics Gems_ (SIGGRAPH 2013) — sprite-based bokeh.
- McIntosh, Riecke and DiPaola, _Efficiently Simulating the Bokeh of Polygonal Apertures in a Post-Process Depth of Field Shader_ (Computer Graphics Forum, 2012).
- Hullin, Eisemann, Seidel and Lee, _Physically-Based Real-Time Lens Flare Rendering_ (SIGGRAPH 2011).
- John Chapman, _Pseudo Lens Flare_ (2013).
- Ritschel, Ihrke, Frisvad, Coppens, Myszkowski and Seidel, _Temporal Glare: Real-Time Dynamic Simulation of the Scattering in the Human Eye_ (Eurographics 2009).
- Spencer, Shirley, Zimmerman and Greenberg, _Physically-Based Glare Effects for Digital Images_ (SIGGRAPH 1995).
- Sun, Ramamoorthi, Narasimhan and Nayar, _A Practical Analytic Single Scattering Model for Real Time Rendering_ (SIGGRAPH 2005) — a light's halo in fog.
- Jensen, Durand, Stark, Premože, Dorsey and Shirley, _A Physically-Based Night Sky Model_ (SIGGRAPH 2001) — moonlight.
- Thompson, Shirley and Ferwerda, _A Spatial Post-Processing Algorithm for Images of Night Scenes_ (Journal of Graphics Tools, 2002) — scotopic vision and the blue shift.
- Philip Laven, _MiePlot_ and his pages on coronae and glories — droplet diffraction.
- Les Cowley, _Atmospheric Optics_ (atoptics.co.uk) — halos, coronae, moonbows.
- Martijn Steinrucken (BigWings), _The Drive Home_ and _Heartfelt_ (Shadertoy) — procedural night-street bokeh.
- Wilkie, Nawaz, Droske, Weidlich and Hanika, _Hero Wavelength Spectral Sampling_ (Eurographics Symposium on Rendering, 2014).
- Guy and Soler, _Graphics Gems Revisited: Fast and Physically-Based Rendering of Gemstones_ (SIGGRAPH 2004) — refraction, dispersion and internal reflection in convex polyhedra.
- Sellmeier and Cauchy dispersion formulas, and the Schott glass catalogue's BK7 and SF11 coefficients.
- WCAG 2.2, Success Criteria 2.3.1 _Three Flashes or Below Threshold_ and 2.3.3 _Animation from Interactions_.
- The other temples: [Fire Temple plan](../firetemple/plan.md), [Storm Temple plan](../stormtemple/plan.md), [Eightfold Path plan](../eightfoldpath/plan.md), [research.md](../research.md) §6 shared pieces.
