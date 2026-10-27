#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "params.wgsl"

// Hello: points of light seen out of focus. Each layer is a grid with at most one orb per cell,
// drawn as a flat disc with a slightly brighter rim (the shape a round aperture gives a defocused
// point), drifting slowly upwards. Nearer layers have bigger cells and softer edges. One bright
// light sits above them with a wide halo. No textures and no state: a pure function of time.

@group(0) @binding(0) var<uniform> params: Params;

/// A defocused point at distance `d` from its centre, radius `r`, edge half-width `soft`.
fn disc(d: f32, r: f32, soft: f32) -> f32 {
  let inside = 1.0 - smoothstep(r - soft, r + soft, d);
  let rim = smoothstep(r * 0.55, r, d) * 0.35;
  return inside * (0.65 + rim);
}

/// One layer of orbs at `q` (image heights): `cell` is the grid spacing, `radius` and `soft` are
/// in cells, `drift` in cells a second.
fn layer(q: vec2f, cell: f32, radius: f32, soft: f32, drift: f32, seed: f32) -> f32 {
  let p = q / cell + vec2f(seed * 17.0, params.time * drift);
  let id = floor(p);
  let edge = soft * params.blur + 1.5 * params.pixel / cell;
  var sum = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let c = id + vec2f(f32(i), f32(j));
      let h = hash_2to3(c + seed);
      if (h.z > params.density) {
        continue;
      }
      let centre = c + 0.2 + 0.6 * h.xy;
      let r = radius * (0.7 + 0.6 * fract(h.z * 7.13));
      sum += disc(length(p - centre), r, edge) * (0.35 + 0.65 * fract(h.x * 13.7));
    }
  }
  return sum;
}

@fragment fn orbs(in: FullscreenVarying) -> @location(0) vec4f {
  let q = vec2f(in.uv.x * params.aspect, in.uv.y);
  let violet = vec3f(0.14, 0.06, 1.0);

  var light = vec3f(0.0);
  light += violet * 0.25 * layer(q, 0.07, 0.3, 0.04, 0.06, 3.0);
  light += violet * 0.55 * layer(q, 0.12, 0.32, 0.06, 0.04, 7.0);
  light += violet * 0.9 * layer(q, 0.22, 0.34, 0.1, 0.025, 11.0);
  light *= params.gain;

  // The light above: a small hot core and a wide violet halo.
  let d = length(q - vec2f(params.light_pos.x * params.aspect, params.light_pos.y));
  let core = exp(-d * d / (2.0 * 0.035 * 0.035));
  let halo = exp(-d * d / (2.0 * 0.18 * 0.18));
  light += (vec3f(0.85, 0.9, 1.0) * 6.0 * core + violet * 0.3 * halo) * params.glow;

  return vec4f(light, 1.0);
}
