export type CreatureState = 'idle' | 'forage' | 'curious' | 'startled' | 'social' | 'rest';

export type CreatureRecord = {
  id: string;
  code: string;
  glyphIndex: number;
  name: string;
  shortName: string;
  modelUrl?: string;
  sensor: string;
  input: string;
  response: string;
  status: 'LIVE MODEL' | 'MODEL PENDING';
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    paper: string;
    ink: string;
  };
  temperament: {
    speed: number;
    curiosity: number;
    fear: number;
    sociality: number;
  };
  ecology: {
    habitat: string;
    metabolism: string;
    reproduction: string;
    lifespan: string;
  };
  archive: {
    origin: string;
    emergence: string;
    characteristics: string;
    motif: string;
  };
  observations: Array<{ time: string; state: CreatureState; note: string }>;
};

export const CREATURE_RECORDS: CreatureRecord[] = [
  {
    id: 'eo-005',
    code: 'NO.01',
    glyphIndex: 4,
    name: 'No.01',
    shortName: 'No.01',
    modelUrl: '/models/eo-005-optic-mimic.glb',
    sensor: 'Click switch / pressure',
    input: 'Click signal / pressure',
    response: 'Directional light emission',
    status: 'LIVE MODEL',
    palette: { primary: '#002928', secondary: '#D9D9D9', accent: '#D9D9D9', paper: '#FFFFFF', ink: '#002928' },
    temperament: { speed: 0.28, curiosity: 0.57, fear: 0.21, sociality: 0.66 },
    ecology: {
      habitat: 'Sealed desk drawers and abandoned input devices.',
      metabolism: 'Converts pressure and click signals into directional light.',
      reproduction: 'Uses light emissions for limited communication with other organisms.',
      lifespan: 'Persists while its click circuitry and luminous organ remain functional.',
    },
    archive: {
      origin: 'Gaming keyboard, mouse',
      emergence: 'A gaming keyboard and mouse, abandoned deep inside a desk drawer, slowly fermented in an enclosed space and developed a unified form.',
      characteristics: 'A cross-shaped organism with a large luminous organ spanning its body. The circuitry that once exchanged click signals remains as a directional light response. Pressure on the body releases light in a specific direction. This is understood as a means of signalling other organisms; the direction of the light is its only known form of expression.',
      motif: 'Starfish, moon-jelly larvae',
    },
    observations: [
      { time: '17:43:10', state: 'startled', note: 'Sent a signal through its right luminous organ after detecting pressure.' },
      { time: '17:38:22', state: 'social', note: 'Emitted a brief directional light toward a neighbouring organism.' },
      { time: '17:24:50', state: 'idle', note: 'The luminous organ stabilised at a low intensity.' },
    ],
  },
  {
    id: 'eo-002',
    code: 'NO.02',
    glyphIndex: 1,
    name: 'No.02',
    shortName: 'No.02',
    modelUrl: '/models/eo-002-tendon-drifter.glb',
    sensor: 'Exposed wire / current sense',
    input: 'Proximity / external stimulus',
    response: 'Tail contraction / inward curl',
    status: 'LIVE MODEL',
    palette: { primary: '#002928', secondary: '#D9D9D9', accent: '#D9D9D9', paper: '#FFFFFF', ink: '#002928' },
    temperament: { speed: 0.34, curiosity: 0.91, fear: 0.18, sociality: 0.82 },
    ecology: {
      habitat: 'The corner of a drawer where cables remained tangled for years.',
      metabolism: 'Reads proximity and outside stimuli through residual current sensitivity.',
      reproduction: 'Erases the boundaries between individual wires and fuses them into one flexible body.',
      lifespan: 'Persists while its exposed-wire senses and articulated tail remain intact.',
    },
    archive: {
      origin: 'Bundle of electrical cables',
      emergence: 'Cables tangled for years in the corner of a drawer fermented until their individual forms could no longer be distinguished. The boundaries of separate wires dissolved as they fused into one flexible body.',
      characteristics: 'A circular body with exposed wiring and a flexible, multi-jointed tail. Its memory of conducting current remains as an extreme sensitivity to outside stimuli. When it detects an approaching presence, the tail curls inward.',
      motif: 'Neuron',
    },
    observations: [
      { time: '17:40:12', state: 'startled', note: 'Detected an approaching signal and curled its tail toward the body.' },
      { time: '17:31:18', state: 'curious', note: 'The tip of the tail responded to a minute change in external current.' },
      { time: '17:23:44', state: 'idle', note: 'The articulated tail slowly relaxed after the stimulus disappeared.' },
    ],
  },
  {
    id: 'eo-003',
    code: 'NO.03',
    glyphIndex: 2,
    name: 'No.03',
    shortName: 'No.03',
    modelUrl: '/models/eo-003-echo-grazer.glb',
    sensor: 'Speaker diaphragm / CPU',
    input: 'Sound / voice / stimulus',
    response: 'Judgement / computation / vocal response',
    status: 'LIVE MODEL',
    palette: { primary: '#002928', secondary: '#D9D9D9', accent: '#D9D9D9', paper: '#FFFFFF', ink: '#002928' },
    temperament: { speed: 0.44, curiosity: 0.68, fear: 0.3, sociality: 0.72 },
    ecology: {
      habitat: 'A waste pile containing old speakers and desktop CPU fragments.',
      metabolism: 'Processes incoming sound through CPU circuitry before returning an individual response.',
      reproduction: 'Acquires distinct temperaments through accidental circuit recombination during fermentation.',
      lifespan: 'Persists while its computational circuit and vocal organ remain connected.',
    },
    archive: {
      origin: 'Speaker, CPU',
      emergence: 'Fragments of an old speaker and desktop CPU fermented in the same waste pile and connected by chance. Dormant computational circuits and a vocal organ began interacting, producing the ability to judge and speak.',
      characteristics: 'A round-bodied organism with a speaker diaphragm attached above it. It is the only recorded specimen capable of judgement and computation. Rather than simply reflecting sound, its CPU processes a signal before responding, so the same stimulus produces a different reaction each time. Response speed and pattern also vary between individuals, likely because accidental recombination produces subtly different circuit connections in every fermented body. The archive records it as the only species in which every individual has a distinct personality.',
      motif: 'Sea butterfly',
    },
    observations: [
      { time: '17:41:55', state: 'curious', note: 'Responded to three identical sound stimuli with a new pattern.' },
      { time: '17:28:14', state: 'social', note: 'Processed a neighbouring signal and returned it as a low resonance.' },
      { time: '17:19:03', state: 'rest', note: 'Computational activity declined as ambient sound fell below the threshold.' },
    ],
  },
  {
    id: 'eo-004',
    code: 'NO.04',
    glyphIndex: 3,
    name: 'No.04',
    shortName: 'No.04',
    modelUrl: '/models/eo-004-lumen-moth.glb',
    sensor: 'Bulb colony / light point',
    input: 'Collective current / inter-body link',
    response: 'Collective illumination / energy sharing',
    status: 'LIVE MODEL',
    palette: { primary: '#002928', secondary: '#D9D9D9', accent: '#D9D9D9', paper: '#FFFFFF', ink: '#002928' },
    temperament: { speed: 0.88, curiosity: 0.86, fear: 0.64, sociality: 0.39 },
    ecology: {
      habitat: 'Storage rooms and display cabinets where multiple bulbs were abandoned together.',
      metabolism: 'Shares luminous energy through a serially connected colony.',
      reproduction: 'Always emerges from fermentation in a group of at least three bodies.',
      lifespan: 'An organism that leaves the colony loses energy and its light goes out.',
    },
    archive: {
      origin: 'Light bulbs',
      emergence: 'Several bulbs abandoned in a storage room or display cabinet fermented at the same time, but developed as separate organisms.',
      characteristics: 'Each body is small and round with a mushroom-like form and a tiny light point on its crown. They are rarely found alone and always inhabit a site as a group. The species has strong colony cohesion and territorial awareness. A serial connection formed between bodies during fermentation; when an organism leaves the group, it loses energy. It is the only species classified as “single specimen observation impossible.” At least three are always found together, while isolated stragglers are discovered only after their lights have gone out.',
      motif: 'Jellyfish, dumbo octopus',
    },
    observations: [
      { time: '17:40:47', state: 'social', note: 'Four bodies maintained a serial connection and illuminated simultaneously.' },
      { time: '17:33:29', state: 'startled', note: 'Light intensity dropped rapidly when one body crossed the colony boundary.' },
      { time: '17:18:41', state: 'rest', note: 'The crown lights returned after the minimum colony size was restored.' },
    ],
  },
];

export function getCreatureRecord(id: string | null | undefined) {
  return CREATURE_RECORDS.find((creature) => creature.id === id) ?? CREATURE_RECORDS[0];
}
