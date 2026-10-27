# Glass and flash

Story 10.8. The flash analyser (`tests/flash.ts`) over the turning glass, six seconds a case at 480 × 270 standing for 1080p. Re-run with `npx vitest run --config experiments/vite.config.ts experiments/glass-flash.test.ts`.

| Effect | Case | Verdict | Most flashes in a cell in a second | Largest area flashing over 3/s | Whole-frame flashes | Frame luminance swing |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| prism-icosahedron | turn 0.1 rad/s | low | 1 | 0 px² | 0 | 0.005 |
| glass-solid | turn 0.1 rad/s | low | 1 | 0 px² | 0 | 0.005 |
| prism-icosahedron | turn 0.3 rad/s | low | 1 | 0 px² | 0 | 0.006 |
| glass-solid | turn 0.3 rad/s | low | 1 | 0 px² | 0 | 0.008 |
| prism-icosahedron | turn 0.6 rad/s | low | 1 | 0 px² | 0 | 0.007 |
| glass-solid | turn 0.6 rad/s | low | 2 | 0 px² | 0 | 0.013 |
| prism-icosahedron | turn 0.6 rad/s, moon 100 | low | 2 | 0 px² | 0 | 0.011 |
| glass-solid | turn 0.6 rad/s, moon 100 | low | 2 | 0 px² | 0 | 0.017 |
