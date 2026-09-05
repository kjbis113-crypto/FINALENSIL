/**
 * 스테이지 — 빔프로젝터에 띄우는 3D 공용 필드. 크롬·버튼 없이 구석 라벨만 두고,
 * 콘솔에서 온 focus/pulse 를 받아 개체를 반응시킨다.
 * 개체 상태는 1초마다 콘솔로 돌려보낸다.
 *
 * 구버전 ENSIL 의 src/routes/Stage.tsx + components/field/EcosystemCanvas.tsx 를
 * React 없이 옮긴 것. 필드 엔진(src/field/HabitatWorld.ts)은 그대로 쓴다.
 */

import { HabitatWorld } from './field/HabitatWorld';
import { CREATURE_RECORDS } from './field/creatureRecords';
import { openFieldLink } from './field/field-link';
import { isStageShortcut } from './stage-window';
import { commonFieldHeight } from './field/CommonFieldLandscape';
import { mapCursorToPeer } from './field/cursor-map.js';
import { createFluidLayer, createFluidStroke, createFluidPool } from './fluid/fluid-layer.js';

const SNAPSHOT_INTERVAL_MS = 1_000;

const mount = document.querySelector('#field-mount');
const loadingLabel = document.querySelector('#field-loading');
const consoleDot = document.querySelector('#console-dot');
const consoleLabel = document.querySelector('#console-label');
const page = document.querySelector('.stage-page');

let lastSnapshotAt = 0;
/** @type {ReturnType<typeof openFieldLink> | null} */
let link = null;

const world = new HabitatWorld({
  mount,
  records: CREATURE_RECORDS,
  mode: 'field',
  ambient: true,
  // 전체화면 진입도 클릭이라 1인칭이 같이 걸린다 — 프로젝터는 계속 천천히 돌기만 한다
  firstPerson: false,
  // 폐허 GLB 는 로드되는 순간 절차적 지형을 전부 숨기고 그 위를 덮는다 — 쓰지 않는다
  referenceLandscape: false,
  // 개체는 아카이브와 같은 GPU 포인트클라우드로
  creatureRenderer: 'particles',
  selectedId: null,
  observation: false,
  paused: false,
  onLoaded: (loaded, total) => {
    if (loaded >= total) {
      // Reveal one drawn frame after the last cloud attaches, past the shader-compile stutter.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        loadingLabel.remove();
        mount.classList.add('is-ready');
      }));
      return;
    }
    loadingLabel.textContent = `ECOLOGIES GENERATING / ${String(loaded).padStart(2, '0')}—${String(total).padStart(2, '0')}`;
  },
  onSelect: (id) => world.setOptions({ selectedId: id }),
  onSnapshot: (items) => {
    const now = performance.now();
    if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
    lastSnapshotAt = now;
    link?.send({
      type: 'snapshot',
      items: items.map(({ id, state, energy }) => ({ id, state, energy })),
    });
  },
  onEnter: () => undefined,
  onProximity: () => undefined,
  onImmersiveChange: () => undefined,
});

/* --- 콘솔(필드 1) 커서 → 유체 -----------------------------------------------
 * 관람객의 커서는 여기(프로젝터)에서만 액체가 된다 — 필드 1 자기 화면에는 유체가 없다.
 * 구버전 ENSIL 의 커서 뒤 유체(FluidVeil)를 그대로: 근백색 염료를 difference 로, 그 위에 키컬러 글레이즈.
 * 필드 1 의 커서가 화면 좌표(s)와 월드 좌표(p)로 함께 건너온다 (메시지 모양은 field-page.js 참고).
 * 카메라는 view 메시지로 콘솔과 같은 각도에 맞춰져 있으므로, 개체에서 먼 곳은 화면 좌표를 그대로 쓴다 —
 * 관람객이 보는 자리에 그대로 뜬다. 개체 근처에서는 그 순간 필드 1 의 개체 위치(a)와 이쪽 개체 위치를
 * 맞춰 "그 개체로부터의 오프셋"으로 옮긴 뒤(field/cursor-map.js) 이 카메라로 투영한다 — 두 필드의
 * 개체는 각자 배회하고 지형 높이도 다르지만, NO.2 를 더듬으면 프로젝터에서도 NO.2 위에 액체가
 * 흐르고, 멈추면 그 위에 고인다. 커서 자체(원)는 그리지 않는다 — 유체만.
 */
const fluid = createFluidLayer({ parent: mount });
// 점이 약 30Hz 로 오므로(필드 1 의 절반) 한 점당 힘과 염료를 키워 같은 굵기로 맞춘다
const stroke = createFluidStroke(fluid, { gain: 2.2, dyeGain: 1.5 });
const pool = createFluidPool(fluid);
/** 필드 1 커서가 마지막으로 놓인 자리 — 이쪽 월드 좌표(개체 기준으로 옮긴 것)와 필드 1 화면 좌표 */
let cursorWorld = null;
let cursorScreen = null;

