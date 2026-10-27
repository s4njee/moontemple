/*
 * A camera for scenes of points: a pinhole projection and the thin-lens circle of confusion of the
 * same lens, in device pixels. Metres in, pixels out: x to the right, y down, z ahead.
 *
 *   const camera = lensCamera({ focalLength: 85, fNumber: 1.4, focus: 3, width, height });
 *   const [px, py] = camera.project(x, y, z);
 *   const radius = camera.coc(z);
 */
import { cocRadius, focalLengthPx, lensFromCamera, type ThinLens } from './lens.ts';

export interface LensCameraSettings {
  /** mm, on a full-frame sensor unless `sensorHeight` says otherwise. */
  focalLength: number;
  fNumber: number;
  /** Focus distance, metres. */
  focus: number;
  /** Target size, device pixels. */
  width: number;
  height: number;
  sensorHeight?: number;
  /** Where the optical axis meets the image, in uv. Default the centre. */
  centre?: readonly [number, number];
}

export interface LensCamera {
  readonly lens: ThinLens;
  /** Focal length in device pixels. */
  readonly focalPx: number;
  /** Height of the view at 1 m, metres. */
  readonly viewScale: number;
  project(x: number, y: number, z: number): [number, number];
  /** Signed circle-of-confusion radius at depth `z`, device pixels: negative in front of focus. */
  coc(z: number): number;
  /** Whether a disc of `radius` at (px, py) touches the image. */
  visible(px: number, py: number, radius: number): boolean;
}

export function lensCamera(settings: LensCameraSettings): LensCamera {
  const { width, height } = settings;
  const sensorHeight = settings.sensorHeight ?? 24;
  const camera = {
    focalLength: settings.focalLength,
    fNumber: settings.fNumber,
    focusDistance: settings.focus,
    imageHeight: height,
    sensorHeight,
  };
  const lens = lensFromCamera(camera);
  const focalPx = focalLengthPx(camera);
  const [cu, cv] = settings.centre ?? [0.5, 0.5];
  return {
    lens,
    focalPx,
    viewScale: sensorHeight / settings.focalLength,
    project: (x, y, z) => [cu * width + (x * focalPx) / z, cv * height + (y * focalPx) / z],
    coc: (z) => cocRadius(lens, z),
    visible: (px, py, radius) => {
      const r = Math.abs(radius) + 2;
      return px > -r && px < width + r && py > -r && py < height + r;
    },
  };
}
