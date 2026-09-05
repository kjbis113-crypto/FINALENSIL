/**
 * ENSIL 브릿지 — 전시장 로컬 허브.
 *
 *   node index.js                 # WS 7777 + 사이트(../dist) HTTP 8080
 *   node index.js --demo          # 하드웨어 없이 15초마다 가짜 trigger
 *   node index.js --serve none    # 정적 서빙 끄기 (개발 중 vite dev 를 쓸 때)
 *
 * 왜 로컬이어야 하나: 목업(ESP32-C3)이 평문 WS 로 이 서버에 붙고, 목업 허브 AP
 *(`archive`)에는 인터넷이 없다. 사이트를 배포해서 https 로 열면 그 페이지에서
 * ws://192.168.4.x 로 붙는 것을 브라우저가 mixed content 로 막는다. 그래서
 * 사이트와 릴레이를 같은 기기에서 http 로 함께 내보낸다.
 *
 * 연결 모델: 모든 클라이언트(브라우저 창들, ESP32 목업들)가 같은 WS 서버에 붙고,
 * 받은 JSON 한 줄을 "보낸 쪽을 뺀 나머지 전부"에게 그대로 중계한다.
 *   목업 → 웹   {"type":"trigger","unit":2,"action":"detect","intensity":0.8}
 *   웹 → 목업   {"type":"act","unit":2,"action":"pulse","intensity":1}
 *   목업 → 웹   {"type":"hello","unit":2,"name":"tendon"}   (접속 시)
 *   창 ↔ 창     {"type":"field", ...}  (필드1 ↔ 필드2, src/field/field-link.js — focus/pulse/snapshot/cursor)
 *
 * 의존성은 ws 하나뿐이다 — 네이티브 빌드가 없어 구형 맥에서도 설치가 깨지지 않는다.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const WS_PORT = 7777;
const HTTP_PORT = 8080;
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const DEMO = flag('--demo');
const serveDir = value('--serve', path.join(__dirname, '..', 'dist'));

function log(msg) {
  console.log(`[bridge] ${msg}`);
}

/** 아이맥에서 열어야 할 주소를 그대로 찍어준다 — 현장에서 IP 찾아다니지 않도록 */
function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

// ── 정적 사이트 서버 ────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.glb': 'model/gltf-binary', '.obj': 'text/plain',
  '.wasm': 'application/wasm', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

if (serveDir !== 'none' && fs.existsSync(path.join(serveDir, 'index.html'))) {
  http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const file = path.normalize(path.join(serveDir, urlPath === '/' ? 'index.html' : urlPath));
    if (!file.startsWith(path.normalize(serveDir))) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      // 텍스트 계열은 gzip 으로 — OBJ 는 4~5배 줄어든다. 다른 맥이 와이파이로 받는 양이다.
      // Range 요청(영상 시킹)과는 섞이지 않는다.
      const compressible = ['.obj', '.js', '.css', '.html', '.json', '.svg', '.txt', '.md'].includes(ext);
      const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      if (compressible && acceptsGzip && !req.headers.range) {
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
        fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
        return;
      }
      // 영상 시킹용 Range 요청 지원
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Length': stat.size });
      fs.createReadStream(file).pipe(res);
    });
  }).listen(HTTP_PORT, '0.0.0.0', () => {
    log(`사이트 서빙: http://0.0.0.0:${HTTP_PORT}  (${serveDir})`);
    log(`  이 기기에서   → http://localhost:${HTTP_PORT}/`);
    for (const address of localAddresses()) log(`  다른 기기에서 → http://${address}:${HTTP_PORT}/`);
  });
} else if (serveDir !== 'none') {
  log(`사이트 서빙 생략 — ${serveDir}/index.html 없음 (npm run build 후 다시)`);
}

// ── WebSocket 허브 ─────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
const clients = new Set();
const units = new Map(); // ws → {unit, name}

function broadcast(obj) {
  const text = JSON.stringify(obj);
  for (const client of clients) if (client.readyState === 1) client.send(text);
}

/** 접속 중인 목업 목록 — 웹이 상태 표시에 쓴다 */
function broadcastUnits() {
  const polled = MOCKUPS.filter((m) => m.reachable).map((m) => ({ unit: m.unit, name: m.name, host: m.host }));
  broadcast({ type: 'units', units: [...Array.from(units.values()), ...polled] });
}

