import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'lens-model',
  title: 'Lens model',
  epic: '2',
  tier: 'A',
  tags: ['building block', 'depth of field', 'bokeh', 'aperture'],
  summary:
    'A night street through a camera lens: two rows of lamps and a railing of small lights receding from half a metre to six hundred, each drawn as the aperture at its own circle of confusion, while the focus walks through them. Every point keeps its light as it blurs; switch that off to see why it matters.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the street in focus at mid-distance.',
    useCases: [
      'Seeing the lens model and the aperture shapes; a building block, not an effect to ship',
    ],
  },
};
