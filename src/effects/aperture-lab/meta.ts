import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'aperture-lab',
  title: 'Aperture lab',
  epic: '4',
  tier: 'A',
  tags: ['building block', 'bokeh', 'aperture', 'pointer'],
  summary:
    'Every aperture shape and aberration side by side in time: a grid of lights far behind the focus and a row close in front of it, all drawn through one lens whose aperture the pointer chooses, left to right, and whose f-number it sets, top to bottom. Odd blade counts show the near row flipped.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A contact sheet of the apertures.',
    useCases: ['Choosing an aperture for another effect; the page the notes link to'],
  },
};
