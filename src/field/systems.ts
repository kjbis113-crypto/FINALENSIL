import * as THREE from 'three';
import { eventProgress, seededUnit } from './worldState';
import type { HabitatBuildContext } from './types';

export type HabitatMaterials = {
  mineral: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  biofilm: THREE.MeshStandardMaterial;
  signal: THREE.MeshStandardMaterial;
  wire: THREE.LineBasicMaterial;
  contour: THREE.LineBasicMaterial;
  membrane: THREE.MeshPhysicalMaterial;
  errorGreen: THREE.LineBasicMaterial;
  errorMagenta: THREE.LineBasicMaterial;
};

type InstancedField = {
  mesh: THREE.InstancedMesh;
  positions: THREE.Vector3[];
  scales: number[];
  phases: number[];
};

type TerrainSystem = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  baseY: Float32Array;
  position: THREE.BufferAttribute;
};

type ContourSystem = {
  group: THREE.Group;
  lines: THREE.LineLoop[];
  errorLines: THREE.LineLoop[];
};

type SignalSystem = InstancedField & {
  material: THREE.MeshStandardMaterial;
  seams: THREE.LineSegments;
  bead: THREE.Mesh;
};

type FeatureRuntime = {
  group: THREE.Group;
  fragments?: InstancedField;
  ribs?: THREE.Mesh[];
  fibres?: InstancedField;
  membranes?: InstancedField;
  suspendedRings?: THREE.Mesh[];
  probes?: InstancedField;
  radialNodes?: InstancedField;
  radialPaths?: THREE.LineSegments;
  nodePositions?: THREE.Vector3[];
};

export type HabitatSystems = {
  materials: HabitatMaterials;
  terrain: TerrainSystem;
  contours: ContourSystem;
  roots: THREE.LineSegments;
  biofilm: InstancedField;
  signals: SignalSystem;
  annotations: THREE.Group;
  features: FeatureRuntime;
  terrainWidth: number;
  terrainDepth: number;
  frame: number;
};

const MINERAL = new THREE.Color(0xffffff);
const MINERAL_SHADOW = new THREE.Color(0xd9d9d9);
const CHARCOAL = new THREE.Color(0x002928);
const BIOFILM = new THREE.Color(0xd9d9d9);

export function terrainHeight(context: HabitatBuildContext, x: number, z: number) {
  const { config, state, terrainWidth, terrainDepth } = context;
  const nx = x / Math.max(terrainWidth * 0.5, 1);
  const nz = z / Math.max(terrainDepth * 0.5, 1);
  const radius = Math.hypot(nx, nz);
  const seed = state.terrainStateSeed * 0.0001;
  const broadFold = Math.sin(nx * 4.2 + seed) * 0.33 + Math.cos(nz * 3.7 - seed * 0.7) * 0.24;

  if (config.terrainProfile === 'basin') {
    const basin = -config.terrainAmplitude * Math.exp(-radius * radius * 2.35);
    const rim = Math.max(0, radius - 0.48) * 2.2;
    const folds = broadFold + Math.sin((nx + nz) * 7.2 + seed) * 0.22;
    return basin + rim + folds;
  }
  if (config.terrainProfile === 'terrace') {
    const raw = broadFold * 0.72 - Math.exp(-radius * radius * 5.5) * 0.5;
    return Math.round(raw * 3.2) / 3.2;
  }
  if (config.terrainProfile === 'resonance') {
    const crater = -config.terrainAmplitude * 0.55 * Math.exp(-radius * radius * 3.8);
    const strata = Math.cos(radius * 16 + seed) * 0.34 * Math.exp(-radius * 1.25);
    return crater + strata + broadFold * 0.22;
  }
  const angle = Math.atan2(z, x);
  const islands = Math.max(0, Math.cos(angle * 4 + seed) * 0.28 + 0.2 - radius * 0.16);
  const radialPaths = Math.cos(angle * 8 + radius * 8) * 0.12;
  return islands + radialPaths + broadFold * 0.15;
}

