/**
 * 스테이지(빔프로젝터) 창 열기 — Ctrl+Alt+Shift+O (맥은 control+option+shift+O).
 * 관람객이 누를 일 없는 운영용 단축키. 같은 이름의 창을 재사용하므로 두 번 눌러도 하나만 뜬다.
 * Window Management API 가 허용되면 두 번째 화면(프로젝터) 위치에 바로 띄우고,
 * 아니면 현재 화면에 뜬 창을 손으로 옮긴 뒤 스테이지 화면을 클릭해 전체화면으로 만든다.
 */

const STAGE_WINDOW_NAME = 'ensil-stage';
const STAGE_PATH = '/stage.html';

export function isStageShortcut(event) {
  return event.ctrlKey && event.altKey && event.shiftKey && event.code === 'KeyO';
}

export function isStagePage() {
  return window.location.pathname.endsWith(STAGE_PATH);
}

/**
 * 두 번째 화면이 있으면 그쪽으로 옮긴다. 창을 연 뒤에 하는 이유:
 * getScreenDetails() 는 첫 호출에 권한을 묻는데, 그걸 window.open 앞에서 await 하면
 * 사용자 제스처 유효시간이 만료돼 팝업이 조용히 차단된다.
 */
async function placeOnSecondScreen(stage) {
  try {
    const details = await window.getScreenDetails?.();
    const other = details?.screens.find((screen) => screen !== details.currentScreen);
    if (!other || stage.closed) return;
    stage.moveTo(other.availLeft, other.availTop);
    stage.resizeTo(other.availWidth, other.availHeight);
  } catch {
    /* 권한 거부 또는 미지원 — 현재 화면에 그대로 둔다 */
  }
}

export function openStageWindow() {
  const url = `${STAGE_PATH}${window.location.search}`;
  // features 없이 열면 '탭'이 되고, 배경 탭은 rAF 가 멈춰 필드가 얼어붙는다 — 항상 독립 창(popup)으로
  const stage = window.open(url, STAGE_WINDOW_NAME, 'popup=1,width=1920,height=1080');
  if (!stage) {
    console.warn('[ENSIL] 스테이지 창이 차단되었습니다 — 이 사이트의 팝업을 허용해 주세요.');
    return null;
  }
  stage.focus();
  void placeOnSecondScreen(stage);
  return stage;
}

/** 아카이브 쪽 페이지에서 부르면 단축키가 스테이지 창을 연다. */
export function installStageShortcut() {
  const onKeyDown = (event) => {
    if (!isStageShortcut(event)) return;
    // 스테이지 창 자신에서는 stage.js 가 전체화면 토글로 처리한다
    if (isStagePage()) return;
    event.preventDefault();
    void openStageWindow();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
