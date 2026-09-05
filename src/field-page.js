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
import { createFluidLayer, createFluidStroke, createFluidPool } from './fluid/fluid-layer.js';

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
  // FIELD 에서만 폐허 GLB 표면을 고밀도 Gaussian-like splat으로 재구성한다.
  referenceLandscape: true,
  // 개체는 아카이브와 같은 GPU 포인트클라우드로
  creatureRenderer: 'particles',
  selectedId: null,
  observation: false,
  paused: false,
  onLoaded: (loaded, total) => {
    if (loaded >= total) {
      // Two frames: the first draw with particles compiles their shaders and
      // stutters; reveal after it so the fade-in is the first thing anyone sees.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        loading.remove();
        mount.classList.add('is-ready');
      }));
      return;
    }
    loading.textContent = `ECOLOGIES GENERATING / ${String(loaded).padStart(2, '0')}—${String(total).padStart(2, '0')}`;
  },
  onProximity: (id) => {
    if (!selectedId) showReadout(id);
    // 개체 위에 커서가 멈추면 그 자리에 유체가 고인다 — 스테이지도 같은 개체 위에 고인다
    if (id) pool.start(() => hoverPointer);
    else pool.stop();
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

/* --- 커서 유체 + 필드 2 로 커서 보내기 ------------------------------------
 * 구버전 ENSIL 의 커서 뒤 유체(FluidVeil)를 필드 위에 깐다 — 원형 솔리드 커서는 빼고 유체만.
 * 같은 커서를 월드 좌표로 필드 2 에 보낸다. 화면 좌표가 아닌 이유: 두 필드의 카메라는 각자
 * 다른 각도로 돌고 개체도 각자 배회하므로, "어느 지형 위 / 어느 개체 위"만이 양쪽에 공통이다.
 * 그 순간의 개체 위치(a)를 함께 보내면 스테이지가 자기 개체 자리로 옮겨 놓는다 (field/cursor-map.js).
 *
 *   { type: 'cursor',
 *     p: [x, z, h] | null,   // 커서가 가리킨 월드 점. h 는 개체 표면일 때 그 개체 밑동 위 높이 (지형이면 0). null = 커서 없음
 *     s: [sx, sy],           // 커서의 정규화 화면 좌표(0~1, 위=0). 카메라가 같으니(view) 개체에서 먼 곳은 이 자리 그대로
 *     hover: id | null,      // 커서가 얹힌 개체
 *     a: [[id, x, z], ...] } // 그 순간 필드 1 의 개체 밑동 위치
 *   { type: 'view', angle }  // 1초마다 — 앰비언트 카메라 각도. 스테이지가 같은 각도로 맞춘다
 */
const CURSOR_SEND_MS = 33; // 약 30Hz — 릴레이(WS)에 부담 없는 선. 브릿지는 이 봉투를 목업에 보내지 않는다
const fluid = createFluidLayer({ parent: mount });
const stroke = createFluidStroke(fluid);
const pool = createFluidPool(fluid);
/** 커서의 정규화 화면 좌표(0~1, 위=0) — 개체 위에 멈춘 커서 자리에 유체가 고이는 데 쓴다 */
let hoverPointer = null;
let lastCursorSentAt = 0;
let cursorTimer = 0;

const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;

function sendCursor() {
  lastCursorSentAt = performance.now();
  const point = world.getPointerField();
  if (!point) {
    link?.send({ type: 'cursor', p: null, hover: null });
    return;
  }
  const anchors = world.getCreatureAnchors();
  const under = point.creature ? anchors.find((anchor) => anchor.id === point.creature) : null;
  const lift = under ? Math.max(0, point.y - under.y) : 0;
  link?.send({
    type: 'cursor',
    p: [round2(point.x), round2(point.z), round2(lift)],
    s: hoverPointer ? [round3(hoverPointer.x), round3(hoverPointer.y)] : undefined,
    hover: point.creature,
    a: anchors.map(({ id, x, z }) => [id, round2(x), round2(z)]),
  });
}

/** 30Hz 로 묶어 보낸다 — 마지막 움직임은 반드시 나간다 */
function scheduleCursor() {
  if (cursorTimer) return;
  const wait = Math.max(0, CURSOR_SEND_MS - (performance.now() - lastCursorSentAt));
  cursorTimer = window.setTimeout(() => {
    cursorTimer = 0;
    sendCursor();
  }, wait);
}

mount.addEventListener('pointermove', (event) => {
  const rect = mount.getBoundingClientRect();
  hoverPointer = {
    x: (event.clientX - rect.left) / Math.max(1, rect.width),
    y: (event.clientY - rect.top) / Math.max(1, rect.height),
  };
  stroke.move(hoverPointer.x, hoverPointer.y, event.timeStamp);
  // 캔버스의 핸들러(HabitatWorld.updatePointer)가 먼저 돌아 있어 getPointerField 가 이 이벤트를 반영한다
  scheduleCursor();
});

mount.addEventListener('pointerleave', () => {
  hoverPointer = null;
  stroke.reset();
  pool.stop();
  window.clearTimeout(cursorTimer);
  cursorTimer = 0;
  link?.send({ type: 'cursor', p: null, hover: null });
});

/** 카메라 각도를 1초마다 스테이지에 알린다 — 두 맥의 시계가 어긋나도 프로젝터가 같은 각도에서 보게 (HabitatWorld.setAmbientAngle) */
const VIEW_SYNC_MS = 1_000;
window.setInterval(() => link?.send({ type: 'view', angle: Math.round(world.getAmbientAngle() * 1e5) / 1e5 }), VIEW_SYNC_MS);

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
  pool.stop();
  fluid?.dispose();
  world.dispose();
  link?.close();
});

// 운영용 — Ctrl+Alt+Shift+O 로 빔프로젝터 스테이지 창을 연다.
installStageShortcut();

// 검증용 — ?debug=true 면 필드와 유체를 콘솔에 노출한다 (interactive.js 와 같은 규칙)
if (new URLSearchParams(window.location.search).get('debug') === 'true') {
  window.__ENSIL__ = { world, fluid };
}
