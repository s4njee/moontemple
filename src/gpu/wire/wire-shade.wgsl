// The wireframe's shade for the stroke renderer (`src/gpu/strokes.ts`, max blending; story 10.1).
//
// A segment's record: `a` is (level at p0, level at p1, unused, unused); `b` is unused. The level
// carries the edge's front-or-hidden fade and the depth cue, and runs linearly along the edge, so
// every edge meeting at a vertex arrives there with that vertex's own level.
//
// Red is the core: a line `width` device pixels wide, box-filtered across by a Gaussian of
// `sigma` pixels. Its integral across the line is exactly `width` times the level, whatever the
// edge's length or angle, so light per unit length is the same on every edge: a long edge carries
// light in proportion to its length and its pixels are as bright as a short edge's. Green is a
// tight glow, (1 + (d / r)^2)^-2, out to four glow radii.
//
// Both fall off with the distance to the segment, round at its ends, and the layer keeps the
// maximum: at a vertex where five edges meet, the pixel is as bright as the brightest edge alone,
// never their sum, so joints do not double.

fn stroke_level(s: Stroke) -> f32 {
  return max(s.a.x, s.a.y);
}

fn stroke_pad(s: Stroke) -> f32 {
  let core = 0.5 * params.width + 3.0 * params.sigma;
  return max(core, params.glow_on * 4.0 * params.glow_radius) + 1.0;
}

fn stroke_shade(s: Stroke, level: f32, at: StrokePoint) -> vec4f {
  let l = mix(s.a.x, s.a.y, at.t);
  let k = 1.0 / (params.sigma * 1.4142136);
  let h = 0.5 * params.width;
  let d = at.distance;
  let core = 0.5 * (stroke_erf((h - d) * k) + stroke_erf((h + d) * k));
  let q = d / params.glow_radius;
  let glow = params.glow_on / ((1.0 + q * q) * (1.0 + q * q));
  return vec4f(l * core, l * glow, 0.0, 0.0);
}
