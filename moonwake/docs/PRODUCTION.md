# Reference and production plan

## What the reference defines

The supplied image places a warm copper settlement in a low south-central basin, crystal woodland to the west, rust-colored scarlands east, and monumental pale structures in the north. Broad paths connect terraces, while deep cuts and high cliffs frame the playable landscape. The preset fixes those regional relationships; its seed changes the local ground and dressing.

The generator creates the underlying terrain and rough silhouettes that communicate those regions. It does not claim to recreate the painting's exact geometry, architectural detail, atmospheric effects or materials. `reference/nacre-target.png` is the user-supplied AI-generated art from the Moonwake asset-pack session; it is included solely as the project's visual target, with no third-party artist attribution invented.

## Campaign versus expansion

The 256 m preset is the first implementation target. World coordinates follow the earlier Moonwake asset plan: Hearth (0,76), Garden (−84,8), Scar (80,−16), Choir (4,−102), with north=−Z. Height grades are new terrain-authoring proposals. At larger presets the region positions and elevations scale with world size, while route width and clearing radius grow more conservatively.

The 1-4 km presets are expanded terrain compositions, not a claim that the 2–4 hour campaign, exposure system or story pacing work unchanged. This differs from the earlier 16-sector atlas, which reserved the original campaign inside a larger region. Choose one expansion design before integrating either into saves or quests.

## Next implementation milestones

1. **Terrain evaluation:** use the 256 m export in an isolated Godot scene; walk the routes at the current 6 m/s speed; verify cliff collision, heightfield normals and sightlines.
2. **Gameplay access:** project the approved terrain onto the existing occupancy/navigation approach; preserve all critical routes, rescue sites and deposit access. Add real gate behavior; this tool exports gate names only.
3. **One finished biome patch:** replace the Glasswood proxy vegetation with approved meshes, materials and occlusion behavior. Validate scale and frame time at the actual game camera distance.
4. **Terrain finishing:** add texture blends, terrain decals, edge closure and hero cliff meshes where the heightfield cannot produce the reference shape. Test runtime LOD strategy and collision budgets.
5. **Colony readability:** place actual core/building assets, reserve their footprints, and retest ward/condenser routes and final-event coverage.
6. **Expansion:** only after the campaign terrain is stable, evaluate the 1-4 km presets with tile visibility/streaming, navigation partitioning, save persistence and revised traversal pacing.

## Known limits

- Reference image lighting and dense hero architecture require an art production pass.
- No caves or true overhangs; no automatic river-water meshes.
- Proxy placement is deterministic but not collision-aware beyond terrain slope, spacing and protected areas.
- Generator 2 validates terrain-grid access to all POIs and camps and protects those connections during editing. Gameplay navigation and physical clearance still need validation.
- The Moonwake painter supports replayable terrain/data edits; it does not provide arbitrary mesh topology, cave carving or finished terrain materials. The original Mapgen4 painting page remains separate.
- No runtime tile streaming, adaptive tessellation, mixed-LOD seam stitching, NPC simulation or game integration.
- Static collision creation passed the isolated test; it is not a played-through level.
