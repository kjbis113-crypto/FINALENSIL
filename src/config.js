export const MODEL_CONFIGS = {
  1: {
    path: '/models/NO1.obj',
    scale: 1,
    rotation: [-Math.PI / 2, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 1,
    screenOffsetX: 0.09,
    frameScale: 0.75,
  },
  2: {
    path: '/models/NO2.obj',
    scale: 1,
    rotation: [0, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 0.95,
    screenOffsetX: 0.09,
    frameScale: 0.63,
  },
  3: {
    path: '/models/NO3.obj',
    scale: 1,
    rotation: [0, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 0.95,
    screenOffsetX: 0.07,
    frameScale: 0.68,
  },
  4: {
    path: '/models/NO4.obj',
    scale: 1,
    rotation: [0, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 1,
    screenOffsetX: 0.105,
    frameScale: 0.64,
  },
};

export const QUALITY_LEVELS = {
  low: {
    textureSize: 224,
    trailParticles: 0,
    trailCaptureInterval: 0,
    particleLayers: 1,
    bloom: false,
    pixelRatio: 1,
  },
  medium: {
    textureSize: 320,
    trailParticles: 560,
    trailCaptureInterval: 4,
    particleLayers: 2,
    bloom: false,
    pixelRatio: 1.25,
  },
  high: {
    textureSize: 432,
    trailParticles: 1100,
    trailCaptureInterval: 3,
    particleLayers: 3,
    bloom: true,
    pixelRatio: 1.5,
  },
  ultra: {
    textureSize: 576,
    trailParticles: 1700,
    trailCaptureInterval: 2,
    particleLayers: 3,
    bloom: true,
    pixelRatio: 1.7,
  },
};

export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export const DEFAULT_PARAMETERS = {
  pointSize: 1,
  interactionRadius: 0.6,
  interactionStrength: 9.6,
  curlStrength: 2,
  curlScale: 1,
  curlSpeed: 0.055,
  returnStrength: 0.65,
  tangentStrength: 6.2,
  velocityInfluence: 3.4,
  damping: 0.85,
  trailLength: 8,
  trailOpacity: 0.36,
  bloomStrength: 0.38,
  bloomRadius: 0.22,
  exposure: 1,
  cameraDistance: 4.15,
  freezeSimulation: false,
  showOriginalMesh: false,
  showInteractionSphere: false,
  disableTrails: false,
  disableBloom: false,
};

export const selectQuality = () => {
  const requested = new URLSearchParams(window.location.search).get('quality');
  if (requested && QUALITY_LEVELS[requested]) return requested;

  try {
    const adaptive = window.sessionStorage.getItem('ensil-adaptive-quality');
    if (adaptive && QUALITY_LEVELS[adaptive]) return adaptive;
  } catch {
    // Storage can be unavailable in privacy-restricted browser sessions.
  }

  const memory = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let legacyGpu = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance' });
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)).toLowerCase()
      : '';
    legacyGpu = /intel.*(hd|iris)|radeon.*(hd|r5|r7|r9|pro 4|pro 5[0-7]0)/i.test(renderer);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    legacyGpu = false;
  }

  if (mobile || reducedMotion || legacyGpu || memory <= 4 || cores <= 4) return 'low';
  if (memory <= 8 || cores <= 8) return 'medium';
  return 'high';
};