export function createMaterials(context: HabitatBuildContext): HabitatMaterials {
  const signalColor = new THREE.Color(context.config.signalColor);
  return {
    mineral: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
    }),
    dark: new THREE.MeshStandardMaterial({ color: CHARCOAL, roughness: 0.78, metalness: 0.08, flatShading: true }),
    biofilm: new THREE.MeshStandardMaterial({ color: BIOFILM, roughness: 0.94, metalness: 0, flatShading: true }),
    signal: new THREE.MeshStandardMaterial({
      color: signalColor,
      emissive: signalColor,
      emissiveIntensity: 0.52,
      roughness: 0.48,
      metalness: 0.12,
    }),
    wire: new THREE.LineBasicMaterial({ color: 0x002928, transparent: true, opacity: 0.62 }),
    contour: new THREE.LineBasicMaterial({ color: 0x002928, transparent: true, opacity: 0.46 }),
    membrane: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      roughness: 0.52,
      metalness: 0.04,
      transmission: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    errorGreen: new THREE.LineBasicMaterial({ color: 0xd9d9d9, transparent: true, opacity: 0.1, depthWrite: false }),
    errorMagenta: new THREE.LineBasicMaterial({ color: context.config.errorColor, transparent: true, opacity: 0.05, depthWrite: false }),
  };
}

function buildTerrain(context: HabitatBuildContext, materials: HabitatMaterials): TerrainSystem {
  const segmentsX = context.mobile ? Math.max(18, context.detail - 10) : context.detail;
  const segmentsZ = context.mobile ? Math.max(14, Math.round(context.detail * 0.68) - 7) : Math.round(context.detail * 0.68);
  const geometry = new THREE.PlaneGeometry(context.terrainWidth, context.terrainDepth, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const baseY = new Float32Array(position.count);
  const colour = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const y = terrainHeight(context, x, z);
    baseY[index] = y;
    position.setY(index, y);
    const shade = Math.max(0, Math.min(1, 0.48 + y * 0.06 + seededUnit(context.state.seed, index) * 0.15));
    colour.copy(MINERAL_SHADOW).lerp(MINERAL, shade);
    if (seededUnit(context.state.seed + 4, index) > 0.965) colour.lerp(CHARCOAL, 0.42);
    colors[index * 3] = colour.r;
    colors[index * 3 + 1] = colour.g;
    colors[index * 3 + 2] = colour.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.mineral);
  mesh.receiveShadow = true;
  mesh.userData.isTerrain = true;
  context.group.add(mesh);
  return { mesh, baseY, position };
}

function contourRadius(context: HabitatBuildContext, index: number) {
  const count = Math.max(1, context.config.contourCount - 1);
  const unit = index / count;
  if (context.config.id === 'accretion') return 1.6 + Math.pow(unit, 1.42) * context.terrainWidth * 0.46;
  if (context.config.id === 'resonance') return 1.4 + unit * context.terrainWidth * 0.47;
  return 2.1 + unit * context.terrainWidth * 0.44;
}

function buildContours(context: HabitatBuildContext, materials: HabitatMaterials): ContourSystem {
  const group = new THREE.Group();
  const lines: THREE.LineLoop[] = [];
  const errorLines: THREE.LineLoop[] = [];
  const count = context.mobile ? Math.ceil(context.config.contourCount * 0.72) : context.config.contourCount;

  for (let ringIndex = 0; ringIndex < count; ringIndex += 1) {
    const points: THREE.Vector3[] = [];
    const steps = context.mobile ? 56 : 88;
    const radius = contourRadius(context, ringIndex);
    for (let step = 0; step < steps; step += 1) {
      const angle = (step / steps) * Math.PI * 2;
      const polygon = context.config.id === 'radial' ? 0.88 + Math.cos(angle * 4) * 0.1 : 1;
      const irregular = 1 + Math.sin(angle * 3 + ringIndex * 0.71) * (context.config.id === 'resonance' ? 0.015 : 0.055);
      const x = Math.cos(angle) * radius * irregular * polygon;
      const z = Math.sin(angle) * radius * irregular * polygon * (context.terrainDepth / context.terrainWidth);
      const detached = ringIndex % 5 === 3 ? 0.18 + ringIndex * 0.016 : 0.055;
      points.push(new THREE.Vector3(x, terrainHeight(context, x, z) + detached, z));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geometry, materials.contour);
    line.userData.radius = radius;
    line.userData.phase = seededUnit(context.state.seed, ringIndex + 20) * Math.PI * 2;
    group.add(line);
    lines.push(line);

    if (ringIndex === Math.floor(count * 0.58)) {
      const green = new THREE.LineLoop(geometry.clone(), materials.errorGreen);
      const magenta = new THREE.LineLoop(geometry.clone(), materials.errorMagenta);
      green.position.x = 0.035;
      magenta.position.x = -0.035;
      group.add(green, magenta);
      errorLines.push(green, magenta);
    }
  }
  context.group.add(group);
  return { group, lines, errorLines };
}

