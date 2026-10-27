#include "aperture.wgsl"
#include "points-params.wgsl"

// Energy-conserving points of light (story 2.3): one instanced quad per point, just big enough
// for its circle of confusion, adding the point's light to the scene through aperture.wgsl.
//
// A point is two vec4f: (x, y, radius, unused) in device pixels from the top left, with the signed
// circle-of-confusion radius; then (r, g, b, unused), its light. The light is the point's total:
// summed over the pixels it touches, the scene gains exactly (r, g, b), in focus or out of it.

struct Point {
  at: vec4f,
  light: vec4f,
}

@group(0) @binding(0) var<storage, read> points: array<Point>;
@group(0) @binding(1) var<uniform> params: PointsParams;

struct PointVarying {
  @builtin(position) position: vec4f,
  /// Offset from the point's centre, device pixels.
  @location(0) offset: vec2f,
  @location(1) @interpolate(flat) radius: f32,
  @location(2) @interpolate(flat) light: vec3f,
  @location(3) @interpolate(flat) field: vec2f,
}

@vertex fn points_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> PointVarying {
  let point = points[instance];
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  // Room for the edge ramp and the pixel the smallest point spreads over.
  let half = max(abs(point.at.z), APERTURE_MIN_RADIUS) + 1.5;
  let offset = corners[vertex] * half;
  let pixel = point.at.xy + offset;
  var out: PointVarying;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.offset = offset;
  out.radius = point.at.z;
  out.light = point.light.rgb * params.gain;
  let centre = 0.5 * params.out_size;
  out.field = (point.at.xy - centre) / length(centre);
  return out;
}

@fragment fn points_fs(in: PointVarying) -> @location(0) vec4f {
  // The pixel's centre relative to the point's: the interpolated offset is already at the centre.
  let a = Aperture(
    params.blades, params.rotation, params.curvature, params.unit_area,
    params.rim, params.rings, params.ring_count, params.vignette, in.field);
  let share = aperture_light(in.offset, in.radius, a);
  if (share <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}
