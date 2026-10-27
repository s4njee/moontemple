## How it works

A few hundred lanterns floating between 2 and 60 m in front of an 85 mm lens at f/1.4: a portrait lens, so the depth of field is shallow enough that a change of focus reads at once. Each lantern is a point in metres with its own flame flicker (Fire Temple's capped signal, story 2.9) and its light falls off with its distance squared.

Each frame the effect finds what to focus on. With the pointer over the canvas, it takes the lantern nearest the pointer measured against the size of its disc (so a big blurred lantern is easy to hit and a far sharp one needs aiming); with no lantern within reach, the focus stays. With no pointer, it picks a new lantern on screen every 3.5 seconds. The focus then eases towards that lantern's distance in log distance, with a time constant of a quarter of a second, as a camera's focus motor moves: a rack from 2 m to 60 m takes as long as one from 4 m to 8 m.

The lens is the thin-lens model (`src/gpu/optics/lens.ts`) and the lanterns are drawn by the shared point layer, so a lantern that comes into focus gathers its light into a sharp point rather than gaining any, and one that leaves focus spreads it out.

The plan's story 6.3 first asked for "a background that sharpens around the cursor". A lens cannot do that: focus is a distance, not a place in the frame. This effect does what a lens does instead, and pulls focus to whatever the pointer is on.

## Cost

On an Apple M1 Max: 0.46 ms per frame at 1080p on Dawn ([docs/studies/epic-6.md](../../../docs/studies/epic-6.md)), against 0.42 ms for the HDR tail alone in the same run. The picking is a loop over the lanterns on the CPU each frame; at 260 lanterns it does not show. The download is 20.2 kB gzipped. No Chrome reading yet: the browser pane was hidden when these were built, which throttles the page. Tier A on this machine, provisional.

## Pitfalls

- Picking uses the lantern's disc, so in a dense field the pointer often lands on a big near disc rather than the small far lantern the visitor meant. A real autofocus has the same trouble.
- On touch there is no hover: the focus only follows a finger while it is down, and wanders otherwise.
- Tested with synthetic pointer events (`tests/focus-cursor.test.ts`), not a real hand.

## When to use it

A hero that answers the pointer without asking for a click, on a dark page: photography, film and camera sites above all. Under reduced motion the held frame keeps one lantern in focus.

## References

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981).
