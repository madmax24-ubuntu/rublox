const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Copy the valid /tmp version to working directory
const src = '/tmp/MG_clean.js';
const dst = 'world/MapGenerator.js';

if (fs.existsSync(src)) {
    const content = fs.readFileSync(src, 'utf8');
    // Ensure LF line endings for Node parser on Windows
    const cleaned = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    fs.writeFileSync(dst, cleaned);

    try {
        execSync(`node --check "${path.resolve(dst)}"`, { stdio: 'inherit' });
        console.log('SUCCESS: Syntax check passed via Node subprocess');
    } catch (e) {
        const err = e.stderr?.toString() || '';
        console.error('FAILED:', err.split('\n').find(l => l.includes('SyntaxError')) || err);
    }
} else {
    console.log('Source file not found, trying direct extraction...');
    // Extract directly from git
    execSync(`git show ebbb1f6:world/MapGenerator.js > "${dst}"`, { shell: '/bin/bash' });

    try {
        const content = fs.readFileSync(dst, 'utf8').replace(/\r\n/g, '\n');
        fs.writeFileSync('/tmp/mg_direct_check.js', content);
        execSync('node --check /tmp/mg_direct_check.js', { stdio: ['pipe','inherit','pipe'] });
        console.log('SUCCESS via /tmp extraction');
    } catch (e) {
        const err = e.stderr?.toString() || '';
        console.error('FAILED:', err.split('\n').find(l => l.includes('SyntaxError')) || 'Exit code: '+e.code);

        // Try a different approach - use vm to parse without checking syntax fully
        try {
            const { VM } = require('vm2');
            const vm = new VM({ timeout: 5000 });
            vm.run(`(function(){${content}})()`);
            console.log('VM parsed successfully (partial check passed)');
        } catch(e2) {
            console.error('VM parse failed:', e2.message.split('\n')[0]);
        }
    }
}
