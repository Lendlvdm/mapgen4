# Generation architecture

## Upstream mechanics retained

The fork starts at Mapgen4 commit `c1d8cb018a11a8b9e17d59233c36c176429d37eb`. Original files remain intact. `moonwake/upstream.ts` calls `choosePoints`, `TriangleMesh`, and Mapgen4's `assignElevation`, `assignRainfall` and `assignRivers`. It creates approximately 6,500 dual-mesh regions, then barycentrically rasterizes their elevation, rain and drainage into a macro field.

The macro field contributes terrain variation, moisture and channel depth. The final terrain is deliberately shaped for the Moonwake composition rather than a generic island: regional shelves, perimeter cliffs, route corridors and landmark clearings constrain the result. The original paintable demo remains at `embed.html`; painting in that demo does not edit or export the Moonwake preset.

## Moonwake generation stages

1. Validate seed, finite numeric parameters, world size and resolution before allocating arrays.
2. Run the upstream macro generator with deterministic random numbers.
3. Shape a south/central landing basin, west garden depression, east geological rise and northern highlands.
4. Apply terrace bands, seeded detail and branching ravines. Blend physical route grades into terrain and flatten landmark reservations.
5. Derive four continuous biome weights. Quantize using largest remainders so all four channels sum to exactly 255.
6. Calculate global normals, incident-edge slopes and candidate walk/build masks. Full-resolution global samples are the source for every chunk edge.
7. Place deterministic spaced scenery proxies, excluding routes, steep ground and landmark clearings.
8. Send a typed-array snapshot from the worker to the viewer. Keep the generated world in the worker for subsequent export. Requests are serialized through disabled generation/export actions.

## Module ownership

| Module | Responsibility |
|---|---|
| `types.ts` | Recipe contract, validation and biome names |
| `upstream.ts` | Direct adapter to Mapgen4 algorithms |
| `terrain.ts` | Moonwake shaping, masks, landmarks and placement |
| `export.ts` | Shared chunk extraction, GLB, PNG and ZIP encoders |
| `worker.ts` | Browser generation/export operations and error reporting |
| `app.ts` | Three.js preview, controls, recipes and downloads |
| `cli.ts` | Reproducible offline generation to a directory |

The Node CLI and browser worker use the same terrain/export modules. There is no server-side generation service, account or backend requirement. The development server binds to loopback only and only serves the demo, build output and reference art.

## Scale and memory

Allowed square worlds: 256, 512 and 1,024 metres. Allowed sample dimensions: 129, 257, 513 and 1025. At 1025 samples the terrain alone has 2,097,152 LOD0 triangles. Each chunk covers 64×64 sample cells (65×65 vertices); the world therefore contains 256 full-detail chunks at that resolution. Exported LOD1 and LOD2 use every second and fourth sample, respectively.

The browser keeps worker and viewer arrays plus GPU geometry. A dense world and its ZIP require more memory than raw height data alone. The generator caps dimensions to avoid unbounded browser requests. Generation timing excludes scene rebuilding, GPU upload and ZIP encoding. Reported measurements are not frame-rate guarantees.

The high-resolution field adds detail to an approximately 6,500-region macro graph; increasing sample count does not create a correspondingly denser Mapgen4 hydrology simulation. No new river network is carved after route grading. Rain and drainage are compositional inputs, not a verified physical water simulation.

## Future additions

Hand-edited terrain stamps or region painting in the Moonwake view, closed cliff wall meshes, navigable collision-aware graph baking, tile streaming and mixed-LOD stitching should be separate reviewed changes. Preserve deterministic recipes and version the export schema when changing interpretation.
