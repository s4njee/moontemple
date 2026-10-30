// Story 8.1: the results page. Every effect's cost on one table, from what the cost studies
// (`npm run study`) and the browser check (`npm run browser-check -- --device ...`) filed in
// src/effects/measured.json, with its download from docs/studies/bundle-sizes.json and its tier
// from its meta, and an index of every study in docs/studies. Writes docs/studies/README.md.
//
//   npm run results

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const catalogue = JSON.parse(readFileSync('catalogue.json', 'utf8'));
const measured = JSON.parse(readFileSync('src/effects/measured.json', 'utf8'));
const bundles = JSON.parse(readFileSync('docs/studies/bundle-sizes.json', 'utf8'));
const DEVICE = 'Apple M1 Max';
const BUDGETS = [
  ['A', 2],
  ['B', 6],
  ['C', 12],
];

const reading = (id, method) =>
  measured[id]?.gpuMs?.find((m) => m.device === DEVICE && m.method === method)?.ms;
/** The lowest tier whose budget neither reading exceeds (the plan's definition of done). */
function tierFor(...readings) {
  const known = readings.filter((v) => v !== undefined);
  if (known.length === 0) return undefined;
  const worst = Math.max(...known);
  return BUDGETS.find(([, budget]) => worst <= budget)?.[0] ?? 'over C';
}

const f2 = (v) => (v === undefined ? '—' : v.toFixed(2));
const kb = (bytes) => (bytes === undefined ? '—' : (bytes / 1024).toFixed(1));
const effects = [...catalogue.effects].sort(
  (a, b) => Number(a.epic) - Number(b.epic) || a.id.localeCompare(b.id),
);
const rows = effects.map((e) => {
  const dawn = reading(e.id, 'marginal');
  const chrome = reading(e.id, 'browser-span');
  const supported = tierFor(dawn, chrome);
  const note =
    supported === undefined
      ? 'not measured'
      : supported === e.tier
        ? ''
        : BUDGETS.findIndex(([t]) => t === supported) < BUDGETS.findIndex(([t]) => t === e.tier)
          ? `fits ${supported}`
          : `over its budget: ${supported}`;
  return `| ${e.id} | ${e.epic} | ${e.tier} | ${f2(dawn)} | ${f2(chrome)} | ${kb(bundles.effects[e.id]?.gzip)} | ${note} |`;
});

const studies = readdirSync('docs/studies')
  .filter((name) => name.endsWith('.md') && name !== 'README.md' && !name.endsWith('.findings.md'))
  .sort((a, b) => {
    const epic = (n) => Number(/^epic-(\d+)\.md$/.exec(n)?.[1] ?? Infinity);
    return epic(a) - epic(b) || a.localeCompare(b);
  });
const titleOf = (name) =>
  readFileSync(`docs/studies/${name}`, 'utf8')
    .split('\n')
    .find((line) => line.startsWith('# '))
    ?.slice(2) ?? name;

const lines = [
  '# Results',
  '',
  'Story 8.1. Every effect on one table, and every study Moon Temple has run. Regenerate with `npm run results` after a study or a browser check.',
  '',
  `## Every effect, on the ${DEVICE}`,
  '',
  '- **Dawn** is the cost of one more frame at 1920 × 1080, default settings, on Dawn under Node (`npm run study`, method in `tests/bench.ts`): the number to compare effects by.',
  "- **Chrome** is the GPU time of one frame as Chrome's HUD reports it at 1080p, median of three page loads (`npm run browser-check`). It carries a timing floor and reads higher than Dawn.",
  "- **Download** is the effect's own lazy chunks, gzipped, on top of the shared first load (`docs/studies/bundle-sizes.json`).",
  `- **Tier** is the effect's label; the last column says when the numbers support a different one, by the plan's rule: the lowest tier whose budget (A ${BUDGETS[0][1]} ms, B ${BUDGETS[1][1]}, C ${BUDGETS[2][1]}) neither number exceeds. The budgets are written for an integrated GPU, so on this machine a number can show an effect is over budget but not that it fits (story 8.2).`,
  '',
  '| Effect | Epic | Tier | Dawn (ms) | Chrome (ms) | Download (kB) | Numbers say |',
  '| --- | ---: | --- | ---: | ---: | ---: | --- |',
  ...rows,
  '',
  `Shared first load: ${bundles.eager.chunks} chunks, ${kb(bundles.eager.gzip)} kB gzipped.`,
  '',
  '## Every study',
  '',
  ...studies.map((name) => `- [${titleOf(name)}](${name})`),
  '',
];
writeFileSync('docs/studies/README.md', `${lines.join('\n')}\n`);
console.log('wrote docs/studies/README.md');