function buildRoots(context: HabitatBuildContext, materials: HabitatMaterials) {
  const branchCount = Math.max(22, Math.round((context.mobile ? 52 : 86) * context.config.rootDensity));
  const positions: number[] = [];
  for (let branch = 0; branch < branchCount; branch += 1) {
    const angle = seededUnit(context.state.seed + 11, branch) * Math.PI * 2;
    const reach = 3 + seededUnit(context.state.seed + 17, branch) * context.terrainWidth * 0.42;
    const segments = 2 + Math.floor(seededUnit(context.state.seed + 23, branch) * 3);
    let previous = new THREE.Vector3(0, terrainHeight(context, 0, 0) + 0.08, 0);
    for (let segment = 1; segment <= segments; segment += 1) {
      const unit = segment / segments;
      const curl = Math.sin(segment * 1.9 + branch) * 0.38;
      const x = Math.cos(angle + curl) * reach * unit;
      const z = Math.sin(angle + curl) * reach * unit * (context.terrainDepth / context.terrainWidth);
      const next = new THREE.Vector3(x, terrainHeight(context, x, z) + (branch % 7 === 0 ? -0.025 : 0.035), z);
      positions.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
      previous = next;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const roots = new THREE.LineSegments(geometry, materials.wire);
  roots.userData.baseOpacity = materials.wire.opacity;
  context.group.add(roots);
  return roots;
}

function buildInstancedField(
  context: HabitatBuildContext,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  placement: (index: number) => { position: THREE.Vector3; scale: number; phase: number; rotation?: THREE.Euler },
) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const positions: THREE.Vector3[] = [];
  const scales: number[] = [];
  const phases: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const item = placement(index);
    positions.push(item.position);
    scales.push(item.scale);
    phases.push(item.phase);
    dummy.position.copy(item.position);
    dummy.rotation.copy(item.rotation ?? new THREE.Euler(0, item.phase, 0));
    dummy.scale.setScalar(item.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  context.group.add(mesh);
  return { mesh, positions, scales, phases };
}

function buildBiofilm(context: HabitatBuildContext, materials: HabitatMaterials): InstancedField {
  const count = Math.max(38, Math.round((context.mobile ? 90 : 150) * context.config.biofilmDensity));
  return buildInstancedField(
    context,
    new THREE.DodecahedronGeometry(0.16, 0),
    materials.biofilm,
    count,
    (index) => {
      const cluster = index % 5;
      const clusterAngle = cluster * 1.27 + seededUnit(context.state.seed, cluster) * 0.6;
      const clusterRadius = 2.2 + cluster * context.terrainWidth * 0.055;
      const angle = clusterAngle + (seededUnit(context.state.seed + 31, index) - 0.5) * 1.05;
      const radius = clusterRadius + (seededUnit(context.state.seed + 37, index) - 0.5) * context.terrainWidth * 0.18;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * (context.terrainDepth / context.terrainWidth);
      return {
        position: new THREE.Vector3(x, terrainHeight(context, x, z) + 0.12, z),
        scale: 0.45 + seededUnit(context.state.seed + 41, index) * 1.5,
        phase: seededUnit(context.state.seed + 43, index) * Math.PI * 2,
      };
    },
  );
}

function buildSignals(context: HabitatBuildContext, materials: HabitatMaterials): SignalSystem {
  const count = context.mobile ? Math.max(6, Math.round(context.config.signalNodes * 0.7)) : context.config.signalNodes;
  const field = buildInstancedField(
    context,
    new THREE.SphereGeometry(0.12, 8, 6),
    materials.signal,
    count,
    (index) => {
      const angle = (index / count) * Math.PI * 2 + seededUnit(context.state.seed + 51, index) * 0.45;
      const radius = context.terrainWidth * (0.12 + seededUnit(context.state.seed + 53, index) * 0.31);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * (context.terrainDepth / context.terrainWidth);
      return {
        position: new THREE.Vector3(x, terrainHeight(context, x, z) + 0.22, z),
        scale: 0.75 + seededUnit(context.state.seed + 59, index) * 1.5,
        phase: seededUnit(context.state.seed + 61, index) * Math.PI * 2,
      };
    },
  );

  const seamPositions: number[] = [];
  for (let index = 0; index < field.positions.length - 1; index += 2) {
    const a = field.positions[index];
    const b = field.positions[index + 1];
    seamPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const seamGeometry = new THREE.BufferGeometry();
  seamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3));
  const seamMaterial = new THREE.LineBasicMaterial({ color: context.config.signalColor, transparent: true, opacity: 0.16 });
  const seams = new THREE.LineSegments(seamGeometry, seamMaterial);
  context.group.add(seams);

  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7), materials.signal);
  bead.visible = false;
  context.group.add(bead);
  return { ...field, material: materials.signal, seams, bead };
}

