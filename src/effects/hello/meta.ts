import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'hello',
  title: 'Hello',
  epic: '1',
  tier: 'B',
  tags: ['scaffold', 'bokeh'],
  summary:
    'The smallest effect: three layers of soft violet orbs drifting in the dark under one haloed light, in one fragment pass through the HDR tail. Every later effect starts from this shape.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the orbs.',
    useCases: ['The template for new effects; a dark ambient hero at a pinch'],
  },
};
