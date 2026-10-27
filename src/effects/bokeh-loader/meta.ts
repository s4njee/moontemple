import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'bokeh-loader',
  title: 'Bokeh loader',
  epic: '6',
  tier: 'A',
  tags: ['bokeh', 'loader', 'progress', 'ui'],
  summary:
    'A loader made of lights: soft out-of-focus orbs that come into focus one after another as progress rises, until they stand as a sharp ring or bar of points. Each orb keeps its light as it shrinks, so a gathered one burns brighter rather than vanishing. Progress is a live parameter; with nothing driving it the loader runs a demo, and it has an indeterminate spinner too.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'A CSS ring of blurred dots whose blur drops as a custom property rises; the energy-conserving brightening needs the shader.',
    useCases: [
      'A loading screen or progress bar on a dark page',
      'An indeterminate spinner that reads as photographed light',
    ],
  },
};
