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
const RELAY_URL = import.meta.env.VITE_FIELD_LINK_URL;

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
function openRelay(url, onEnvelope) {
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
export function openFieldLink(role, { onMessage, onPeerChange } = {}) {
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

  const transports = [openBroadcast(handle), RELAY_URL ? openRelay(RELAY_URL, handle) : null].filter(Boolean);

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
    close: () => {
      window.clearInterval(beat);
      transports.forEach((transport) => transport.close());
    },
  };
}
