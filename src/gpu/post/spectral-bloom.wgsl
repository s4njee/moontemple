#include "fullscreen.wgsl"

// Spectral bloom (story 10.2): light scattered by a lens or a film's base spreads further the
// longer its wavelength, so a white highlight's halo goes white, yellow, orange and red outwards.
// TypeScript side: spectral-bloom.ts, which works out the anchors and their weights.
//
// The scene is RGB, not a spectrum, so each channel's light is taken as spread over the
// wavelengths in the white-balanced proportions w_bc of `spectralSamples`. Band b scatters a share
// s_b of its light into a Gaussian of sigma_b (both growing with the wavelength), and channel c is
//
//   out_c = (1 - S_c) scene_c + sum_b w_bc s_b G(sigma_b) * scene_c,   S_c = sum_b w_bc s_b,
//
// one kernel per channel, a mixture of Gaussians, so every channel keeps its light. Rather than
// blurring once per band, the scene is blurred at a few anchor widths (each at the coarsest pyramid
// level that still holds it smoothly), and each band's weight is split between the two anchors
// round its width so that its variance is kept. The composite then reads the anchors once:
//
//   down       one level of the pyramid: the finer level averaged over each texel's footprint
//              (a 2x2 average when the size halves exactly)
//   composite  sum_m weight_m * anchor_m, drawn over the scene with blending so the scene keeps
//              (1 - S_c) of each channel, through the blend constant

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;

/// The finer level averaged over exactly this texel's footprint: each source texel weighted by
/// how much of it lies inside. When the size halves that is a 2x2 average; when it does not (a
/// 135-row level under a 270 one, say), it still is the mean of what the texel covers, so every
/// source texel's light lands somewhere once. A bilinear tap would skip every other row there.
@fragment fn down(in: FullscreenVarying) -> @location(0) vec4f {
  let src_size = vec2f(textureDimensions(source));
  let dst_size = round(in.position.xy / in.uv);
  let ratio = src_size / dst_size;
  let lo = floor(in.position.xy) * ratio;
  let hi = lo + ratio;
  let last = vec2i(src_size) - 1;
  var sum = vec3f(0.0);
  // At most four texels a side: a level is never more than ~2.3 times its coarser neighbour.
  for (var j = 0; j < 4; j++) {
    let y = floor(lo.y) + f32(j);
    let wy = max(0.0, min(hi.y, y + 1.0) - max(lo.y, y));
    if (wy <= 0.0) { continue; }
    for (var i = 0; i < 4; i++) {
      let x = floor(lo.x) + f32(i);
      let wx = max(0.0, min(hi.x, x + 1.0) - max(lo.x, x));
      if (wx <= 0.0) { continue; }
      let p = clamp(vec2i(i32(x), i32(y)), vec2i(0), last);
      sum += textureLoad(source, p, 0).rgb * (wx * wy);
    }
  }
  return vec4f(sum / (ratio.x * ratio.y), 1.0);
}

/// Up to six anchors; an unused one has weight 0 (and is bound to anchor 0's view).
struct SpectralBloomWeights {
  weights: array<vec4f, 6>,
}

@group(0) @binding(2) var<uniform> bloom: SpectralBloomWeights;
@group(0) @binding(3) var anchor0: texture_2d<f32>;
@group(0) @binding(4) var anchor1: texture_2d<f32>;
@group(0) @binding(5) var anchor2: texture_2d<f32>;
@group(0) @binding(6) var anchor3: texture_2d<f32>;
@group(0) @binding(7) var anchor4: texture_2d<f32>;
@group(0) @binding(8) var anchor5: texture_2d<f32>;

@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  let uv = in.uv;
  var halo = textureSampleLevel(anchor0, linear, uv, 0.0).rgb * bloom.weights[0].rgb;
  halo += textureSampleLevel(anchor1, linear, uv, 0.0).rgb * bloom.weights[1].rgb;
  halo += textureSampleLevel(anchor2, linear, uv, 0.0).rgb * bloom.weights[2].rgb;
  halo += textureSampleLevel(anchor3, linear, uv, 0.0).rgb * bloom.weights[3].rgb;
  halo += textureSampleLevel(anchor4, linear, uv, 0.0).rgb * bloom.weights[4].rgb;
  halo += textureSampleLevel(anchor5, linear, uv, 0.0).rgb * bloom.weights[5].rgb;
  return vec4f(max(halo, vec3f(0.0)), 0.0);
}
