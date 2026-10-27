#include "fullscreen.wgsl"
#include "scatter.wgsl"
#include "params.wgsl"

// The night behind the orbs: a dark ground and the glow of the light in the haze, from the
// closed-form single scattering of scatter.wgsl (story 2.8), scattering forwards by `forward` (0 is
// isotropic). Each pixel is a view ray through a pinhole with a vertical field of view `view_scale`
// (2 tan(fov / 2)); its angle from the light's ray sets how much of the light the fog scatters back
// along it.

@group(0) @binding(0) var<uniform> params: Params;

fn view_ray(uv: vec2f) -> vec3f {
  return normalize(vec3f((uv.x - 0.5) * params.aspect * params.view_scale, (uv.y - 0.5) * params.view_scale, 1.0));
}

@fragment fn haze(in: FullscreenVarying) -> @location(0) vec4f {
  let gamma = acos(clamp(dot(view_ray(in.uv), view_ray(params.light_pos)), -1.0, 1.0));
  let glow = params.light * airlight_forward(gamma, params.haze, params.forward);
  return vec4f(params.ground + params.glow_colour * glow, 1.0);
}
