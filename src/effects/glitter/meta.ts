import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'glitter',
  title: 'Glitter',
  epic: '4',
  tier: 'A',
  tags: ['bokeh', 'glint', 'pointer', 'hero'],
  summary:
    'A sheet of glitter receding from the lens, its thousands of tiny facets each tilted its own way: a facet flashes only when it mirrors the light into the lens, so a moving light sends a ripple of sparks across it, sharp where the sheet is in focus and soft discs where it is not.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the sheet with a band of sparks.',
    useCases: ['Fashion, beauty, celebration and jewellery heroes', 'A product reveal'],
  },
};
