import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'halation-text',
  title: 'Halation text',
  epic: '6',
  tier: 'B',
  tags: ['halation', 'typography', 'msdf', 'dom', 'overlay'],
  summary:
    "A headline as film sees a bright sign: the letters lit like a lightbox, a red-orange halo scattered under every stroke as light bounces off the film base, and a faint glow. Drawn over the page's own headline, in its own font and place, while the real text stays in the page; a stand-in sign where there is no page.",
  layout: 'hero',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'The real headline with a warm `text-shadow` (a tight bright one and a wide red one). It is in the markup either way: the canvas only draws light on it.',
    useCases: [
      'A film, theatre or music hero whose title should read as a lit marquee',
      'A night-themed landing headline or an event title card',
    ],
  },
};
