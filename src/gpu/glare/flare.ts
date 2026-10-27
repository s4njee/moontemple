/*
 * Lens flare ghosts (story 2.7): light reflected between the surfaces of a lens lands as faint
 * images of the aperture strung along the line from the light through the centre of the image.
 * After Hullin et al.'s physically based flares, simplified to what a page can afford: a fixed set
 * of ghosts, each at its own place along that line, its own size and coating tint, drawn as
 * aperture-shaped points through the shared point layer (so a hexagonal lens gives hexagonal
 * ghosts, as it does).
 *
 * Each ghost carries a small share of its light; the shares add to about 4%, so a flare never
 * outshines its light.
 */
import type { PointList } from '../points.ts';

interface Ghost {
  /** Where along the line from the centre to the light: 1 is the light, 0 the centre, negative the far side. */
  at: number;
  /** Radius as a share of the image height. */
  size: number;
  /** Share of the light. */
  share: number;
  /** Anti-reflection coatings tint each ghost. */
  tint: readonly [number, number, number];
}

const GHOSTS: readonly Ghost[] = [
  { at: 0.55, size: 0.018, share: 0.004, tint: [1, 0.7, 0.3] },
  { at: 0.25, size: 0.04, share: 0.005, tint: [0.4, 1, 0.5] },
  { at: -0.15, size: 0.025, share: 0.006, tint: [0.9, 0.4, 1] },
  { at: -0.4, size: 0.07, share: 0.008, tint: [0.35, 0.7, 1] },
  { at: -0.75, size: 0.03, share: 0.005, tint: [1, 0.55, 0.2] },
  { at: -1.1, size: 0.11, share: 0.009, tint: [0.5, 0.45, 1] },
  { at: -1.45, size: 0.015, share: 0.004, tint: [0.6, 1, 0.9] },
];

/** The ghosts' shares added together. */
export const FLARE_SHARE = GHOSTS.reduce((sum, g) => sum + g.share, 0);

/**
 * Adds the ghosts of a light at (x, y) device pixels with total light (r, g, b) to `list`, scaled by
 * `strength` (1 the lens's own). Ghosts are out of focus by nature: each is a disc of its own size.
 */
export function addFlareGhosts(
  list: PointList,
  x: number,
  y: number,
  light: readonly [number, number, number],
  width: number,
  height: number,
  strength = 1,
): void {
  const cx = width / 2;
  const cy = height / 2;
  for (const ghost of GHOSTS) {
    const gx = cx + (x - cx) * ghost.at;
    const gy = cy + (y - cy) * ghost.at;
    const s = ghost.share * strength;
    list.push(
      gx,
      gy,
      ghost.size * height,
      light[0] * ghost.tint[0] * s,
      light[1] * ghost.tint[1] * s,
      light[2] * ghost.tint[2] * s,
    );
  }
}