/** 화면 좌표(먼 곳)와 개체 기준 투영(가까운 곳)을 anchored 가중으로 섞는다. 카메라가 돌므로 매 프레임 다시 계산. */
function projectCursor() {
  if (!cursorWorld && !cursorScreen) return null;
  const anchored = cursorWorld && cursorWorld.anchored > 0 ? world.fieldToScreen(cursorWorld) : null;
  let screen = cursorScreen;
  if (anchored && cursorScreen) {
    const t = cursorWorld.anchored;
    screen = { x: cursorScreen.x + (anchored.x - cursorScreen.x) * t, y: cursorScreen.y + (anchored.y - cursorScreen.y) * t };
  } else if (anchored) {
    screen = anchored;
  }
  if (!screen || screen.x < -0.05 || screen.x > 1.05 || screen.y < -0.05 || screen.y > 1.05) return null;
  return screen;
}

function handleCursor(msg) {
  if (!fluid) return;
  if (!msg.p) {
    cursorWorld = null;
    cursorScreen = null;
    stroke.reset();
    pool.stop();
    return;
  }
  const fromAnchors = (msg.a ?? []).map(([id, x, z]) => ({ id, x, z }));
  cursorWorld = mapCursorToPeer(
    { x: msg.p[0], z: msg.p[1], h: msg.p[2] },
    fromAnchors,
    world.getCreatureAnchors(),
    { hover: msg.hover, groundHeight: commonFieldHeight },
  );
  cursorScreen = Array.isArray(msg.s) ? { x: msg.s[0], y: msg.s[1] } : null;
  const screen = projectCursor();
  if (!screen) {
    stroke.reset();
    pool.stop();
    return;
  }
  stroke.move(screen.x, screen.y);
  if (msg.hover) pool.start(projectCursor);
  else pool.stop();
}

/** 콘솔 카메라 각도 — 1초마다 온다. 끊기면 잠시 뒤 자기 벽시계로 돌아간다. */
const VIEW_STALE_MS = 5_000;
let viewTimer = 0;
function handleView(msg) {
  world.setAmbientAngle(typeof msg.angle === 'number' ? msg.angle : null);
  window.clearTimeout(viewTimer);
  viewTimer = window.setTimeout(() => world.setAmbientAngle(null), VIEW_STALE_MS);
}

link = openFieldLink('stage', {
  onMessage: (msg) => {
    if (msg.type === 'cursor') handleCursor(msg);
    if (msg.type === 'view') handleView(msg);
    if (msg.type === 'pulse') {
      world.activate(msg.id, msg.strength);
      flashPulse();
    }
    if (msg.type === 'focus') world.setOptions({ selectedId: msg.id });
  },
  // 목업이 스스로 움직이면 브릿지가 trigger 를 보낸다 — 그 개체가 프로젝터에서 흐트러진다
  onHardware: (msg) => {
    if (msg.type !== 'trigger') return;
    const record = CREATURE_RECORDS[msg.unit - 1];
    if (!record) return;
    world.activate(record.id, Math.min(2, Math.max(0.6, msg.strength ?? 1)));
    flashPulse();
  },
  onPeerChange: (alive) => {
    consoleDot.dataset.alive = alive ? 'true' : 'false';
    consoleLabel.textContent = alive ? 'CONSOLE LINKED' : 'CONSOLE WAITING';
  },
});

/** 콘솔 신호가 올 때마다 화면 전체에 한 번 번지는 빛 — 애니메이션은 매번 새로 시작한다. */
function flashPulse() {
  document.querySelector('.stage-page__pulse')?.remove();
  const pulse = document.createElement('div');
  pulse.className = 'stage-page__pulse';
  pulse.setAttribute('aria-hidden', 'true');
  pulse.addEventListener('animationend', () => pulse.remove(), { once: true });
  page.append(pulse);
}

// 전체화면 — 사용자 제스처가 필요하므로 첫 클릭 또는 단축키(F / Ctrl+Alt+Shift+O)로 진입
const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
};

window.addEventListener('pointerdown', () => {
  if (!document.fullscreenElement) toggleFullscreen();
});

window.addEventListener('keydown', (event) => {
  if (isStageShortcut(event) || (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey)) {
    event.preventDefault();
    toggleFullscreen();
  }
});

window.addEventListener('pagehide', () => {
  pool.stop();
  fluid?.dispose();
  world.dispose();
  link.close();
});

// 검증용 — ?debug=true 면 필드·유체·마지막 커서 자리를 콘솔에 노출한다
if (new URLSearchParams(window.location.search).get('debug') === 'true') {
  window.__ENSIL__ = { world, fluid, get cursorWorld() { return cursorWorld; }, get cursorScreen() { return cursorScreen; }, projectCursor };
}
