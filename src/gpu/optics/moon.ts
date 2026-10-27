/*
 * The moon as a light source (Epic 5): its size on screen, and the CPU twin of src/wgsl/moon.wgsl
 * for tests. See the WGSL for the model.
 */

/** The moon's mean angular radius, radians (0.259 degrees). */
export const MOON_ANGULAR_RADIUS = 0.00452;

/**
 * The moon's radius in pixels for a camera whose view is `viewScale` tall at one metre
 * (2 tan(fov / 2); 24 / focal length for a full-frame lens) on a canvas `heightPx` tall.
 */
export function moonRadiusPx(viewScale: number, heightPx: number): number {
  return (MOON_ANGULAR_RADIUS / viewScale) * heightPx;
}

const MARIA: readonly [number, number, number, number][] = [
  [-0.28, -0.38, 0.28, 0.32],
  [0.18, -0.36, 0.17, 0.3],
  [0.34, -0.08, 0.2, 0.28],
  [0.68, -0.22, 0.11, 0.3],
  [-0.56, 0.02, 0.32, 0.26],
  [-0.14, 0.38, 0.18, 0.22],
];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function moonAlbedo(x: number, y: number): number {
  let a = 1;
  for (const [mx, my, r, depth] of MARIA) {
    const d = Math.hypot(x - mx, y - my) / r;
    a -= depth * (1 - smoothstep(0.55, 1.15, d));
  }
  return Math.max(a, 0.62);
}

/** Relative radiance at (x, y) in disc radii, untilted; 0 off the disc. */
export function moonRadiance(x: number, y: number, phase: number): number {
  const r2 = x * x + y * y;
  if (r2 >= 1) return 0;
  const nz = Math.sqrt(1 - r2);
  const a = 2 * Math.PI * phase;
  const mu0 = Math.max(x * Math.sin(a) - nz * Math.cos(a), 0);
  const lit = (2 * mu0) / (mu0 + Math.max(nz, 1e-3));
  return moonAlbedo(x, y) * Math.max(lit, 0.0008);
}

/** The moon's total light relative to a flat, fully lit disc of albedo 1: its brightness by phase. */
export function moonLight(phase: number, samples = 200): number {
  let sum = 0;
  let count = 0;
  for (let j = 0; j < samples; j++) {
    for (let i = 0; i < samples; i++) {
      const x = ((i + 0.5) / samples) * 2 - 1;
      const y = ((j + 0.5) / samples) * 2 - 1;
      if (x * x + y * y >= 1) continue;
      sum += moonRadiance(x, y, phase);
      count++;
    }
  }
  return sum / count;
}
