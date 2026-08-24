const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);

const zip = path.join(root, 'yandex-game.zip');
const src = path.join(root, 'yandex-game');
const out = path.join(root, '.zipverify');

if (fs.existsSync(zip)) fs.rmSync(zip);
if (fs.existsSync(out)) fs.rmSync(out, { recursive: true });
fs.mkdirSync(out, { recursive: true });

// zip with CONTENTS of yandex-game/ at archive root (index.html at root)
execFileSync('tar', ['-a', '-c', '-f', 'yandex-game.zip', '-C', 'yandex-game', '.'], { stdio: 'inherit' });
const size = fs.statSync(zip).size;
console.log('zip bytes:', size);

execFileSync('tar', ['-x', '-f', 'yandex-game.zip', '-C', '.zipverify'], { stdio: 'inherit' });

const read = (p) => fs.readFileSync(path.join(out, p), 'utf8');
const html = read('index.html');
const yb = read('core/YandexBridge.js');
const mg = read('world/MapGenerator.js');
const hud = read('ui/HUD.js');
const main = read('main.js');

const checks = {
  'index.html sdk.js in head (async)': html.includes('async src="/sdk.js"'),
  'single build mode': html.includes("__ARENA_BUILD_MODE = 'single'"),
  'YandexBridge: no shouldUseSdkRuntime': !yb.includes('shouldUseSdkRuntime'),
  'YandexBridge: always YaGames.init': /await this\.loadSdkScript\(\);/.test(yb) && yb.includes('if (window.YaGames?.init) {'),
  'YandexBridge: i18n.lang': yb.includes('i18n'),
  'MapGenerator: 2F slab with 5x5 hole (4 boxes, aligned to stairs)': mg.includes('0, 4.15, -6') && mg.includes('0, 4.15, 3.5') && mg.includes('-8.75, 4.15, -2.5') && mg.includes('2.75, 4.15, -2.5'),
  'MapGenerator: tower roof solid (no fall-through)': mg.includes('Solid roof: keep every cell') && !mg.includes('inExitPassage'),
  'HUD_STRINGS': hud.includes('HUD_STRINGS'),
  'main setLang': main.includes('setLang'),
};
let bad = 0;
for (const [k, v] of Object.entries(checks)) {
  if (!v) bad++;
  console.log((v ? 'PASS' : 'FAIL') + '  ' + k);
}
process.exit(bad ? 1 : 0);
