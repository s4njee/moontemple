// Extra configurations for the cost studies, beyond "every effect at its defaults and at each
// preset", which `tests/study.test.ts` runs anyway. Keyed by epic. Use these for sweeps that
// answer a research question (how cost grows with a parameter).

/** Every method in src/gpu/dof/index.ts, listed here so the study needs no GPU module to load. */
const DOF_METHOD_IDS = [
  'sharp',
  'hexagon',
  'gather',
  'circular',
  'sprites',
  'layers',
  'tilt-shift',
];

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
    ...sweep('dof-lab', 'method', DOF_METHOD_IDS, { view: 'method' }),
    ...sweep('dof-lab', 'method', DOF_METHOD_IDS, { view: 'method', focus: 40 }),
    ...sweep('dof-lab', 'samples', [8, 32], { view: 'reference', rays: 1e9 }),
  ],
  '9': [
    // 9.4: the glass body's cost by sampling and trace resolution; 9.5: caustics traced or not.
    ...sweep('glass-solid', 'sampling', ['spectral', 'three-channel']),
    ...sweep('glass-solid', 'resolution', [0.25, 0.5, 1]),
    ...sweep('glass-solid', 'caustics', ['off', 'stand-in', 'traced']),
  ],
  '10': [
    // 10.8: each piece of the showpiece on its own, by switching the others off.
    ...sweep('prism-icosahedron', 'halo', [0, 0.45]),
    ...sweep('prism-icosahedron', 'focus', [0, 0.035]),
    ...sweep('prism-icosahedron', 'resolution', [0.25, 0.5, 1]),
    ...sweep('prism-icosahedron', 'flares', [0, 0.9]),
  ],
  '4': [
    // 4.1: the orbs' cost should follow their total area, count × blur².
    ...sweep('bokeh-drift', 'count', [50, 220, 440]),
    ...sweep('bokeh-drift', 'blur', [0.02, 0.09]),
  ],
};
