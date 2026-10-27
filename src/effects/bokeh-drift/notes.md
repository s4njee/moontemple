## How it works

The look of the reference picture: a lens focused close, half a metre away, with lights far behind it. Every light beyond the focus images to a disc nearly the size of a point at infinity's, so the field is a crowd of discs of similar size, smaller for the nearer ones (`radius = blur at infinity × (1 − focus / depth)`, `src/gpu/optics/lens.ts`).

Each orb is a point in depth between 1.5 and 30 metres, more of them far than near, with a seeded position, colour and brightness. It rises slowly and sways, both divided by its depth, so near orbs move faster, as perspective has them; it wraps round the frame once it has left it. The pointer shifts the whole field by depth for a little parallax, eased so it settles rather than jumps.

The orbs are drawn by the shared point layer (`src/gpu/points.ts`): each disc is the aperture's shape at its circle of confusion, and adds exactly its own light however big it is (`tests/points.test.ts`). An orb's light is set against a disc of a fixed reference size, so pulling the focus or changing the blur spreads the same light wider or gathers it tighter; overlapping discs add, which is what makes a crowd of them look photographed rather than drawn. One much brighter point far away is the light above: overexposed, it bleeds through the bloom.

Behind them, one fullscreen pass draws the night and the light's glow in the haze: a narrow and a wide falloff with distance. It is a stand-in for the closed-form in-scattering of plan story 2.8.

The aperture controls are the shared ones (see `lens-model`): round or polygonal, a bright rim by default, and a light cat's eye that clips the discs towards the corners.

## Cost

Not measured yet. The work is one fullscreen pass and one quad per orb whose fragments cover its disc, so the cost follows the orbs' total area: count × blur². 110 orbs with a blur of 4.5% of the height cover at most about 70% of a square frame's area, 40% of a 16:9 one.

## Pitfalls

- The discs are added light on an opaque night: on a light page this is a dark block, not decoration over the page (plan story 7.5).
- With many large orbs the overlaps add up to a bright haze; the brightness control sets each orb's light, not the field's.
- The orbs are not sorted and need not be: added light commutes.
- The light above is a single point with a disc like the others; it is the bloom, not the disc, that makes it read as overexposed.

## When to use it

A dark hero or section background that moves without asking for attention. Compare it with hologpu's `particle-drift` and with a CSS version of radial gradients before shipping it: a dozen still orbs is a CSS job; the shader earns its place with a hundred overlapping orbs that keep their light, an aperture shape, parallax by depth and a focus that can be pulled.

## References

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981).
- Martijn Steinrucken (BigWings), _The Drive Home_ (Shadertoy) — a night scene made of procedural bokeh.
