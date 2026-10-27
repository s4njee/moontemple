import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'flare-cursor',
  title: 'Flare cursor',
  epic: '6',
  tier: 'A',
  tags: ['flare', 'pointer', 'cursor', 'hero'],
  summary:
    'The pointer as a bright light shining into a lens: a hot point with diffraction spikes, and the ghosts a real lens makes, aperture-shaped and tinted by its coatings, strung along the line from the light through the centre of the frame, swinging round as the pointer moves. An anamorphic streak and film halation are a control away. See-through over the page.',
  layout: 'hero',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'Nothing: the page works without it.',
    useCases: ['A cinematic hero for film, games and music sites', 'A product launch page'],
  },
};