function makeLabelSprite(text: string, colour = '#002928') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '18px Helvetica, Arial, sans-serif';
    context.fillStyle = colour;
    context.fillText(text, 6, 32);
    context.fillRect(5, 39, 104, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.72, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.9, 0.85, 1);
  sprite.userData.ownedTexture = texture;
  return sprite;
}

function buildAnnotations(context: HabitatBuildContext) {
  const group = new THREE.Group();
  const labels = [context.config.id.toUpperCase()];
  const probePositions: number[] = [];
  labels.forEach((label, index) => {
    const angle = index * 1.49 + 0.4;
    const radius = context.terrainWidth * (0.17 + index * 0.05);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * (context.terrainDepth / context.terrainWidth);
    const ground = terrainHeight(context, x, z);
    const height = 1.5 + index * 0.45;
    const sprite = makeLabelSprite(`${context.record.code} / ${label}`);
    sprite.position.set(x + 1.35, ground + height, z);
    sprite.userData.phase = index * 1.8;
    sprite.userData.baseY = sprite.position.y;
    group.add(sprite);
    probePositions.push(x, ground + 0.04, z, x, ground + height - 0.35, z);
  });
  const probeGeometry = new THREE.BufferGeometry();
  probeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(probePositions, 3));
  group.add(new THREE.LineSegments(probeGeometry, new THREE.LineBasicMaterial({ color: 0x002928, transparent: true, opacity: 0.42 })));
  context.group.add(group);
  return group;
}

function buildAccretionFeatures(context: HabitatBuildContext, materials: HabitatMaterials): FeatureRuntime {
  const group = new THREE.Group();
  context.group.add(group);
  const fragmentContext = { ...context, group };
  const fragments = buildInstancedField(
    fragmentContext,
    new THREE.BoxGeometry(0.75, 0.24, 0.42),
    materials.dark,
    context.mobile ? 26 : 42,
    (index) => {
      const angle = seededUnit(context.state.seed + 71, index) * Math.PI * 2;
      const radius = 3 + seededUnit(context.state.seed + 73, index) * context.terrainWidth * 0.38;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * (context.terrainDepth / context.terrainWidth);
      return {
        position: new THREE.Vector3(x, terrainHeight(context, x, z) + (index % 6 === 0 ? -0.18 : 0.13), z),
        scale: 0.35 + seededUnit(context.state.seed + 79, index) * 1.2,
        phase: seededUnit(context.state.seed + 83, index) * Math.PI * 2,
        rotation: new THREE.Euler(seededUnit(context.state.seed, index) * 1.2, angle, seededUnit(context.state.seed + 1, index) * 1.2),
      };
    },
  );
  const ribs: THREE.Mesh[] = [];
  for (let index = 0; index < 8; index += 1) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.4 + index * 0.58, 0.1, 6, 38, Math.PI * 0.72), materials.dark);
    rib.rotation.set(Math.PI / 2, index * 0.22, 0);
    const baseY = terrainHeight(context, 0, 0) + 0.22 + (index % 3) * 0.1;
    rib.position.set(-1.7 + index * 0.42, baseY, -1 + Math.sin(index) * 0.72);
    rib.userData.baseY = baseY;
    group.add(rib);
    ribs.push(rib);
  }
  return { group, fragments, ribs };
}

