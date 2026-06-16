import { execSync, spawn } from 'child_process';
import fs from 'fs';
const logs = execSync('git log --oneline world/MapGenerator.js', { encoding: 'utf8' }).trim().split('\n');

let i = 0;
for (const line of logs) {
    const hash = line.split(' ')[0];
    try {
        // Use git show to extract file content, pipe through node --check via bash
        execSync(`bash -c 'git show ${hash}:world/MapGenerator.js > /tmp/_node_check.js && node --check /tmp/_node_check.js'`);
        console.log(`${i} ${line.trim()} -> OK`);
    } catch (e) {
        console.log(`${i} ${line.trim()} -> BROKEN: ${(e.stderr?.toString() || e.message).split('\n')[0]}`);
    }
    i++;
    if (i > 45) break;
}
