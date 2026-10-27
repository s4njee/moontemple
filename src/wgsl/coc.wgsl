// coc.wgsl -- the thin-lens circle of confusion (story 2.1), the WGSL twin of src/gpu/optics/lens.ts.
//
//   coc_radius(depth, focus, blur_at_infinity)
//     Signed radius in device pixels of a point at `depth` (scene units) for a lens focused at
//     `focus` whose point at infinity has radius `blur_at_infinity`. Negative nearer than focus.

fn coc_radius(depth: f32, focus: f32, blur_at_infinity: f32) -> f32 {
  return blur_at_infinity * (1.0 - focus / max(depth, 1e-6));
}
