import { mountDither } from './dither-mount.jsx';
import { installStageShortcut } from './stage-window.js';
import { revealEncryptedCollection } from './components/ui/encrypted-text.js';

/**
 * Every archive entry uses the same grid (see info.css). A specimen only
 * declares how far its cutout is zoomed inside the shared square media
 * frame — `scale` is the rendered image width as a share of that frame —
 * and how strongly the wash sits on top of it.
 */
const CREATURES = {
  1: {
    scale: 1.711,
    colorOpacity: 0.77,
    origin: '게이밍 키보드, 마우스',
    story:
      '책상 서랍 깊숙이 방치된 게이밍 키보드와 마우스가 밀폐된 공간에서 서서히 발효되며 형성',
    character:
      '몸 전체에 커다란 발광 기관을 가진 십자 모양 개체.\n클릭 신호를 주고받던 회로의 특성이 남아 방향성 있는 발광 반응으로 남음.\n몸을 누르면 특정 방향으로 빛을 발산함. 다른 개체를 향해 신호를 보내는 수단으로 추정되며,\n빛의 방향이 곧 이 개체의 유일한 의사표현 수단.',
  },
  2: {
    scale: 2.433,
    colorOpacity: 1,
    origin: '전선류 케이블 뭉치',
    story:
      '서랍 구석에서 오랜 시간 얽혀있던 케이블이,\n형태를 구분할 수 없을 만큼 뒤엉킨 채로 발효',
    character:
      '개별 전선이었던 시절의 경계가 흐려지며 하나의 유연한 몸체로 통합.\n전선이 노출된 원형 몸통과 다절형 유연한 꼬리를 가진 개체.\n전류가 흐르던 감각이 그대로 남아 외부 자극에 극도로 예민하게 반응하는 습성으로 이어짐.',
  },
  3: {
    scale: 1.601,
    colorOpacity: 0.84,
    origin: '스피커, GPU',
    story:
      '낡은 스피커와 데스크톱 CPU 조각이 같은 폐기물 더미 속에서 발효되며 우연히 연결.\n죽어있던 연산 회로와 발성 기관이 상호작용하며, 판단하고 말하는 능력 발현.',
    character:
      '둥근 몸통 위로 스피커 진동판 구조가 붙어있는 개체.\n반응 속도와 패턴이 개체마다 조금씩 다르게 관찰되는데,\n이는 우연한 재조합의 결과물이라 발효 개체마다 회로 연결 방식이 미세하게 다르기 때문으로 추정됨.\n도감 편찬팀은 이를 ‘개체마다 성격이 다른’ 유일한 종으로 기록함.',
  },
  4: {
    scale: 1.105,
    colorOpacity: 1,
    origin: '전구류',
    story:
      '창고나 장식장에 방치된 여러 개의 전구가 동시에,\n그러나 서로 다른 개체로 발효',
    character:
      '단독 개체로는 거의 발견되지 않고 항상 여러 마리가 무리 지어 서식함.\n항상 최소 3마리 이상 무리로 발견되며, 낙오된 단독 개체는 빛이 꺼진 채로만 발견됨.\n강한 텃세와 영역 의식을 가짐.\n발효 과정에서 개체 간에 형성된 직렬 연결 구조 때문에,\n개체가 무리에서 이탈하면 에너지를 잃음.',
  },
};

const TEXT_FIELDS = ['origin', 'story', 'character'];

const params = new URLSearchParams(window.location.search);
const id = Math.min(4, Math.max(1, Number(params.get('id')) || 1));
const creature = CREATURES[id];
const page = document.querySelector('.info-page');
const image = document.querySelector('.specimen-image');
const numberLink = document.querySelector('.creature-number-link');
const backLink = document.querySelector('.back-to-interaction');

document.title = `NO. ${id} — ENSIL Archive`;
page.dataset.creature = String(id);

page.style.setProperty('--specimen-scale', `${creature.scale * 100}%`);
page.style.setProperty('--specimen-color-opacity', creature.colorOpacity);
page.style.setProperty('--specimen-mask', `url("/assets/info/no${id}-cutout.png")`);

image.src = `/assets/info/no${id}-cutout.png`;
image.alt = `NO. ${id} creature specimen`;
numberLink.href = `/interactive.html?id=${id}`;
numberLink.setAttribute('aria-label', `Return to the NO. ${id} point cloud`);
backLink.href = `/interactive.html?id=${id}`;
backLink.setAttribute('aria-label', `Back to the NO. ${id} interaction`);

const numberElement = document.querySelector('#creature-number');
numberElement.textContent = `NO. ${id}`;
for (const field of TEXT_FIELDS) {
  const element = document.querySelector(`[data-field="${field}"]`);
  if (element) element.textContent = creature[field];
}

mountDither(document.querySelector('#dither-background'));

requestAnimationFrame(() => {
  page.classList.add('is-visible');
  const encryptedElements = [
    numberElement,
    backLink,
    ...document.querySelectorAll('.fact h2, .fact p'),
  ];
  revealEncryptedCollection(encryptedElements, {
    revealDelayMs: 50,
    startDelayMs: 120,
    staggerMs: 65,
    labelDurationMs: 1100,
    bodyDurationMs: 2600,
  });

  // The scramble writes its own aria-label, so restore the spoken one after it.
  backLink.setAttribute('aria-label', `Back to the NO. ${id} interaction`);
});

function returnToInteraction(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const destination = event.currentTarget.href;
  document.body.classList.add('is-leaving');
  window.setTimeout(() => window.location.assign(destination), 520);
}

numberLink.addEventListener('click', returnToInteraction);
backLink.addEventListener('click', returnToInteraction);

// 운영용 — Ctrl+Alt+Shift+O 로 빔프로젝터 스테이지 창을 연다.
installStageShortcut();
