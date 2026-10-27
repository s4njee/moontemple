#include "fullscreen.wgsl"
#include "params.wgsl"

// The shaft of light: a beam whose brightness falls off across it as a Gaussian of width `sigma`
// about the axis through `origin` along `direction`. The light the air scatters towards the lens
// along a view ray is the integral of that profile along the ray, which has a closed form: the
// distance from the axis squared is a quadratic in the distance along the ray, so the integral is a
// Gaussian's, an error function. Scaled by a Henyey–Greenstein phase for the angle between the
// beam and the way to the lens, so it is brightest where it comes towards you.

@group(0) @binding(0) var<uniform> params: Params;

const _PI: f32 = 3.14159265358979;

/// erfc(x) for x >= 0 (Abramowitz and Stegun 7.1.26, error under 1.5e-7).
fn erfc_positive(x: f32) -> f32 {
  let t = 1.0 / (1.0 + 0.3275911 * x);
  let poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * exp(-x * x);
}

fn erfc(x: f32) -> f32 {
  return select(2.0 - erfc_positive(-x), erfc_positive(x), x >= 0.0);
}

/// The beam profile integrated along a ray from the lens in direction `d` (unit).
fn beam_along(d: vec3f) -> f32 {
  let axis = params.direction;
  let w = -params.origin;
  let dp = d - dot(d, axis) * axis;
  let wp = w - dot(w, axis) * axis;
  // r(t)^2 = a t^2 + b t + c.
  let a = max(dot(dp, dp), 1e-6);
  let b = 2.0 * dot(dp, wp);
  let c = dot(wp, wp);
  let s2 = 2.0 * params.sigma * params.sigma;
  let closest = c - b * b / (4.0 * a);
  let q = a / s2;
  return exp(-closest / s2) * 0.5 * sqrt(_PI / q) * erfc(sqrt(q) * b / (2.0 * a));
}

fn phase(cos_theta: f32) -> f32 {
  let g = params.forward;
  return (1.0 - g * g) / (4.0 * _PI * pow(1.0 + g * g - 2.0 * g * cos_theta, 1.5));
}

@fragment fn beam(in: FullscreenVarying) -> @location(0) vec4f {
  let s = (in.uv - params.centre) * vec2f(params.aspect, 1.0) * params.view_scale;
  let d = normalize(vec3f(s, 1.0));
  // Light travels along the beam's direction and turns towards the lens, along -d.
  let glow = params.haze * beam_along(d) * phase(dot(params.direction, -d));
  return vec4f(params.ground + params.colour * glow, 1.0);
}
