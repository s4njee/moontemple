#include "fullscreen.wgsl"
#include "params.wgsl"

// The night behind the orbs: a dark ground and the glow of the light in haze. A stand-in for story
// 2.8's closed-form in-scattering: a narrow and a wide falloff with distance, in image heights.

@group(0) @binding(0) var<uniform> params: Params;

@fragment fn haze(in: FullscreenVarying) -> @location(0) vec4f {
  let q = vec2f(in.uv.x * params.aspect, in.uv.y);
  let d = length(q - vec2f(params.light_pos.x * params.aspect, params.light_pos.y));
  let near = 1.0 / pow(1.0 + (d / 0.07) * (d / 0.07), 1.5);
  let wide = 1.0 / (1.0 + (d / 0.32) * (d / 0.32));
  let glow = params.haze * params.light * (0.5 * near + 0.08 * wide);
  return vec4f(params.ground + params.glow_colour * glow, 1.0);
}
