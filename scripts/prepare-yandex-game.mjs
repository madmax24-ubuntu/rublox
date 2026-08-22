import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'yandex-game');
const sourceItems = ['index.html', 'main.js', 'assets', 'core', 'entities', 'items', 'ui', 'world'];

const copy = async (source, destination) => {
  const output = path.join(target, destination || source);
  await mkdir(path.dirname(output), { recursive: true });
  await cp(path.join(root, source), output, { recursive: true, force: true });
};

const walk = async (dir, prefix = '') => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute, relative));
    else files.push({ relative, absolute });
  }
  return files;
};

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const item of sourceItems) await copy(item);
await copy('node_modules/three/build/three.module.js', 'node_modules/three/build/three.module.js');
await copy('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');

const indexPath = path.join(target, 'index.html');
let html = await readFile(indexPath, 'utf8');
html = html.replace('</head>', '    <script src="/sdk.js" data-yg-sdk="1" onload="this.dataset.loaded=\'1\'" onerror="this.dataset.failed=\'1\'"></script>\n</head>');
html = html.replace(/<script type="module" src="\.\/main\.js[^\"]*"><\/script>/i, '<script>window.__ARENA_BUILD_MODE = \'single\';</script>\n    <script type="module" src="./main.js"></script>');
await writeFile(indexPath, html, 'utf8');

const files = await walk(target);
const invalid = files.filter(({ relative }) => /[\u0400-\u04FF\s]/u.test(relative));
if (invalid.length) throw new Error(`Invalid archive paths: ${invalid.map(file => file.relative).join(', ')}`);
const indexFiles = files.filter(file => file.relative.toLowerCase() === 'index.html');
if (indexFiles.length !== 1) throw new Error(`Expected one root index.html, found ${indexFiles.length}`);
let bytes = 0;
for (const file of files) bytes += (await stat(file.absolute)).size;
if (bytes > 100 * 1024 * 1024) throw new Error(`Uncompressed build exceeds 100 MB: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`yandex-game ready: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
