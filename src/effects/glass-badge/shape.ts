/*
 * The badge's solid (story 10.7): a convex outline extruded into a slab, its front edge bevelled,
 * as planes for the shared glass tracer (src/wgsl/glass.wgsl). Units are pixels; the badge's
 * centre is the origin, x right, y down, z towards the viewer.
 */
import type { Plane } from '../../gpu/optics/glass.ts';

export const SHAPES = ['hexagon', 'octagon', 'shield', 'pill', 'diamond'] as const;
export type BadgeShape = (typeof SHAPES)[number];

/** The outline's corners, counter-clockwise on screen, for a badge `radius` px across its middle. */
export function outline(shape: BadgeShape, radius: number): [number, number][] {
  const ring = (n: number, turn: number, sx = 1, sy = 1) =>
    Array.from({ length: n }, (_, i) => {
      const a = turn + (2 * Math.PI * i) / n;
      return [Math.cos(a) * radius * sx, Math.sin(a) * radius * sy] as [number, number];
    });
  switch (shape) {
    case 'octagon':
      return ring(8, Math.PI / 8);
    case 'diamond':
      return ring(4, 0, 1.25, 0.8);
    case 'pill':
      // A wide rounded bar, its ends as half-octagons.
      return [
        ...ring(8, -Math.PI / 2 + Math.PI / 8)
          .slice(0, 4)
          .map(([x, y]) => [x * 0.42 + radius * 0.85, y * 0.42] as [number, number]),
        ...ring(8, Math.PI / 2 + Math.PI / 8)
          .slice(0, 4)
          .map(([x, y]) => [x * 0.42 - radius * 0.85, y * 0.42] as [number, number]),
      ];
    case 'shield':
      return [
        [radius * 0.85, -radius * 0.8],
        [radius * 0.85, radius * 0.1],
        [0, radius],
        [-radius * 0.85, radius * 0.1],
        [-radius * 0.85, -radius * 0.8],
      ];
    default:
      return ring(6, Math.PI / 6);
  }
}

/**
 * The planes of the outline extruded `thickness` px deep (front face at z = thickness / 2), with
 * each side's front edge cut by a bevel `bevel` px wide at `angle` radians from the front: the
 * bevels are where the badge refracts most. At most 9 sides: 2n + 2 planes, and the tracer holds 20.
 */
export function badgePlanes(
  corners: readonly [number, number][],
  thickness: number,
  bevel: number,
  angle: number,
): Plane[] {
  const n = corners.length;
  if (n > 9) throw new Error('glass badge: at most 9 sides');
  const half = thickness / 2;
  const planes: Plane[] = [
    [0, 0, 1, half],
    [0, 0, -1, half],
  ];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = corners[i]!;
    const [x1, y1] = corners[(i + 1) % n]!;
    // Outward normal of the edge, for either winding: the side away from the centre.
    let nx = y1 - y0;
    let ny = -(x1 - x0);
    const len = Math.hypot(nx, ny);
    nx /= len;
    ny /= len;
    let d = nx * x0 + ny * y0;
    if (d < 0) {
      nx = -nx;
      ny = -ny;
      d = -d;
    }
    planes.push([nx, ny, 0, d]);
    if (bevel > 0) {
      // The bevel passes through the front face `bevel` px in from the side, tilted `angle`.
      const bx = nx * Math.sin(angle);
      const by = ny * Math.sin(angle);
      const bz = Math.cos(angle);
      planes.push([bx, by, bz, bx * nx * (d - bevel) + by * ny * (d - bevel) + bz * half]);
    }
  }
  return planes;
}
