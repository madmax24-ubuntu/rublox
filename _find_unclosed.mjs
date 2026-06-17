import { readFileSync } from 'fs';
const c = readFileSync('world/MapGenerator.js', 'utf8');
const lines = c.split('\n');
let d = 0;

// Find all lines where depth transitions to non-zero after line 920
for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i]) {
        if (ch === '{') d++;
        else if (ch === '}') d--;
    }
}

// Now find where the last two unclosed braces started
d = 0;
for (let i = 0; i < Math.min(1680, lines.length); i++) {
    const oldD = d;
    for (const ch of lines[i]) {
        if (ch === '{') d++;
        else if (ch === '}') d--;
    }
    // When depth goes from 2 to 3 after line 1068, that's suspicious
    if (oldD >= 2 && d > oldD && i > 920) {
        console.log(`line ${i+1}: depth ${oldD} -> ${d}, content:`, lines[i].trim().substring(0, 50));
    }
}
