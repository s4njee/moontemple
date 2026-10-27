## How it works

A city street at night through an 85 mm lens at f/1.4 focused 1.5 m out, so everything on the street is far behind the focus and becomes a disc of its own colour (`src/gpu/optics/camera.ts` for the projection and the thin-lens circle of confusion, the shared point layer for the discs). The lights, in metres: two lanes of cars, oncoming headlights on the left and receding tail lights on the right, each car two lights 1.5 m apart moving at 11 to 17 m/s and coming round again past 180 m; rows of sodium lamps on both sides every 22 m; fourteen neon signs as short rows of one colour on the shopfronts; traffic lights at 45 m that change every four seconds with a half-second fade; and lit windows a few hundred metres off. Each light's light falls off with its distance squared.

A wet road mirrors every light below its surface at 30% (`wet road`), which is what fills the lower half of the frame in a real photograph of a wet street. The pointer's height pulls the focus, top near and bottom far (0.8 to 120 m), eased with a 0.3-second time constant like a focus ring; without a pointer the focus stays at the setting.

## Cost

On an Apple M1 Max: 0.81 ms per frame at 1080p on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)), against 0.42 ms for the tail alone in the same run; with a dry road, 0.48 ms. The reflections double the lights and their discs overlap, so the extra cost is fill. Building the lights takes about 0.15 ms of CPU a frame. In Chrome, 1.16 ms for one frame on a 1920 × 1080 canvas (`npm run browser-check`, median of three loads; [docs/studies/browser-check.md](../../../docs/studies/browser-check.md)). Tier A on this machine, provisional.

## Pitfalls

- The street is lights only: no buildings, road or cars are drawn, which is right for a street this far out of focus and wrong the moment it is focused on (`focused on the street` shows dots, not a street).
- A real wet road smears each reflection into a vertical streak; these are round discs.
- The traffic lights change with a fade so they never flash; real ones switch, and some LED ones flicker.

## When to use it

A night hero for city, travel, music and nightlife sites. A looped video of a real out-of-focus street is cheap and convincing; this earns its place with the focus pull and resolution independence.

## References

- Martijn Steinrucken (BigWings), _The Drive Home_ (Shadertoy).
