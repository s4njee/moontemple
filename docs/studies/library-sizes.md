# Library sizes

Story 7.1. What each effect costs to download from the library build (`npm run build:lib`, unminified ES modules with the WGSL inlined): the effect's entry and every module it imports, raw and gzipped at level 9. Measured 2026-10-27 by `node scripts/lib-sizes.mjs`. A site that minifies will ship less; the gallery's own minified chunks are in [bundle-sizes.json](bundle-sizes.json).

The host and `mount` (`moontemple`'s index) add 6.7 kB gzipped (2 files) once, shared by every effect. `@mk7s/hologpu-temple-core` is a dependency the site installs and is not counted.

| Effect | Files | Raw (kB) | Gzip (kB) |
| --- | ---: | ---: | ---: |
| aperture-lab | 8 | 35.1 | 13.5 |
| bokeh-drift | 11 | 45.6 | 17.9 |
| bokeh-loader | 8 | 44.5 | 17.0 |
| dof-lab | 11 | 117.4 | 36.7 |
| dust-in-light | 9 | 41.4 | 16.4 |
| fairy-lights | 8 | 41.9 | 16.1 |
| fireflies | 9 | 36.3 | 14.3 |
| flare-cursor | 11 | 48.6 | 18.8 |
| focus-cursor | 9 | 41.9 | 16.3 |
| focus-pull | 8 | 41.2 | 16.0 |
| glint-hover | 8 | 56.3 | 21.2 |
| glitter | 10 | 38.3 | 15.1 |
| halation-text | 7 | 94.2 | 56.7 |
| hello | 5 | 18.7 | 7.4 |
| lens-light | 13 | 52.8 | 20.3 |
| lens-model | 7 | 35.6 | 13.8 |
| light-leak | 13 | 94.7 | 33.6 |
| night-street | 9 | 37.9 | 14.9 |
| photo-focus | 11 | 125.3 | 39.3 |
| rack-focus-transition | 9 | 126.1 | 38.8 |
| snow-at-night | 9 | 43.7 | 17.1 |

