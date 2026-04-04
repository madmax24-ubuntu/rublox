import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();

const SOURCE_ITEMS = [
  'index.html',
  'main.js',
  'assets',
  'core',
  'entities',
  'items',
  'ui',
  'world'
];

const BUILDS = [
  { dir: 'single', mode: 'single', title: 'Rubo Arena: Голодные игры' },
  { dir: 'multi', mode: 'multi', title: 'Rubo Arena: Голодные игры' }
];

async function copyBaseFiles(targetDir) {
  for (const item of SOURCE_ITEMS) {
    const src = path.join(rootDir, item);
    const dst = path.join(targetDir, item);
    await cp(src, dst, { recursive: true, force: true });
  }
}

async function copyThree(targetDir) {
  const src = path.join(rootDir, 'node_modules', 'three');
  const dst = path.join(targetDir, 'node_modules', 'three');
  await mkdir(path.dirname(dst), { recursive: true });
  await cp(src, dst, { recursive: true, force: true });
}

function injectBuildMode(html, mode, title) {
  let out = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${title}</title>`
  );

  const modeScript = `<script>window.__ARENA_BUILD_MODE = '${mode}';</script>`;
  out = out.replace(
    /<script type="module" src="\.\/main\.js"><\/script>/i,
    `${modeScript}\n    <script type="module" src="./main.js"></script>`
  );
  return out;
}

async function writeBuildReadme(targetDir, mode) {
  const text = [
    `Rubo Arena build mode: ${mode}`,
    '',
    'Эта папка готова для отдельной загрузки в Яндекс Игры.',
    'В архив нужно упаковать СОДЕРЖИМОЕ этой папки, а не папку целиком.',
    '',
    'Точка входа: index.html'
  ].join('\n');
  await writeFile(path.join(targetDir, 'README_YANDEX.txt'), text, 'utf8');
}

async function buildOne({ dir, mode, title }) {
  const targetDir = path.join(rootDir, dir);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  await copyBaseFiles(targetDir);
  await copyThree(targetDir);

  const htmlPath = path.join(targetDir, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  const patched = injectBuildMode(html, mode, title);
  await writeFile(htmlPath, patched, 'utf8');

  await writeBuildReadme(targetDir, mode);
}

async function main() {
  for (const build of BUILDS) {
    await buildOne(build);
  }
  // eslint-disable-next-line no-console
  console.log('Done: generated ./single and ./multi');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate builds:', err);
  process.exit(1);
});
