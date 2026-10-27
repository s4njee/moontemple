import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'glint-hover',
  title: 'Glint hover',
  epic: '6',
  tier: 'A',
  tags: ['glint', 'pointer', 'dom', 'interaction'],
  summary:
    "A star glint on the corner of each button and card the pointer comes near, as light catches a polished edge: a sharp point with four diffraction spikes, brightest on the corner closest to the pointer, twinkling on a signal capped below the flash threshold. Reads the page's own elements; see-through over it.",
  layout: 'cards',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'Nothing: the page works without it. A CSS pseudo-element sparkle on :hover is close.',
    useCases: ['Jewellery, luxury and premium product pages', 'A hover state with some sparkle'],
  },
};
