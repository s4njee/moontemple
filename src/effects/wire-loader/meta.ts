import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'wire-loader',
  title: 'Wire loader',
  epic: '10',
  tier: 'A',
  tags: ['wireframe', 'loader', 'icon', 'glint', 'ui'],
  summary:
    'A small wireframe solid turning slowly, its edges lines of HDR light: the same width everywhere, no brighter where five edges meet, the far side faded rather than gone. A starburst sits on each corner that faces the light and drifts round with the turn, never strobing, and bloom gives it a halo. An icosahedron by default; any Platonic solid. A loader or an icon with no glass body, so it stays cheap.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'An inline SVG of the solid turned by a CSS animation of a few pre-drawn frames, with a drop-shadow glow; no HDR, no faded far side that moves with the turn, no flares.',
    useCases: [
      'A loading indicator on a dark page or app screen',
      'An animated logo mark or section icon for a technical product',
    ],
  },
};