function buildPhototropicFeatures(context: HabitatBuildContext, materials: HabitatMaterials): FeatureRuntime {
  const group = new THREE.Group();
  context.group.add(group);
  const featureContext = { ...context, group };
  const fibres = buildInstancedField(
    featureContext,
    new THREE.CylinderGeometry(0.025, 0.045, 1, 5),
    materials.dark,
    context.mobile ? 30 : 46,
    (index) => {
      const cluster = index % 5;
      const clusterAngle = cluster * (Math.PI * 2 / 5) + 0.35;
      const angle = clusterAngle + (seededUnit(context.state.seed + 91, index) - 0.5) * 0.65;
      const radius = 4.2 + (cluster % 2) * 3.4 + (seededUnit(context.state.seed + 97, index) - 0.5) * 3.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * (context.terrainDepth / context.terrainWidth);
      const height = 0.9 + seededUnit(context.state.seed + 101, index) * 1.9;
      return {
        position: new THREE.Vector3(x, terrainHeight(context, x, z) + height * 0.5, z),
        scale: height,
        phase: seededUnit(context.state.seed + 103, index) * Math.PI * 2,
      };
    },
  );
  const membranes = buildInstancedField(
    featureContext,
    new THREE.CircleGeometry(0.75, 6),
    materials.membrane,
    context.mobile ? 9 : 16,
    (index) => {
      const angle = (index / 16) * Math.PI * 2 + 0.35;
      const radius = 5 + (index % 4) * 2.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.62;
      return {
        position: new THREE.Vector3(x, terrainHeight(context, x, z) + 1.1 + (index % 3) * 0.35, z),
        scale: 0.65 + seededUnit(context.state.seed + 107, index) * 1.3,
        phase: index * 0.8,
        rotation: new THREE.Euler(-0.35 + seededUnit(context.state.seed, index) * 0.7, angle, index * 0.17),
      };
    },
  );
  return { group, fibres, membranes };
}

function buildResonanceFeatures(context: HabitatBuildContext, materials: HabitatMaterials): FeatureRuntime {
  const group = new THREE.Group();
  context.group.add(group);
  const suspendedRings: THREE.Mesh[] = [];
  for (let index = 0; index < (context.mobile ? 7 : 11); index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2 + index * 0.82, 0.025 + (index % 3) * 0.008, 4, 72),
      index % 4 === 0 ? materials.signal : materials.dark,
    );
    ring.rotation.x = Math.PI / 2 + (index % 2) * 0.06;
    ring.position.y = 0.75 + index * 0.18;
    ring.userData.baseY = ring.position.y;
    ring.userData.phase = index * 0.68;
    group.add(ring);
    suspendedRings.push(ring);
  }
  const featureContext = { ...context, group };
  const probes = buildInstancedField(
    featureContext,
    new THREE.CylinderGeometry(0.035, 0.035, 1, 5),
    materials.dark,
    context.mobile ? 8 : 14,
    (index) => {
      const angle = (index / 14) * Math.PI * 2;
      const radius = 6 + (index % 4) * 1.6;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.68;
      const height = 1.4 + (index % 5) * 0.55;
      return {
        position: new THREE.Vector3(x, terrainHeight(context, x, z) + height * 0.5, z),
        scale: height,
        phase: index,
      };
    },
  );
  return { group, suspendedRings, probes };
}

function buildRadialFeatures(context: HabitatBuildContext, materials: HabitatMaterials): FeatureRuntime {
  const group = new THREE.Group();
  context.group.add(group);
  const featureContext = { ...context, group };
  const nodeCount = context.mobile ? 10 : 16;
  const radialNodes = buildInstancedField(
    featureContext,
    new THREE.CylinderGeometry(0.22, 0.36, 0.18, 8),
    materials.dark,
    nodeCount,
    (index) => {
      const arm = index % 5;
      const level = 1 + Math.floor(index / 5);
      const angle = arm * (Math.PI * 2 / 5) + seededUnit(context.state.seed + 113, index) * 0.25;
      const radius = 3.2 + level * 3.1 + seededUnit(context.state.seed + 127, index);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.64;
      return {
        position: new THREE.Vector3(x, terrainHeight(context, x, z) + 0.15, z),
        scale: 0.75 + seededUnit(context.state.seed + 131, index) * 0.8,
        phase: angle,
      };
    },
  );
  const pathPositions: number[] = [];
  for (let index = 0; index < radialNodes.positions.length; index += 1) {
    const source = radialNodes.positions[index];
    const target = radialNodes.positions[(index + 3 + (index % 4)) % radialNodes.positions.length];
    pathPositions.push(source.x, source.y + 0.05, source.z, target.x, target.y + 0.05, target.z);
  }
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pathPositions, 3));
  const pathMaterial = new THREE.LineDashedMaterial({ color: context.config.signalColor, transparent: true, opacity: 0.28, dashSize: 0.32, gapSize: 0.22 });
  const radialPaths = new THREE.LineSegments(pathGeometry, pathMaterial);
  radialPaths.computeLineDistances();
  group.add(radialPaths);
  return { group, radialNodes, radialPaths, nodePositions: radialNodes.positions };
}

