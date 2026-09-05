# OBJ models

The interactive routes map to these files:

- `interactive.html?id=1` → `NO1.obj`
- `interactive.html?id=2` → `NO2.obj`
- `interactive.html?id=3` → `NO3.obj`
- `interactive.html?id=4` → `NO4.obj`

Replace a file while keeping its filename to change that route without modifying the particle system. The loader automatically recalculates bounds, center, normalized scale, camera framing, surface samples, and the hidden raycast mesh.

Per-model path, orientation, scale, density, and point-size settings live in `src/config.js`.
