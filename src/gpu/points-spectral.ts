import type { LcaBand } from './optics/lca.ts';
import { POINT_FLOATS, PointList } from './points.ts';

/*
 * Longitudinal chromatic aberration on the shared point layer (story 9.7), without touching it:
 * each point is handed to the layer as one sub-point per band (src/gpu/optics/lca.ts), at the same
 * place, with its circle of confusion shifted by the band's pixels and its light weighted by the
 * band's share. The bands' shares sum to white, and the layer keeps each sub-point's light, so
 * each channel keeps its light whatever the aberration.
 *
 *   const bands = lcaBands(lens, focalLength, { lens: 'achromat', amount: 1 }, 8);
 *   const list = new SpectralPointList(bands);
 *   list.push(x, y, cocRadius(lens, z), r, g, b);   // one call per point, as with PointList
 *   list.upload(layer);
 *
 * Three bands (`channels`) is the cheap version, each channel drawn at its own focus; eight
 * wavelengths cost eight sub-points a point, and grade the rim instead of stepping it. The
 * layer's own `chroma.axial` (story 2.4) also draws three channels, in one quad, but scales each
 * channel's focus distance rather than its power, so its shift fades to nothing at infinity where
 * a lens's does not; it is left as it was.
 */

/** A PointList that splits every point into `bands`. */
export class SpectralPointList extends PointList {
  bands: readonly LcaBand[];

  constructor(bands: readonly LcaBand[]) {
    super();
    this.bands = bands;
  }

  /** A point at (x, y) device pixels, 555 nm radius `radius`, total light (r, g, b). */
  override push(x: number, y: number, radius: number, r: number, g: number, b: number): void {
    for (const band of this.bands) {
      const [wr, wg, wb] = band.weight;
      if (r * wr + g * wg + b * wb === 0) continue;
      super.push(x, y, radius + band.shift, r * wr, g * wg, b * wb);
    }
  }
}

/** Splits `count` points of `data` (POINT_FLOATS each, as setPoints takes) into `bands`. */
export function splitPoints(
  data: Float32Array,
  count: number,
  bands: readonly LcaBand[],
  into: SpectralPointList = new SpectralPointList(bands),
): SpectralPointList {
  into.bands = bands;
  into.clear();
  for (let i = 0; i < count; i++) {
    const o = i * POINT_FLOATS;
    into.push(data[o]!, data[o + 1]!, data[o + 2]!, data[o + 4]!, data[o + 5]!, data[o + 6]!);
  }
  return into;
}
