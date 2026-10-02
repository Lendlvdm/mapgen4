# Export contract / manifest schema 1, recipe schema 2

An export directory or ZIP is self-contained. Read its `manifest.json`; never infer dimensions or height scale from filenames. The browser exports its last successfully generated world. Save recipe also saves that world, not unsaved control changes.

Recipe schema 2 adds a `generation` version and an ordered `edits` array of brush stamps in world metres. Each stamp stores feature, position, radius, signed amount, selected biome, leveling target and stroke ID. The same generator and replay code runs in the browser and CLI. Schema 1 recipes load as generator 1 with no edits; new worlds use generator 2.

Recipes and manifest settings include `walkability`, a shaping strength from 0 to 1. Missing values default to 0, preserving recipes created before the control was added. This changes exported terrain heights and their derived masks, normals and placements; the candidate walkable mask still uses the same ≤30° slope test. The browser shows strength as 0–100%. CLI generation accepts `--walkability 0.8`; when `--recipe` is supplied, settings come from that recipe.

## Coordinate conventions

- One unit is one metre. Y is up, X east, −Z north.
- The square's center is X=0, Z=0; its northwestern corner is (−size/2, −size/2).
- Height arrays have both endpoints: spacing = worldSize / (resolution − 1).
- Row zero is north. Rows advance +Z, columns advance +X. Index = row × resolution + column.
- Every chunk GLB root already carries its X/Z translation. Import at the origin; **do not apply the listed chunk origin a second time**.

## Files

| File | Interpretation |
|---|---|
| `height/height.f32` | Authoritative row-major IEEE754 float32, little-endian, absolute height in metres |
| `height/height.r16` | Row-major unsigned uint16, little-endian, normalized to exported min/max |
| `height/height-16bit.png` | Real grayscale 16-bit PNG; same normalized values as R16 |
| `masks/biome-weights.png` | RGBA 8-bit weights: Basin, Glasswood, Scar, Choir; all channels sum to 255 |
| `masks/biome-id.png` | Grayscale 8-bit discrete IDs 0–3, not display-normalized |
| `masks/slope-degrees.png` | Grayscale 8-bit integer degrees 0–90, conservative maximum neighbor-edge grade |
| `masks/moisture.png` | Grayscale 8-bit moisture in range 0–255 |
| `masks/walkable.png` | 0/255 candidate slope mask, limited to interior boundary, ≤30 degrees |
| `masks/buildable.png` | 0/255 basin reserve, <5 degrees, route/objective exclusions |
| `masks/routes.png` | 0/255 generated routes plus painted path reservations |
| `terrain/lod0/*.glb` | Full-resolution meshes, normals and biome-derived vertex colors |
| `terrain/lod1/*.glb`, `lod2/*.glb` | Optional coarser uniform-level meshes |
| `placements.json` | Proxy placements, objective clearings and route polylines with gate names |
| `recipe.json` | Seed, settings, generator version and ordered brush edits, recipe schema 2 |
| `masks/dressing.png` | Local scenery density, grayscale 0–255 |
| `masks/painted-build.png` | Painted building reservation strength, grayscale 0–255; final eligibility is in buildable.png |
| `manifest.json` | World dimensions, height scale, channel meanings, chunk list and limitations |

R16 and PNG reconstruction: `metres = minimumMetres + value / 65535 × (maximumMetres − minimumMetres)`. Do not use the PNG as an 8-bit display image when importing height. Float32 avoids normalization ambiguity.

**Biome alpha is the Choir weight, not transparency.** Load the RGBA map as linear data without premultiplying alpha, color transforms or lossy compression. IDs and masks also require data-texture settings. Black-looking ID/slope PNGs are expected because their values are low integers; do not auto-level them.

## Godot adoption, later

1. Copy a selected export into a separate Godot terrain test project first. Keep the game project untouched until integration is authorized.
2. Load all `lod0` GLBs under an identity-transform parent. Confirm adjacent vertices and chunk origins align. The GLBs are compatible with Godot's supported glTF 2.0 pipeline ([official format reference](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html)).
3. Use one uniform LOD across neighboring tiles initially. LOD borders coincide at shared samples but a fine edge has extra vertices; mixed LODs require runtime stitching or skirts. Do not switch arbitrary neighboring tiles independently yet.
4. Generate static concave terrain collision from selected full-detail chunks. The included isolated check validates shape creation, not gameplay collision behavior.
5. Replace the flat vertex-color material with an approved biome material. UV0 is not included; derive continuous terrain UVs from world X/Z or use triplanar mapping. Godot's standard material supports triplanar mapping ([material reference](https://docs.godotengine.org/en/stable/tutorials/3d/standard_material_3d.html)).
6. Read placement coordinates, replace proxy kinds with actual scene assets, and author their collision and player-occlusion behavior. Preview buildings/relay decorations are visual markers; only their landmark records are exported.
7. Rebuild the game's navigation/occupancy after placing props. Enforce story gates, ward coverage, 2 m construction cells and building-entry routes in the game's existing systems.

Camp landmarks have `kind: "camp"` and `faction: "neutral"` or `"enemy"`, physical coordinates, an elevation and a clearing radius. Their approach polylines are included in routes. NPC actors and tent models are not embedded in the terrain meshes.

Painted geometry is baked into every exported LOD and height format. Painted biome, dressing, moisture, path and build data are included in the corresponding masks and regenerated placements. Exporting does not require regenerating after painting.

The masks do not validate a building's entire footprint, worker connectivity, housing, resources or ward coverage. Steep slopes at route shoulders are expected; evaluate corridor connectivity at the resolution actually selected. Low-resolution previews may under-resolve narrow routes.

## Boundaries and geometry limits

The terrain is an open heightfield surface. It has no underside, vertical perimeter closure, caves, tunnels or true overhangs. Place distant scenery/fog outside the playable boundary or author a separate cliff-wall kit. Generic river/sea water is not exported: Mapgen4's drainage is used as a lunar channel influence.
