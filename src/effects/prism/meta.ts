import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'prism',
  title: 'Prism',
  epic: '9',
  tier: 'B',
  tags: ['glass', 'refraction', 'spectral', 'dispersion', 'light', 'hero', 'science'],
  summary:
    "Newton's experiment in a dark room: a sheet of white light from a slit crosses a little haze, passes through a glass prism and fans out into a spectrum on the wall behind, red bent least and violet most, with faint reflections off the faces. Every ray is traced through the prism wavelength by wavelength, so the band is as wide as the glass makes it: crown, flint or diamond. The prism turns slowly through minimum deviation and the spectrum swings out and back.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the beam, the prism and the spectrum at minimum deviation.',
    useCases: [
      'A hero for physics, optics and science-education pages',
      'A section header for anything about light, colour or spectra',
      'An interactive figure: change the glass or the lamp and watch the band change',
    ],
  },
};
