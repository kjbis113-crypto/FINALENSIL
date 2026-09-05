export const MODEL_CONFIGS = {
  1: {
    path: '/models/NO1.obj',
    scale: 1,
    rotation: [-Math.PI / 2, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 1,
  },
  2: {
    path: '/models/NO2.obj',
    scale: 1,
    rotation: [0, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 0.95,
  },
  3: {
    path: '/models/NO3.obj',
    scale: 1,
    rotation: [0, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 0.95,
  },
  4: {
    path: '/models/NO4.obj',
    scale: 1,
    rotation: [-Math.PI / 2, 0, 0],
    initialRotation: [0, 0, 0],
    particleDensity: 1,
    pointSize: 1,
  },
};

export const QUALITY_LEVELS = {
  low: { textureSize: 240, trailParticles: 620, bloom: false, pixelRatio: 1.25 },
  medium: { textureSize: 384, trailParticles: 1080, bloom: true, pixelRatio: 1.5 },
  high: { textureSize: 480, trailParticles: 1700, bloom: true, pixelRatio: 1.7 },
  ultra: { textureSize: 672, trailParticles: 2300, bloom: true, pixelRatio: 1.85 },
};

export const DEFAULT_PARAMETERS = {
  pointSize: 1,
  interactionRadius: 0.44,
  interactionStrength: 7.2,
  curlStrength: 2,
  curlScale: 1,
  curlSpeed: 0.055,
  returnStrength: 0.65,
  tangentStrength: 5.2,
  velocityInfluence: 2.6,
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

  const memory = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;

  if (mobile || memory <= 4 || cores <= 4) return 'low';
  if (memory <= 8 || cores <= 8) return 'medium';
  return 'high';
};
