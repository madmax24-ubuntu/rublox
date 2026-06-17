import { readFileSync } from 'fs';

const content = readFileSync('world/MapGenerator.js', 'utf8');
let braceDepth = 0;
let parenDepth = 0;
let bracketDepth = 0;
let inString = false;
let stringChar = '';
let escaped = false;

for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    // Track string literals to skip braces inside strings/comments
    if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
        inString = true;
        stringChar = ch;
        continue;
    }
    if (inString && ch === stringChar) {
        // Check for multi-line template literals
        if (stringChar === '`') {
            // Template literal can contain newlines - track until closing `
            let j = i + 1;
            while (j < content.length && !(content[j] === '`' && !escaped)) {
                if (content[j-1] !== '\\') escaped = false;
                else escaped = true;
                j++;
            }
            inString = false;
        }
        inString = false;
        continue;
    }

    if (!inString) {
        // Skip single-line comments
        if (ch === '/' && i + 1 < content.length && content[i+1] === '/') {
            let j = i;
            while (++j < content.length && content[j] !== '\n');
            i = j - 1;
            continue;
        }

        // Skip block comments (// ===== markers are just line comments)
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;

        // Report when depth goes negative (early closing)
        if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
            const line = content.substring(0, i).split('\n').length;
            console.log(`Early close at char ${i}, line ~${line}: brace=${braceDepth} paren=${parenDepth} bracket=${bracketDepth}`);
        }

        // Report when we hit a very high depth (possible missing closes)
        if (braceDepth > 30 || parenDepth > 20) {
            const line = content.substring(0, i).split('\n').length;
            console.log(`High depth at char ${i}, line ~${line}: brace=${braceDepth} paren=${parenDepth}`);
        }

    }
}

console.log(`Final: Braces:${braceDepth} Parens:${parenDepth} Brackets:${bracketDepth}`);
if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
    console.log('ALL BALANCED');
} else {
    console.error('IMBALANCE!');
}
