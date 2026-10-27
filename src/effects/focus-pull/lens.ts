/*
 * The one lens behind the focus pull (story 6.2), shared by the effect and the page: the canvas
 * blurs its lights with it and the page blurs its sections with it, so the two always agree.
 */
import { cocRadius, lensFromCamera, type ThinLens } from '../../gpu/optics/lens.ts';

/** A portrait lens: shallow enough for a pull to read, long enough not to bend the page. */
export const FOCAL_LENGTH = 85;

/** How far away the page's `index`-th section stands, metres: each half again as far as the last. */
export function sectionDepth(index: number): number {
  return 1.5 * Math.pow(1.5, index);
}

/**
 * The focus distance for a scroll `position` in sections (2.5 is halfway from the third section's
 * middle to the fourth's). Between sections it moves in log distance, as a focus ring turns.
 */
export function focusAt(position: number): number {
  return sectionDepth(Math.max(0, position));
}

export function pullLens(focus: number, fNumber: number, heightPx: number): ThinLens {
  return lensFromCamera({
    focalLength: FOCAL_LENGTH,
    fNumber,
    focusDistance: focus,
    imageHeight: heightPx,
  });
}

/**
 * The CSS blur, in CSS pixels, that matches what `lens` does to something at `depth`. CSS blur is a
 * Gaussian's standard deviation, and a disc of radius r has the variance of a Gaussian of sigma
 * r / 2. `devicePixelRatio` takes the lens's device pixels to CSS ones; `cap` keeps a far section
 * from costing more than it shows.
 */
export function cssBlur(lens: ThinLens, depth: number, devicePixelRatio: number, cap = 12): number {
  return Math.min(cap, Math.abs(cocRadius(lens, depth)) / 2 / devicePixelRatio);
}
