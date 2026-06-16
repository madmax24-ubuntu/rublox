import fs from 'fs';
const lines = fs.readFileSync('world/MapGenerator.js', 'utf8').split('\n');

// Find the end of _generateEnvironment sector for-loop
let inEnv = false;
for (let i = 0; i < lines.length; i++) {
    if (/^\s+_generateEnvironment\(\)/.test(lines[i])) {
        inEnv = true;
        console.log(`_generateEnvironment starts at line ${i+1}`);
    }
    if (inEnv && /for \(const sector/.test(lines[i])) {
        const startDepth = lines.slice(0, i).join('\n').match(/\{/g)?.length || 0;
        let depth = 0;
        for (let j = i; j < Math.min(i + 820, lines.length); j++) {
            depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
            if (depth <= startDepth && lines[j].trim() === '}') {
                console.log(`Sector loop closes at line ${j+1}: "${lines[j-2]?.trim()}..."`);
                console.log(`Insert biome code after line ${j}, before line ${j+1}`);
                break;
            }
        }
    }
}
