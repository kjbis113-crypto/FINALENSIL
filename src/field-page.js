/**
 * 필드 1 — 아이맥 웹에 띄우는 공용 필드.
 *
 * 필드 2(빔프로젝터, stage.html)와 같은 엔진·같은 지형을 쓰되, 이쪽은 관람객이
 * 마우스로 만진다. 개체 위에 커서를 올리면 판독값이 뜨고, 누르면 그 개체가 깨어나며
 * 같은 신호가 릴레이를 타고 필드 2 로 건너가 프로젝터에서도 반응한다.
 */

import { HabitatWorld } from './field/HabitatWorld';
import { CREATURE_RECORDS } from './field/creatureRecords';
import { openFieldLink } from './field/field-link.js';
import { installStageShortcut } from './stage-window.js';

const mount = document.querySelector('#field-mount');
const loading = document.querySelector('#field-loading');
const stageDot = document.querySelector('#stage-dot');
const stageLabel = document.querySelector('#stage-label');
const readout = document.querySelector('#field-readout');
const readoutCode = document.querySelector('#readout-code');
const readoutSensor = document.querySelector('#readout-sensor');
const readoutLink = document.querySelector('#readout-link');

/** 도감 순번(1~4) — 아카이브 페이지의 ?id 와 같은 번호다 */
const archiveId = (creatureId) => CREATURE_RECORDS.findIndex((record) => record.id === creatureId) + 1;

let link = null;
let selectedId = null;
/** 이번 클릭이 개체를 집었는지 — 빈 곳을 눌렀을 때 선택을 푸는 데 쓴다 */
let pickedThisClick = false;

function showReadout(creatureId) {
  const record = CREATURE_RECORDS.find((candidate) => candidate.id === creatureId);
  if (!record) {
    readout.dataset.open = 'false';
    return;
  }
  readoutCode.textContent = record.code;
  readoutSensor.textContent = record.sensor;
  readoutLink.href = `/info.html?id=${archiveId(record.id)}`;
  readoutLink.setAttribute('aria-label', `Open the ${record.code} archive record`);
  readout.dataset.open = 'true';
}

const world = new HabitatWorld({
  mount,
  records: CREATURE_RECORDS,
  mode: 'field',
  // 조작이 없을 땐 천천히 돌고, 개체를 만지는 건 포인터로 한다
  ambient: true,
  // 클릭이 포인터 락을 잡아 1인칭으로 빠지면 개체를 고를 수 없다
  firstPerson: false,
  // 폐허 GLB 는 로드되는 순간 절차적 지형을 전부 숨긴다
  referenceLandscape: false,
  // 개체는 아카이브와 같은 GPU 포인트클라우드로
  creatureRenderer: 'particles',
  selectedId: null,
  observation: false,
  paused: false,
  onLoaded: (loaded, total) => {
    if (loaded >= total) {
      loading.remove();
      return;
    }
    loading.textContent = `ECOLOGIES GENERATING / ${String(loaded).padStart(2, '0')}—${String(total).padStart(2, '0')}`;
  },
  onProximity: (id) => {
    if (!selectedId) showReadout(id);
  },
  onSelect: (id) => {
    pickedThisClick = true;
    selectedId = id;
    world.setOptions({ selectedId: id });
    showReadout(id);
    // 프로젝터도 같은 개체를 비추고 한 번 반응한다
    link?.send({ type: 'focus', id });
    if (id) link?.send({ type: 'pulse', id, strength: 1 });
    // 그리고 실제 목업이 움직인다
    if (id) moveMockup(id);
  },
  onEnter: (id) => {
    window.location.assign(`/info.html?id=${archiveId(id)}`);
  },
  onImmersiveChange: () => undefined,
});

/* --- 목업 (ESP32) ---------------------------------------------------------
 * 세 목업은 허브 와이파이 ARCHIVE 에 고정 IP 로 붙은 HTTP 서버다. 화면에서 개체를
 * 누르면 브라우저가 그 목업의 /api/click 을 직접 부른다 (CORS 열려 있음).
 * 반대 방향 — 목업이 스스로 움직였을 때 — 은 브릿지가 /api/state 를 폴링해
 * trigger 로 중계해 준다. 개체가 쉽게 움직이고 동시에도 움직이므로, 물리 트리거는
 * 화면을 빼앗지 않고 개체를 깨우기만 한다. 페이지 이동은 관람객의 클릭으로만.
 */
