import type * as THREE from 'three';
import type { CreatureRecord, CreatureState } from './creatureRecords';

export type BiomeId = 'accretion' | 'phototropic' | 'resonance' | 'radial';

export type HabitatEventType =
  | 'fragment-emergence'
  | 'root-seek'
  | 'terrain-compression'
  | 'cluster-open'
  | 'light-wane'
  | 'fibre-orient'
  | 'inward-resonance'
  | 'interference'
  | 'terrain-breath'
  | 'node-transfer'
  | 'path-failure'
  | 'node-germination';

export type WeightedEvent = { type: HabitatEventType; weight: number; duration: [number, number] };

export type HabitatBiomeConfig = {
  id: BiomeId;
  recordId: string;
  title: string;
  concept: string;
  terrainProfile: 'basin' | 'terrace' | 'resonance' | 'radial';
  terrainAmplitude: number;
  contourCount: number;
  rootDensity: number;
  biofilmDensity: number;
  signalNodes: number;
  signalColor: number;
  errorColor: number;
  fogColor: number;
  fogDensity: number;
  creatureScale: number;
  creatureRange: number;
  events: WeightedEvent[];
};

export type PersistedHabitatState = {
  seed: number;
  growth: number;
  decay: number;
  activity: number;
  signalStrength: number;
  terrainStateSeed: number;
  eventHistory: Array<{ type: HabitatEventType; at: number }>;
  savedAt: number;
};

export type HabitatWorldState = PersistedHabitatState & {
  worldTime: number;
  tension: number;
  weatherState: number;
  creatureInfluence: number;
  primaryResponse: number;
  secondaryResponse: number;
  residual: number;
  nextEventAt: number;
  eventStartedAt: number;
  eventEndsAt: number;
  currentEvent: HabitatEventType | null;
  activationUntil: number;
};

export type HabitatSnapshot = {
  id: string;
  state: CreatureState;
  energy: number;
  stress: number;
};

export type HabitatBuildContext = {
  record: CreatureRecord;
  config: HabitatBiomeConfig;
  state: HabitatWorldState;
  group: THREE.Group;
  terrainWidth: number;
  terrainDepth: number;
  detail: number;
  mobile: boolean;
};
