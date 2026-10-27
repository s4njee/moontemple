import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'rack-focus-transition',
  title: 'Rack-focus transition',
  epic: '6',
  tier: 'A',
  tags: ['bokeh', 'depth of field', 'transition', 'page'],
  summary:
    'A transition between two sections of a page: the outgoing view racks out of focus until its lights are discs, the cut happens inside the blur, and the incoming view focuses out of its own bokeh. Real bokeh in the highlights, which a CSS blur cannot give. Drop two images on it to use your own.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'untested',
    features: { required: [] },
    fallback:
      'A plain cut, or the same transition in CSS: `filter: blur()` and opacity on the two views (experiments/css-rack-focus.html).',
    useCases: [
      'Route changes and slide changes between two hero images or canvases the page already has',
      'Photography and film sites, where a focus pull is the house style',
    ],
  },
};
