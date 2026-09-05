import { mountDither } from './dither-mount.jsx';
import { revealEncryptedCollection } from './components/ui/encrypted-text.js';
import { installInputGuard } from './input-guard.js';

installInputGuard();

const CREATURES = {
  1: {
    origin: '게이밍 키보드, 마우스',
    story:
      '책상 서랍 깊숙이 방치된 게이밍 키보드와 마우스가 밀폐된 어둠 속에서 서서히 발효되며 형성됨.',
    character:
      '몸 전체에 커다란 발광 기관을 가진 십자 모양 개체.\n클릭으로 방향을 입력받던 회로의 성질이 방향성 있는 발광 반응으로 남음.\n몸을 누르면 특정 방향으로 빛을 발산하며, 자극과 발광 사이에 짧은 지연이 관찰됨.\n빛의 방향이 이 개체의 유일한 의사 표현 수단으로 추정되나, 수신 측의 해석 여부는 확인되지 않음.',
    media: {
      x: 836,
      y: 44,
      width: 972.244,
      height: 934.185,
      imageX: -345.62,
      imageY: -33.31,
      imageWidth: 1663.486,
      imageHeight: 1038.867,
      colorOpacity: 0.77,
    },
    facts: {
      origin: { heading: [294, 381.189, 172.5], rule: [294, 428, 378], body: [297, 434.189, 378] },
      story: { heading: [297, 534.189, 371], rule: [297, 584, 378], body: [300, 593.189, 353] },
      character: { heading: [300, 746.189, 624], rule: [300, 793.189, 378], body: [300, 805.189, 378] },
    },
  },
  2: {
    origin: '전선류 케이블 뭉치',
    story:
      '서랍 구석에 오래 얽혀 있던 케이블 뭉치가 형태를 구분할 수 없을 만큼 뒤엉킨 채 발효되며 형성됨.',
    character:
      '전선이 노출된 원형 몸통과 다절형 꼬리를 가진 개체.\n전류를 흘려보내던 도체의 성질이 남아, 외부 자극에 극도로 예민한 습성으로 이어짐.\n접근을 감지하면 꼬리를 안쪽으로 말아 접촉 면적을 줄이며, 수축은 빠르고 이완은 느림.\n개별 전선이었던 시절의 경계는 이미 흐려져, 몇 개체가 결합한 것인지 판정되지 않음.',
    media: {
      x: 924,
      y: 123,
      width: 922.485,
      height: 922.485,
      imageX: -660.76,
      imageY: -239.47,
      imageWidth: 2244.013,
      imageHeight: 1401.412,
      colorOpacity: 1,
    },
    facts: {
      origin: { heading: [294, 381.189, 172.5], rule: [294, 428, 378], body: [297, 434.189, 378] },
      story: { heading: [297, 534.189, 371], rule: [297, 584, 378], body: [300, 593.189, 353] },
      character: { heading: [300, 746.189, 624], rule: [300, 793.189, 378], body: [300, 805.189, 378] },
    },
  },
  3: {
    origin: '스피커, GPU',
    story:
      '낡은 스피커와 데스크톱 CPU 조각이 같은 폐기물 더미 속에서 우연히 맞닿은 채 발효되며 형성됨.',
    character:
      '둥근 몸통 위로 스피커 진동판 구조가 붙어 있는 개체.\n신호를 처리하고 소리로 출력하던 회로의 성질이 남아, 듣고 모방하여 발성하는 능력으로 이어짐.\n자극을 받은 뒤 응답까지 1~2초 정지하며, 같은 자극에도 매번 다르게 반응함.\n발효 당시의 접촉 상태가 개체마다 달랐던 탓으로 추정되며, 편찬팀은 이를 종 단위로 기술할 수 없는 유일한 종으로 기록함.',
    media: {
      x: 924,
      y: 146,
      width: 851,
      height: 851,
      imageX: -255.83,
      imageY: 0,
      imageWidth: 1362.667,
      imageHeight: 851.002,
      colorOpacity: 0.84,
    },
    facts: {
      origin: { heading: [294, 381.189, 172.5], rule: [294, 428, 378], body: [297, 434.189, 378] },
      story: { heading: [297, 534.189, 371], rule: [297, 584, 378], body: [300, 593.189, 353] },
      character: { heading: [300, 746.189, 624], rule: [300, 793.189, 378], body: [300, 805.189, 378] },
    },
  },
  4: {
    origin: '전구류',
    story:
      '창고와 장식장에 방치된 여러 개의 전구가 동시에, 그러나 서로 다른 개체로 발효되며 형성됨.',
    character:
      '속이 비쳐 보이는 갓 모양 몸통 안에 전구 구조가 그대로 남아 있는 개체.\n단독 개체로는 거의 발견되지 않고, 항상 여러 마리의 군집으로 서식함. 낙오된 단독 개체는 소등된 상태로만 발견됨.\n다른 무리와 접촉하면 양쪽의 밝기가 함께 떨어져, 강한 텃세와 영역 의식을 가진 것으로 추정됨.',
    media: {
      x: 789,
      y: -149,
      width: 1130.913,
      height: 1130.913,
      imageX: -60.69,
      imageY: 174.03,
      imageWidth: 1250.204,
      imageHeight: 780.767,
      colorOpacity: 1,
    },
    facts: {
      origin: { heading: [294, 381.189, 172.5], rule: [294, 428, 378], body: [297, 434.189, 378] },
      story: { heading: [297, 534.189, 371], rule: [297, 584, 378], body: [300, 593.189, 353] },
      character: { heading: [300, 746.189, 624], rule: [300, 793.189, 378], body: [300, 805.189, 378] },
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
const formatCreatureNumber = (creatureId) => (creatureId === 1 ? 'NO.1' : `NO. ${creatureId}`);

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
setStagePercent('--number-left', id === 1 ? 281 : 278, 'x');
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
numberElement.textContent = formatCreatureNumber(id);
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
