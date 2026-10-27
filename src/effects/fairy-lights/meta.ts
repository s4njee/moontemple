import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'fairy-lights',
  title: 'Fairy lights',
  epic: '4',
  tier: 'A',
  tags: ['bokeh', 'hero', 'seasonal', 'twinkle'],
  summary:
    'Strings of small bulbs hanging in sagging curves across the frame at several depths, behind a lens focused close: every bulb is a soft disc, swaying with its string and twinkling on a signal capped below the flash threshold.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'underlay',
    features: { required: [] },
    fallback: 'A still of the strings; a CSS version of a few rows of soft dots is close.',
    useCases: ['A seasonal or festive hero', 'Event, wedding and hospitality sites'],
  },
};
