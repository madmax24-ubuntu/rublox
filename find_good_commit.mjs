import { execSync } from 'child_process';
const logs = execSync('git log --oneline world/MapGenerator.js', { encoding: 'utf8' }).trim().split('\n');

let i = 0;
for (const line of logs) {
    const hash = line.split(' ')[0];
    try {
        execSync(`node --check <(git show ${hash}:world/MapGenerator.js)`);
        console.log(`${i} ${line.trim()} -> OK`);
    } catch (e) {
        console.log(`${i} ${line.trim()} -> BROKEN: ${e.message.split('\n')[0] || e.message}`);
    }
    i++;
    if (i > 45) break;
}
