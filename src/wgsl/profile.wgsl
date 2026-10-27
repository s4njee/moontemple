// profile.wgsl -- angular colour profiles (Epic 5): linear RGB against angle, one profile a row of an
// rgba32float texture written by src/gpu/profile-texture.ts from src/gpu/optics/profile.ts. The
// corona, the ice halo and the moonbow are worked out on the CPU and looked up here.
//
//   profile_at(table, row, angle, range) -> vec3f
//     The profile in `row` at `angle`, blended between its two nearest entries; `range` holds the
//     angles of the first and last entries. Zero outside the range. The twin of `profileAt`.

fn profile_at(table: texture_2d<f32>, row: i32, angle: f32, range: vec2f) -> vec3f {
  let t = (angle - range.x) / (range.y - range.x);
  if (!(t >= 0.0 && t <= 1.0)) {
    return vec3f(0.0);
  }
  let n = i32(textureDimensions(table).x);
  let x = t * f32(n - 1);
  let i = min(i32(x), n - 2);
  let f = x - f32(i);
  let a = textureLoad(table, vec2i(i, row), 0).rgb;
  let b = textureLoad(table, vec2i(i + 1, row), 0).rgb;
  return mix(a, b, f);
}
