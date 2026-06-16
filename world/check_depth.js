const fs = require('fs');
const src = fs.readFileSync('./world/MapGenerator.js', 'utf8');
let bd = 0;
for (let i = 1; i <= Math.min(942, src.split('\n').length); i++) {
    const line = src.split('\n')[i-1];
    for (const ch of line) {
        if (ch === '{') bd++;
        else if (ch === '}') bd--;
    }
}

// Print depth at every closing brace before _addTree
bd = 0;
for (let i = 1; i <= Math.min(942, src.split('\n').length); i++) {
    const line = src.split('\n')[i-1];
    for (const ch of line) {
        if (ch === '{') bd++;
        else if (ch === '}') bd--;
    }
}

// Print depth at every closing brace before _addTree
bd = 0;
for (let i = 1; i <= Math.min(942, src.split('\n').length); i++) {
    const line = src.split('\n')[i-1];
    for (const ch of line) {
        if (ch === '{') bd++;
        else if (ch === '}') bd--;
    }
}

// Print depth at every closing brace before _addTree
bd = 0;
for (let i = 1; i <= Math.min(942, src.split('\n').length); i++) {
    const line = src.split('\n')[i-1];
    for (const ch of line) {
        if (ch === '{') bd++;
        else if (ch === '}') bd--;
    }
}

// Print depth at every closing brace before _addTree
bd = 0;
for (let i = 1; i <= Math.min(942, src.split('\n').length); i++) {
    const line = src.split('\n')[i-1];
    for (const ch of line) {
        if (ch === '{') bd++;
        else if (ch === '}') bd--;
    }
}

// Print depth at every closing brace before _addTree
bd = 0;
for (let i = 1; i <= Math.min(942, src.split('\n').length); i++) {
    const line = src.split('\n')[i-1];
    for (const ch of line) {
        if (ch === '{') bd++;
        else if (ch === '}') bd--;
    }
}