/** unit → host. ?mockups=a,b,c 로 바꿀 수 있고 한 번 넣으면 기억한다 (현장에서 IP 가 다를 때). */
const MOCKUP_HOST = (() => {
  const fallback = { 1: '192.168.4.11', 2: '192.168.4.12', 3: '192.168.4.13' };
  const requested = new URLSearchParams(window.location.search).get('mockups');
  let hosts = null;
  try {
    if (requested) window.localStorage.setItem('ensil-mockups', requested);
    hosts = requested ?? window.localStorage.getItem('ensil-mockups');
  } catch { /* 저장소 없음 */ }
  if (!hosts) return fallback;
  return Object.fromEntries(hosts.split(',').map((host, index) => [index + 1, host.trim()]));
})();
const MOCKUP_CLICK_LEVEL = 2;          // /api/click?n= — 1 살짝 · 2 보통 · 3 크게
const TRIGGER_COOLDOWN_MS = 6_000;     // 같은 목업의 연속 트리거는 이 안에서 한 번만
const TRIGGER_CROWD_MS = 1_500;        // 이 안에 겹친 트리거는 깨우기만 하고 판독은 안 띄운다
const TRIGGER_READOUT_MS = 4_000;
/** 관람객이 한참 아무것도 안 만질 때, 같은 목업이 두 번 연달아 움직이면 그 개체의 아카이브로 넘어간다. */
const ATTRACT_NAVIGATION = false;
const ATTRACT_IDLE_MS = 30_000;
const ATTRACT_REPEAT_MS = 5_000;

const lastTriggerAt = {};
let lastWakeAt = 0;
let lastActivityAt = performance.now();
let readoutTimer = 0;
for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel']) {
  window.addEventListener(type, () => { lastActivityAt = performance.now(); }, { passive: true });
}

function moveMockup(creatureId, level = MOCKUP_CLICK_LEVEL) {
  const host = MOCKUP_HOST[archiveId(creatureId)];
  if (!host) return; // NO.4 에는 목업이 없다
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), 1500);
  fetch(`http://${host}/api/click?n=${level}`, { cache: 'no-store', signal: abort.signal })
    .catch(() => { /* 목업이 꺼져 있거나 다른 망 — 화면은 계속 간다 */ })
    .finally(() => window.clearTimeout(timer));
}

function handleHardware(msg) {
  if (msg.type !== 'trigger') return;
  const record = CREATURE_RECORDS[msg.unit - 1];
  if (!record) return;
  const now = performance.now();
  const previous = lastTriggerAt[msg.unit] ?? -Infinity;
  lastTriggerAt[msg.unit] = now;
  if (now - previous < TRIGGER_COOLDOWN_MS) return;

  // 깨우기 — 파티클이 흐트러진다. 프로젝터는 브릿지에서 같은 trigger 를 직접 받는다.
  world.activate(record.id, Math.min(2, Math.max(0.6, msg.strength ?? 1)));

  const crowded = now - lastWakeAt < TRIGGER_CROWD_MS;
  lastWakeAt = now;
  if (!crowded && selectedId === null) {
    showReadout(record.id);
    window.clearTimeout(readoutTimer);
    readoutTimer = window.setTimeout(() => { if (selectedId === null) readout.dataset.open = 'false'; }, TRIGGER_READOUT_MS);
  }

  if (ATTRACT_NAVIGATION && now - lastActivityAt > ATTRACT_IDLE_MS && now - previous < ATTRACT_REPEAT_MS) {
    window.location.assign(`/info.html?id=${archiveId(record.id)}`);
  }
}

link = openFieldLink('panel', {
  onHardware: handleHardware,
  onPeerChange: (alive) => {
    stageDot.dataset.alive = alive ? 'true' : 'false';
    stageLabel.textContent = alive ? 'STAGE LINKED' : 'STAGE OFFLINE';
  },
});

// 빈 곳을 누르면 선택 해제 — 다시 호버 판독으로 돌아간다.
// 캔버스의 핸들러가 먼저 돌고 개체를 집었으면 pickedThisClick 이 서 있다.
mount.addEventListener('pointerup', () => {
  window.setTimeout(() => {
    if (!pickedThisClick && selectedId !== null) {
      selectedId = null;
      world.setOptions({ selectedId: null });
      readout.dataset.open = 'false';
      link?.send({ type: 'focus', id: null });
    }
    pickedThisClick = false;
  }, 0);
});

window.addEventListener('pagehide', () => {
  world.dispose();
  link?.close();
});

// 운영용 — Ctrl+Alt+Shift+O 로 빔프로젝터 스테이지 창을 연다.
installStageShortcut();
