import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'focus-pull',
  title: 'Focus pull',
  epic: '6',
  tier: 'A',
  tags: ['bokeh', 'scroll', 'depth of field', 'page'],
  summary:
    'Rack focus with the scroll. Each section of a page stands a little farther off than the last, and one lens decides everything: the section crossing the middle of the screen comes sharp, the ones above and below soften with CSS blur, and the lights behind the page swell and shrink in the canvas from the same focus distance. In the gallery the lens racks through the sections on its own.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'The page with every section sharp; the lights are a poster.',
    useCases: [
      'Long-form pages and product stories read one section at a time',
      'Portfolio pages where the scroll should feel like a camera move',
    ],
  },
};
