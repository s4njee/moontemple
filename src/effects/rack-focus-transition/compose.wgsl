#include "fullscreen.wgsl"
#include "color.wgsl"
#include "compose-params.wgsl"

// The two views into what a depth-of-field method takes (story 6.8): linear HDR colour and a depth.
//
// Each view arrives display-referred, as an image does: sRGB, highlights clipped at white. Blurred
// as it is, a clipped lamp spreads into a grey smudge, which is all a CSS blur can make of it. So
// each view's brightest pixels are opened back up first, as photo-focus does: above `threshold`
// in their largest channel, light grows steeply to `gain` times at white. Then the views are
// crossfaded by `fade`.
//
// The depth is one plane for the whole frame: a flat view has no depth, and a rack focus through
// a flat page puts all of it out of focus together. With one blur radius everywhere the method is
// a linear filter, so blurring the crossfade is the crossfade of the two blurs: one method pass a
// frame however many views are in it.

@group(0) @binding(0) var<uniform> params: ComposeParams;
@group(0) @binding(1) var view_a: texture_2d<f32>;
@group(0) @binding(2) var view_b: texture_2d<f32>;
@group(0) @binding(3) var linear: sampler;

struct Composed {
  @location(0) colour: vec4f,
  @location(1) depth: f32,
}

/// A view's linear light at `position` (full-resolution pixels), scaled to cover the frame,
/// highlights opened up.
fn light(tex: texture_2d<f32>, position: vec2f) -> vec3f {
  let size = vec2f(textureDimensions(tex));
  let scale = max(params.out_size.x / size.x, params.out_size.y / size.y);
  let uv = (position - 0.5 * params.out_size) / (scale * size) + 0.5;
  let c = srgb_to_linear(textureSampleLevel(tex, linear, uv, 0.0).rgb);
  let k = smoothstep(params.threshold, 1.0, max(c.r, max(c.g, c.b)));
  return c * (1.0 + (params.gain - 1.0) * k * k * k * k);
}

@fragment fn compose(in: FullscreenVarying) -> Composed {
  // At half resolution each pixel averages the four full-resolution pixels under it, each opened
  // up first: averaging a clipped lamp's edge with the dark beside it before opening it up would
  // lose most of its light.
  let n = i32(params.subsample);
  let corner = floor(in.position.xy) * params.subsample;
  var a = vec3f(0.0);
  var b = vec3f(0.0);
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      let p = corner + vec2f(f32(i), f32(j)) + 0.5;
      a += light(view_a, p);
      b += light(view_b, p);
    }
  }
  let k = 1.0 / (params.subsample * params.subsample);
  return Composed(vec4f(mix(a, b, params.fade) * k, 1.0), params.depth);
}

// A wide rack is blurred at half resolution (index.ts): a disc tens of pixels across has no detail
// a full-resolution blur would keep, and a quarter of the pixels with half the radius is several
// times cheaper. This brings it back to full size.
@group(0) @binding(0) var half_res: texture_2d<f32>;
@group(0) @binding(1) var half_sampler: sampler;

@fragment fn upsample(in: FullscreenVarying) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(half_res, half_sampler, in.uv, 0.0).rgb, 1.0);
}
