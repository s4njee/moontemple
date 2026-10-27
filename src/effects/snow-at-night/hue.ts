// The lamp's hue shift, on its own so a page can paint its accents the same colour without loading
// the effect (and its shaders) up front.

export type Rgb = [number, number, number];

/**
 * `colour` turned `degrees` round the colour wheel, keeping its luminance: the matrix of CSS's
 * `hue-rotate()`, so a page can match it in CSS too. A near-white lamp barely changes; a sodium
 * lamp's amber becomes any other hue at the same brightness.
 */
export function rotateHue(colour: Readonly<Rgb>, degrees: number): Rgb {
  if (degrees === 0) return [...colour];
  const a = Math.cos((degrees * Math.PI) / 180);
  const b = Math.sin((degrees * Math.PI) / 180);
  const [r, g, bl] = colour;
  const out: Rgb = [
    (0.213 + 0.787 * a - 0.213 * b) * r +
      (0.715 - 0.715 * a - 0.715 * b) * g +
      (0.072 - 0.072 * a + 0.928 * b) * bl,
    (0.213 - 0.213 * a + 0.143 * b) * r +
      (0.715 + 0.285 * a + 0.14 * b) * g +
      (0.072 - 0.072 * a - 0.283 * b) * bl,
    (0.213 - 0.213 * a - 0.787 * b) * r +
      (0.715 - 0.715 * a + 0.715 * b) * g +
      (0.072 + 0.928 * a + 0.072 * b) * bl,
  ];
  // The matrix can push a saturated colour slightly out of gamut; light is never negative.
  return out.map((v) => Math.max(0, v)) as Rgb;
}
