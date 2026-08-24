// Прямой клиент threejs-devtools bridge (WS :9222) — работает без MCP-транспорта.
// Сценарий: MCP-сервер threejs-devtools-mcp уже запущен (config.toml: HEADLESS=true),
// но транспорт MCP в текущей сессии сломан — тогда вызываем bridge напрямую.
//
// Использование:
//   node scripts/bridge-call.cjs <method> [jsonParams]
// Примеры:
//   node scripts/bridge-call.cjs bridge_status
//   node scripts/bridge-call.cjs scene_tree {"depth":2}
//   node scripts/bridge-call.cjs run_js {"code":"return scene.children.length"}
//
// Методы = те же, что у MCP-инструментов (scene_tree, object_details, run_js,
// take_screenshot, material_details и т.д.).
'use strict';

const [method, paramsJson] = process.argv.slice(2);
if (!method) {
  console.error('usage: node scripts/bridge-call.cjs <method> [jsonParams]');
  process.exit(2);
}
let params = {};
if (paramsJson) {
  try {
    params = JSON.parse(paramsJson);
  } catch (e) {
    console.error('invalid jsonParams: ' + e.message);
    process.exit(2);
  }
}

const PORT = process.env.BRIDGE_PORT || 9222;
const id = 'cli-' + Date.now();
const timeoutMs = Number(process.env.BRIDGE_TIMEOUT_MS) || 30000;

const ws = new WebSocket(`ws://localhost:${PORT}/bridge`);
const timer = setTimeout(() => {
  console.error(`bridge-call: timeout after ${timeoutMs}ms`);
  process.exit(1);
}, timeoutMs);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ id, method, params }));
});
ws.addEventListener('message', (ev) => {
  let msg;
  try {
    const raw = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.id !== id) return;
  clearTimeout(timer);
  if (msg.error) {
    console.error(JSON.stringify(msg.error, null, 2));
    process.exit(1);
  }
  const r = msg.result;
  if (typeof r === 'string') process.stdout.write(r.endsWith('\n') ? r : r + '\n');
  else process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  process.exit(0);
});
ws.addEventListener('error', (e) => {
  console.error('bridge-call: ws error: ' + (e.message || String(e)));
  process.exit(1);
});
