# Live versus baked

Story 8.3. `bokeh-drift` and `night-street` as the shader and as looping video, on this machine (Apple M1 Max), 2026-10-29.

**The loops.** Each effect was rendered on Dawn at 1920 × 1080, 30 frames a second, for 12 seconds, and the last 2 were cross-faded over the first so the 10-second loop has no seam (`experiments/live-vs-baked.test.ts`). That lossless loop was encoded with ffmpeg: H.264 (x264, CRF 23, slow), VP9 (CRF 33), and AV1 (SVT-AV1, CRF 35) in 8 and 10 bits. SSIM is the decoded video against the lossless loop, at 1080p.

**Playback.** Each case filled a 1920 × 1080 window in headless Chrome for 6 seconds (`experiments/live-vs-baked.mjs`, after `css-fallbacks-cost.mjs`): main thread from Chrome's Performance metrics; GPU process the union of its main and compositor threads' top-level tasks from a trace; media the threads named for media or decoding. All in milliseconds per second of running.

The empty page costs 13.0 ms/s of main thread and 9.3 ms/s of GPU process at 61 frames a second; the rows below include it.

| Effect | As | Download | Bit rate | SSIM | Frames a second | Main thread (ms/s) | GPU process (ms/s) | Media (ms/s) | Video frames decoded a second, dropped |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| bokeh-drift | the shader | 27 kB of code, gzipped |  |  | 60 | 55.6 | 157.1 | 0.0 |  |
| bokeh-drift | 1080p h264 | 1124 kB | 920 kbit/s | 0.9937 | 60 | 14.5 | 55.3 | 11.0 | 30, 0 |
| bokeh-drift | 1080p vp9 | 523 kB | 429 kbit/s | 0.9938 | 60 | 13.3 | 44.3 | 10.8 | 30, 0 |
| bokeh-drift | 1080p av1 | 302 kB | 248 kbit/s | 0.9948 | 60 | 21.7 | 35.6 | 31.2 | 30, 0 |
| bokeh-drift | 1080p av1-10bit | 287 kB | 235 kbit/s | 0.9964 | 60 | 12.3 | 34.2 | 27.0 | 30, 0 |
| bokeh-drift | 720p h264 | 612 kB | 501 kbit/s | 0.9904 | 60 | 12.8 | 39.1 | 9.9 | 30, 0 |
| bokeh-drift | 720p vp9 | 308 kB | 253 kbit/s | 0.9904 | 60 | 10.9 | 34.5 | 8.3 | 30, 0 |
| bokeh-drift | 720p av1 | 189 kB | 155 kbit/s | 0.9915 | 60 | 15.7 | 32.7 | 26.1 | 30, 0 |
| bokeh-drift | 720p av1-10bit | 182 kB | 149 kbit/s | 0.9933 | 60 | 19.3 | 39.0 | 25.9 | 30, 0 |
| night-street | the shader | 25 kB of code, gzipped |  |  | 60 | 61.3 | 318.2 | 0.0 |  |
| night-street | 1080p h264 | 1253 kB | 1027 kbit/s | 0.9869 | 60 | 13.4 | 43.2 | 10.7 | 30, 0 |
| night-street | 1080p vp9 | 784 kB | 642 kbit/s | 0.9923 | 60 | 13.0 | 42.3 | 10.0 | 30, 0 |
| night-street | 1080p av1 | 539 kB | 442 kbit/s | 0.9934 | 60 | 15.0 | 32.1 | 28.6 | 30, 0 |
| night-street | 1080p av1-10bit | 532 kB | 436 kbit/s | 0.9952 | 60 | 13.9 | 39.6 | 32.1 | 30, 0 |
| night-street | 720p h264 | 665 kB | 545 kbit/s | 0.9851 | 60 | 16.3 | 55.3 | 12.5 | 30, 0 |
| night-street | 720p vp9 | 479 kB | 392 kbit/s | 0.9896 | 60 | 13.0 | 44.8 | 10.6 | 30, 0 |
| night-street | 720p av1 | 328 kB | 269 kbit/s | 0.9910 | 60 | 17.0 | 34.0 | 28.4 | 30, 0 |
| night-street | 720p av1-10bit | 323 kB | 265 kbit/s | 0.9930 | 60 | 15.0 | 34.9 | 25.9 | 30, 0 |

## What the run says

- **The shader is the smaller download by ten to forty times.**
  - The effect's own code is 25 to 27 kB gzipped.
  - A ten-second 1080p loop is 287 kB in 10-bit AV1, 523 to 784 kB in VP9, and 1.1 to 1.25 MB in H.264.
  - At 720p it is 182 to 665 kB.
  - A loop longer than ten seconds costs proportionally more; the shader never repeats.
- **The video is cheaper to play.**
  - Main thread: every loop sits at about the empty page's 13 ms a second (12 to 22). The shader pages take 56 to 61, for the effect's script and its frame loop.
  - GPU process: 32 to 55 ms a second for a loop, against 157 for `bokeh-drift` and 318 for `night-street`, whose discs overdraw more.
  - Decoding: 8 to 13 ms a second on the media threads for H.264 and VP9, and 26 to 32 for AV1. The M1 has no AV1 decoder in hardware (the M3 and later do), so AV1 is decoded in software here.
  - No loop dropped a frame. A loop plays at 30 frames a second where the shader draws 60.
- **The 8-bit codecs band the halos.**
  - The effect dithers its output, and every 8-bit encode removes the dither and steps the smooth falloff round the bright light into rings, visible on a dark screen.
  - 10-bit AV1 at the same rate keeps most of the gradient and scores the best SSIM of all (0.9964 and 0.9952 at 1080p).
  - That is the encoding to ship, with H.264 for browsers without AV1.
- **The loop needs a seam hidden.**
  - The last two seconds are cross-faded over the first, and the step across the loop point is then an ordinary frame's step: PSNR 42.7 against 42.5 to 42.8 elsewhere in `bokeh-drift`, and 21 against 20 to 39 in `night-street`.
  - During the fade, `night-street`'s traffic shows double, the cars of two moments half-transparent.
- **What the video loses:**
  - Interaction: `night-street`'s pointer focus pull, its subject, and `bokeh-drift`'s parallax.
  - Resolution: the loop is 1080p however large the screen, so a 2× display gets it upscaled, while the shader draws at the canvas's own pixels.
  - Framing: the shader composes for any aspect, while the video is cropped to fill a phone held upright.
  - Range: the shader can use the HDR canvas.
  - Parameters: every change of colour, count or focus is a new encode, and the poster is a frame of it rather than a frame the effect chose.
- **What it gains:** it plays in any browser without WebGPU, and needs no shader compile on load.

**Verdict.**

- **`bokeh-drift`:** a backdrop that answers nothing, so a 10-bit AV1 loop (about 290 kB) with an H.264 fallback is a fair stand-in, and better than the poster as its no-WebGPU fallback.
- **`night-street`:** keep the shader, because the focus pull is the point; the loop is its fallback.

All of this is on one machine. A phone without an AV1 decoder in hardware would spend more on the AV1 loops, and its battery would notice; the H.264 loop is the safe one there.