function buildFeatures(context: HabitatBuildContext, materials: HabitatMaterials) {
  if (context.config.id === 'accretion') return buildAccretionFeatures(context, materials);
  if (context.config.id === 'phototropic') return buildPhototropicFeatures(context, materials);
  if (context.config.id === 'resonance') return buildResonanceFeatures(context, materials);
  return buildRadialFeatures(context, materials);
}

export function buildHabitatSystems(context: HabitatBuildContext): HabitatSystems {
  const materials = createMaterials(context);
  return {
    materials,
    terrain: buildTerrain(context, materials),
    contours: buildContours(context, materials),
    roots: buildRoots(context, materials),
    biofilm: buildBiofilm(context, materials),
    signals: buildSignals(context, materials),
    annotations: buildAnnotations(context),
    features: buildFeatures(context, materials),
    terrainWidth: context.terrainWidth,
    terrainDepth: context.terrainDepth,
    frame: 0,
  };
}

function updateTerrain(context: HabitatBuildContext, systems: HabitatSystems, creaturePosition: THREE.Vector3) {
  const { state, config } = context;
  const { terrain } = systems;
  systems.frame += 1;
  if (systems.frame % 3 !== 0) return;
  const compression = eventProgress(state, 'terrain-compression');
  const breath = eventProgress(state, 'terrain-breath');
  const resonance = Math.max(eventProgress(state, 'inward-resonance'), eventProgress(state, 'interference'));
  for (let index = 0; index < terrain.position.count; index += 1) {
    const x = terrain.position.getX(index);
    const z = terrain.position.getZ(index);
    const distance = Math.hypot(x - creaturePosition.x, z - creaturePosition.z);
    const influence = Math.max(0, 1 - distance / Math.max(context.terrainWidth * 0.32, 1));
    let delta = -influence * influence * state.secondaryResponse * (config.id === 'accretion' ? 0.46 : 0.12);
    if (config.id === 'accretion') delta -= compression * influence * 0.55;
    if (config.id === 'resonance') {
      const wave = Math.sin(distance * 1.28 - state.worldTime * 2.1) * Math.exp(-distance * 0.055);
      delta += wave * (0.13 + resonance * 0.4 + state.residual * 0.12) + breath * 0.18 * Math.exp(-distance * 0.08);
    }
    if (config.id === 'phototropic') delta += Math.sin(state.worldTime * 0.22 + x * 0.08) * 0.025 * state.growth;
    if (config.id === 'radial') delta += Math.sin(Math.atan2(z, x) * 5 + state.worldTime * 0.15) * 0.035 * state.growth;
    terrain.position.setY(index, terrain.baseY[index] + delta);
  }
  terrain.position.needsUpdate = true;
  if (systems.frame % 12 === 0) terrain.mesh.geometry.computeVertexNormals();
}

function updateContours(context: HabitatBuildContext, systems: HabitatSystems) {
  const { state, config } = context;
  const resonance = Math.max(eventProgress(state, 'inward-resonance'), eventProgress(state, 'interference'));
  systems.contours.lines.forEach((line, index) => {
    const phase = line.userData.phase as number;
    const migration = Math.sin(state.worldTime * (0.045 + index * 0.002) + phase) * 0.018;
    let scale = 1 + migration;
    if (config.id === 'accretion') scale -= state.secondaryResponse * Math.exp(-index * 0.16) * 0.045;
    if (config.id === 'resonance') {
      const delayed = Math.max(0, state.worldTime - index * 0.16);
      scale += Math.sin(delayed * 2.2) * (0.012 + resonance * 0.035) * Math.exp(-index * 0.025);
    }
    line.scale.set(scale, 1, scale);
    line.position.y = index % 5 === 3 ? 0.05 + Math.sin(state.worldTime * 0.12 + phase) * 0.12 : 0;
  });
  const error = 0.045 + Math.max(state.activity - 0.72, 0) * 0.55;
  systems.materials.errorGreen.opacity = error;
  systems.materials.errorMagenta.opacity = error * 0.82;
}

