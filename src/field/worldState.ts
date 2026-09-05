import type { HabitatEventType, HabitatWorldState, PersistedHabitatState, WeightedEvent } from './types';

const STORAGE_PREFIX = 'ensil-habitat-v2:';

export function seededUnit(seed: number, offset: number) {
  const value = Math.sin(seed * 92.817 + offset * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function fallbackSeed(id: string) {
  return Array.from(id).reduce((total, character) => total + character.charCodeAt(0) * 17, 173);
}

export function loadWorldState(recordId: string): HabitatWorldState {
  const seed = fallbackSeed(recordId);
  let persisted: PersistedHabitatState | null = null;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${recordId}`);
    if (raw) persisted = JSON.parse(raw) as PersistedHabitatState;
  } catch {
    persisted = null;
  }

  const base: PersistedHabitatState = persisted ?? {
    seed,
    growth: 0.46 + seededUnit(seed, 2) * 0.2,
    decay: 0.16 + seededUnit(seed, 3) * 0.18,
    activity: 0.28 + seededUnit(seed, 4) * 0.18,
    signalStrength: 0.36 + seededUnit(seed, 5) * 0.24,
    terrainStateSeed: Math.floor(seededUnit(seed, 6) * 100000),
    eventHistory: [],
    savedAt: Date.now(),
  };

  const elapsedAway = Math.min(300, Math.max(0, Date.now() - base.savedAt) / 1000);
  return {
    ...base,
    growth: Math.min(1, base.growth + elapsedAway * 0.00012),
    decay: Math.min(1, base.decay + elapsedAway * 0.00004),
    worldTime: elapsedAway,
    tension: 0.2,
    weatherState: seededUnit(base.seed, 8),
    creatureInfluence: 0.32,
    primaryResponse: 0.24,
    secondaryResponse: 0.2,
    residual: 0.18,
    nextEventAt: 3 + seededUnit(base.seed, 9) * 5,
    eventStartedAt: -1,
    eventEndsAt: -1,
    currentEvent: null,
    activationUntil: -1,
  };
}

export function saveWorldState(recordId: string, state: HabitatWorldState) {
  const persisted: PersistedHabitatState = {
    seed: state.seed,
    growth: state.growth,
    decay: state.decay,
    activity: state.activity,
    signalStrength: state.signalStrength,
    terrainStateSeed: state.terrainStateSeed,
    eventHistory: state.eventHistory.slice(-12),
    savedAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${recordId}`, JSON.stringify(persisted));
  } catch {
    // Session persistence is progressive enhancement; the world still runs without it.
  }
}

export function chooseWeightedEvent(events: WeightedEvent[], state: HabitatWorldState): WeightedEvent {
  const total = events.reduce((sum, event) => sum + event.weight, 0);
  let cursor = seededUnit(state.seed + state.eventHistory.length * 13, Math.floor(state.worldTime * 10)) * total;
  for (const event of events) {
    cursor -= event.weight;
    if (cursor <= 0) return event;
  }
  return events[events.length - 1];
}

export function beginEvent(event: WeightedEvent, state: HabitatWorldState) {
  const durationRandom = seededUnit(state.seed + state.eventHistory.length * 19, 21);
  state.currentEvent = event.type;
  state.eventStartedAt = state.worldTime;
  state.eventEndsAt = state.worldTime + event.duration[0] + (event.duration[1] - event.duration[0]) * durationRandom;
  state.eventHistory.push({ type: event.type, at: Date.now() });
}

export function eventProgress(state: HabitatWorldState, type?: HabitatEventType) {
  if (!state.currentEvent || (type && state.currentEvent !== type)) return 0;
  const duration = Math.max(0.001, state.eventEndsAt - state.eventStartedAt);
  const progress = Math.max(0, Math.min(1, (state.worldTime - state.eventStartedAt) / duration));
  return Math.sin(progress * Math.PI);
}
