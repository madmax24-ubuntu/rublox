import { readFileSync } from 'fs';
import { parseScript } from './node_modules/esprima/dist/esprima.js' 2>/dev/null || null;

const content = readFileSync('world/MapGenerator.js', 'utf8');

// Try to use acorn or esprima parser if available, otherwise just count braces
let braceDepth = 0;
let parenDepth = 0;
let bracketDepth = 0;
let inString = false;
let stringChar = '';
let escaped = false;

for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escaped) {
        escaped = false;
        continue;
    }

    if (ch === '\\') {
        escaped = true;
        continue;
    }

    // Track string literals
    if ((ch === '"' || ch === "'" || ch === '`') && !inString) {
        inString = true;
        stringChar = ch;
        continue;
    }
    if (ch === stringChar && inString) {
        inString = false;
        continue;
    }

    if (!inString) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
    }
}

console.log(`Braces: ${braceDepth}, Parens: ${parenDepth}, Brackets: ${bracketDepth}`);
console.log(`Total chars: ${content.length}, Lines: ${(content.match(/\n/g) || []).length + 1}`);

if (braceDepth !== 0 || parenDepth !== 0 || bracketDepth !== 0) {
    console.error('IMBALANCE DETECTED!');
} else {
    console.log('All balanced.');
}
