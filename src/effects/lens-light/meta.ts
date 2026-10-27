import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'lens-light',
  title: 'Lens light',
  epic: '2',
  tier: 'A',
  tags: ['building block', 'flare', 'glare', 'chromatic aberration', 'halation', 'pointer'],
  summary:
    'What a lens does to bright light, each piece on its own control: colour fringes on out-of-focus discs, film halation, diffraction spikes from the blades, ghosts strung through the centre of the frame, and an anamorphic streak. One bright light moves with the pointer among a few others.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the lights with every effect on.',
    useCases: ['Choosing which lens artefacts another effect should have; a building block'],
  },
};
