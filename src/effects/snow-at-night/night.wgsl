#include "fullscreen.wgsl"
#include "scatter.wgsl"
#include "params.wgsl"

// The night behind the snow: a dark ground and the lamp's glow in the fog, from the closed-form
// single scattering of scatter.wgsl, through the same pinhole the flakes are projected with.

@group(0) @binding(0) var<uniform> params: Params;

fn view_ray(uv: vec2f) -> vec3f {
  return normalize(vec3f((uv.x - 0.5) * params.aspect * params.view_scale, (uv.y - 0.5) * params.view_scale, 1.0));
}

@fragment fn night(in: FullscreenVarying) -> @location(0) vec4f {
  let gamma = acos(clamp(dot(view_ray(in.uv), view_ray(params.lamp_uv)), -1.0, 1.0));
  let glow = params.glow * airlight(gamma, params.fog);
  return vec4f(params.ground + params.lamp_colour * glow, 1.0);
}
