# OBJ models

The interactive routes map to these files:

- `interactive.html?id=1` → `NO1.obj`
- `interactive.html?id=2` → `NO2.obj`
- `interactive.html?id=3` → `NO3.obj`
- `interactive.html?id=4` → `NO4.obj`

Replace a file while keeping its filename to change that route without modifying the particle system. The loader automatically recalculates bounds, center, normalized scale, camera framing, surface samples, and the hidden raycast mesh.

Per-model path, orientation, scale, density, and point-size settings live in `src/config.js`.

## FIELD landscape

`field.html` renders the Ghost Forest source as a GPU-instanced splat field.
The browser loads these optimized assets instead of the 177 MB source OBJ:

- `ghost-forest/ghost-forest.splat` — 500,000 area-weighted surface samples
- `ghost-forest/ghost-forest.splat.json` — bounds and ground-proxy metadata
- `ghost-forest/ghost-forest.png` — the original surface-color texture

To rebuild the FIELD assets after replacing the OBJ or texture:

```bash
node scripts/build-textured-landscape-splats.mjs \
  /absolute/path/to/landscape.obj \
  /absolute/path/to/landscape.png \
  public/models/ghost-forest/ghost-forest.splat \
  500000
```
