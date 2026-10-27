#include "fullscreen.wgsl"
#include "wire-composite-params.wgsl"

@group(0) @binding(0) var wire: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: WireComposite;

// The wire's two channels into the scene as light: the core in its colour, the glow in its own.
// Drawn either over the scene with additive blending (`base` is zero) or as the scene's first
// pass, writing `base` as the background under the wire.
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let w = textureLoad(wire, vec2i(in.position.xy), 0).rg;
  return vec4f(params.base.rgb + w.x * params.core + w.y * params.glow, params.base.a);
}