function updateInstancedBiofilm(context: HabitatBuildContext, field: InstancedField, creaturePosition: THREE.Vector3) {
  const dummy = new THREE.Object3D();
  const visible = Math.max(1, Math.min(field.positions.length, Math.floor(field.positions.length * (0.56 + context.state.growth * 0.44))));
  field.mesh.count = visible;
  if (Math.floor(context.state.worldTime * 10) % 3 !== 0) return;
  for (let index = 0; index < visible; index += 1) {
    const position = field.positions[index];
    const distance = position.distanceTo(creaturePosition);
    const compression = context.config.id === 'accretion' ? Math.max(0, 1 - distance / 4.8) * context.state.primaryResponse : 0;
    const pulse = 1 + Math.sin(context.state.worldTime * 0.24 + field.phases[index]) * 0.04;
    dummy.position.copy(position);
    dummy.rotation.set(field.phases[index] * 0.24, field.phases[index], 0);
    dummy.scale.set(
      field.scales[index] * pulse,
      field.scales[index] * (0.55 + context.state.growth * 0.52) * (1 - compression * 0.7),
      field.scales[index] * pulse,
    );
    dummy.updateMatrix();
    field.mesh.setMatrixAt(index, dummy.matrix);
  }
  field.mesh.instanceMatrix.needsUpdate = true;
}

function updateSignals(context: HabitatBuildContext, systems: HabitatSystems) {
  const { state, config } = context;
  const pulse = 0.72 + Math.sin(state.worldTime * 0.66) * 0.12 + state.primaryResponse * 0.7;
  systems.signals.material.emissiveIntensity = Math.min(1.2, 0.2 + state.signalStrength * 0.58 + pulse * 0.16);
  systems.signals.seams.visible = state.signalStrength > 0.32;
  (systems.signals.seams.material as THREE.LineBasicMaterial).opacity = 0.05 + state.signalStrength * 0.18;
  systems.signals.mesh.scale.setScalar(0.85 + state.signalStrength * 0.34);

  const transfer = eventProgress(state, 'node-transfer');
  const failure = eventProgress(state, 'path-failure');
  if (config.id === 'radial' && systems.features.nodePositions?.length) {
    const nodes = systems.features.nodePositions;
    const sourceIndex = state.eventHistory.length % nodes.length;
    const targetIndex = (sourceIndex + 3 + (sourceIndex % 4)) % nodes.length;
    const progress = failure > 0 ? Math.min(0.56, failure) : transfer;
    systems.signals.bead.visible = transfer > 0.02 || failure > 0.02;
    systems.signals.bead.position.lerpVectors(nodes[sourceIndex], nodes[targetIndex], progress);
    systems.signals.bead.position.y += 0.22;
  } else {
    systems.signals.bead.visible = false;
  }
}

