# Third-party notices

Retain the root Apache-2.0 LICENSE and all upstream file notices.

| Component | Source / version record | License |
|---|---|---|
| Mapgen4 and dual-mesh | redblobgames/mapgen4, base commit c1d8cb018a11a8b9e17d59233c36c176429d37eb | Apache-2.0 |
| Vendored PRNG | redblobgames/prng, commit 1104cf92f9824d71cf631eeeedd5866e9b62ea9f; files and LICENSE in vendor/prng-source | Apache-2.0 |
| Delaunator / flatqueue | Versions resolved in package-lock.json | ISC |
| fast-2d-poisson-disk-sampling / simplex-noise / gl-matrix | Versions resolved in package-lock.json | MIT |
| Three.js | Version resolved in package-lock.json | MIT |
| fflate | Version resolved in package-lock.json | MIT |
| esbuild / TypeScript / Playwright | Development tooling; resolved versions in package-lock.json | MIT / Apache-2.0 / Apache-2.0 |

Dependency license files are supplied in their installed packages; preserve them when redistributing bundles. The package lock records integrity and versions, including indirect dependencies. The original pnpm lock is retained as upstream history; the Moonwake build uses npm and package-lock.json as its active lockfile.

The user-supplied visual target has separate image provenance described in PRODUCTION.md. It is not upstream Mapgen4 art and is not automatically covered by the code's Apache license. Generated terrain exports include a short attribution note. No external texture/asset marketplace content is included.
