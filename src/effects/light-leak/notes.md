## How it works

A hero image with film light leaks over it: warm light spilling in from the edges and drifting slowly, and every ten seconds a flare sweeping across the frame. Everything is light added to the picture in linear HDR, never a tint laid over it, so the image stays legible underneath.

**The image is handed to the effect.** A WebGPU canvas cannot read the page's pixels (Fire Temple's backdrop finding), so the effect owns its image: a dropped file is decoded with `createImageBitmap`, scaled down if its long side is over 4096 pixels, and copied into an `rgba8unorm-srgb` texture with `copyExternalImageToTexture`, then mipmapped (`upload` in `index.ts`). It has to be an `ImageBitmap`: an `HTMLImageElement` source works only in Chrome. The sample image is not a photograph. It is a dusk lake drawn once on the GPU when the effect loads (`develop.wgsl`): sky, clouds, a sun half behind the far hills, the lake mirroring them with a glitter path, pines on the shore. It is developed like a camera's JPEG into the same kind of texture, and from then on it goes through the same path a dropped image does.

**Each frame** (`leak.wgsl`):

- `field` draws the leaks at a quarter of the canvas's size. There are four (`LEAKS` in `index.ts`), a big one at the left and smaller ones at the top, right and bottom. Each is a soft ellipse centred just past its edge, so the frame shows only its falling side, in its palette's deep or middle tone, with a hotter yellow core where it enters. One shared domain warp (two three-octave noise fields, drifting slowly) tears every outline, and also varies the glow a little in uneven bands, as light reaching the film edge-on does.
- `compose` fills the HDR scene. It scales the image to cover the frame and runs it backwards through the tail's ACES curve (Narkowicz's fit solved as a quadratic), so with nothing added the image comes out of the tail as it went in. Then it adds the leak field and the flare's veil, a broad warm glow round the flare. Added light lifts the shadows most and is lost in the highlights, which is how leaks look on film. The tail's tonemap rolls off whatever goes past white.
- The flare is a light crossing the upper frame along a slight diagonal, as a lens pans past the sun, alternating direction and height each time. It is drawn with Lens Light's parts: a hot disc and aperture-shaped ghosts strung through the frame centre (`src/gpu/glare/flare.ts`), diffraction spikes and an anamorphic streak (`src/gpu/glare/glare.ts`). Film halation (`src/gpu/post/halation.ts`) and the HDR tail finish the frame.

**Flash safety.** Each leak's brightness and its wander along its edge come from the flicker module's slow signal (`flickerIntensity` and `flickerOffset` in `src/gpu/optics/flicker.ts`), with no shimmer, at `drift` changes a second (0.3 by default, 1 at most). The module caps the rate at four changes a second whatever is asked, so a leak cannot pulse fast enough to flash at any strength. The flare's brightness rises and falls as sin² over the whole crossing (five seconds by default, never under two), so it never switches on at once. A held frame (`FrameTime.still`) shows the leaks at three quarters of their mean brightness, where the clock has them, and no flare.

## Cost

In Chrome on an Apple M1 Max, one 1920 × 1080 frame with the HUD on (`npm run browser-check`, `hud-1080p`) took 2.69 ms of GPU time (median of five runs), against 2.33 ms for `flare-cursor` in the same run. Other jobs were loading the machine heavily at the time (load average 16), and `flare-cursor`'s figure taken on an idle machine is 1.40 ms, so both numbers read high. Drawing the leak field at full size took the same check to 5.9 ms. At a quarter of the size, its domain warp costs about a sixteenth as much. The Dawn study (`npm run study`) is not measured yet, and neither are phones or the bundle size.

Texture memory reads about 41 MB at 1080p in the HUD, against 33 MB for `flare-cursor`. The extra is the sample image (1600 × 1000 at 8 bits with mips, about 8.5 MB) and the quarter-size field (1 MB). A dropped image costs its own size plus a third for mips, up to about 90 MB for a 4096-pixel square. What scales the cost is the canvas's area: the compose pass, the halation and the tail are per pixel, and the flare's passes cost little when it is off screen.

## Pitfalls

- **Display white has no inverse.** ACES reaches 1 only at infinity, so the image is opened back up from at most 0.98, which is 4.5 times white in the scene. A clipped sky therefore stays clipped, and a leak over it disappears into the white. That is right for film, but a leak over a bright image shows mostly in its shadows.
- **The leaks are not composited, they are added.** Over a light, low-contrast image they read as haze rather than as colour. `red burn` and `leak strength` push them, but past about 2 the left edge clips to orange-white.
- **The flare is placed, not traced.** Its ghosts are Lens Light's hand-placed set. Its veil is a Gaussian, not a measured veiling-glare profile.
- **Flash.** Over 22 s at every preset, the analyser found at most one flash a second in any cell and none over a large area. Even at the slider extremes (`leak strength` 3, `drift` 1, `flare strength` 3, a two-second crossing every four seconds) the most was one a second per cell, while the frame's mean luminance swung by about half over the run. The frame's average swings slowly by 5 to 18% at the presets.
- **The image is dropped, not linked.** There is no way yet for a page to give the effect an image other than the canvas's drop event. A site would add one, for example a `setImage(bitmap)` on the instance.
- The sample's foreground grass is a stretched noise and reads as faint vertical streaks at large sizes.

## When to use it

A film, music or photography hero with an analogue feel, or a slow warm transition over a still. It is Tier A on this machine: one quarter-size noise pass and one full-size compose pass before the tail, in the same range as `flare-cursor`. Where WebGPU is missing, a warm CSS radial gradient over one edge of the same image, with `mix-blend-mode: screen`, gives a static leak. A light-leak video overlaid in screen mode is the usual cheap version, but it loops visibly, cannot be tuned and costs megabytes.

## References

- Krzysztof Narkowicz, [_ACES Filmic Tone Mapping Curve_](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/) (2016): the curve the image is passed backwards through.
- Inigo Quilez, [_Domain warping_](https://iquilezles.org/articles/warp/): the torn outlines of the leaks.
- Hullin, Eisemann, Seidel and Lee, _Physically-Based Real-Time Lens Flare Rendering_ (SIGGRAPH 2011): the ghosts, via `flare-cursor`.
- [WCAG 2.3.1, Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html): the limit the leaks' and the flare's timing stay under.
- [`GPUQueue.copyExternalImageToTexture`](https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/copyExternalImageToTexture) on MDN: which sources each browser accepts.
