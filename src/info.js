import { mountDither } from './dither-mount.jsx';
import { revealEncryptedCollection } from './components/ui/encrypted-text.js';

const CREATURES = {
  1: {
    origin: '게이밍 키보드, 마우스',
    story:
      '책상 서랍 깊숙이 방치된 게이밍 키보드와 마우스가 밀폐된 공간에서 서서히 발효되며 형성',
    character:
      '몸 전체에 커다란 발광 기관을 가진 십자 모양 개체.\n클릭 신호를 주고받던 회로의 특성이 남아 방향성 있는 발광 반응으로 남음.\n몸을 누르면 특정 방향으로 빛을 발산함. 다른 개체를 향해 신호를 보내는 수단으로 추정되며,\n빛의 방향이 곧 이 개체의 유일한 의사표현 수단.',
    media: {
      x: 381,
      y: 0,
      width: 972.244,
      height: 934.185,
      imageX: -345.62,
      imageY: -33.31,
      imageWidth: 1663.486,
      imageHeight: 1038.867,
      colorOpacity: 0.77,
    },
    facts: {
      origin: { heading: [1424, 129, 172.5], rule: [1424, 176, 201], body: [1427, 182, 210] },
      story: { heading: [1427, 282, 371], rule: [1427, 332, 356], body: [1430, 341, 353] },
      character: { heading: [1430, 494, 624], rule: [1430, 541, 378], body: [1430, 553, 378] },
    },
  },
  2: {
    origin: '전선류 케이블 뭉치',
    story:
      '서랍 구석에서 오랜 시간 얽혀있던 케이블이,\n형태를 구분할 수 없을 만큼 뒤엉킨 채로 발효',
    character:
      '개별 전선이었던 시절의 경계가 흐려지며 하나의 유연한 몸체로 통합.\n전선이 노출된 원형 몸통과 다절형 유연한 꼬리를 가진 개체.\n전류가 흐르던 감각이 그대로 남아 외부 자극에 극도로 예민하게 반응하는 습성으로 이어짐.',
    media: {
      x: 402,
      y: 39,
      width: 922.485,
      height: 922.485,
      imageX: -660.76,
      imageY: -239.47,
      imageWidth: 2244.013,
      imageHeight: 1401.412,
      colorOpacity: 1,
    },
    facts: {
      origin: { heading: [1434, 143, 172.5], rule: [1434, 190, 384], body: [1437, 196, 384] },
      story: { heading: [1437, 299, 371], rule: [1437, 346, 381], body: [1440, 355, 353] },
      character: { heading: [1440, 508, 624], rule: [1440, 555, 378], body: [1440, 564, 378] },
    },
  },
  3: {
    origin: '스피커, GPU',
    story:
      '낡은 스피커와 데스크톱 CPU 조각이 같은 폐기물 더미 속에서 발효되며 우연히 연결.\n죽어있던 연산 회로와 발성 기관이 상호작용하며, 판단하고 말하는 능력 발현.',
    character:
      '둥근 몸통 위로 스피커 진동판 구조가 붙어있는 개체.\n반응 속도와 패턴이 개체마다 조금씩 다르게 관찰되는데,\n이는 우연한 재조합의 결과물이라 발효 개체마다 회로 연결 방식이 미세하게 다르기 때문으로 추정됨.\n도감 편찬팀은 이를 ‘개체마다 성격이 다른’ 유일한 종으로 기록함.',
    media: {
      x: 417,
      y: 67,
      width: 851,
      height: 851,
      imageX: -255.83,
      imageY: 0,
      imageWidth: 1362.667,
      imageHeight: 851.002,
      colorOpacity: 0.84,
    },
    facts: {
      origin: { heading: [1431, 175, 172.5], rule: [1431, 222, 201], body: [1434, 228, 210] },
      story: { heading: [1434, 331, 371], rule: [1434, 378, 356], body: [1437, 384, 353] },
      character: { heading: [1437, 540, 624], rule: [1437, 587, 378], body: [1437, 601, 378] },
    },
  },
  4: {
    origin: '전구류',
    story:
      '창고나 장식장에 방치된 여러 개의 전구가 동시에,\n그러나 서로 다른 개체로 발효',
    character:
      '단독 개체로는 거의 발견되지 않고 항상 여러 마리가 무리 지어 서식함.\n항상 최소 3마리 이상 무리로 발견되며, 낙오된 단독 개체는 빛이 꺼진 채로만 발견됨.\n강한 텃세와 영역 의식을 가짐.\n발효 과정에서 개체 간에 형성된 직렬 연결 구조 때문에,\n개체가 무리에서 이탈하면 에너지를 잃음.',
    media: {
      x: 216,
      y: -187,
      width: 1130.913,
      height: 1130.913,
      imageX: -60.69,
      imageY: 174.03,
      imageWidth: 1250.204,
      imageHeight: 780.767,
      colorOpacity: 1,
    },
    facts: {
      origin: { heading: [1438, 175, 172.5], rule: [1438, 222, 201], body: [1441, 228, 210] },
      story: { heading: [1441, 331, 371], rule: [1441, 378, 356], body: [1444, 387, 353] },
      character: { heading: [1444, 540, 624], rule: [1444, 587, 378], body: [1444, 596, 378] },
    },
  },
};

