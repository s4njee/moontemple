// The rgb palette's colour wheel, on its own so a page can paint its accents the same colour
// without loading the effect (and its shaders) up front.

export type Rgb = [number, number, number];

/**
 * A colour round the hue wheel, `turn` in 0..1 from red through green and blue: a cosine wheel,
 * divided by part of its luminance so the green third is not several times brighter than the blue
 * one. What is left of the swing is slow and smooth, a breathing rather than a flash.
 */
export function hueColour(turn: number): Rgb {
  const a = 2 * Math.PI * turn;
  const c: Rgb = [
    0.5 + 0.5 * Math.cos(a),
    0.5 + 0.5 * Math.cos(a - (2 * Math.PI) / 3),
    0.5 + 0.5 * Math.cos(a + (2 * Math.PI) / 3),
  ];
  // Pushed towards the primaries, so the sweep reads as red, green and blue rather than pastel.
  const saturated = c.map((v) => v * v) as Rgb;
  const luminance = 0.2126 * saturated[0] + 0.7152 * saturated[1] + 0.0722 * saturated[2];
  const k = Math.pow(0.15 / Math.max(luminance, 0.02), 0.6);
  return [saturated[0] * k, saturated[1] * k, saturated[2] * k];
}
