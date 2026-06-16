import { execSync } from 'child_process';
const logs = execSync('git log --oneline world/MapGenerator.js', { encoding: 'utf8' }).trim().split('\n');

let i = 0;
for (const line of logs) {
    const hash = line.split(' ')[0];
    try {
        // Extract to Windows temp path, then check syntax
        execSync(`bash -c "git show ${hash}:world/MapGenerator.js > /tmp/_node_check_${i}.js && node --check /tmp/_node_check_${i}.js"`);
        console.log(`${i} ${line.trim()} -> OK`);
    } catch (e) {
        const err = e.stderr?.toString() || '';
        const firstLine = err.split('\n').find(l => l.includes('SyntaxError') || l.includes('ERR_')) || err;
        console.log(`${i} ${line.trim()} -> BROKEN`);
    }
    i++;
    if (i > 45) break;
}
