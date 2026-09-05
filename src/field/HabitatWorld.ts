import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
// GLB는 압축(EXT_meshopt_compression)돼 있으므로 meshopt 디코더가 연결된
// 공용 로더(sim3d/gltf.ts)로 로드한다. 디코더 정적 import는 wasm-rollup 크래시(debug.md #1).
import { getGLTFLoader } from './gltf';
import type { CreatureRecord, CreatureState } from './creatureRecords';
import { FirstPersonFieldController } from './FirstPersonFieldController';
import { getBiomeConfig } from './biomes';
import { buildHabitatSystems, terrainHeight, updateHabitatSystems, type HabitatSystems } from './systems';
import {
  buildCommonFieldLandscape,
  commonFieldHeight,
  FIELD_CENTRES,
  type CommonFieldLandscape,
} from './CommonFieldLandscape';
import { beginEvent, chooseWeightedEvent, eventProgress, loadWorldState, saveWorldState, seededUnit } from './worldState';
import type { HabitatBuildContext, HabitatSnapshot, HabitatWorldState } from './types';
import { createParticleCreature } from './particle-creature.js';
import {
  LandscapeSplatRenderer,
  LANDSCAPE_SPLAT_LAYER,
} from './LandscapeSplatRenderer.js';
import {
  CreatureHalo,
  CREATURE_HALO_CONFIG,
  CREATURE_HALO_LAYER,
} from './CreatureHalo.js';

export type HabitatWorldOptions = {
  mount: HTMLElement;
  records: CreatureRecord[];
  mode: 'field' | 'single';
  /** 스테이지(프로젝터) — 1인칭 진입이 없을 때 카메라가 필드 중심을 천천히 돈다 */
  ambient?: boolean;
  /**
   * 1인칭 진입을 허용할지. 캔버스를 클릭하면 포인터 락이 걸리며 1인칭이 되는데,
   * 프로젝터(스테이지)는 전체화면 진입도 클릭으로 하므로 같이 걸려버린다.
   * false 면 컨트롤러를 아예 만들지 않아 ambient 회전이 계속 돈다.
   */
  firstPerson?: boolean;
  /**
   * 절차적 지형 대신 표면 샘플링된 Ghost Forest FIELD를 표시할지.
   * 로드되면 setFieldFallbackVisible(false) 로 절차적 지형·등고선·신호선이
   * 숨겨진다. false 면 절차적 지형만 남는다.
   */
  referenceLandscape?: boolean;
  /**
   * 개체를 무엇으로 그릴지. 'particles' 면 GLB 대신 아카이브와 같은 GPU 포인트클라우드
   * (src/field/particle-creature.js). 기본은 GLB.
   */
  creatureRenderer?: 'glb' | 'particles';
  selectedId?: string | null;
  observation?: boolean;
  paused?: boolean;
  onLoaded?: (loaded: number, total: number) => void;
  onSelect?: (id: string | null) => void;
  onEnter?: (id: string) => void;
  onProximity?: (id: string | null) => void;
  onSnapshot?: (snapshot: HabitatSnapshot[]) => void;
  onImmersiveChange?: (active: boolean) => void;
};

type HabitatRuntime = {
  record: CreatureRecord;
  context: HabitatBuildContext;
  state: HabitatWorldState;
  systems: HabitatSystems;
  group: THREE.Group;
  creatureRoot: THREE.Group;
  creatureBody: THREE.Group;
  placeholder: THREE.Group;
  trail: THREE.Line;
  trailPositions: THREE.Vector3[];
  lastTrailAt: number;
  home: THREE.Vector3;
  influencePosition: THREE.Vector3;
  pointerInfluence: number;
  focusBlend: number;
  emergence: number;
  enteredAt: number;
  loaded: boolean;
  particles: ParticleCreatureHandle | null;
};

/** src/field/particle-creature.js 가 돌려주는 것 */
type ParticleCreatureHandle = {
  root: THREE.Object3D;
  particleCount: number;
  update(time: number, dt: number, drive: number): void;
  dispose(): void;
};

type FieldReferenceLandscape = {
  model: THREE.Group;
  splats: LandscapeSplatRenderer;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  baseScale: THREE.Vector3;
  pointerEnergy: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 필드 링크(커서 중계)용 — 포인터가 지형을 못 맞혔을 때 대신 쓰는 지평면 높이와, 그 점을 가두는 범위.
 * 공용 지형(104×78)의 절반이다. 낮은 카메라라 지평선 근처의 지형 점은 한없이 멀어질 수 있다.
 */
const LINK_PLANE_Y = 0;
const LINK_BOUNDS = { x: 52, z: 39 };

/**
 * 앰비언트 카메라(필드 1·2 공통)의 회전 속도 — 약 3분에 한 바퀴.
 * 페이지 시각이 아니라 벽시계(Date.now)에 건다: 아이맥의 필드 1 과 맥미니의 필드 2 가 같은 각도에서 보게.
 * 필드 1 의 커서를 필드 2 에 옮겨 그릴 때 두 화면이 같은 자리를 보고 있어야 유체가 같은 곳에 뜬다.
 * 두 맥의 시계가 몇 초 어긋나도 1초 = 약 2° 라 눈에 띄지 않는다.
 */
const AMBIENT_ORBIT_RATE = 0.000035;

/** 포인터가 가리키는 월드 점. creature 는 개체 표면을 맞혔을 때 그 개체 id. */
export type PointerFieldPoint = { x: number; y: number; z: number; creature: string | null };

/** 개체 밑동의 월드 위치 — 필드 1 ↔ 필드 2 가 서로의 개체 자리를 맞춰 보는 기준점 */
export type CreatureAnchor = { id: string; x: number; y: number; z: number };

function damp(current: number, target: number, smoothing: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

function snapshotState(state: HabitatWorldState): CreatureState {
  if (state.tension > 0.72) return 'startled';
  if (state.activationUntil > state.worldTime || state.activity > 0.74) return 'curious';
  if (state.currentEvent === 'node-transfer' || state.currentEvent === 'root-seek') return 'social';
  if (state.signalStrength < 0.2) return 'rest';
  if (state.currentEvent) return 'forage';
  return 'idle';
}

function buildPlaceholder(runtime: Pick<HabitatRuntime, 'context'>) {
  const { config } = runtime.context;
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x002928, roughness: 0.78, metalness: 0.08 });
  const mineral = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02 });
  if (config.id === 'accretion') {
    for (let index = 0; index < 7; index += 1) {
      const fragment = new THREE.Mesh(new THREE.BoxGeometry(0.75 + index * 0.08, 0.28, 0.48), index % 3 ? dark : mineral);
      fragment.position.set(Math.sin(index * 1.7) * 1.2, index * 0.18, Math.cos(index * 1.2) * 0.8);
      fragment.rotation.set(index * 0.24, index * 0.62, index * 0.17);
      group.add(fragment);
    }
  } else if (config.id === 'phototropic') {
    for (let index = 0; index < 6; index += 1) {
      const unit = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 7), index % 2 ? dark : mineral);
      unit.position.set(Math.cos(index) * 0.75, (index % 3) * 0.45, Math.sin(index) * 0.65);
      group.add(unit);
    }
  } else if (config.id === 'resonance') {
    const body = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.36, 10, 34), dark);
    body.rotation.x = Math.PI / 2;
    group.add(body);
  } else {
    for (let index = 0; index < 5; index += 1) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.42), index % 2 ? dark : mineral);
      arm.rotation.y = index * Math.PI * 0.4;
      group.add(arm);
    }
  }
  group.scale.setScalar(1.15);
  return group;
}

