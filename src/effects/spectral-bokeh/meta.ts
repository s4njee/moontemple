import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'spectral-bokeh',
  title: 'Spectral bokeh',
  epic: '9',
  tier: 'B',
  tags: ['bokeh', 'spectral', 'chromatic aberration', 'depth of field', 'hero', 'ambient'],
  summary:
    'White lights at many depths through a fast lens whose focus depends on the wavelength. Every disc is drawn once per wavelength, each at its own focus, so out-of-focus lights fringe the way real lenses make them: magenta rims in front of focus, green behind, swapping sides as the focus slowly racks through the field. Switch to a singlet for red and blue fringes, or over-correct it for the red rim behind focus.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the lights with the focus mid-field.',
    useCases: [
      'A dark hero for photography, lens and camera sites',
      'An interactive figure about chromatic aberration: change the glass and watch the rims swap',
    ],
  },
};