function updateFeatures(context: HabitatBuildContext, systems: HabitatSystems, creaturePosition: THREE.Vector3) {
  const { state, config } = context;
  const dummy = new THREE.Object3D();
  const features = systems.features;

  if (features.fragments) {
    const emergence = eventProgress(state, 'fragment-emergence');
    for (let index = 0; index < features.fragments.positions.length; index += 1) {
      const position = features.fragments.positions[index];
      const direction = Math.atan2(creaturePosition.x - position.x, creaturePosition.z - position.z);
      dummy.position.copy(position);
      if (index === state.eventHistory.length % features.fragments.positions.length) dummy.position.y += emergence * 1.7;
      dummy.rotation.set(features.fragments.phases[index] * 0.18, direction * state.secondaryResponse + features.fragments.phases[index] * (1 - state.secondaryResponse), 0.1);
      dummy.scale.setScalar(features.fragments.scales[index]);
      dummy.updateMatrix();
      features.fragments.mesh.setMatrixAt(index, dummy.matrix);
    }
    features.fragments.mesh.instanceMatrix.needsUpdate = true;
    features.ribs?.forEach((rib, index) => {
      rib.position.y = (rib.userData.baseY as number) + emergence * (index === state.eventHistory.length % 8 ? 0.82 : 0);
    });
  }

  if (features.fibres) {
    const orient = Math.max(eventProgress(state, 'fibre-orient'), state.secondaryResponse * 0.55);
    const open = Math.max(eventProgress(state, 'cluster-open'), state.signalStrength * 0.42);
    for (let index = 0; index < features.fibres.positions.length; index += 1) {
      const position = features.fibres.positions[index];
      const angle = Math.atan2(creaturePosition.z - position.z, creaturePosition.x - position.x);
      dummy.position.copy(position);
      dummy.rotation.set(Math.sin(angle) * orient * 0.28, 0, -Math.cos(angle) * orient * 0.28);
      dummy.scale.set(1, features.fibres.scales[index], 1);
      dummy.updateMatrix();
      features.fibres.mesh.setMatrixAt(index, dummy.matrix);
    }
    features.fibres.mesh.instanceMatrix.needsUpdate = true;
    if (features.membranes) {
      for (let index = 0; index < features.membranes.positions.length; index += 1) {
        dummy.position.copy(features.membranes.positions[index]);
        dummy.rotation.set(-0.5 + Math.sin(state.worldTime * 0.18 + index) * 0.12, features.membranes.phases[index], index * 0.17);
        const scale = features.membranes.scales[index] * (0.46 + open * (0.34 + (index % 4) * 0.05));
        dummy.scale.set(scale, scale * (0.62 + open * 0.38), scale);
        dummy.updateMatrix();
        features.membranes.mesh.setMatrixAt(index, dummy.matrix);
      }
      features.membranes.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  if (features.suspendedRings) {
    const inward = eventProgress(state, 'inward-resonance');
    const interference = eventProgress(state, 'interference');
    features.suspendedRings.forEach((ring, index) => {
      const delayed = Math.max(0, state.worldTime - index * 0.18);
      const wave = Math.sin(delayed * 2.4 - index * 0.42) * (0.012 + inward * 0.045);
      const secondWave = Math.sin(delayed * 1.72 + index * 0.63) * interference * 0.038;
      ring.scale.setScalar(1 + wave + secondWave);
      ring.position.y = (ring.userData.baseY as number) + Math.sin(delayed * (2.2 + index * 0.09)) * (0.012 + state.tension * 0.025);
    });
  }

  if (features.radialNodes) {
    const germination = eventProgress(state, 'node-germination');
    features.radialNodes.mesh.count = Math.min(
      features.radialNodes.positions.length,
      Math.floor(features.radialNodes.positions.length * (0.72 + state.growth * 0.22) + germination * 2),
    );
    const pathMaterial = features.radialPaths?.material as THREE.LineBasicMaterial | undefined;
    if (pathMaterial) pathMaterial.opacity = 0.1 + Math.max(eventProgress(state, 'node-transfer'), eventProgress(state, 'path-failure')) * 0.55;
  }

  const rootMaterial = systems.roots.material as THREE.LineBasicMaterial;
  rootMaterial.opacity = 0.34 + state.growth * 0.24 + eventProgress(state, 'root-seek') * 0.28;
  if (config.id === 'radial') rootMaterial.opacity *= 0.76;
}

export function updateHabitatSystems(
  context: HabitatBuildContext,
  systems: HabitatSystems,
  creaturePosition: THREE.Vector3,
  observation: boolean,
) {
  updateTerrain(context, systems, creaturePosition);
  updateContours(context, systems);
  updateInstancedBiofilm(context, systems.biofilm, creaturePosition);
  updateSignals(context, systems);
  updateFeatures(context, systems, creaturePosition);
  systems.annotations.visible = true;
  systems.annotations.children.forEach((child) => {
    if (!(child instanceof THREE.Sprite)) return;
    if (typeof child.userData.baseY === 'number') {
      child.position.y = child.userData.baseY + Math.sin(context.state.worldTime * 0.2 + child.userData.phase) * 0.05;
    }
    (child.material as THREE.SpriteMaterial).opacity = observation ? 0.88 : 0.38 + context.state.activity * 0.18;
  });
}
