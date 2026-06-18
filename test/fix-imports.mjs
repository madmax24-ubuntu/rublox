import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

async function findAndReplaceJSFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'single' || entry.name === 'multi') continue;
            await findAndReplaceJSFiles(fullPath);
        } else if (entry.name.endsWith('.js')) {
            try {
                let content = await readFile(fullPath, 'utf8');
                const relativePath = relative(rootDir, fullPath);
                
                // Replace "three" import with correct relative path
                const depth = (relativePath.split('/').length - 1);
                const prefix = '../'.repeat(depth);
                const threeImport = `./node_modules/three/build/three.module.js`;
                const newThreeImport = `${prefix}node_modules/three/build/three.module.js`;
                
                if (content.includes(`from "${threeImport}"`) || content.includes(`from '${threeImport}'`)) {
                    content = content
                        .replace(new RegExp(`from\\s+"\\./node_modules/three/build/three\\.module\\.js"`, 'g'), `from "${newThreeImport}"`)
                        .replace(new RegExp(`from\\s+'\\./node_modules/three/build/three\\.module\\.js'`, 'g'), `from '${newThreeImport}'`);
                    await writeFile(fullPath, content, 'utf8');
                    console.log(`Fixed: ${relativePath}`);
                }
            } catch (e) {
                // ignore
            }
        }
    }
}

findAndReplaceJSFiles(rootDir);
