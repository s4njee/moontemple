#include "fullscreen.wgsl"
#include "params.wgsl"

// What the lab shows: the reference beside the method with a line between them, either alone, the
// sharp input, or the difference between the method and the reference, four times over.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var sharp: texture_2d<f32>;
@group(0) @binding(2) var method: texture_2d<f32>;
@group(0) @binding(3) var reference: texture_2d<f32>;

@fragment fn display(in: FullscreenVarying) -> @location(0) vec4f {
  let p = vec2i(in.position.xy);
  let m = textureLoad(method, p, 0).rgb;
  let r = textureLoad(reference, p, 0).rgb;
  switch params.view {
    case 1u: {
      return vec4f(m, 1.0);
    }
    case 2u: {
      return vec4f(r, 1.0);
    }
    case 3u: {
      return vec4f(textureLoad(sharp, p, 0).rgb, 1.0);
    }
    case 4u: {
      return vec4f(abs(m - r) * 4.0, 1.0);
    }
    default: {
      let x = in.position.x - params.split * params.out_size.x;
      if (abs(x) < 1.0 * params.dpr) {
        return vec4f(vec3f(0.6), 1.0);
      }
      return vec4f(select(m, r, x < 0.0), 1.0);
    }
  }
}
