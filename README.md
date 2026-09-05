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

## Design system

`src/design-system.css` holds the tokens and layout primitives every page shares, and each
page links it before its own stylesheet. Geometry is written against one 16:9 stage of
1920 × 1080 units: `--u` is 1% of that stage's width and is the spacing unit for both axes,
so a value lands on the same pixel on the gallery, the field and the archive.

- `.ensil-backdrop` — the dither, edge to edge behind every page.
- `.ensil-frame` — the centred 16:9 stage that carries the composition.
- `.ensil-header` — logo left, navigation link right, on a shared gutter.
- `.ensil-number` — the large specimen number, anchored to the bottom gutter so it does not
  move between `interactive.html` and `info.html`.

Page themes are selected with `data-page` on `<html>`: `gallery` (paper), `field` (void) and
the default archive (ink).

## Interaction

The original four gallery videos remain the main-page previews. The transparent area around each object is not clickable; selecting the visible object opens `interactive.html?id=1` through `id=4`.

Each detail route loads the matching `public/models/NO1.obj` through `NO4.obj`, normalizes and centers it, then uniformly samples its triangle surfaces with `MeshSurfaceSampler`. Particle positions and velocities run in WebGL2 float/half-float ping-pong framebuffer textures. The visible result combines a dense core, displaced surface particles, micro-debris, and trajectory trails.

Pointer movement raycasts against an invisible copy of the OBJ. Movement locally weakens the particles' rest-position attraction and introduces multi-scale curl flow, tangential surface shear, and smoothed pointer-velocity advection. Holding and dragging increases the local release energy; releasing allows the field to retain inertia before reconstructing the original surface.

## Quality and debugging

Automatic tiers use 57,600 (low), 147,456 (medium), or 230,400 (high) simulated particles. The manual ultra tier uses 451,584 particles. Force a tier with `?quality=low|medium|high|ultra`.

Append `?debug=true` (or `&debug=true`) to expose the lil-gui controls for interaction, curl, trails, bloom, camera, the hidden mesh, the interaction sphere, simulation freeze, and reset.

## Replacing models

Place OBJ files in `public/models/` and update their paths or transforms in `src/config.js`. Bounds, centering, normalization, camera framing, surface sampling, and the raycast mesh are recalculated automatically.
