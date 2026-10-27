import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'glass-badge',
  title: 'Glass badge',
  epic: '10',
  tier: 'B',
  tags: ['glass', 'refraction', 'page', 'image', 'pointer'],
  summary:
    "A logo mark or a call to action as a thick piece of bevelled glass, refracting the page's own background image behind it: lines bend and split into colour at its bevels, and it tilts towards the pointer. Drop an image to see it through the glass.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'The background image with the badge as a frosted CSS panel.',
    useCases: ['A logo or badge on a hero image', 'A call to action that catches the light'],
  },
};
