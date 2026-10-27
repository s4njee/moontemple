#include "fullscreen.wgsl"

// Halation (story 2.5): film's red halo round bright light. Light that passes through the emulsion
// reflects off the film base and comes back spread out, into the red-sensitive layer above all. As a
// pass on the HDR scene it moves light rather than adding it: each channel keeps (1 - spread) of
// itself and gets back `spread` of its blurred self, so the light in each channel is unchanged and
// the red halo is red light taken from the highlight's own core.
//
//   down       the scene at half size, bilinear (the blur that follows hides the step)
//   composite  drawn over the scene with blending: out = halo * spread + scene * (1 - spread),
//              per channel, the second factor through the blend constant

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;

@fragment fn down(in: FullscreenVarying) -> @location(0) vec4f {
  return textureSampleLevel(source, linear, in.uv, 0.0);
}

@group(0) @binding(2) var<uniform> spread: vec4f;

@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  let halo = textureSampleLevel(source, linear, in.uv, 0.0);
  return vec4f(halo.rgb * spread.rgb, 0.0);
}
