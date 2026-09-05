/**
 * 전시 두-창 연동 — 콘솔 ↔ 스테이지(빔프로젝터 /stage.html).
 *
 * 기본 전송로는 BroadcastChannel: 같은 브라우저 프로필에서 창 두 개를 띄우면
 * 서버·네트워크 없이 동작한다. 다른 기기를 써야 하면 VITE_FIELD_LINK_URL 로
 * WebSocket 릴레이를 켠다 — 같은 메시지를 {type:'field', role, msg} 봉투에 담아
 * 다른 클라이언트로 중계한다.
 *
 * 두 전송로 모두 "보낸 쪽 role"을 붙여 보내므로 자기 메시지는 버린다.
 * 구버전 ENSIL 의 src/state/fieldLink.ts 를 React 훅에서 떼어낸 것.
 */

const CHANNEL = 'ensil-field';
const HEARTBEAT_MS = 2_000;
const ALIVE_MS = 6_000;
const RELAY_RECONNECT_MS = 3_000;
const BRIDGE_PORT = 7777;
const BRIDGE_STORAGE_KEY = 'ensil-bridge-host';

/**
 * 브릿지 주소를 현장에서 손대지 않고 찾는다.
 *   1) ?bridge=호스트:포트 — 한 번 넣으면 기억한다 (다른 기기에서 열 때)
 *   2) 빌드 시 VITE_FIELD_LINK_URL
 *   3) 페이지를 내려준 호스트의 7777 — 브릿지가 사이트도 서빙하므로 이게 기본
 * https 페이지에서는 ws:// 가 mixed content 로 막히므로 아예 시도하지 않는다.
 */
function resolveRelayUrl() {
  const requested = new URLSearchParams(window.location.search).get('bridge');
  if (requested) {
    try {
      window.localStorage.setItem(BRIDGE_STORAGE_KEY, requested);
    } catch {
      /* 저장 불가 — 이번 세션에만 쓴다 */
    }
    return `ws://${requested.includes(':') ? requested : `${requested}:${BRIDGE_PORT}`}`;
  }

  let remembered = null;
  try {
    remembered = window.localStorage.getItem(BRIDGE_STORAGE_KEY);
  } catch {
    /* 저장소 접근 불가 */
  }
  if (remembered) {
    return `ws://${remembered.includes(':') ? remembered : `${remembered}:${BRIDGE_PORT}`}`;
  }

  if (import.meta.env.VITE_FIELD_LINK_URL) return import.meta.env.VITE_FIELD_LINK_URL;

  if (window.location.protocol === 'https:') return null;
  const host = window.location.hostname;
  if (!host) return null;
  return `ws://${host}:${BRIDGE_PORT}`;
}

const RELAY_URL = resolveRelayUrl();

function openBroadcast(onEnvelope) {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => {
    if (event.data && typeof event.data.role === 'string') onEnvelope(event.data);
  };
  return {
    send: (envelope) => channel.postMessage(envelope),
    close: () => channel.close(),
  };
}

/** 브릿지 릴레이 — 끊기면 조용히 재접속, 실패해도 화면은 정상 */
function openRelay(url, onEnvelope, onRaw) {
  let socket = null;
  let timer = null;
  let disposed = false;

  const retry = () => {
    if (disposed || timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      connect();
    }, RELAY_RECONNECT_MS);
  };

  function connect() {
    if (disposed) return;
    try {
      socket = new WebSocket(url);
    } catch {
      retry();
      return;
    }
    socket.onclose = retry;
    socket.onerror = () => socket?.close();
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'field' && data.msg && typeof data.role === 'string') {
          onEnvelope({ role: data.role, msg: data.msg });
        } else if (data && typeof data.type === 'string') {
          // 봉투 없는 메시지 — 브릿지가 목업에서 만들어 보내는 trigger / units
          onRaw?.(data);
        }
      } catch {
        /* JSON 아닌 메시지 무시 */
      }
    };
  }

  connect();

  return {
    send: (envelope) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'field', ...envelope }));
    },
    sendRaw: (message) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      socket?.close();
    },
  };
}

/**
 * @param {'panel'|'stage'} role
 * @param {{ onMessage?: (msg: object) => void, onPeerChange?: (alive: boolean) => void }} handlers
 */
/**
 * @param {'panel'|'stage'} role
 * @param {{ onMessage?: (msg: object) => void, onPeerChange?: (alive: boolean) => void, onHardware?: (msg: object) => void }} handlers
 *   onHardware 는 릴레이로만 온다 — 브릿지가 목업을 폴링해 만드는 trigger / units.
 */
export function openFieldLink(role, { onMessage, onPeerChange, onHardware } = {}) {
  const other = role === 'panel' ? 'stage' : 'panel';
  let lastSeen = 0;
  let peerAlive = false;

  const setAlive = (alive) => {
    if (alive === peerAlive) return;
    peerAlive = alive;
    onPeerChange?.(alive);
  };

  const handle = (envelope) => {
    if (envelope.role !== other) return;
    lastSeen = Date.now();
    setAlive(true);
    if (envelope.msg.type !== 'hello') onMessage?.(envelope.msg);
  };

  const relay = RELAY_URL ? openRelay(RELAY_URL, handle, (message) => onHardware?.(message)) : null;
  const transports = [openBroadcast(handle), relay].filter(Boolean);

  const hello = () => transports.forEach((transport) => transport.send({ role, msg: { type: 'hello', role } }));
  hello();

  const beat = window.setInterval(() => {
    hello();
    if (lastSeen && Date.now() - lastSeen > ALIVE_MS) {
      lastSeen = 0;
      setAlive(false);
    }
  }, HEARTBEAT_MS);

  return {
    send: (msg) => transports.forEach((transport) => transport.send({ role, msg })),
    /** 브릿지(그리고 그 너머 목업)로 가는 봉투 없는 메시지 — 릴레이가 없으면 조용히 버린다 */
    sendHardware: (message) => relay?.sendRaw(message),
    close: () => {
      window.clearInterval(beat);
      transports.forEach((transport) => transport.close());
    },
  };
}