function buildWorldScaffold(scene: THREE.Scene, mobile: boolean, mode: HabitatWorldOptions['mode']) {
  if (mode === 'single') {
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.01, flatShading: true });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(118, 86, 8, 6), baseMaterial);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -2.85;
    base.receiveShadow = true;
    scene.add(base);
  }

  const gridPositions: number[] = [];
  for (let index = -10; index <= 10; index += 1) {
    if (index % 4 === 1) continue;
    const x = index * 5.4;
    gridPositions.push(x, -2.76, -38, x, -2.76, index % 3 === 0 ? 9 : 38);
  }
  for (let index = -7; index <= 7; index += 1) {
    if (index % 4 === -1) continue;
    const z = index * 5.4;
    gridPositions.push(-56, -2.75, z, index % 3 === 0 ? -7 : 56, -2.75, z);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
  scene.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0x002928, transparent: true, opacity: 0.18 })));

  const measurePositions: number[] = [];
  const lineCount = mobile ? 4 : 7;
  for (let index = 0; index < lineCount; index += 1) {
    const x = -43 + index * 14.4;
    const z = -30 + (index % 3) * 28;
    const height = 5.5 + (index % 4) * 1.4;
    measurePositions.push(x, -2.6, z, x, height, z, x, height, z, x + 5.6, height, z);
  }
  const measureGeometry = new THREE.BufferGeometry();
  measureGeometry.setAttribute('position', new THREE.Float32BufferAttribute(measurePositions, 3));
  scene.add(new THREE.LineSegments(measureGeometry, new THREE.LineBasicMaterial({ color: 0x002928, transparent: true, opacity: 0.28 })));
}

export class HabitatWorld {
  private options: HabitatWorldOptions;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(33, 1, 0.1, 220);
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private creatureHalo: CreatureHalo | null = null;
  private controls: OrbitControls;
  private fieldController: FirstPersonFieldController | null = null;
  private runtimes = new Map<string, HabitatRuntime>();
  private pickables: THREE.Object3D[] = [];
  private terrains: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2(10, 10);
  private centerNdc = new THREE.Vector2(0, 0);
  private pointerWorld = new THREE.Vector3();
  private scratchWorld = new THREE.Vector3();
  private pointerBiomeId: string | null = null;
  private hoveredId: string | null = null;
  private frame = 0;
  private lastTime = performance.now();
  private lastSnapshot = 0;
  private loaded = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private mobile = window.matchMedia('(max-width: 760px)').matches;
  private down = { x: 0, y: 0 };
  private focusStartedAt = 0;
  private userInteracting = false;
  private desiredTarget = new THREE.Vector3();
  private desiredCamera = new THREE.Vector3();
  private commonLandscape: CommonFieldLandscape | null = null;
  private fieldReferenceLandscape: FieldReferenceLandscape | null = null;
  private lastPointerClient = new THREE.Vector2();
  private hasPointerClient = false;
  /** 마지막 pointermove 가 가리킨 월드 점 (개체 표면 > 지형 > 지평면 순). 하늘이면 null. */
  private pointerField: PointerFieldPoint | null = null;
  /**
   * 상대(콘솔) 카메라 각도와 내 벽시계 각도의 차. 스테이지가 콘솔의 view 메시지로 맞춘다 —
   * 두 맥의 시계가 어긋나도 프로젝터가 아이맥과 같은 각도에서 보게. 콘솔이 사라지면 0 으로 돌아간다.
   */
  private ambientOffset = 0;
  private ambientOffsetTarget = 0;

  constructor(options: HabitatWorldOptions) {
    this.options = options;
    this.scene.background = new THREE.Color(0xffffff);
    this.scene.fog = new THREE.FogExp2(0xffffff, options.mode === 'field' ? 0.0038 : 0.0065);

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.15 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = !this.mobile && options.mode === 'single' && !this.reducedMotion;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    options.mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.26;
    this.controls.zoomSpeed = 0.45;
    this.controls.minPolarAngle = 0.48;
    this.controls.maxPolarAngle = options.mode === 'field' ? 1.28 : 1.02;
    this.controls.autoRotate = options.mode === 'single' && !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.075;
    this.controls.minDistance = options.mode === 'field' ? 40 : 24;
    this.controls.maxDistance = options.mode === 'field' ? 92 : 62;
    this.controls.enabled = options.mode === 'single';
    this.controls.addEventListener('start', this.handleControlStart);
    this.controls.addEventListener('end', this.handleControlEnd);

    this.setupCamera();
    if (options.mode === 'field' && options.firstPerson !== false) {
      this.fieldController = new FirstPersonFieldController({
        camera: this.camera,
        canvas: this.renderer.domElement,
        onActiveChange: (active) => this.options.onImmersiveChange?.(active),
        onInteract: () => this.interactFromView(),
      });
    }
    this.setupLighting();
    buildWorldScaffold(this.scene, this.mobile, options.mode);
    if (options.mode === 'field') {
      this.commonLandscape = buildCommonFieldLandscape(this.scene, this.mobile);
      this.terrains.push(this.commonLandscape.terrain);
      if (options.referenceLandscape !== false) this.loadFieldReferenceLandscape();
    }
    this.buildRuntimes();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(options.mount);
    this.resize();
    this.setFocus(options.selectedId ?? (options.mode === 'single' ? options.records[0]?.id : null), true);
    this.frame = window.requestAnimationFrame(this.animate);
  }

