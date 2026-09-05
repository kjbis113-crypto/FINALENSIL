import * as THREE from 'three';

/**
 * 필드 파노라마 — 발효 생태계 텍스처를 안쪽에서 보는 뷰.
 *
 * 구버전 ENSIL 의 src/components/field/PanoramaViewer.tsx 를 React 없이 옮긴 것.
 * 프로젝터에 띄우는 화면이라 콘솔용 UI(개체 핫스팟, VR 버튼, 자이로)는 빼고
 * 파노라마 렌더링과 시점 조작만 남겼다.
 *
 * 텍스처가 2:1 등장방형이면 구(球)로 감싸 360° 로, 아니면 원통 조각에 입혀
 * 좌우 ±47° 안에서만 둘러보게 한다. 현재 에셋(1456x816)은 후자.
 */

const PANORAMA_URL = '/panoramas/ensil-field-biome.png';
const TURN_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function createPanoramaField(mount, { onProgress, onMode } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !window.matchMedia('(pointer: coarse)').matches,
      powerPreference: 'high-performance',
    });
  } catch {
    onMode?.('error');
    return { dispose: () => undefined, setPaused: () => undefined };
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x002928);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.01, 80);
  camera.rotation.order = 'YXZ';

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'ENSIL electronic fermentation field panorama. Drag to look around.',
  );
  renderer.domElement.style.touchAction = 'none';
  mount.appendChild(renderer.domElement);

  let panoramaMesh = null;
  let panoramaMode = 'limited';
  let paused = false;
  let yaw = 0;
  let pitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let dragging = false;
  let pointerId = -1;
  let pointerX = 0;
  let pointerY = 0;
  let previousFrame = performance.now();
  const keys = new Set();
  const yawLimit = THREE.MathUtils.degToRad(47);
  const pitchMin = THREE.MathUtils.degToRad(-18);
  const pitchMax = THREE.MathUtils.degToRad(24);

  const applyTexture = (texture) => {
    const image = texture.image;
    const aspect = (image.width ?? 16) / Math.max(image.height ?? 9, 1);
    panoramaMode = Math.abs(aspect - 2) < 0.08 ? '360' : 'limited';
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const geometry = panoramaMode === '360'
      ? new THREE.SphereGeometry(30, 96, 48)
      : new THREE.CylinderGeometry(10, 10, 20, 96, 1, true, -1.78, 3.56);
    if (panoramaMode === '360') geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: panoramaMode === '360' ? THREE.FrontSide : THREE.BackSide,
    });
    panoramaMesh = new THREE.Mesh(geometry, material);
    scene.add(panoramaMesh);
    renderer.domElement.dataset.panoramaMode = panoramaMode;
    onProgress?.(100);
    onMode?.(panoramaMode);
  };

  new THREE.TextureLoader().load(
    PANORAMA_URL,
    applyTexture,
    (event) => event.total && onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100))),
    () => onMode?.('error'),
  );

  const onPointerDown = (event) => {
    dragging = true;
    pointerId = event.pointerId;
    pointerX = event.clientX;
    pointerY = event.clientY;
    renderer.domElement.setPointerCapture?.(event.pointerId);
    renderer.domElement.focus();
  };
  const onPointerMove = (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    pointerX = event.clientX;
    pointerY = event.clientY;
    targetYaw -= dx * 0.0032;
    targetPitch = THREE.MathUtils.clamp(targetPitch - dy * 0.0028, pitchMin, pitchMax);
    if (panoramaMode === 'limited') targetYaw = THREE.MathUtils.clamp(targetYaw, -yawLimit, yawLimit);
  };
  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
  };
  const onWheel = (event) => {
    event.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.025, 52, 72);
    camera.updateProjectionMatrix();
  };
  const onKeyDown = (event) => {
    if (!TURN_KEYS.includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  };
  const onKeyUp = (event) => keys.delete(event.code);
  const onVisibility = () => {
    if (document.hidden) keys.clear();
  };

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibility);

  const resize = () => {
    const width = Math.max(mount.clientWidth, 1);
    const height = Math.max(mount.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  renderer.setAnimationLoop((frameTime) => {
    if (document.hidden) return;
    const dt = Math.min((frameTime - previousFrame) / 1000, 0.05);
    previousFrame = frameTime;
    if (!paused) {
      const turn = dt * 0.72;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) targetYaw += turn;
      if (keys.has('KeyD') || keys.has('ArrowRight')) targetYaw -= turn;
      if (keys.has('KeyW') || keys.has('ArrowUp')) targetPitch += turn * 0.6;
      if (keys.has('KeyS') || keys.has('ArrowDown')) targetPitch -= turn * 0.6;
      targetPitch = THREE.MathUtils.clamp(targetPitch, pitchMin, pitchMax);
      if (panoramaMode === 'limited') targetYaw = THREE.MathUtils.clamp(targetYaw, -yawLimit, yawLimit);
      const damping = 1 - Math.exp(-9 * dt);
      yaw = THREE.MathUtils.lerp(yaw, targetYaw, damping);
      pitch = THREE.MathUtils.lerp(pitch, targetPitch, damping);
    }
    const baseYaw = panoramaMode === 'limited' ? Math.PI : 0;
    camera.rotation.set(pitch, baseYaw + yaw, 0, 'YXZ');
    renderer.render(scene, camera);
  });

  return {
    setPaused: (value) => {
      paused = value;
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
      panoramaMesh?.geometry.dispose();
      if (panoramaMesh?.material) {
        panoramaMesh.material.map?.dispose();
        panoramaMesh.material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
