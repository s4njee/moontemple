# CSS versus WebGPU

Story 8.4. Story 7.4's pairs, each effect's CSS version (`experiments/css-fallbacks.html?only=<id>`) and the WebGPU effect (its page with the stage filling the window), filling a 1280 × 720 window in headless Chrome on this machine (Apple M1 Max), 2026-10-29, 5 seconds each (`node experiments/css-vs-webgpu.mjs`). Main thread is Chrome's Performance metric (all tasks); GPU process is the union of its main and compositor threads' top-level tasks from a trace, which is where both composited CSS and WebGPU's command buffers are drawn. Milliseconds per second of running. Long frames are frames over 25 ms.

The empty page costs 14.1 ms/s of main thread and 8.2 ms/s of GPU process at 61 frames a second; every row includes it.

## The pairs

| Effect | CSS elements | CSS: frames a second | CSS: main (ms/s) | CSS: GPU process (ms/s) | WebGPU: frames a second | WebGPU: main (ms/s) | WebGPU: GPU process (ms/s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bokeh-drift | 144 | 60 | 80.3 | 116.1 | 60 | 53.2 | 197.1 |
| bokeh-loader | 47 | 60 | 29.4 | 115.1 | 60 | 61.7 | 197.0 |
| dust-in-light | 194 | 60 | 111.3 | 227.1 | 60 | 113.9 | 194.1 |
| fairy-lights | 215 | 60 | 63.6 | 141.6 | 60 | 42.3 | 162.9 |
| fireflies | 101 | 60 | 101.0 | 240.6 | 60 | 56.4 | 216.7 |
| flare-cursor | 13 | 60 | 24.4 | 170.7 | 60 | 61.2 | 216.2 |
| focus-cursor | 154 | 60 | 73.3 | 129.6 | 60 | 69.1 | 205.8 |
| focus-pull | 134 | 60 | 116.1 | 198.6 | 60 | 59.0 | 183.5 |
| glint-hover | 32 | 60 | 23.1 | 113.5 | 60 | 43.1 | 120.9 |
| glitter | 219 | 60 | 72.2 | 168.7 | 60 | 238.2 | 85.1 |
| ice-halo | 99 | 60 | 12.4 | 6.2 | 60 | 50.9 | 185.4 |
| lamp-in-fog | 9 | 60 | 38.0 | 117.8 | 60 | 46.2 | 187.8 |
| lens-model | 114 | 60 | 61.9 | 192.0 | 60 | 57.9 | 214.0 |
| light-leak | 11 | 60 | 39.5 | 156.9 | 60 | 68.8 | 217.3 |
| lunar-corona | 93 | 60 | 14.0 | 7.0 | 60 | 53.1 | 193.0 |
| moon-through-cloud | 88 | 60 | 44.8 | 182.4 | 60 | 55.4 | 182.6 |
| moonbow | 13 | 60 | 40.2 | 158.2 | 60 | 49.9 | 271.5 |
| night-street | 93 | 60 | 91.1 | 122.4 | 60 | 62.9 | 197.3 |
| snow-at-night | 151 | 60 | 115.8 | 231.3 | 60 | 119.6 | 233.7 |

## Where each breaks

`bokeh-drift`, the densest honest pair: the CSS version with every layer's disc count multiplied (`?scale=<k>`), and the effect with its `orbs` parameter raised to its maximum. At 4× the CPU is throttled four times by Chrome (`Emulation.setCPUThrottlingRate`), a stand-in for a phone's main thread; the GPU is not slowed, so this finds where the main thread gives out, not the GPU.

| CPU | Version | Discs | Frames a second | Long frames | Main (ms/s) | GPU process (ms/s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1× | CSS | 144 | 60 | 0 | 116.2 | 221.3 |
| 1× | CSS | 288 | 60 | 0 | 139.2 | 235.5 |
| 1× | CSS | 576 | 60 | 0 | 151.0 | 248.8 |
| 1× | CSS | 1152 | 60 | 0 | 318.5 | 551.7 |
| 1× | CSS | 2304 | 28 | 139 | 308.4 | 596.3 |
| 1× | WebGPU | 110 | 60 | 1 | 35.2 | 276.5 |
| 1× | WebGPU | 300 | 60 | 0 | 25.2 | 275.4 |
| 1× | WebGPU | 600 | 60 | 0 | 27.5 | 268.7 |
| 4× | CSS | 144 | 59 | 1 | 182.9 | 223.2 |
| 4× | CSS | 288 | 60 | 0 | 288.6 | 274.7 |
| 4× | CSS | 576 | 60 | 0 | 649.4 | 367.9 |
| 4× | CSS | 1152 | 30 | 149 | 752.5 | 599.6 |
| 4× | CSS | 2304 | 13 | 65 | 722.1 | 602.0 |
| 4× | WebGPU | 110 | 60 | 0 | 46.3 | 197.8 |
| 4× | WebGPU | 300 | 60 | 0 | 44.2 | 193.9 |
| 4× | WebGPU | 600 | 60 | 0 | 73.8 | 199.5 |


## What the run says

- **At their default sizes every pair holds 60 frames a second on this machine.** Frame rate separates nothing here; main-thread time does.
- **The readings are noisy.** `bokeh-drift`'s CSS version at 144 discs read 80 ms a second of main thread in the pairs and 116 in the breaking-point run. Differences under about a third mean little.
- **WebGPU has a floor; CSS grows with its elements.**
  - A WebGPU effect's page spends 40 to 70 ms a second of main thread on its frame loop, whatever it draws.
  - A CSS version spends about the empty page's 14 plus a share for each animated element.
  - Under about fifty elements CSS is cheaper: `flare-cursor` (13 elements) 24 against 61, `glint-hover` 23 against 43, `bokeh-loader` 29 against 62, `light-leak` 40 against 69.
  - Past a hundred it costs more: `bokeh-drift` 80 against 53, `fireflies` 101 against 56, `focus-pull` 116 against 59, `night-street` 91 against 63.
  - `glitter` is the exception the other way: its shader page spends 238 ms a second on the CPU facet test (story 4.7's finding).
- **A still gradient beats everything.** `ice-halo` and `lunar-corona`'s CSS versions do not animate and cost the empty page's floor on both threads (12 to 14 ms of main thread, 6 to 7 of GPU process), against 51 to 53 and 185 to 193 for the shaders.
- **The GPU process pays for any motion either way.** 110 to 240 ms a second for an animated CSS version, 120 to 270 for a WebGPU one. It does not decide between them on this machine.
- **Where each breaks** (`bokeh-drift`):
  - At full CPU speed, CSS holds 60 frames a second up to 576 discs. At 1 152 it still holds 60, but at 319 ms a second of main thread and 552 of GPU process. At 2 304 it falls to 28.
  - With the CPU throttled four times, CSS's main thread passes 650 ms a second at 576 discs. It falls to 30 frames a second at 1 152 and 13 at 2 304.
  - WebGPU's main thread does not grow with the orbs: 25 to 35 ms a second from 110 to 600 at full speed, and 44 to 74 throttled, at 60 frames a second throughout.
  - So CSS gives out at about a thousand discs here, and at a few hundred on a phone-speed main thread. WebGPU's limit is the GPU, which 600 orbs (the parameter's maximum) did not reach on this Mac.
- **The throttled WebGPU rows read less GPU-process time (194 to 200) than the full-speed ones (269 to 277).** This is not explained. It may be fewer frames submitted per vsync when the page's script runs slower, but the frame counter shows 60 in both.

**Verdict.**

- **Small counts (under about fifty soft discs, a glint, a leak):** CSS costs less main thread than any WebGPU page and looks close enough where 7.4 called it honest.
- **Dense fields:** WebGPU is cheaper on the main thread and holds that as the field grows. Once CSS passes a few hundred animated discs it is the one that drops frames on a slower CPU.
- **Not answered here:** the integrated laptop and the phones (8.2). Throttling slows the main thread but not the GPU, so it cannot show where WebGPU gives out.
