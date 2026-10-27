import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'prism-icosahedron',
  title: 'Prism icosahedron',
  epic: '10',
  tier: 'C',
  tags: ['glass', 'spectral', 'wireframe', 'halo', 'showpiece', 'pointer'],
  summary:
    'The showpiece: a slowly turning icosahedron, its edges a sharp white wire with starbursts at the corners, over a glass body out of focus behind it that bends and splits the horizon into colour, with light gathered at its corners, the whole wrapped in a halo that turns gold, orange and red towards its rim. Drag to turn it.',
  scorecard: {
    compute: false,
    mobile: 'no',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'The poster: the solid at rest, a corner up.',
    useCases: ['A hero for a launch, a product in glass, anything about light'],
  },
};
