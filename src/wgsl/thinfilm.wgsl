// Thin-film interference (story 9.6): the colours of a soap film or an oil slick, from light
// reflected off the film's two faces adding in or out of step.
//
// `thin_film` is Light Temple's two-beam chunk (lighttemple/src/shaders/optics.wgsl, `thin_film`),
// copied with its constants made local: the tint of a film over a reflective base at three fixed
// wavelengths, cheap and good for a holographic sheen.
//
// `thin_film_reflectance` is the full Airy sum for one wavelength, which the traced glass needs:
// the share of the light a film of index `nf` and `thickness` nm reflects, between a medium n1 the
// light comes from and n3 beyond, for each polarisation and then averaged. The film does not absorb,
// so what it does not reflect it transmits, and a solid split at its faces still conserves light.
// With thickness 0 it is plain Fresnel from n1 into n3.

const THIN_FILM_PI: f32 = 3.14159265358979;

/// Light Temple's: reflectance tint of a thin film (thickness in nm, index `ior`) over a reflective
/// base, seen at cos(theta) = `cos_v`, at 650, 532 and 450 nm, with the half-wave flip.
fn thin_film(cos_v: f32, thickness: f32, ior: f32) -> vec3f {
  let sin_t2 = (1.0 - cos_v * cos_v) / (ior * ior);
  let cos_t = sqrt(max(1.0 - sin_t2, 0.0));
  let opd = 2.0 * ior * thickness * cos_t;
  let lambda = vec3f(650.0, 532.0, 450.0);
  let phase = 2.0 * THIN_FILM_PI * opd / lambda + THIN_FILM_PI;
  return 0.5 + 0.5 * cos(phase);
}

/// Amplitude reflection coefficients (s, p) at an interface from index n1 into n2.
fn thin_film_coefficients(n1: f32, n2: f32, cos_i: f32, cos_t: f32) -> vec2f {
  let rs = (n1 * cos_i - n2 * cos_t) / (n1 * cos_i + n2 * cos_t);
  let rp = (n2 * cos_i - n1 * cos_t) / (n2 * cos_i + n1 * cos_t);
  return vec2f(rs, rp);
}

/// Unpolarised reflectance of a non-absorbing film of index `nf`, `thickness` nm thick, between
/// n1 (the light's side) and n3, at incidence cosine `cos1` and wavelength `nm`. 1 past the
/// critical angle into n3. Where the film itself would reflect totally but n3 would not, a film a
/// fraction of a wavelength thick lets the light tunnel through: approximated by the bare
/// interface.
fn thin_film_reflectance(cos1: f32, n1: f32, nf: f32, n3: f32, thickness: f32, nm: f32) -> f32 {
  let s1 = max(0.0, 1.0 - cos1 * cos1);
  let sin3 = (n1 / n3) * (n1 / n3) * s1;
  if (sin3 >= 1.0) {
    return 1.0;
  }
  let c3 = sqrt(1.0 - sin3);
  let sinf = (n1 / nf) * (n1 / nf) * s1;
  if (sinf >= 1.0) {
    let r = thin_film_coefficients(n1, n3, cos1, c3);
    return 0.5 * dot(r, r);
  }
  let cf = sqrt(1.0 - sinf);
  let r12 = thin_film_coefficients(n1, nf, cos1, cf);
  let r23 = thin_film_coefficients(nf, n3, cf, c3);
  let c = cos(4.0 * THIN_FILM_PI * nf * thickness * cf / nm);
  let num = r12 * r12 + r23 * r23 + 2.0 * r12 * r23 * c;
  let den = 1.0 + r12 * r12 * r23 * r23 + 2.0 * r12 * r23 * c;
  let r = num / den;
  return 0.5 * (r.x + r.y);
}
