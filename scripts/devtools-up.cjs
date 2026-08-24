// devtools-up: подготовка окружения для threejs devtools MCP (автоматически, без участия пользователя).
//
// Что делает:
//   1. Убивает "осиротевшие" headless-Chrome, запущенные MCP-сервером
//      (по специфичным аргументам puppeteer: --no-default-browser-check --window-size=1280,800),
//      чтобы не было двойных рендеров и перегрузки системы.
//   2. Убеждается, что dev-сервер игры работает на порту 3001 (если нет — стартует node server.js).
//   3. Печатает статус. Дальше можно сразу вызывать инструменты threejs_devtools MCP:
//      bridge_status / scene_tree / take_screenshot и т.д.
//
// Запуск: node scripts/devtools-up.cjs

const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const DEV_PORT = Number(process.env.DEV_PORT || 3001);

function log(msg) {
  console.log('[devtools-up] ' + msg);
}

function httpGet(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function waitForServer(url, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const code = await httpGet(url, 1500);
      if (code >= 200 && code < 500) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function killOrphanMcpChromes() {
  // Только Chrome с аргументами, которые ставит MCP-сервер (puppeteer launch args).
  const ps1 = path.join(__dirname, '_kill_mcp_chrome.ps1');
  fs.writeFileSync(
    ps1,
    [
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" |",
      " Where-Object { $_.CommandLine -match 'no-default-browser-check' -and $_.CommandLine -match 'window-size=1280,800' } |",
      " ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }",
    ].join('\r\n') + '\r\n',
    'utf8',
  );
  try {
    const out = execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1 + '"',
      { encoding: 'utf8', timeout: 20000 },
    ).trim();
    const pids = out.split(/\s+/).filter(Boolean);
    log('killed orphan MCP chrome pids: ' + (pids.length ? pids.join(', ') : 'none'));
  } catch (e) {
    log('chrome cleanup failed: ' + String(e.message).split('\n')[0]);
  }
}

async function ensureDevServer() {
  const url = 'http://localhost:' + DEV_PORT + '/';
  let up = false;
  try {
    const code = await httpGet(url, 1500);
    up = code >= 200 && code < 500;
  } catch (_) {}
  if (up) {
    log('dev server already up on :' + DEV_PORT);
    return;
  }
  log('dev server down, starting node server.js ...');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(DEV_PORT) }),
  });
  child.unref();
  const ok = await waitForServer(url, 25000);
  if (!ok) {
    log('ERROR: dev server did not come up on :' + DEV_PORT);
    process.exit(1);
  }
  log('dev server started on :' + DEV_PORT + ' (pid ' + child.pid + ')');
}

(async () => {
  killOrphanMcpChromes();
  await ensureDevServer();
  log('ready. Call threejs_devtools MCP tools now (bridge_status, scene_tree, take_screenshot, ...).');
})().catch((e) => {
  log('FATAL: ' + (e && e.stack || e));
  process.exit(1);
});
