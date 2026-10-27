#include "fullscreen.wgsl"
#include "hexagon-params.wgsl"

// The separable hexagon (story 3.3; White and Barré-Brisebois, SIGGRAPH 2011). Three directions
// 120 degrees apart, `UP`, `DOWN_LEFT` and `DOWN_RIGHT`. A one-sided line blur along two of them
// in turn sweeps out a rhombus with a corner at the pixel; the three rhombi that pairs of them
// make tile a hexagon of circumradius r, its corners at 30, 90, 150... degrees.
//
//   pass 1 (two targets): a = line(colour, UP);  b = a + line(colour, DOWN_LEFT)
//   pass 2:              (line(a, DOWN_LEFT) + line(b, DOWN_RIGHT)) / 3
//
// so a hexagon costs two passes of line blurs instead of a 2D gather. Each line's length is the
// pixel's own circle of confusion. A tap counts only where the tap's own circle reaches back to the
// pixel (a gather standing in for a scatter), which keeps a sharp subject from smearing over a
// blurred background, if not the other way round.

@group(0) @binding(0) var<uniform> params: HexagonParams;
@group(0) @binding(1) var depth_tex: texture_2d<f32>;
@group(0) @binding(2) var linear: sampler;
@group(1) @binding(0) var source_a: texture_2d<f32>;
@group(1) @binding(1) var source_b: texture_2d<f32>;

const UP: vec2f = vec2f(0.0, -1.0);
const DOWN_LEFT: vec2f = vec2f(-0.8660254, 0.5);
const DOWN_RIGHT: vec2f = vec2f(0.8660254, 0.5);
const TAPS: i32 = 16;

fn coc_at(pixel: vec2f) -> f32 {
  let p = clamp(vec2i(pixel), vec2i(0), vec2i(params.out_size) - 1);
  let z = textureLoad(depth_tex, p, 0).r;
  return min(abs(params.blur * (1.0 - params.focus / max(z, 1e-4))), params.max_radius);
}

/// The average of `tex` along `dir` from the pixel to its circle of confusion.
fn line(tex: texture_2d<f32>, at: vec2f, dir: vec2f, radius: f32) -> vec4f {
  if (radius < 0.5) {
    return textureSampleLevel(tex, linear, at / params.out_size, 0.0);
  }
  var sum = vec4f(0.0);
  var weight = 0.0;
  for (var k = 0; k < TAPS; k++) {
    let t = (f32(k) + 0.5) / f32(TAPS) * radius;
    let q = at + dir * t;
    // Only light whose own blur reaches this far may arrive here.
    let w = clamp(coc_at(q) - t + 1.0, 0.0, 1.0);
    sum += textureSampleLevel(tex, linear, q / params.out_size, 0.0) * w;
    weight += w;
  }
  if (weight < 1e-3) {
    return textureSampleLevel(tex, linear, at / params.out_size, 0.0);
  }
  return sum / weight;
}

struct Rhombi {
  @location(0) a: vec4f,
  @location(1) b: vec4f,
}

@fragment fn first(in: FullscreenVarying) -> Rhombi {
  let radius = coc_at(in.position.xy);
  let a = line(source_a, in.position.xy, UP, radius);
  let b = a + line(source_a, in.position.xy, DOWN_LEFT, radius);
  return Rhombi(a, b);
}

@fragment fn second(in: FullscreenVarying) -> @location(0) vec4f {
  let radius = coc_at(in.position.xy);
  let hexagon = line(source_a, in.position.xy, DOWN_LEFT, radius) + line(source_b, in.position.xy, DOWN_RIGHT, radius);
  return vec4f(hexagon.rgb / 3.0, 1.0);
}
