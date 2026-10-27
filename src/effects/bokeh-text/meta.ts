import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'bokeh-text',
  title: 'Bokeh text',
  epic: '4',
  tier: 'B',
  tags: ['bokeh', 'typography', 'msdf', 'reveal', 'hero'],
  summary:
    "A headline made of lights: a thousand soft out-of-focus orbs, scattered at many depths, pull into focus and settle onto points inside the letters until the word stands sharp. Each orb keeps its light as its disc shrinks, so the type burns brighter as it resolves. It loops, plays once as a reveal, or follows a progress a page drives; the letters come from Fire Temple's MSDF atlas.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'The headline itself, revealed with a CSS `filter: blur()` that falls to zero and a `text-shadow` glow; the orbs and the brightening as they gather need the shader.',
    useCases: [
      'A reveal for a landing hero or a title card on a dark page',
      'An event, film or launch name that should arrive as photographed light',
    ],
  },
};
