import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'lamp-in-fog',
  title: 'Lamp in fog',
  epic: '5',
  tier: 'A',
  tags: ['fog', 'light', 'night', 'backdrop', 'hero', 'ambient'],
  summary:
    'A street lamp on a foggy night: the halo round its head, the cone of light under the shade standing in the fog, and the bright pool where the cone meets the wet road, with the fog drifting slowly through the beam. Both the halo and the cone are single scattering computed in closed form for each pixel, not painted on. Dark and slow enough to sit behind text.',
  layout: 'backdrop',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'untested',
    features: { required: [] },
    fallback: 'A still of the lamp in the fog; it hardly moves, so the still loses little.',
    useCases: [
      'A dark backdrop behind an article or a quiet landing page',
      'Night, noir, mystery and travel sites',
      'A row of lamps receding as a section divider or a long hero',
    ],
  },
};
