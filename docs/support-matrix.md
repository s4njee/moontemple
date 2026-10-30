# Support matrix: what this family adds

Story 1.6. This page is a delta on Fire Temple's [support matrix](../../firetemple/docs/support-matrix.md). Fire Temple's page covers:

- WebGPU itself and the browsers that ship it;
- `rgba16float` targets;
- timestamp queries;
- the HDR canvas.

This page covers only what Moon Temple leans on beyond those.

**Checked so far:**

- Headless Chrome 156 on an Apple M1 Max (Metal 3), probed on 2026-10-29 by `node experiments/support-probe.mjs` from the dev server ([support-probe.json](studies/support-probe.json)).
- Dawn under Node, for the tests and studies.

Safari, Firefox, Windows, Android and an integrated GPU are not checked yet; they belong to the device matrix ([device-matrix.md](device-matrix.md), story 8.2). Spec facts are from the WebGPU and WGSL specifications, not measured.

| What | Needed by | Spec | Chrome 156, M1 Max |
| --- | --- | --- | --- |
| Additive blending into `rgba16float` | Every orb, glint and sprite: the scene is light added up | Core | Works. 1 000 additions of 0.75 sum to 670.5, not 750 (half-float precision; see below) |
| Storage atomics, and `drawIndirect` with arguments written by a compute pass | Sprite bokeh (3.5): highlights counted with an atomic, then drawn as that many apertures | Core | 300 highlights counted and drawn exactly (225 = 300 × 0.75) |
| Blending into `rgba32float` | Accumulating many small contributions exactly | Optional (`float32-blendable`) | Offered. Without the feature the pipeline fails validation ("not blendable"). The site never asks for it |
| `float32-filterable` | Sampling `r32float` depth or `rgba32float` tables with a linear sampler | Optional | Offered and requested where present (`src/gpu/device.ts`). Nothing depends on it: `profile.wgsl`, the blit and the depth-of-field passes read float32 textures with `textureLoad` |
| `rg11b10ufloat-renderable` | A cheaper HDR target for bloom levels (not used) | Optional | Offered; additive blending into it works |
| `shader-f16` | Half-precision kernels for the separable passes (not used) | Optional | Offered; `enable f16;` compiles |
| `subgroups` | Tile reductions for sprite extraction (optional, not used) | Optional | Offered |
| `maxComputeWorkgroupStorageSize` | An FFT glare kernel in workgroup memory (2.6's FFT variant, not built) | 16 KiB by default | 32 KiB offered. A ping-pong row of complex f32 fits 1 024 points at the default and 2 048 here |
| `maxStorageBufferBindingSize` | Caustic photon counts, the sprite list | 128 MiB by default | 4 GiB offered; the largest buffer here, `glass-solid`'s caustic atlas, is far under the default |

## What it means for the plan

- **Nothing shipped needs an optional feature.** Every effect runs on core WebGPU. `float32-filterable` is asked for when it is there, and nothing breaks without it.
- **Half-float accumulation drops small light.**
  - `rgba16float` has 11 significant bits, so an addition under half a step of the value already there is lost.
  - At 4 the step is 1/256, so adding 0.001 a thousand times leaves 4, not 5. In `rgba32float` it comes to 4.99993.
  - At 512 and above, 0.75 is added as 0.5 or 1 by rounding, so the thousand additions above come to 670.5.
  - In one frame this is invisible: the part lost is under a twentieth of a percent of the pixel.
  - It decides how the references are built. The depth-of-field reference averages its batches in `rgba32float` without blending, as a ping-pong (`src/gpu/dof/scene.ts`). The caustics count photons in fixed point with atomics (`src/gpu/glass/caustics.wgsl`), not by blending.
  - Any future accumulation over many frames must do the same, or ask for `float32-blendable` and keep a fallback.
- **The sprite path is core.** Atomics plus an indirect draw is all sprite bokeh needs, and both are core. Only the count's upper bound (`params.capacity`) needs care, because the GPU decides how many sprites to draw.
- **An FFT glare kernel has room at the default limit.** A 1 024-point row is enough for a 1080p glare buffer at half resolution. Nothing here uses FFT glare yet: the glare is analytic (2.6).