wss.on('connection', (ws, req) => {
  clients.add(ws);
  log(`연결 ${req.socket.remoteAddress} (${clients.size})`);

  ws.on('close', () => {
    if (units.has(ws)) {
      log(`목업 unit ${units.get(ws).unit} 끊김`);
      units.delete(ws);
      broadcastUnits();
    }
    clients.delete(ws);
  });

  ws.on('message', (data) => {
    const text = data.toString();
    let msg = null;
    try {
      msg = JSON.parse(text);
    } catch {
      return; // JSON 아님
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello' && msg.unit !== undefined) {
      units.set(ws, { unit: msg.unit, name: msg.name ?? '' });
      log(`목업 unit ${msg.unit} ${msg.name ?? ''} 접속`);
      broadcastUnits();
      return;
    }
    if (msg.type === 'trigger') log(`trigger unit ${msg.unit} ${msg.action ?? ''} ${msg.intensity ?? ''}`);
    if (msg.type === 'act') {
      // 웹이 브릿지를 거쳐 목업을 움직일 때 (브라우저가 직접 못 부를 때의 우회로)
      const mockup = MOCKUPS[Number(msg.unit) - 1];
      const level = Math.min(3, Math.max(1, Number(msg.level) || 2));
      log(`act → unit ${msg.unit} n=${level}${mockup ? '' : ' (폴링 목록에 없음)'}`);
      if (mockup) fetch(`http://${mockup.host}/api/click?n=${level}`).catch(() => {});
    }

    // 보낸 쪽을 뺀 나머지 전부에게 그대로 중계 — 단, 창↔창 봉투(field: 커서가 약 30Hz 로 온다)는
    // WS 로 붙은 목업(ESP32)에게는 보내지 않는다. 목업은 act 만 알면 된다.
    const browsersOnly = msg.type === 'field';
    for (const client of clients) {
      if (client === ws || client.readyState !== 1) continue;
      if (browsersOnly && units.has(client)) continue;
      client.send(text);
    }
  });
});

wss.on('listening', () => log(`ws://0.0.0.0:${WS_PORT} 대기 중`));

// ── 목업 폴링 ────────────────────────────────────────────────
// 목업 셋은 허브 와이파이 ARCHIVE 에 고정 IP 로 붙은 HTTP 서버라 스스로 알리지 않는다.
// /api/state 의 id 는 사건(버튼·PIR·마이크·웹 클릭)마다 1씩 오른다. 그게 바뀌면 새 사건이고,
// from 이 'web' 이면 우리가 /api/click 으로 시킨 것이니 되울리지 않는다.
//   node index.js --mockups 192.168.4.11,192.168.4.12,192.168.4.13   (기본값, 순서 = unit 1·2·3)
//   node index.js --no-mockups                                        (하드웨어 없는 날)
const MOCKUP_POLL_MS = 500;
const MOCKUP_TIMEOUT_MS = 1200;
const STRENGTH_BY_MODE = { 1: 0.6, 2: 1, 3: 1.6 }; // 1 살짝 · 2 보통 · 3 크게
const MOCKUPS = flag('--no-mockups') || DEMO
  ? []
  : (value('--mockups', process.env.ENSIL_MOCKUPS) ?? '192.168.4.11,192.168.4.12,192.168.4.13')
      .split(',')
      .map((host, index) => ({ unit: index + 1, host: host.trim(), name: '', lastId: null, reachable: false, misses: 0, busy: false }));

async function pollMockup(mockup) {
  if (mockup.busy) return;
  mockup.busy = true;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), MOCKUP_TIMEOUT_MS);
  try {
    const response = await fetch(`http://${mockup.host}/api/state`, { signal: abort.signal });
    const state = await response.json();
    mockup.misses = 0;
    if (!mockup.reachable) {
      mockup.reachable = true;
      mockup.name = state.name ?? '';
      log(`목업 unit ${mockup.unit} ${mockup.name} 접속 (${mockup.host})`);
      broadcastUnits();
    }
    const id = Number(state.id);
    if (mockup.lastId === null) {
      mockup.lastId = id; // 첫 응답 — 브릿지가 뜨기 전의 사건을 되살리지 않는다
      return;
    }
    if (id !== mockup.lastId) {
      mockup.lastId = id;
      if (state.from === 'web') return;
      const trigger = {
        type: 'trigger',
        unit: mockup.unit,
        name: mockup.name,
        from: state.from ?? '',
        mode: Number(state.mode) || 0,
        strength: STRENGTH_BY_MODE[state.mode] ?? 1,
        action: state.pattern ?? state.sound ?? '',
      };
      log(`trigger unit ${trigger.unit} from=${trigger.from} mode=${trigger.mode} ${trigger.action}`);
      broadcast(trigger);
    }
  } catch {
    if (mockup.reachable && ++mockup.misses > 3) {
      mockup.reachable = false;
      log(`목업 unit ${mockup.unit} 끊김`);
      broadcastUnits();
    }
  } finally {
    clearTimeout(timer);
    mockup.busy = false;
  }
}

if (MOCKUPS.length) {
  log(`목업 폴링: ${MOCKUPS.map((m) => `unit ${m.unit} → ${m.host}`).join(', ')}`);
  setInterval(() => MOCKUPS.forEach(pollMockup), MOCKUP_POLL_MS);
}

// ── 데모 모드 — 하드웨어 없이 개발·리허설 ────────────────────
if (DEMO) {
  log('데모 모드 — 15초마다 가짜 trigger (unit 1→2→3)');
  let unit = 0;
  setInterval(() => {
    unit = (unit % 3) + 1;
    log(`demo trigger unit ${unit}`);
    broadcast({ type: 'trigger', unit, name: 'demo', from: 'demo', mode: 2, strength: 1, action: 'demo' });
  }, 15_000);
}