  private setupCamera() {
    if (this.options.mode === 'field') {
      this.camera.position.set(0, commonFieldHeight(0, 27) + 3.2, 27);
      this.camera.lookAt(0, 1.5, 0);
      this.controls.target.set(0, 1.5, 0);
    } else {
      this.camera.position.set(this.mobile ? 19 : 24, this.mobile ? 27 : 22, this.mobile ? 42 : 34);
      this.controls.target.set(0, -0.4, 0);
    }
    this.desiredTarget.copy(this.controls.target);
    this.desiredCamera.copy(this.camera.position);
  }

  private setupLighting() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x002928, 1.35));
    const overhead = new THREE.DirectionalLight(0xffffff, 1.65);
    overhead.position.set(-22, 48, 18);
    overhead.castShadow = this.renderer.shadowMap.enabled;
    overhead.shadow.mapSize.set(1024, 1024);
    overhead.shadow.camera.left = -34;
    overhead.shadow.camera.right = 34;
    overhead.shadow.camera.top = 28;
    overhead.shadow.camera.bottom = -28;
    this.scene.add(overhead);
    const coolFill = new THREE.DirectionalLight(0xd9d9d9, 0.3);
    coolFill.position.set(35, 17, -24);
    this.scene.add(coolFill);
  }

  private buildRuntimes() {
    const count = this.options.records.length;
    this.options.records.forEach((record, index) => {
      const group = new THREE.Group();
      const layout = this.options.mode === 'field' ? FIELD_CENTRES[index] ?? new THREE.Vector3() : new THREE.Vector3();
      group.position.copy(layout);
      group.userData.biomeId = record.id;
      this.scene.add(group);

      const state = loadWorldState(record.id);
      const config = getBiomeConfig(record.id);
      const context: HabitatBuildContext = {
        record,
        config,
        state,
        group,
        terrainWidth: this.options.mode === 'field' ? 34 : 54,
        terrainDepth: this.options.mode === 'field' ? 26 : 40,
        detail: this.options.mode === 'field' ? 24 : 30,
        mobile: this.mobile,
      };
      const systems = buildHabitatSystems(context);
      if (this.options.mode === 'single') systems.annotations.visible = false;
      if (this.options.mode === 'field') {
        // 필드(전시)에는 개체 라벨 스프라이트를 아예 두지 않는다 — updateHabitatSystems 가
        // 매 프레임 visible 을 다시 켜므로 숨기는 것으로는 부족하다.
        systems.annotations.children.forEach((child) => {
          if (child instanceof THREE.Sprite) {
            child.material.map?.dispose();
            child.material.dispose();
          }
        });
        systems.annotations.clear();
      }
      systems.terrain.mesh.userData.biomeId = record.id;
      if (this.options.mode === 'field') {
        systems.terrain.mesh.visible = false;
        group.position.y = commonFieldHeight(layout.x, layout.z) - terrainHeight(context, 0, 0);
      } else {
        this.terrains.push(systems.terrain.mesh);
      }

      const creatureRoot = new THREE.Group();
      creatureRoot.userData.creatureId = record.id;
      const creatureBody = new THREE.Group();
      creatureRoot.add(creatureBody);
      group.add(creatureRoot);
      this.pickables.push(creatureRoot);

      const placeholder = buildPlaceholder({ context });
      placeholder.traverse((child) => { child.userData.creatureId = record.id; });
      creatureBody.add(placeholder);

      const trailGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 36 }, () => new THREE.Vector3()));
      const trailMaterial = new THREE.LineBasicMaterial({
        color: config.signalColor,
        transparent: true,
        opacity: config.id === 'accretion' ? 0.24 : 0.1,
      });
      const trail = new THREE.Line(trailGeometry, trailMaterial);
      group.add(trail);

      const runtime: HabitatRuntime = {
        record,
        context,
        state,
        systems,
        group,
        creatureRoot,
        creatureBody,
        placeholder,
        trail,
        trailPositions: Array.from({ length: 36 }, () => new THREE.Vector3()),
        lastTrailAt: 0,
        home: group.position.clone(),
        influencePosition: new THREE.Vector3(),
        pointerInfluence: 0,
        focusBlend: 1,
        emergence: this.options.mode === 'field' ? 1 : 0,
        enteredAt: performance.now(),
        loaded: false,
        particles: null,
      };
      this.runtimes.set(record.id, runtime);
      this.loadCreature(runtime);
    });
    this.options.onLoaded?.(0, count);
  }

  private setFieldFallbackVisible(visible: boolean) {
    if (this.options.mode !== 'field') return;
    if (this.commonLandscape) this.commonLandscape.group.visible = visible;
    this.runtimes.forEach((runtime) => {
      runtime.systems.contours.group.visible = visible;
      runtime.systems.roots.visible = visible;
      runtime.systems.features.group.visible = visible;
      runtime.systems.biofilm.mesh.visible = visible;
      runtime.systems.signals.mesh.visible = visible;
      runtime.systems.signals.seams.visible = visible;
      runtime.systems.annotations.visible = visible;
    });
  }

  private markCreatureForHalo(root: THREE.Object3D) {
    if (this.options.mode !== 'field' || this.options.referenceLandscape === false) return;
    root.traverse((child) => {
      if (child instanceof THREE.Points || child instanceof THREE.Mesh) {
        child.layers.enable(CREATURE_HALO_LAYER);
      }
    });
  }

  private enableFieldPostprocessing() {
    if (this.composer || this.options.mode !== 'field') return;
    const parameters = {
      creatureHaloInnerRadius: CREATURE_HALO_CONFIG.innerRadius,
      creatureHaloInnerStrength: CREATURE_HALO_CONFIG.innerStrength,
      creatureHaloOuterRadius: CREATURE_HALO_CONFIG.outerRadius,
      creatureHaloOuterStrength: CREATURE_HALO_CONFIG.outerStrength,
      creatureHaloColor: CREATURE_HALO_CONFIG.color,
    };
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.creatureHalo = new CreatureHalo(
      this.renderer,
      this.scene,
      this.camera,
      parameters,
      { pixelRatio: this.renderer.getPixelRatio() },
      LANDSCAPE_SPLAT_LAYER,
    );
    this.creatureHalo.setEnabled(true);
    this.composer.addPass(this.creatureHalo.compositePass);
    this.composer.addPass(new OutputPass());
    this.camera.layers.enable(LANDSCAPE_SPLAT_LAYER);
    this.resize();
  }

  private loadFieldReferenceLandscape() {
    this.renderer.domElement.dataset.habitatModel = 'LOADING';
    this.renderer.domElement.dataset.habitatError = 'false';
    const splats = new LandscapeSplatRenderer({
      renderer: this.renderer,
      mobile: this.mobile,
      reducedMotion: this.reducedMotion,
    });

    void splats.load().then(() => {
      if (this.disposed) {
        splats.dispose();
        return;
      }
      const model = splats.root;
      const horizontal = Math.max(
        splats.metadata.normalizedDimensions[0],
        splats.metadata.normalizedDimensions[2],
      ) || 1;
      const baseScale = 80 / horizontal;
      model.scale.setScalar(baseScale);
      // The source contains long roots below its walkable surface. Aligning its
      // absolute minimum to the floor lifts the usable forest above the camera;
      // this calibrated surface datum keeps foreground ground and side volume
      // around the existing FIELD camera without changing that camera.
      model.position.set(0, -3.35, -1.5);
      model.rotation.set(0, -0.055, 0);
      this.scene.add(model);
      this.terrains.push(splats.groundProxy);
      model.updateMatrixWorld(true);
      this.raiseEcologiesToReferenceSurface(model);
      this.fieldReferenceLandscape = {
        model,
        splats,
        basePosition: model.position.clone(),
        baseRotation: model.rotation.clone(),
        baseScale: model.scale.clone(),
        pointerEnergy: 0,
      };
      this.setFieldFallbackVisible(false);
      this.enableFieldPostprocessing();
      this.renderer.domElement.dataset.habitatModel = model.name;
      this.renderer.domElement.dataset.habitatParts = String(splats.metadata.sourceTriangleCount);
      this.renderer.domElement.dataset.habitatInteractive = 'true';
      this.renderer.domElement.dataset.habitatError = 'false';
    }).catch((error) => {
        splats.dispose();
        this.setFieldFallbackVisible(true);
        this.renderer.domElement.dataset.habitatModel = 'PROCEDURAL_FALLBACK';
        this.renderer.domElement.dataset.habitatParts = '0';
        this.renderer.domElement.dataset.habitatInteractive = 'false';
        this.renderer.domElement.dataset.habitatError = 'true';
        console.warn('ENSIL Ghost Forest splats could not be loaded; using procedural fallback.', error);
      });
  }

  private raiseEcologiesToReferenceSurface(model: THREE.Object3D) {
    const surfaces: THREE.Object3D[] = [];
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.userData.isLandscapeSplat) surfaces.push(child);
    });
    const raycaster = new THREE.Raycaster();
    raycaster.ray.direction.set(0, -1, 0);
    this.runtimes.forEach((runtime) => {
      raycaster.ray.origin.set(runtime.home.x, 80, runtime.home.z);
      const hit = raycaster.intersectObjects(surfaces, false)[0];
      if (!hit) return;
      const localGround = terrainHeight(runtime.context, 0, 0);
      const clearance = Number(hit.object.userData.creatureClearance ?? 0.12);
      const originalCreatureGround = runtime.home.y + localGround;
      const safeCreatureGround = Math.max(originalCreatureGround, hit.point.y + clearance);
      const homeY = safeCreatureGround - localGround;
      runtime.home.y = homeY;
      runtime.group.position.y = homeY;
    });
  }

  private loadCreature(runtime: HabitatRuntime) {
    if (this.options.creatureRenderer === 'particles') {
      void this.loadParticleCreature(runtime);
      return;
    }
    if (!runtime.record.modelUrl) {
      this.completeLoad(runtime);
      return;
    }
    const modelUrl = runtime.record.modelUrl;
    getGLTFLoader().then((loader) => loader.load(
      modelUrl,
      (gltf) => {
        if (this.disposed) {
          this.disposeObject(gltf.scene);
          return;
        }
        const model = gltf.scene;
        model.traverse((child) => {
          child.userData.creatureId = runtime.record.id;
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = this.renderer.shadowMap.enabled;
          child.receiveShadow = true;
        });
        const before = new THREE.Box3().setFromObject(model);
        const size = before.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const fieldSize: Record<string, number> = {
          'eo-002': 6.2,
          'eo-003': 5.6,
          'eo-004': 4.8,
          'eo-005': 5.4,
        };
        const targetSize = this.options.mode === 'field'
          ? fieldSize[runtime.record.id] ?? 5.5
          : runtime.context.config.creatureScale;
        model.scale.setScalar(targetSize / maxDimension);
        const fitted = new THREE.Box3().setFromObject(model);
        const center = fitted.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -fitted.min.y, -center.z);
        runtime.creatureBody.remove(runtime.placeholder);
        this.disposeObject(runtime.placeholder);
        runtime.creatureBody.add(model);
        this.markCreatureForHalo(model);
        this.completeLoad(runtime);
      },
      undefined,
      () => this.completeLoad(runtime),
    ));
  }

  /**
   * GLB 대신 포인트클라우드. 도감 순번(records 의 순서)이 곧 OBJ 번호다.
   * 실패하면 절차적 플레이스홀더를 그대로 두고 로드는 끝난 것으로 친다 — 필드는 계속 돌아야 한다.
   */
  private async loadParticleCreature(runtime: HabitatRuntime) {
    const fieldSize: Record<string, number> = { 'eo-002': 6.2, 'eo-003': 5.6, 'eo-004': 4.8, 'eo-005': 5.4 };
    const modelIndex = this.options.records.indexOf(runtime.record) + 1;
    try {
      const creature = await createParticleCreature({
        renderer: this.renderer,
        modelIndex,
        size: fieldSize[runtime.record.id] ?? 5.5,
        pixelRatio: Math.min(window.devicePixelRatio, this.mobile ? 1.15 : 1.5),
      });
      if (this.disposed) {
        creature.dispose();
        return;
      }
      creature.root.traverse((child) => { child.userData.creatureId = runtime.record.id; });
      this.markCreatureForHalo(creature.root);
      runtime.creatureBody.remove(runtime.placeholder);
      this.disposeObject(runtime.placeholder);
      runtime.creatureBody.add(creature.root);
      runtime.particles = creature;
      this.renderer.domElement.dataset.particleCreatures = String(
        Array.from(this.runtimes.values()).filter((entry) => entry.particles).length,
      );
    } catch (error) {
      console.warn(`ENSIL point cloud for ${runtime.record.id} could not be built; keeping the placeholder.`, error);
    }
    this.completeLoad(runtime);
  }

  private completeLoad(runtime: HabitatRuntime) {
    if (runtime.loaded || this.disposed) return;
    runtime.loaded = true;
    this.loaded += 1;
    this.options.onLoaded?.(this.loaded, this.options.records.length);
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    const habitatLabel = this.options.records.length === 1 ? 'habitat' : 'habitats';
    canvas.setAttribute('aria-label', this.options.mode === 'field'
      ? `${this.options.records.length} autonomous electronic ${habitatLabel}. Enter the field, move with W A S D, look with the pointer, and press E to inspect a creature.`
      : `${this.options.records.length} autonomous electronic ${habitatLabel}. Drag to orbit, move to disturb contours, and select a creature to activate its ecology.`);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('dblclick', this.handleDoubleClick);
    canvas.addEventListener('keydown', this.handleKeyDown);
  }

  private updatePointer(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const terrainHit = this.raycaster.intersectObjects(this.terrains, false)[0];
    this.pointerBiomeId = terrainHit?.object.userData.biomeId ?? null;
    if (terrainHit) {
      this.pointerWorld.copy(terrainHit.point);
      if (terrainHit.object.userData.isCommonField) {
        let nearest: HabitatRuntime | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        this.runtimes.forEach((runtime) => {
          const distance = Math.hypot(
            terrainHit.point.x - runtime.group.position.x,
            terrainHit.point.z - runtime.group.position.z,
          );
          if (distance < nearestDistance) {
            nearest = runtime;
            nearestDistance = distance;
          }
        });
        this.pointerBiomeId = nearestDistance < 24 ? (nearest as HabitatRuntime | null)?.record.id ?? null : null;
      }
    }

    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    let target: THREE.Object3D | null = hit?.object ?? null;
    while (target && !target.userData.creatureId) target = target.parent;
    const nextHovered = (target?.userData.creatureId as string | undefined) ?? null;
    if (nextHovered !== this.hoveredId) {
      this.hoveredId = nextHovered;
      this.options.onProximity?.(nextHovered);
    }

    // 필드 링크용 — 같은 레이캐스트 결과를 재사용한다 (한 번 더 쏘지 않는다)
    if (hit && nextHovered) {
      this.pointerField = { x: hit.point.x, y: hit.point.y, z: hit.point.z, creature: nextHovered };
    } else if (terrainHit) {
      this.pointerField = { x: terrainHit.point.x, y: terrainHit.point.y, z: terrainHit.point.z, creature: null };
    } else {
      this.pointerField = this.pointerOnHorizon();
    }
  }

  /** 지형을 못 맞힌 포인터를 지평면(y = LINK_PLANE_Y)에 내려놓는다. 지평선 위(하늘)면 null. */
  private pointerOnHorizon(): PointerFieldPoint | null {
    const { origin, direction } = this.raycaster.ray;
    if (Math.abs(direction.y) < 1e-5) return null;
    const t = (LINK_PLANE_Y - origin.y) / direction.y;
    if (t <= 0) return null;
    this.raycaster.ray.at(t, this.scratchWorld);
    return {
      x: clamp(this.scratchWorld.x, -LINK_BOUNDS.x, LINK_BOUNDS.x),
      y: LINK_PLANE_Y,
      z: clamp(this.scratchWorld.z, -LINK_BOUNDS.z, LINK_BOUNDS.z),
      creature: null,
    };
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (this.hasPointerClient && this.fieldReferenceLandscape) {
      const movement = Math.hypot(event.clientX - this.lastPointerClient.x, event.clientY - this.lastPointerClient.y);
      this.fieldReferenceLandscape.pointerEnergy = Math.min(1, this.fieldReferenceLandscape.pointerEnergy + movement * 0.018);
    }
    this.lastPointerClient.set(event.clientX, event.clientY);
    this.hasPointerClient = true;
    this.updatePointer(event);
    this.runtimes.forEach((runtime) => {
      runtime.pointerInfluence = runtime.record.id === this.pointerBiomeId ? 1 : 0;
    });
  };

  private handlePointerLeave = () => {
    this.hasPointerClient = false;
    this.pointerField = null;
    this.pointerBiomeId = null;
    this.hoveredId = null;
    this.options.onProximity?.(null);
    this.runtimes.forEach((runtime) => { runtime.pointerInfluence = 0; });
  };

  private handlePointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
    this.updatePointer(event);
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (this.options.mode === 'field' && this.fieldController?.isActive) return;
    if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 7) return;
    this.updatePointer(event);
    if (this.hoveredId) {
      this.activate(this.hoveredId, 1);
      this.options.onSelect?.(this.hoveredId);
      this.setFocus(this.hoveredId);
      return;
    }
    if (this.pointerBiomeId) {
      const runtime = this.runtimes.get(this.pointerBiomeId);
      if (runtime) {
        runtime.state.tension = Math.min(1, runtime.state.tension + 0.08);
        runtime.state.activity = Math.min(1, runtime.state.activity + 0.1);
      }
    }
  };

  private handleDoubleClick = () => {
    if (this.options.mode === 'field' && this.fieldController?.isActive) return;
    if (this.hoveredId) this.options.onEnter?.(this.hoveredId);
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.options.mode === 'field' && this.fieldController?.isActive) return;
    const records = this.options.records;
    const selectedIndex = Math.max(0, records.findIndex((record) => record.id === this.options.selectedId));
    if (event.key === 'Tab' && this.options.mode === 'field') {
      event.preventDefault();
      const record = records[(selectedIndex + 1) % records.length];
      this.options.onSelect?.(record.id);
      this.setFocus(record.id);
    } else if (event.key === 'Enter') {
      const id = this.options.selectedId ?? records[0]?.id;
      if (id) this.activate(id, 1);
    } else if (event.key === 'Escape' && this.options.mode === 'field') {
      this.options.onSelect?.(null);
      this.setFocus(null);
    }
  };

  private handleControlStart = () => { this.userInteracting = true; };
  private handleControlEnd = () => { this.userInteracting = false; };

  private resize = () => {
    const width = Math.max(1, this.options.mount.clientWidth);
    const height = Math.max(1, this.options.mount.clientHeight);
    this.mobile = width <= 760;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.15 : 1.5));
    this.renderer.setSize(width, height, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
    }
    this.creatureHalo?.setSize(width, height);
    this.fieldReferenceLandscape?.splats.setSize();
    this.camera.aspect = width / height;
    this.camera.fov = this.options.mode === 'field' ? (this.mobile ? 64 : 58) : (this.mobile ? 39 : 33);
    this.camera.updateProjectionMatrix();
  };

  setOptions(options: Partial<Pick<HabitatWorldOptions, 'selectedId' | 'observation' | 'paused'>>) {
    const selectionChanged = options.selectedId !== undefined && options.selectedId !== this.options.selectedId;
    this.options = { ...this.options, ...options };
    if (selectionChanged) this.setFocus(options.selectedId ?? null);
  }

  activate(id: string, strength = 1) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.state.activationUntil = runtime.state.worldTime + 4.5 + strength * 2;
    runtime.state.activity = Math.min(1, runtime.state.activity + 0.34 * strength);
    runtime.state.signalStrength = Math.min(1, runtime.state.signalStrength + 0.42 * strength);
    runtime.state.tension = Math.min(1, runtime.state.tension + 0.16 * strength);
  }

  /* --- 필드 링크 (field-page.js ↔ stage.js) --------------------------------
   * 두 필드의 카메라는 각자 돌고 개체도 각자 배회하므로 화면 좌표는 서로 쓸 수 없다.
   * 월드 좌표와 개체 위치를 주고받고, 받은 쪽이 자기 카메라로 다시 투영한다. */

  /** 마지막 pointermove 가 가리킨 월드 점. 개체 표면이면 그 개체 id 가 붙는다. 하늘이면 null. */
  getPointerField(): PointerFieldPoint | null {
    return this.pointerField;
  }

  /** 개체 밑동(creatureRoot)의 현재 월드 위치 */
  getCreatureAnchors(): CreatureAnchor[] {
    return Array.from(this.runtimes.values()).map((runtime) => {
      const world = runtime.creatureRoot.getWorldPosition(this.scratchWorld);
      return { id: runtime.record.id, x: world.x, y: world.y, z: world.z };
    });
  }

  /** 월드 점 → 캔버스 기준 정규화 화면 좌표(0~1, 위=0). 카메라 뒤에 있으면 null. */
  fieldToScreen(point: { x: number; y: number; z: number }): { x: number; y: number } | null {
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.scratchWorld.set(point.x, point.y, point.z).applyMatrix4(this.camera.matrixWorldInverse);
    if (this.scratchWorld.z > -0.1) return null; // 카메라는 -z 를 본다
    this.scratchWorld.applyMatrix4(this.camera.projectionMatrix);
    return { x: (this.scratchWorld.x + 1) / 2, y: (1 - this.scratchWorld.y) / 2 };
  }

  /** 지금 앰비언트 카메라가 쓰는 각도(rad). 필드 1 이 1초마다 스테이지에 보낸다. */
  getAmbientAngle() {
    return Date.now() * AMBIENT_ORBIT_RATE + this.ambientOffset;
  }

  /** 상대(콘솔) 카메라 각도를 최단 호로 부드럽게 따라간다. null 이면 자기 벽시계로 돌아간다. */
  setAmbientAngle(angle: number | null) {
    if (angle === null || !Number.isFinite(angle)) {
      this.ambientOffsetTarget = 0;
      return;
    }
    const delta = angle - Date.now() * AMBIENT_ORBIT_RATE;
    this.ambientOffsetTarget = Math.atan2(Math.sin(delta), Math.cos(delta));
  }

  enterFirstPerson() {
    this.fieldController?.requestEntry();
  }

  exitFirstPerson() {
    this.fieldController?.exit();
  }

  private inspectViewTarget() {
    this.raycaster.setFromCamera(this.centerNdc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    let target: THREE.Object3D | null = hit?.object ?? null;
    while (target && !target.userData.creatureId) target = target.parent;
    const rayId = (target?.userData.creatureId as string | undefined) ?? null;
    if (rayId) return rayId;

    let nearestId: string | null = null;
    let nearestDistance = 13;
    this.runtimes.forEach((runtime) => {
      const world = runtime.creatureRoot.getWorldPosition(this.scratchWorld);
      const distance = world.distanceTo(this.camera.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = runtime.record.id;
      }
    });
    return nearestId;
  }

  private interactFromView() {
    if (this.options.mode !== 'field' || !this.fieldController?.isActive) return;
    const id = this.inspectViewTarget();
    if (!id) return;
    this.activate(id, 1);
    this.options.onSelect?.(id);
  }

  private setFocus(id: string | null | undefined, immediate = false) {
    const runtime = id ? this.runtimes.get(id) : null;
    this.focusStartedAt = performance.now();
    if (runtime && this.options.mode === 'field') {
      this.activate(runtime.record.id, 0.45);
    } else if (this.options.mode === 'field') {
      this.desiredTarget.set(0, 1.5, 0);
    } else {
      this.desiredTarget.set(0, -0.4, 0);
      this.desiredCamera.set(this.mobile ? 19 : 24, this.mobile ? 27 : 22, this.mobile ? 42 : 34);
    }
    if (immediate && this.options.mode === 'single') {
      this.controls.target.copy(this.desiredTarget);
      this.camera.position.copy(this.desiredCamera);
    }
  }

  private stepWorld(runtime: HabitatRuntime, dt: number) {
    const { state, context } = runtime;
    state.worldTime += dt;

    if (state.currentEvent && state.worldTime >= state.eventEndsAt) {
      state.currentEvent = null;
      state.nextEventAt = state.worldTime + 8 + seededUnit(state.seed + state.eventHistory.length * 7, 151) * 17;
    }
    if (!state.currentEvent && state.worldTime >= state.nextEventAt) {
      beginEvent(chooseWeightedEvent(context.config.events, state), state);
    }

    const active = state.activationUntil > state.worldTime ? 1 : 0;
    const eventEnergy = state.currentEvent ? 0.36 : 0;
    const autonomous = 0.27 + Math.sin(state.worldTime * 0.071 + state.seed) * 0.07;
    const pointer = runtime.pointerInfluence * 0.14;
    const targetActivity = clamp(autonomous + active * 0.58 + eventEnergy + pointer, 0.08, 1);
    state.activity = damp(state.activity, targetActivity, active ? 3.7 : 0.32, dt);
    state.tension = damp(state.tension, state.currentEvent === 'interference' ? 0.74 : active ? 0.52 : 0.18, 0.48, dt);

    let signalTarget = 0.3 + state.activity * 0.36 + Math.sin(state.worldTime * 0.13 + state.seed) * 0.08;
    if (state.currentEvent === 'light-wane') signalTarget *= 0.36;
    if (state.currentEvent === 'cluster-open' || state.currentEvent === 'node-transfer') signalTarget += 0.28;
    state.signalStrength = damp(state.signalStrength, clamp(signalTarget, 0.08, 1), 0.55, dt);
    state.weatherState = clamp(state.weatherState + Math.sin(state.worldTime * 0.017 + state.seed) * dt * 0.002, 0, 1);
    state.growth = clamp(state.growth + dt * (0.00008 + eventProgress(state, 'node-germination') * 0.0008 + eventProgress(state, 'cluster-open') * 0.00038), 0.2, 1);
    state.decay = clamp(state.decay + dt * 0.00003 - state.growth * dt * 0.000015, 0.05, 0.9);

    const influenceTarget = clamp(state.activity * 0.72 + runtime.pointerInfluence * 0.24, 0, 1);
    state.creatureInfluence = damp(state.creatureInfluence, influenceTarget, 5.2, dt);
    state.primaryResponse = damp(state.primaryResponse, state.creatureInfluence, 3.4, dt);
    state.secondaryResponse = damp(state.secondaryResponse, state.primaryResponse, 0.72, dt);
    state.residual = Math.max(state.residual - dt / 10, state.secondaryResponse * 0.74);
  }

  private updateCreature(runtime: HabitatRuntime, dt: number) {
    const { state, context } = runtime;
    const speed = context.config.id === 'accretion' ? 0.075 : context.config.id === 'phototropic' ? 0.115 : 0.065;
    const range = context.config.creatureRange;
    const targetX = Math.sin(state.worldTime * speed + state.seed) * range;
    const targetZ = Math.cos(state.worldTime * speed * 0.73 + state.seed * 0.6) * range * 0.66;
    runtime.influencePosition.x = damp(runtime.influencePosition.x, targetX, 0.46, dt);
    runtime.influencePosition.z = damp(runtime.influencePosition.z, targetZ, 0.46, dt);
    const ground = terrainHeight(context, runtime.influencePosition.x, runtime.influencePosition.z);
    runtime.influencePosition.y = ground + 0.08;
    runtime.creatureRoot.position.copy(runtime.influencePosition);
    runtime.creatureRoot.rotation.y += dt * (0.018 + state.activity * 0.025);
    const breath = 1 + Math.sin(state.worldTime * 0.61 + state.seed) * 0.004 + state.primaryResponse * 0.006;
    runtime.creatureBody.scale.setScalar(breath);

    if (state.worldTime - runtime.lastTrailAt > 0.28) {
      runtime.lastTrailAt = state.worldTime;
      runtime.trailPositions.shift();
      runtime.trailPositions.push(runtime.influencePosition.clone().add(new THREE.Vector3(0, 0.035, 0)));
      runtime.trail.geometry.setFromPoints(runtime.trailPositions);
    }
    const trailMaterial = runtime.trail.material as THREE.LineBasicMaterial;
    trailMaterial.opacity = (context.config.id === 'accretion' ? 0.13 : 0.045) + state.residual * 0.18;
  }

  private updateFieldReferenceLandscape(now: number, dt: number) {
    const reference = this.fieldReferenceLandscape;
    if (!reference) return;
    reference.pointerEnergy = damp(reference.pointerEnergy, 0, 2.15, dt);
    const motion = this.reducedMotion ? 0 : reference.pointerEnergy;
    const idleLift = this.reducedMotion ? 0 : Math.sin(now * 0.00038) * 0.045;
    reference.model.position.x = damp(
      reference.model.position.x,
      reference.basePosition.x + this.pointerNdc.x * motion * 0.16,
      1.9,
      dt,
    );
    reference.model.position.y = damp(
      reference.model.position.y,
      reference.basePosition.y + idleLift + motion * 0.06,
      1.4,
      dt,
    );
    reference.model.position.z = damp(
      reference.model.position.z,
      reference.basePosition.z - this.pointerNdc.y * motion * 0.12,
      1.9,
      dt,
    );
    reference.model.rotation.x = damp(
      reference.model.rotation.x,
      reference.baseRotation.x + this.pointerNdc.y * motion * 0.0025,
      1.6,
      dt,
    );
    reference.model.rotation.y = damp(
      reference.model.rotation.y,
      reference.baseRotation.y + this.pointerNdc.x * motion * 0.0035,
      1.6,
      dt,
    );
    reference.model.rotation.z = reference.baseRotation.z;
    const breath = 1 + (this.reducedMotion ? 0 : Math.sin(now * 0.00029 + 0.8) * 0.0015 + motion * 0.001);
    reference.model.scale.set(
      reference.baseScale.x * breath,
      reference.baseScale.y * breath,
      reference.baseScale.z * breath,
    );
    reference.splats.update(now / 1000, dt);
  }

  private applyEmergence(runtime: HabitatRuntime, now: number) {
    if (this.options.mode === 'field') return;
    const progress = clamp((now - runtime.enteredAt) / (this.reducedMotion ? 900 : 2800), 0, 1);
    const emergence = THREE.MathUtils.smoothstep(progress, 0, 1);
    runtime.emergence = emergence;
    const radial = 0.16 + emergence * 0.84;
    const vertical = 0.025 + emergence * 0.975;
    runtime.systems.terrain.mesh.scale.set(radial, vertical, radial);
    runtime.systems.contours.group.scale.set(radial, vertical, radial);
    runtime.systems.roots.scale.set(radial, vertical, radial);
    runtime.systems.features.group.scale.set(radial, vertical, radial);
    runtime.systems.biofilm.mesh.count = Math.min(
      runtime.systems.biofilm.mesh.count,
      Math.max(1, Math.floor(runtime.systems.biofilm.positions.length * emergence)),
    );
    runtime.systems.signals.mesh.count = Math.min(
      runtime.systems.signals.mesh.count,
      Math.max(1, Math.floor(runtime.systems.signals.positions.length * emergence)),
    );
    runtime.systems.annotations.visible = false;
    runtime.trail.visible = emergence > 0.58;
    runtime.creatureRoot.visible = emergence > 0.31;
    runtime.creatureRoot.scale.setScalar(THREE.MathUtils.smoothstep(emergence, 0.28, 0.72));
  }

  private animate = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (!this.options.paused && document.visibilityState === 'visible') {
      this.runtimes.forEach((runtime) => {
        this.stepWorld(runtime, this.reducedMotion ? dt * 0.35 : dt);
        this.updateCreature(runtime, dt);
        // 호버(pointerInfluence)와 활성(activity: pulse·목업 trigger) 중 센 쪽이 파티클을 흔든다
        runtime.particles?.update(now / 1000, dt, Math.max(runtime.pointerInfluence * 0.55, runtime.state.activity));
        updateHabitatSystems(runtime.context, runtime.systems, runtime.influencePosition, Boolean(this.options.observation));
        this.applyEmergence(runtime, now);

        const selected = this.options.selectedId;
        const focusTarget = selected ? (selected === runtime.record.id ? 1 : 0.56) : 1;
        runtime.focusBlend = damp(runtime.focusBlend, focusTarget, 1.7, dt);
        runtime.group.position.y = runtime.home.y - (1 - runtime.focusBlend) * 2.8;
        if (this.options.mode === 'field') runtime.group.scale.y = 0.72 + runtime.focusBlend * 0.28;
      });
    }

    this.commonLandscape?.update(now);
    this.updateFieldReferenceLandscape(now, dt);

    if (this.options.mode === 'field') {
      this.fieldController?.update(dt);
      if (this.options.ambient && !this.fieldController?.isActive && !this.reducedMotion) {
        // 약 3분에 한 바퀴 — 정지 화면처럼 보이지 않을 만큼만. 벽시계 기준인 이유는 AMBIENT_ORBIT_RATE 참고.
        this.ambientOffset = damp(this.ambientOffset, this.ambientOffsetTarget, 1.6, dt);
        const angle = Date.now() * AMBIENT_ORBIT_RATE + this.ambientOffset;
        const x = Math.sin(angle) * 27;
        const z = Math.cos(angle) * 27;
        this.camera.position.set(x, commonFieldHeight(x, z) + 3.2, z);
        this.camera.lookAt(0, 1.5, 0);
      }
      if (this.fieldController?.isActive) {
        const focused = this.inspectViewTarget();
        if (focused !== this.hoveredId) {
          this.hoveredId = focused;
          this.options.onProximity?.(focused);
        }
      }
    } else {
      if (!this.userInteracting) {
        const transition = now - this.focusStartedAt < 2200;
        this.controls.target.lerp(this.desiredTarget, transition ? 0.035 : 0.008);
        if (transition) this.camera.position.lerp(this.desiredCamera, 0.022);
      }
      this.controls.autoRotate = !this.reducedMotion && !this.userInteracting && now - this.focusStartedAt > 2200;
      this.controls.update();
    }

    const fog = this.scene.fog as THREE.FogExp2;
    const averageWeather = Array.from(this.runtimes.values()).reduce((sum, runtime) => sum + runtime.state.weatherState, 0) / Math.max(this.runtimes.size, 1);
    fog.density = (this.options.mode === 'field' ? 0.0064 : 0.0085) + averageWeather * 0.0015;

    if (now - this.lastSnapshot > 360) {
      this.lastSnapshot = now;
      this.options.onSnapshot?.(Array.from(this.runtimes.values()).map((runtime) => ({
        id: runtime.record.id,
        state: snapshotState(runtime.state),
        energy: runtime.state.signalStrength,
        stress: runtime.state.tension,
      })));
    }

    if (this.composer && this.creatureHalo) {
      this.creatureHalo.renderMask();
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.frame = window.requestAnimationFrame(this.animate);
  };

  private disposeObject(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((child) => {
      const object = child as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      if (object.geometry) geometries.add(object.geometry);
      const list = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      list.forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) textures.add(value); });
      });
      if (child.userData.ownedTexture instanceof THREE.Texture) textures.add(child.userData.ownedTexture);
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('dblclick', this.handleDoubleClick);
    canvas.removeEventListener('keydown', this.handleKeyDown);
    this.controls.removeEventListener('start', this.handleControlStart);
    this.controls.removeEventListener('end', this.handleControlEnd);
    this.controls.dispose();
    this.fieldController?.dispose();
    this.fieldController = null;
    this.fieldReferenceLandscape?.splats.dispose();
    this.fieldReferenceLandscape = null;
    this.creatureHalo?.dispose();
    this.creatureHalo = null;
    this.composer?.dispose();
    this.composer = null;
    this.runtimes.forEach((runtime) => {
      saveWorldState(runtime.record.id, runtime.state);
      runtime.particles?.dispose(); // FBO 와 데이터 텍스처는 씬 순회로는 안 잡힌다
      runtime.particles = null;
    });
    this.disposeObject(this.scene);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
    this.runtimes.clear();
  }
}
