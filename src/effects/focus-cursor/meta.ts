import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'focus-cursor',
  title: 'Focus cursor',
  epic: '6',
  tier: 'A',
  tags: ['bokeh', 'pointer', 'depth of field', 'hero'],
  summary:
    'A field of floating lanterns from two metres to sixty, and a lens whose focus follows the pointer: whatever lantern you point at comes sharp, the rest melt into discs, and the focus racks between them the way a camera’s does. Without a pointer it wanders on its own.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still with the focus mid-field; the rack needs the shader.',
    useCases: [
      'A hero that answers the pointer without asking for a click',
      'Photography, film and camera sites',
    ],
  },
};
