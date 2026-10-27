/*
 * Comparing two renderings (story 1.9): how far a depth-of-field method is from the reference.
 *
 * Both images are scene-linear HDR, RGBA floats. They are compared as a viewer would see them:
 * each channel through a Reinhard curve, x / (1 + x), and a 2.2 gamma, so an error in a bright
 * highlight counts for what it looks like, not for its radiance. Two numbers:
 *
 *   rmse  root mean square difference of the displayed values, in 8-bit levels (0 to 255).
 *   ssim  mean structural similarity of the displayed luminance over 8 x 8 windows every 4 pixels
 *         (Wang, Bovik, Sheikh and Simoncelli, 2004): 1 is identical, lower is worse. It cares
 *         about shape and contrast rather than level, so it catches a halo or a hard edge that
 *         RMSE spreads thin.
 */

export interface ImageDifference {
  rmse: number;
  ssim: number;
}

/** One linear HDR channel as displayed, 0..1. */
export function displayed(value: number): number {
  const v = Math.max(value, 0);
  return Math.pow(v / (1 + v), 1 / 2.2);
}

function displayedLuminance(rgba: ArrayLike<number>, i: number): number {
  return (
    0.2126 * displayed(rgba[i * 4]!) +
    0.7152 * displayed(rgba[i * 4 + 1]!) +
    0.0722 * displayed(rgba[i * 4 + 2]!)
  );
}

export function compareImages(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  width: number,
  height: number,
): ImageDifference {
  const pixels = width * height;
  let squared = 0;
  for (let i = 0; i < pixels; i++) {
    for (let c = 0; c < 3; c++) {
      const d = 255 * (displayed(a[i * 4 + c]!) - displayed(b[i * 4 + c]!));
      squared += d * d;
    }
  }

  const la = Float64Array.from({ length: pixels }, (_, i) => displayedLuminance(a, i));
  const lb = Float64Array.from({ length: pixels }, (_, i) => displayedLuminance(b, i));
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  let ssim = 0;
  let windows = 0;
  for (let y = 0; y + 8 <= height; y += 4) {
    for (let x = 0; x + 8 <= width; x += 4) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          ma += la[(y + j) * width + x + i]!;
          mb += lb[(y + j) * width + x + i]!;
        }
      }
      ma /= 64;
      mb /= 64;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const da = la[(y + j) * width + x + i]! - ma;
          const db = lb[(y + j) * width + x + i]! - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      }
      va /= 63;
      vb /= 63;
      cov /= 63;
      ssim += ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
      windows++;
    }
  }
  return { rmse: Math.sqrt(squared / (pixels * 3)), ssim: windows > 0 ? ssim / windows : 1 };
}
