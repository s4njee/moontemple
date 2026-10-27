#include "fullscreen.wgsl"
#include "layers-params.wgsl"

// Layered depth of field (story 3.6): the image cut into slices by circle of confusion, each slice
// blurred by its own amount, and the slices composited back to front.
//
//   extract    one slice at half size: the colour times the slice's weight, and the weight as
//              alpha (premultiplied). The weights are hat functions centred on each slice's blur,
//              so every pixel's weights sum to one and nothing is lost between slices.
//   (blur)     each slice blurred with a Gaussian of sigma = radius / 2, the variance of a disc of
//              that radius (src/gpu/passes/blur.ts).
//   composite  far slices first, then the sharp slice at full size, then near slices over them:
//              out = slice + out * (1 - slice alpha). A blurred near slice spreads its colour and
//              its alpha over what lies behind it, which the gather methods cannot do.
//
// What a near object hid is not in the sharp image, so once the object is blurred and partly see-
// through, the slices behind it have a hole there. An eighth slice fills it: everything not in
// front, blurred as wide as the nearest slice, so the hole shows the background's colours spread
// in from its sides. The background (far and sharp slices) is divided by its own alpha where it
// has any, and falls back to the fill where it has none, before the near slices go over it.
//
// The circle of confusion comes from the depth, or with `tilt_shift` from the pixel's height
// alone: blur growing away from a horizontal band, the miniature look, with no depth at all.

@group(0) @binding(0) var<uniform> params: LayersParams;
@group(0) @binding(1) var colour: texture_2d<f32>;
@group(0) @binding(2) var depth_tex: texture_2d<f32>;
@group(0) @binding(3) var linear: sampler;

const LAYERS: i32 = 7;

/// Signed circle of confusion at a full-size pixel, device pixels.
fn coc_at(pixel: vec2f) -> f32 {
  if (params.tilt_shift > 0.5) {
    let v = pixel.y / params.out_size.y;
    let off = max(abs(v - params.band_centre) - params.band_half, 0.0);
    return params.blur * smoothstep(0.0, params.band_ramp, off) * sign(v - params.band_centre + 1e-6);
  }
  let p = clamp(vec2i(pixel), vec2i(0), vec2i(params.out_size) - 1);
  let z = textureLoad(depth_tex, p, 0).r;
  return params.blur * (1.0 - params.focus / max(z, 1e-4));
}

/// The weight of slice `i` for a pixel with circle of confusion `c`: a hat between its neighbours.
fn slice_weight(i: i32, c: f32) -> f32 {
  let centre = params.centres[i / 4][i % 4];
  if (c <= centre) {
    if (i == 0) {
      return 1.0;
    }
    let below = params.centres[(i - 1) / 4][(i - 1) % 4];
    return clamp((c - below) / (centre - below), 0.0, 1.0);
  }
  if (i == LAYERS - 1) {
    return 1.0;
  }
  let above = params.centres[(i + 1) / 4][(i + 1) % 4];
  return clamp((above - c) / (above - centre), 0.0, 1.0);
}

@group(1) @binding(0) var<uniform> slice: vec4f;

/// One slice at half size. `slice.x` is the slice's index. Four full-size pixels per output pixel,
/// each weighted on its own, so a slice's edge is not decided by one sample.
@fragment fn extract(in: FullscreenVarying) -> @location(0) vec4f {
  let i = i32(slice.x);
  let fill = i == LAYERS;
  let base = floor(in.position.xy) * 2.0;
  var sum = vec4f(0.0);
  for (var j = 0; j < 2; j++) {
    for (var k = 0; k < 2; k++) {
      let pixel = base + vec2f(f32(k), f32(j)) + 0.5;
      let c = coc_at(pixel);
      // The fill takes everything but the near slices.
      var w: f32;
      if (fill) {
        w = 1.0 - slice_weight(0, c) - slice_weight(1, c) - slice_weight(2, c);
      } else {
        w = slice_weight(i, c);
      }
      sum += vec4f(textureLoad(colour, vec2i(pixel), 0).rgb * w, w);
    }
  }
  return sum * 0.25;
}

@group(1) @binding(1) var slice_0: texture_2d<f32>;
@group(1) @binding(2) var slice_1: texture_2d<f32>;
@group(1) @binding(3) var slice_2: texture_2d<f32>;
@group(1) @binding(4) var slice_4: texture_2d<f32>;
@group(1) @binding(5) var slice_5: texture_2d<f32>;
@group(1) @binding(6) var slice_6: texture_2d<f32>;
@group(1) @binding(7) var slice_fill: texture_2d<f32>;

fn over(top: vec4f, under: vec4f) -> vec4f {
  return top + under * (1.0 - top.a);
}

/// Back to front: the far slices (largest blur behind focus first), the sharp slice, the near ones.
/// Slices are numbered from nearest (0) to farthest (6); 3 is in focus and is not blurred.
@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  let uv = in.uv;
  var out = textureSampleLevel(slice_6, linear, uv, 0.0);
  out = over(textureSampleLevel(slice_5, linear, uv, 0.0), out);
  out = over(textureSampleLevel(slice_4, linear, uv, 0.0), out);
  let w = slice_weight(3, coc_at(in.position.xy));
  let sharp = textureLoad(colour, vec2i(in.position.xy), 0).rgb;
  out = over(vec4f(sharp * w, w), out);
  // The background as one opaque layer: its own colour where it has any coverage, the fill where a
  // near object left a hole.
  let fill = textureSampleLevel(slice_fill, linear, uv, 0.0);
  let behind = out.rgb / max(out.a, 1e-4);
  out = vec4f(mix(fill.rgb / max(fill.a, 1e-4), behind, smoothstep(0.0, 0.05, out.a)), 1.0);
  out = over(textureSampleLevel(slice_2, linear, uv, 0.0), out);
  out = over(textureSampleLevel(slice_1, linear, uv, 0.0), out);
  out = over(textureSampleLevel(slice_0, linear, uv, 0.0), out);
  return vec4f(out.rgb, 1.0);
}
