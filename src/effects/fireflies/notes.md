## How it works

180 fireflies over a meadow at dusk, between 0.5 and 14 m from a 50 mm lens at f/1.4, spread evenly in log distance so near, middle and far each have their share. Each wanders on smooth noise, about a metre each way and a little in depth, and glows once a period of 2.5 to 6.5 seconds: a Gaussian swell and fade 0.35 s wide, with a faint 3% glow between. Its light falls off with its distance squared and goes to the shared point layer: sharp near the plane of focus, discs that swell as it drifts towards the lens.

The pointer's height moves the plane of focus through them, top near and bottom far, eased like a focus ring; without a pointer it stays at the setting (2.5 m).

The plan's story 4.4 asked for GPU particles. A few hundred fireflies built on the CPU cost about 0.13 ms a frame, so the GPU particle system Light Temple plans (its E7-S1) is not needed here.

## Cost

On an Apple M1 Max: 0.44 ms per frame at 1080p on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)), the tail alone; 0.13 ms of CPU a frame. In Chrome, 0.78 ms for one frame on a 1920 × 1080 canvas (`npm run browser-check`, median of three loads; [docs/studies/browser-check.md](../../../docs/studies/browser-check.md)). Tier A on this machine, provisional.

## Pitfalls

- Real fireflies flash in species-specific patterns and sometimes in step with each other; these glow independently and slowly, which is also what keeps them under the flash threshold.
- No meadow is drawn: the fireflies float in a dark blue-green.

## When to use it

A calm evening hero for nature, outdoor and wellness sites, on a dark page.

## References

- Light Temple's plan, story E7-S2 (fireflies as lights), for the lighting half this effect leaves out.
