import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'spectral-halo',
  title: 'Spectral halo',
  epic: '10',
  tier: 'B',
  tags: ['bloom', 'halation', 'spectral', 'halo', 'post', 'hdr'],
  summary:
    'Bright white lines whose halo turns gold, orange and red towards its rim: each wavelength scatters its own share over its own width, red the widest, and the light is moved rather than added, so white in integrates to white out. Switch to a radius per channel, film halation or a plain bloom to see what each one does with the same light.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'The shapes as SVG or CSS with stacked `drop-shadow` filters: a tight white one, a wider amber and a widest dim red. It reads as the same halo at rest, but adds light rather than moving it.',
    useCases: [
      'The halo round a glowing wireframe or line-art hero (the wire-loader and prism-icosahedron of Epic 10)',
      'A post pass for any HDR scene that should look photographed through a lens or on film',
    ],
  },
};
