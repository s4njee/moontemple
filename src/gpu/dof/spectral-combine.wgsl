#include "fullscreen.wgsl"
#include "combine-params.wgsl"

// Spectral depth of field (story 9.7): the sum of up to eight images of the same shot, each drawn
// at one band's focus, weighted by the band's share of each channel. See spectral-dof.ts.

@group(0) @binding(0) var<uniform> params: CombineParams;
@group(0) @binding(1) var band0: texture_2d<f32>;
@group(0) @binding(2) var band1: texture_2d<f32>;
@group(0) @binding(3) var band2: texture_2d<f32>;
@group(0) @binding(4) var band3: texture_2d<f32>;
@group(0) @binding(5) var band4: texture_2d<f32>;
@group(0) @binding(6) var band5: texture_2d<f32>;
@group(0) @binding(7) var band6: texture_2d<f32>;
@group(0) @binding(8) var band7: texture_2d<f32>;

@fragment fn combine(in: FullscreenVarying) -> @location(0) vec4f {
  let p = vec2i(in.position.xy);
  // Bands past `count` carry a weight of zero; their textures are bound to band 0.
  var sum = textureLoad(band0, p, 0).rgb * params.weights[0].rgb;
  sum += textureLoad(band1, p, 0).rgb * params.weights[1].rgb;
  sum += textureLoad(band2, p, 0).rgb * params.weights[2].rgb;
  sum += textureLoad(band3, p, 0).rgb * params.weights[3].rgb;
  sum += textureLoad(band4, p, 0).rgb * params.weights[4].rgb;
  sum += textureLoad(band5, p, 0).rgb * params.weights[5].rgb;
  sum += textureLoad(band6, p, 0).rgb * params.weights[6].rgb;
  sum += textureLoad(band7, p, 0).rgb * params.weights[7].rgb;
  return vec4f(sum, 1.0);
}
