import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'light-leak',
  title: 'Light leak',
  epic: '6',
  tier: 'A',
  tags: ['light leak', 'flare', 'film', 'photo', 'hero'],
  summary:
    'Film light leaks over a hero image: soft red, orange and amber light spilling in from the edges and drifting slowly, added to the picture rather than tinting it, and every few seconds a flare sweeping across the frame, a hot streak with its ghosts swinging through the centre. The image is handed to the effect and uploaded as a texture; drop your own photo on it to try it.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'The image as it is, with a warm CSS gradient over one edge.',
    useCases: [
      'A film, music or photography hero with an analogue feel',
      'A slow, warm transition over a still image',
    ],
  },
};
