import { execSync } from 'child_process';
import fs from 'fs';

const commits = [9, 10, 14, 25];
for (const i of commits) {
    const hashLine = execSync(`git log --oneline world/MapGenerator.js | tail -n+${i} | head -1`, { encoding: 'utf8' }).trim();
    const hash = hashLine.split(' ')[0];

    // Extract to Windows temp path (C:\\Windows\\Temp or similar)
    const tmpPath = `C:/Users/maksk/Desktop/rublox/.tmp_check_${i}.js`;
    execSync(`git show ${hash}:world/MapGenerator.js > "${tmpPath}"`);

    try {
        const content = fs.readFileSync(tmpPath, 'utf8');
        const lines = content.split('\n');
        let braceBalance = 0;
        for (const line of lines) {
            braceBalance += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        }

        // Check syntax using node from bash
        try {
            execSync(`node --check "${tmpPath}"`);
            console.log(`${i} (${hash}): ${lines.length} lines, braces=${braceBalance}, SYNTAX OK`);
        } catch (e) {
            const err = e.stderr?.toString() || '';
            console.log(`${i} (${hash}): ${lines.length} lines, braces=${braceBalance}, BROKEN: ${err.split('\n').find(l => l.includes('SyntaxError')) || 'unknown'}`);
        }

        fs.unlinkSync(tmpPath);
    } catch (e) {
        console.log(`${i}: Error - ${e.message}`);
    }
}
