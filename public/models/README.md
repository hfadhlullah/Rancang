# Furniture models

Drop `.glb` files here to swap a furniture kind's rendering from procedural
primitives to a real 3D model, no code change needed.

1. Add file: `public/models/<kind>.glb` (kind = `FurnitureKind` value, e.g. `sofa.glb`, `bed-double.glb`).
2. Set `modelUrl: "/models/<kind>.glb"` on that kind's entry in `src/lib/furniture/catalog.ts`.
3. Model is auto-scaled to fit the catalog's `w`/`h`/`d` bounding box and recentered on its footprint — any
   real-world scale/orientation glb works as-is.

Free CC0/CC-BY sources: Poly Pizza (polypizza.dev), Kenney (kenney.nl), Sketchfab (filter by license).
Check each model's license before shipping — CC-BY requires attribution.

Kinds without a `modelUrl` keep rendering as procedural geometry (`Furniture3D.tsx`) — no regressions.

## Current status

Wired (CC0, real assets):
- `chair`, `sofa`, `armchair`, `fridge`, `plant` — Khronos glTF-Sample-Assets (`.glb`)
- `bed-double`, `bed-single`, `wardrobe`, `desk`, `coffee-table`, `tv-stand`, `dining-table`, `counter` — KayKit Furniture Bits 1.0 (`.gltf` + `.bin` + shared `furniturebits_texture.png`, kept together in `kaykit/`)

Still procedural (no CC0 match found): `toilet`, `sink`, `shower`, `bathtub`, `stove`.

