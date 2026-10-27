#include "fullscreen.wgsl"
#include "circular-params.wgsl"

// Circular separable convolution (story 3.4; Garcia, "Circular separable convolution depth of
// field", SIGGRAPH 2017 Talks; Niemitalo, "Circularly symmetric convolution and lens blur", 2018).
//
// A complex Gaussian g(x) = exp(-a x²) (cos(b x²) + i sin(b x²)) is separable, and g(x) g(y) is
// circularly symmetric: exp(-a r²) (cos(b r²) + i sin(b r²)). A weighted sum of the real and
// imaginary parts of a few of them, with real weights A and B,
//
//   disc(r) ≈ Σ_k A_k Re(g_k(x) g_k(y)) + B_k Im(g_k(x) g_k(y))
//
// is a flat disc with a soft edge at r ≈ EDGE. So each component costs one horizontal pass, which
// convolves each channel with the complex 1D kernel, and one vertical pass multiplies by the
// vertical kernel (complex) and folds the components together with A and B.
//
//   horizontal (once per component, two targets): (R.re, R.im, G.re, G.im), (B.re, B.im, W.re, W.im)
//   vertical (once, reads every component): Σ_k A_k Re + B_k Im, then rgb / w
//
// W convolves a constant 1 alongside the colour, so it carries the kernel's own weight at the
// pixel: dividing by it normalises wherever taps were dropped, as well as where none were.
//
// The kernel is scaled by the centre pixel's circle of confusion, and a tap counts only where the
// tap's own kernel reaches back to the pixel (a gather standing in for a scatter), as in the
// hexagon. Negative lobes are left in: they carry the fit's ringing, and the energy balances.

@group(0) @binding(0) var<uniform> params: CircularParams;
@group(0) @binding(1) var depth_tex: texture_2d<f32>;
@group(0) @binding(2) var linear: sampler;

// The horizontal pass reads the sharp colour; the vertical pass the two targets per component.
@group(1) @binding(0) var colour_tex: texture_2d<f32>;
@group(1) @binding(1) var h0_rg: texture_2d<f32>;
@group(1) @binding(2) var h0_bw: texture_2d<f32>;
@group(1) @binding(3) var h1_rg: texture_2d<f32>;
@group(1) @binding(4) var h1_bw: texture_2d<f32>;
@group(1) @binding(5) var h2_rg: texture_2d<f32>;
@group(1) @binding(6) var h2_bw: texture_2d<f32>;

// Taps each side of the centre, so 2 * TAPS + 1 per pass.
const TAPS: i32 = 8;
// The kernel runs from -EXTENT to EXTENT in its own units, and its disc's edge is at EDGE: the
// circle of confusion maps to EDGE.
const EXTENT: f32 = 1.2;
const EDGE: f32 = 1.1;

fn coc_at(pixel: vec2f) -> f32 {
  let p = clamp(vec2i(pixel), vec2i(0), vec2i(params.out_size) - 1);
  let z = textureLoad(depth_tex, p, 0).r;
  return min(abs(params.blur * (1.0 - params.focus / max(z, 1e-4))), params.max_radius);
}

/// One component's complex weight at `x`, kernel units: (re, im).
fn kernel(component: vec4f, x: f32) -> vec2f {
  let x2 = x * x;
  let phase = component.y * x2;
  return exp(-component.x * x2) * vec2f(cos(phase), sin(phase));
}

/// Whether a tap `offset` pixels away, whose own circle of confusion is `coc`, reaches the pixel:
/// its kernel spans EXTENT / EDGE times its circle. Soft over a pixel.
fn reaches(coc: f32, offset: f32) -> f32 {
  return clamp(coc * (EXTENT / EDGE) - abs(offset) + 1.0, 0.0, 1.0);
}

fn complex_mul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

struct Horizontal {
  @location(0) rg: vec4f,
  @location(1) bw: vec4f,
}

@fragment fn horizontal(in: FullscreenVarying) -> Horizontal {
  let component = params.components[u32(params.component)];
  let at = in.position.xy;
  let scale = coc_at(at) / EDGE;
  var rg = vec4f(0.0);
  var bw = vec4f(0.0);
  for (var i = -TAPS; i <= TAPS; i++) {
    let x = EXTENT * f32(i) / f32(TAPS);
    let q = at + vec2f(x * scale, 0.0);
    let w = reaches(coc_at(q), x * scale);
    let k = kernel(component, x) * w;
    let c = textureSampleLevel(colour_tex, linear, q / params.out_size, 0.0).rgb;
    rg += vec4f(k * c.r, k * c.g);
    bw += vec4f(k * c.b, k);
  }
  return Horizontal(rg, bw);
}

/// One component's vertical pass at `at`: the 2D complex sum of r, g, b and the weight, folded to
/// real with that component's A and B.
fn vertical_component(component: vec4f, rg_tex: texture_2d<f32>, bw_tex: texture_2d<f32>, at: vec2f, scale: f32) -> vec4f {
  var r = vec2f(0.0);
  var g = vec2f(0.0);
  var b = vec2f(0.0);
  var w = vec2f(0.0);
  for (var i = -TAPS; i <= TAPS; i++) {
    let y = EXTENT * f32(i) / f32(TAPS);
    let q = at + vec2f(0.0, y * scale);
    let k = kernel(component, y) * reaches(coc_at(q), y * scale);
    let uv = q / params.out_size;
    let rg = textureSampleLevel(rg_tex, linear, uv, 0.0);
    let bw = textureSampleLevel(bw_tex, linear, uv, 0.0);
    r += complex_mul(k, rg.xy);
    g += complex_mul(k, rg.zw);
    b += complex_mul(k, bw.xy);
    w += complex_mul(k, bw.zw);
  }
  let fold = component.zw;
  return vec4f(dot(fold, r), dot(fold, g), dot(fold, b), dot(fold, w));
}

fn resolve(sum: vec4f, at: vec2f) -> vec4f {
  // Where almost no tap counted (or the lobes cancelled), the pixel keeps its own colour.
  if (sum.w < 1e-3) {
    return vec4f(textureSampleLevel(colour_tex, linear, at / params.out_size, 0.0).rgb, 1.0);
  }
  return vec4f(sum.rgb / sum.w, 1.0);
}

// One vertical entry point per component count: an automatic layout holds only the targets read.
@fragment fn vertical1(in: FullscreenVarying) -> @location(0) vec4f {
  let at = in.position.xy;
  let scale = coc_at(at) / EDGE;
  let sum = vertical_component(params.components[0], h0_rg, h0_bw, at, scale);
  return resolve(sum, at);
}

@fragment fn vertical2(in: FullscreenVarying) -> @location(0) vec4f {
  let at = in.position.xy;
  let scale = coc_at(at) / EDGE;
  let sum = vertical_component(params.components[0], h0_rg, h0_bw, at, scale) +
    vertical_component(params.components[1], h1_rg, h1_bw, at, scale);
  return resolve(sum, at);
}

@fragment fn vertical3(in: FullscreenVarying) -> @location(0) vec4f {
  let at = in.position.xy;
  let scale = coc_at(at) / EDGE;
  let sum = vertical_component(params.components[0], h0_rg, h0_bw, at, scale) +
    vertical_component(params.components[1], h1_rg, h1_bw, at, scale) +
    vertical_component(params.components[2], h2_rg, h2_bw, at, scale);
  return resolve(sum, at);
}
