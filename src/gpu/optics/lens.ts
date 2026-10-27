/*
 * The thin-lens model (story 2.1): how big a point's circle of confusion is at a given depth.
 *
 * For a thin lens of focal length f and f-number N focused at distance S1, a point at distance S2
 * images to a disc on the sensor of diameter
 *
 *   c = (f / N) * f / (S1 - f) * |1 - S1 / S2|
 *
 * Everything but the last factor is fixed for a given lens and focus, so the whole model is two
 * numbers: the focus distance, and how big a point at infinity is (`blurAtInfinity`). A point
 * nearer than focus gets a negative radius, a point beyond it a positive one: near-field and
 * far-field bokeh are drawn differently (the near field is flipped through the lens).
 *
 * Two ways in, mapping to the same model: a photographer's (focal length, f-stop, focus distance,
 * sensor) through `lensFromCamera`, or an artist's (focus distance, blur at infinity in pixels)
 * written straight into a `ThinLens`.
 */

export interface ThinLens {
  /** Distance in focus, in scene units (metres for a camera). */
  focus: number;
  /** Radius of a point at infinity's circle of confusion, device pixels. */
  blurAtInfinity: number;
}

export interface CameraSettings {
  /** Focal length, mm. */
  focalLength: number;
  /** f-number (f-stop), e.g. 1.8. */
  fNumber: number;
  /** Focus distance, metres. */
  focusDistance: number;
  /** Sensor height, mm. Default 24 (full frame, landscape). */
  sensorHeight?: number;
  /** Height of the image the sensor maps to, device pixels. */
  imageHeight: number;
}

/** A camera's lens as the two-number model, with the radius in device pixels. */
export function lensFromCamera(camera: CameraSettings): ThinLens {
  const { focalLength: f, fNumber, focusDistance, imageHeight } = camera;
  const sensorHeight = camera.sensorHeight ?? 24;
  const focusMm = Math.max(focusDistance * 1000, f * 1.0001);
  const diameterMm = (f / fNumber) * (f / (focusMm - f));
  return { focus: focusDistance, blurAtInfinity: ((diameterMm / 2) * imageHeight) / sensorHeight };
}

/** Signed circle-of-confusion radius at `depth`, device pixels: negative nearer than focus. */
export function cocRadius(lens: ThinLens, depth: number): number {
  return lens.blurAtInfinity * (1 - lens.focus / Math.max(depth, 1e-6));
}

/** The depth whose circle of confusion has signed radius `radius`, or Infinity past the limit. */
export function depthForCoc(lens: ThinLens, radius: number): number {
  const k = 1 - radius / lens.blurAtInfinity;
  return k <= 0 ? Infinity : lens.focus / k;
}

/** A pinhole projection's focal length in device pixels, for the same camera. */
export function focalLengthPx(
  camera: Pick<CameraSettings, 'focalLength' | 'sensorHeight' | 'imageHeight'>,
): number {
  return (camera.focalLength * camera.imageHeight) / (camera.sensorHeight ?? 24);
}
