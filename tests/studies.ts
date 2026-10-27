// Extra configurations for the cost studies, beyond "every effect at its defaults and at each
// preset", which `tests/study.test.ts` runs anyway. Keyed by epic. Use these for sweeps that
// answer a research question (how cost grows with a parameter).

export interface StudyConfig {
  effect: string;
  /** Shown in the report, e.g. "count=220". */
  name: string;
  preset?: string;
  params?: Readonly<Record<string, unknown>>;
}

const sweep = (
  effect: string,
  key: string,
  values: readonly (string | number)[],
  fixed: Readonly<Record<string, unknown>> = {},
): StudyConfig[] =>
  values.map((value) => ({
    effect,
    name: [...Object.entries(fixed), [key, value]].map(([k, v]) => `${k}=${String(v)}`).join(' '),
    params: { ...fixed, [key]: value },
  }));

export const STUDY_SWEEPS: Readonly<Record<string, readonly StudyConfig[]>> = {
  '3': [
    // Each method alone (no reference drawn), at subject and background focus; and the reference
    // alone, whose cost is the rays a frame.
    ...sweep('dof-lab', 'method', ['sharp', 'hexagon'], { view: 'method' }),
    ...sweep('dof-lab', 'method', ['sharp', 'hexagon'], { view: 'method', focus: 40 }),
    ...sweep('dof-lab', 'samples', [8, 32], { view: 'reference', rays: 1e9 }),
  ],
  '4': [
    // 4.1: the orbs' cost should follow their total area, count × blur².
    ...sweep('bokeh-drift', 'count', [50, 220, 440]),
    ...sweep('bokeh-drift', 'blur', [0.02, 0.09]),
  ],
};
