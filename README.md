# Moonwake / Nacre Terrain Studio

A separate terrain-authoring fork of [Red Blob Games Mapgen4](https://github.com/redblobgames/mapgen4). This repository is independent of the Moonwake Godot game. It generates actual terrain geometry and data for later game integration.

![Actual generated Moonwake campaign terrain](moonwake/docs/images/studio-campaign.png)

## Start

Requires Node.js 22 or newer. From this folder:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:5174**. Choose a seed, world size and sample count, then Generate. Drag to orbit, right-drag to pan, and scroll to zoom. The original paintable Mapgen4 is retained at `/embed.html`.

## What this version does

- Uses Mapgen4's real Poisson/Delaunay dual mesh, seeded elevation, wind-driven rainfall and river-flow algorithms as its macro field.
- Applies a Moonwake layout with a sheltered southern colony, west Glasswood, eastern Scar and northern Choir.
- Authors terraces, ravines, graded connecting routes and flat objective sites over that field.
- Generates deterministic crystal woodland, rocks, monoliths, fungal caps and vent placement data.
- Previews real 3D meshes with orbit controls, biome and walkability views, reference image and schematic colony/relay proxies.
- Exports chunked GLB terrain, three uniform detail levels, a **16-bit grayscale height PNG**, float32/R16 heights, biome weight/ID masks, slopes, candidate walk/build masks and placement metadata.
- Saves and reloads recipes; the same recipe reproduces terrain and placements.

| Preset | Samples | Spacing | LOD0 triangles |
|---|---:|---:|---:|
| 256 m campaign | 513 × 513 | 0.5 m | 524,288 |
| 1,024 m open world | 1025 × 1025 | 1 m | 2,097,152 |

World dimensions and resolution are independent. A 1 km map at 129 samples is a coarse preview, not metre-resolution terrain. The studio displays spacing explicitly. Changes to controls require Generate; exports and Save recipe use the last generated world.

### Increase walkable terrain

Raise **Walkable terrain** under Landscape character, then click **Generate landscape**. Higher strength blends inland terraces and ravines toward gentle ground while keeping the perimeter cliffs, biome boundaries, route grades and landmark clearings. Use **Walkability** to inspect the result and **Slope-pass area** to read the measured area. The slider is shaping strength, not a promised percentage or a change to the 30° slope limit.

For seed 187 with the other default controls, maximum strength raises slope-pass area from **36.1% to 58.2%** in the 256 m / 513-sample valley, and **37.8% to 60.5%** in the 1,024 m / 1025-sample world. Results depend on the seed, relief, detail and sample spacing. These are terrain slope candidates; final gameplay navigation still needs prop collisions and player testing.

The setting is saved in recipes and exports. Older recipes default to 0%, retaining their original terrain.

## Command-line generation

```sh
npm run generate -- --size 1024 --resolution 1025 --seed 187 --out exports/nacre-1024
npm run generate -- --recipe exports/nacre-1024/recipe.json --out exports/reproduced
npm run generate -- --size 1024 --resolution 1025 --walkability 1 --out exports/nacre-walkable
```

Generated bundles are ignored by Git because high-resolution worlds can be large. See [the export contract](moonwake/docs/EXPORTS.md), [architecture](moonwake/docs/ARCHITECTURE.md) and [production scope](moonwake/docs/PRODUCTION.md).

## Verify

```sh
npm test
npm run test:browser
```

Browser tests use installed Chrome on Windows; override `CHROME_PATH` elsewhere. No browser download is required. Tests check determinism, protected terrain, region connectivity for the reference seed, chunk seams, binary export content and the UI export flow. Performance and Godot loading evidence are recorded in [validation](moonwake/docs/VALIDATION.md).

## Reference fidelity and limits

The user-supplied concept guides terrain composition, color families, terraces and regional props. This is a **terrain foundation**, not a reconstruction of every painted building, crystal or overhang. The heightfield cannot represent caves or overhangs. Buildings and vegetation in the viewer are low-poly proxies; replace them with production assets later. Slope masks are candidates, not game navigation or construction approval. Route unlock gates are exported metadata only. The 1 km preset scales the regional composition and is a future expansion design, not the original campaign's unchanged pacing.

No code, scenes, settings or assets are written to the main Godot project. Exports must be imported separately when that development work is authorized.

## Attribution

Original Mapgen4 and dual-mesh code: Red Blob Games, Apache-2.0; copyright notices and [LICENSE](LICENSE) retained. The small PRNG helper is vendored at upstream's locked revision `1104cf92f9824d71cf631eeeedd5866e9b62ea9f` under its existing Apache-2.0 license, so installation does not need Git-based package fetching. See [third-party notices](moonwake/docs/THIRD_PARTY.md). Moonwake additions use the repository's Apache-2.0 code license. The supplied visual reference has separate provenance and is not automatically relicensed as Apache code.

The original upstream documentation remains in [README.org](README.org).
