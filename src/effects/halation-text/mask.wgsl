#include "fullscreen.wgsl"
#include "msdf.wgsl"
#include "mask-params.wgsl"

// The stand-in headline's coverage, from the MSDF atlas (src/gpu/ui/msdf.wgsl, after Fire Temple's
// fire-text mask): 1 inside a glyph, 0 outside, anti-aliased across one canvas pixel. Baked once per
// word and canvas size into the same mask the page's own type is drawn into, so the sign pass reads
// one texture whichever source the text came from. Coverage goes in every channel, alpha included,
// to match the 2D canvas upload (white on transparent).

@group(0) @binding(0) var<uniform> params: MaskParams;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlas_smp: sampler;

@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let p = in.uv * vec2f(params.aspect, 1.0);
  let size = params.origin.z;
  var distance = 1e3;
  for (var i = 0u; i < params.count; i++) {
    let pair = params.glyphs[i / 2u];
    let g = select(pair.xy, pair.zw, (i & 1u) == 1u);
    let local = vec2f((p.x - params.origin.x - g.y * size) / (size * MSDF_ASPECT), (p.y - params.origin.y) / size);
    if (all(local > vec2f(-0.1)) && all(local < vec2f(1.1))) {
      distance = min(distance, msdf_distance(atlas, atlas_smp, u32(g.x), local));
    }
  }
  let ink = msdf_coverage(distance * size, params.pixel);
  return vec4f(ink);
}
