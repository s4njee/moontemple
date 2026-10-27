/*
 * Aperture settings (story 2.2) and the CPU side of src/wgsl/aperture.wgsl: the shape's area,
 * which the shader divides by so a point's light is the same whatever its shape.
 */
import type { ParamSchema } from '../../effects/types.ts';

export interface ApertureSettings {
  /** Sides of the polygon; 0 for a circle. */
  blades: number;
  /** Rotation, degrees. */
  rotation: number;
  /** 0 straight blades, 1 a circle. */
  curvature: number;
  /** Bright rim (> 0, soap bubble) or soft edge (< 0). -0.5..1. */
  rim: number;
  /** Onion-ring strength, 0..0.3. */
  rings: number;
  /** Whole number of onion rings. */
  ringCount: number;
  /** Cat's-eye strength, 0..1. */
  vignette: number;
}

/** The controls every bokeh effect shares. Spread into an effect's params. */
export const APERTURE_PARAMS = {
  blades: { type: 'number', default: 0, min: 0, max: 9, step: 1, label: 'blades (0 round)' },
  rotation: { type: 'number', default: 0, min: 0, max: 90, step: 1, label: 'blade rotation (°)' },
  curvature: { type: 'number', default: 0.2, min: 0, max: 1, step: 0.01, label: 'blade curve' },
  rim: { type: 'number', default: 0.15, min: -0.5, max: 1, step: 0.01, label: 'rim' },
  rings: { type: 'number', default: 0, min: 0, max: 0.3, step: 0.01, label: 'onion rings' },
  ringCount: { type: 'number', default: 4, min: 1, max: 8, step: 1, label: 'ring count' },
  vignette: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: "cat's eye" },
} as const satisfies ParamSchema;

/** The shape's radius at angle `theta`, circumradius 1, as the shader has it. */
export function apertureRadius(
  theta: number,
  blades: number,
  rotation: number,
  curvature: number,
): number {
  if (blades < 3) return 1;
  const sector = (2 * Math.PI) / blades;
  const t = theta - rotation;
  const local = t - sector * Math.floor(t / sector) - 0.5 * sector;
  return (Math.cos(0.5 * sector) / Math.cos(local)) * (1 - curvature) + curvature;
}

/** Area of the shape with circumradius 1: half the integral of r(theta)^2. */
export function apertureArea(blades: number, rotation: number, curvature: number): number {
  if (blades < 3) return Math.PI;
  const steps = 720;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const r = apertureRadius(((i + 0.5) / steps) * 2 * Math.PI, blades, rotation, curvature);
    sum += r * r;
  }
  return 0.5 * sum * ((2 * Math.PI) / steps);
}

/** The `Aperture` struct's fields, for a uniform buffer. `field` is set per point by the shader. */
export function apertureUniforms(a: ApertureSettings) {
  const blades = Math.round(a.blades) < 3 ? 0 : Math.round(a.blades);
  const rotation = (a.rotation * Math.PI) / 180;
  return {
    blades,
    rotation,
    curvature: a.curvature,
    unit_area: apertureArea(blades, rotation, a.curvature),
    rim: a.rim,
    rings: a.rings,
    ring_count: Math.max(1, Math.round(a.ringCount)),
    vignette: a.vignette,
  };
}
