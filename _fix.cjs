const fs = require('fs');
let c = fs.readFileSync('ui/HUD.js', 'utf-8');
let lines = c.split('\n');
let newLines = [];
let skip = false;
for (let line of lines) {
    if (line.includes('const gameOverlay = document.createElement')) {
        newLines.push('        const gameOverlay = document.getElementById(' + String.fromCharCode(39) + 'gameOverlay' + String.fromCharCode(39) + ');');
        skip = true;
    } else if (skip && line.includes('hud.appendChild(gameOverlay)')) {
        skip = false;
    } else if (skip) {
        continue;
    } else {
        newLines.push(line);
    }
}
fs.writeFileSync('ui/HUD.js', newLines.join('\n'), 'utf-8');
console.log('Done');