# FINALENSIL

Responsive main-page implementation based on the provided Figma frame, with four interactive motion studies.

## Local development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

## Interaction

The original four gallery videos remain the main-page previews. The transparent area around each object is not clickable; selecting the visible object opens `interactive.html?id=1` through `id=4`.

Each detail route loads the matching `public/models/NO1.obj` through `NO4.obj`, normalizes and centers it, then uniformly samples its triangle surfaces with `MeshSurfaceSampler`. Particle positions and velocities run in WebGL2 float/half-float ping-pong framebuffer textures. The visible result combines a dense core, displaced surface particles, micro-debris, and trajectory trails.

Pointer movement raycasts against an invisible copy of the OBJ. Movement locally weakens the particles' rest-position attraction and introduces multi-scale curl flow, tangential surface shear, and smoothed pointer-velocity advection. Holding and dragging increases the local release energy; releasing allows the field to retain inertia before reconstructing the original surface.

## Quality and debugging

Automatic tiers use 57,600 (low), 147,456 (medium), or 230,400 (high) simulated particles. The manual ultra tier uses 451,584 particles. Force a tier with `?quality=low|medium|high|ultra`.

Append `?debug=true` (or `&debug=true`) to expose the lil-gui controls for interaction, curl, trails, bloom, camera, the hidden mesh, the interaction sphere, simulation freeze, and reset.

## Replacing models

Place OBJ files in `public/models/` and update their paths or transforms in `src/config.js`. Bounds, centering, normalization, camera framing, surface sampling, and the raycast mesh are recalculated automatically.
