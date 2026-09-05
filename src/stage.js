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

link = openFieldLink('stage', {
  onMessage: (msg) => {
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
  world.dispose();
  link.close();
});
