const CREATURES = {
  1: {
    origin: '게이밍 키보드, 마우스',
    story: '책상 서랍 깊숙이 방치된 게이밍 키보드와 마우스가 밀폐된 공간에서 서서히 발효되며 형성',
    character:
      '몸 전체에 커다란 발광 기관을 가진 십자 모양 개체. 클릭 신호를 주고받던 회로의 특성이 남아 방향성 있는 발광 반응으로 남음. 몸을 누르면 특정 방향으로 빛을 발산함. 다른 개체를 향해 신호를 보내는 수단으로 추정되며, 빛의 방향이 곧 이 개체의 유일한 의사표현 수단.',
    media: { top: 127, width: 556, height: 534, scale: 1 },
  },
  2: {
    origin: '전선류 케이블 뭉치',
    story: '서랍 구석에서 오랜 시간 얽혀있던 케이블이, 형태를 구분할 수 없을 만큼 뒤엉킨 채로 발효',
    character:
      '개별 전선이었던 시절의 경계가 흐려지며 하나의 유연한 몸체로 통합. 전선이 노출된 원형 몸통과 다절형 유연한 꼬리를 가진 개체. 전류가 흐르던 감각이 그대로 남아 외부 자극에 극도로 예민하게 반응하는 습성으로 이어짐.',
    media: { top: 175, width: 552, height: 552, scale: 1 },
  },
  3: {
    origin: '스피커, GPU',
    story:
      '낡은 스피커와 데스크톱 CPU 조각이 같은 폐기물 더미 속에서 발효되며 우연히 연결 죽어있던 연산 회로와 발성 기관이 상호작용하며, 판단하고 말하는 능력 발현',
    character:
      '둥근 몸통 위로 스피커 진동판 구조가 붙어있는 개체. 반응 속도와 패턴이 개체마다 조금씩 다르게 관찰되는데, 이는 우연한 재조합의 결과물이라 발효 개체마다 회로 연결 방식이 미세하게 다르기 때문으로 추정됨. 도감 편찬팀은 이를 ‘개체마다 성격이 다른’ 유일한 종으로 기록함.',
    media: { top: 139, width: 481, height: 481, scale: 1 },
  },
  4: {
    origin: '전구류',
    story: '창고나 장식장에 방치된 여러 개의 전구가 동시에, 그러나 서로 다른 개체로 발효',
    character:
      '단독 개체로는 거의 발견되지 않고 항상 여러 마리가 무리 지어 서식함. 항상 최소 3마리 이상 무리로 발견되며, 낙오된 단독 개체는 빛이 꺼진 채로만 발견됨. 강한 텃세와 영역 의식을 가짐. 발효 과정에서 개체 간에 형성된 직렬 연결 구조 때문에, 개체가 무리에서 이탈하면 에너지를 잃음.',
    media: { top: 19, width: 529, height: 529, scale: 1.105 },
  },
};

const params = new URLSearchParams(window.location.search);
const id = Math.min(4, Math.max(1, Number(params.get('id')) || 1));
const creature = CREATURES[id];
const page = document.querySelector('.info-page');
const image = document.querySelector('.specimen-image');
const numberLink = document.querySelector('.creature-number-link');
const backLink = document.querySelector('.back-to-interaction');

document.title = `NO. ${id} — ENSIL Archive`;
page.dataset.creature = String(id);
page.style.setProperty('--media-top', `${(creature.media.top / 1080) * 100}%`);
page.style.setProperty('--media-width', `${(creature.media.width / 1920) * 100}%`);
page.style.setProperty('--media-height', `${(creature.media.height / 1080) * 100}%`);
page.style.setProperty('--media-scale', creature.media.scale);

image.src = `/assets/info/no${id}.jpeg`;
image.alt = `NO. ${id} creature specimen`;
numberLink.href = `/interactive.html?id=${id}`;
numberLink.setAttribute('aria-label', `Return to the NO. ${id} point cloud`);
backLink.href = `/interactive.html?id=${id}`;
backLink.setAttribute('aria-label', `Back to the NO. ${id} interaction`);

document.querySelector('#creature-number').textContent = `NO. ${id}`;
for (const [field, value] of Object.entries(creature)) {
  const element = document.querySelector(`[data-field="${field}"]`);
  if (element) element.textContent = value;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function tenseType(element, order) {
  const text = element.textContent;
  element.setAttribute('aria-label', text);

  if (reducedMotion) {
    element.classList.add('is-complete');
    return Promise.resolve();
  }

  element.textContent = '';
  element.classList.add('is-typing');
  const fragment = document.createDocumentFragment();
  const chars = Array.from(text);

  chars.forEach((char, index) => {
    const span = document.createElement('span');
    span.className = 'type-char';
    span.textContent = char;
    span.style.setProperty('--char-index', index);
    fragment.append(span);
  });

  element.append(fragment);
  const start = 150 + order * 280;
  const step = element.tagName === 'H1' ? 105 : element.tagName === 'H2' ? 54 : 23;
  const duration = chars.length * step + 360;

  element.querySelectorAll('.type-char').forEach((char, index) => {
    const punctuationPause = /[.,·]/.test(chars[index - 1] || '') ? 90 : 0;
    const jitter = ((index * 37 + order * 19) % 5) * 9;
    char.style.animationDelay = `${start + index * step + punctuationPause + jitter}ms`;
  });

  return new Promise((resolve) => {
    window.setTimeout(() => {
      element.classList.remove('is-typing');
      element.classList.add('is-complete');
      resolve();
    }, start + duration);
  });
}

requestAnimationFrame(() => {
  page.classList.add('is-visible');
  document.querySelectorAll('[data-typewriter]').forEach((element, order) => {
    tenseType(element, order);
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