const params = new URLSearchParams(window.location.search);
const id = Math.min(4, Math.max(1, Number(params.get('id')) || 1));
const creature = CREATURES[id];
const page = document.querySelector('.info-page');
const image = document.querySelector('.specimen-image');
const numberLink = document.querySelector('.creature-number-link');
const backLink = document.querySelector('.back-to-interaction');

function setStagePercent(name, value, dimension) {
  const base = dimension === 'y' ? 1080 : 1920;
  page.style.setProperty(name, `${(value / base) * 100}%`);
}

function applyFactLayout(name, layout, ruleWidthOverride) {
  const [headingX, headingY, headingWidth] = layout.heading;
  const [ruleX, ruleY, ruleWidth] = layout.rule;
  const [bodyX, bodyY, bodyWidth] = layout.body;

  setStagePercent(`--${name}-heading-left`, headingX, 'x');
  setStagePercent(`--${name}-heading-top`, headingY, 'y');
  setStagePercent(`--${name}-heading-width`, headingWidth, 'x');
  setStagePercent(`--${name}-rule-left`, ruleX, 'x');
  setStagePercent(`--${name}-rule-top`, ruleY, 'y');
  setStagePercent(`--${name}-rule-width`, ruleWidthOverride ?? ruleWidth, 'x');
  setStagePercent(`--${name}-body-left`, bodyX, 'x');
  setStagePercent(`--${name}-body-top`, bodyY, 'y');
  setStagePercent(`--${name}-body-width`, bodyWidth, 'x');
}

document.title = `NO. ${id} — ENSIL Archive`;
page.dataset.creature = String(id);

setStagePercent('--media-left', creature.media.x, 'x');
setStagePercent('--media-top', creature.media.y, 'y');
setStagePercent('--media-width', creature.media.width, 'x');
setStagePercent('--media-height', creature.media.height, 'y');
page.style.setProperty('--image-left', `${(creature.media.imageX / creature.media.width) * 100}%`);
page.style.setProperty('--image-top', `${(creature.media.imageY / creature.media.height) * 100}%`);
page.style.setProperty('--image-width', `${(creature.media.imageWidth / creature.media.width) * 100}%`);
page.style.setProperty('--image-height', `${(creature.media.imageHeight / creature.media.height) * 100}%`);
page.style.setProperty('--specimen-color-opacity', creature.media.colorOpacity);
const sharedFactRuleWidth = creature.facts.character.rule[2];
Object.entries(creature.facts).forEach(([name, layout]) =>
  applyFactLayout(name, layout, sharedFactRuleWidth),
);

image.src = `/assets/info/no${id}-cutout.png`;
image.alt = `NO. ${id} creature specimen`;
page.style.setProperty('--specimen-mask', `url("/assets/info/no${id}-cutout.png")`);
numberLink.href = `/interactive.html?id=${id}`;
numberLink.setAttribute('aria-label', `Return to the NO. ${id} point cloud`);
backLink.href = `/interactive.html?id=${id}`;
backLink.setAttribute('aria-label', `Back to the NO. ${id} interaction`);

const numberElement = document.querySelector('#creature-number');
numberElement.textContent = `NO. ${id}`;
for (const [field, value] of Object.entries(creature)) {
  const element = document.querySelector(`[data-field="${field}"]`);
  if (element && typeof value === 'string') element.textContent = value;
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
