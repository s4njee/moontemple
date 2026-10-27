#include "fullscreen.wgsl"
#include "sdf.wgsl"
#include "params.wgsl"

// Spectral halo (story 10.2): bright white HDR shapes for the halo to spread, drawn as light in
// scene units (1 is paper white). A ring, a starburst point and the outline of a turning hexagon,
// each a line of constant width in pixels with the same radiance, so the halo is the only thing
// that differs between the methods compared.

@group(0) @binding(0) var<uniform> params: Params;

/// Coverage of a line `half_px` pixels either side of the curve, at `d_px` pixels from it.
fn line(d_px: f32, half_px: f32) -> f32 {
  return clamp(half_px + 0.5 - d_px, 0.0, 1.0);
}

@fragment fn shapes(in: FullscreenVarying) -> @location(0) vec4f {
  let p = in.position.xy;
  let half_px = params.line_px * 0.5;
  var light = 0.0;

  // The ring.
  let ring = abs(length(p - params.ring.xy) - params.ring.z);
  light += line(ring, half_px);

  // The hexagon's outline, turning.
  let q = p - params.hexagon.xy;
  var edge = 1e9;
  for (var i = 0; i < 6; i++) {
    let a0 = params.hexagon.w + f32(i) * 1.0471976;
    let a1 = a0 + 1.0471976;
    let v0 = vec2f(cos(a0), sin(a0)) * params.hexagon.z;
    let v1 = vec2f(cos(a1), sin(a1)) * params.hexagon.z;
    edge = min(edge, sd_segment_2d(q, v0, v1));
  }
  light += line(edge, half_px);

  // The starburst point: a small hot core and six thin rays that fade with distance.
  let s = p - params.star.xy;
  let r = length(s);
  light += params.star.w * clamp(params.star.z + 0.5 - r, 0.0, 1.0);
  let angle = atan2(s.y, s.x);
  let sector = 1.0471976;
  let off = (fract(angle / sector + 0.5) - 0.5) * sector;
  let across = abs(sin(off)) * r;
  let along = r / (params.ring.z * 0.9);
  let ray = clamp(1.0 - across / (half_px + 0.5), 0.0, 1.0) * max(0.0, 1.0 - along);
  light += ray * ray * 1.5 * step(params.star.z, r);

  return vec4f(vec3f(light * params.brightness), 1.0);
}
