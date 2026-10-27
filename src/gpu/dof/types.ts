/*
 * Depth of field as a post-process (Epic 3): what every method takes and gives, so the lab can
 * swap them and score each against the same reference.
 *
 * A method gets a sharp HDR image and its depth, the lens, and writes the defocused image. It
 * knows nothing about the scene: it sees what a renderer would hand a real post chain.
 */
import type { PassProfiler } from '../profiler.ts';
import type { ApertureSettings } from '../optics/aperture.ts';
import type { ThinLens } from '../optics/lens.ts';

/** The sharp image a renderer hands the post chain. */
export interface DofInput {
  /** Scene-linear HDR colour, `rgba16float`, full resolution. */
  colour: GPUTextureView;
  /** Distance along the view axis, metres, `r32float`, same size. */
  depth: GPUTextureView;
  width: number;
  height: number;
}

export interface DofSettings {
  /** The lens: focus distance and the radius of a point at infinity, device pixels. */
  lens: ThinLens;
  aperture: ApertureSettings;
}

export interface DofMethod {
  /** Shown in the lab and the study. */
  readonly name: string;
  /** Which apertures it can draw: a method that only makes hexagons says so. */
  readonly shapes: 'any' | 'circle' | 'hexagon';
  /** Called before `encode` whenever the input size changes. */
  resize(width: number, height: number): void;
  /** Writes the defocused image to `output` (`rgba16float`, the input's size). */
  encode(
    encoder: GPUCommandEncoder,
    input: DofInput,
    output: GPUTextureView,
    settings: DofSettings,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

export type DofMethodFactory = (device: GPUDevice) => DofMethod;
