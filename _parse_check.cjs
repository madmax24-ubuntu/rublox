const fs = require('fs');

const content = fs.readFileSync('world/MapGenerator.js', 'utf8');
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

    // Skip strings
    if (!inString && (ch === '"' || ch === "'")) {
        inString = true;
        stringChar = ch;
        let j = i + 1;
        while (j < content.length) {
            if (content[j] === '\\') { j += 2; continue; }
            if (content[j] === stringChar) break;
            j++;
        }
        i = j;
        inString = false;
        continue;
    }

    // Skip single-line comments
    if (!inString && ch === '/' && content[i+1] === '/') {
        let j = i;
        while (++j < content.length && content[j] !== '\n');
        i = j - 1;
        continue;
    }

    // Count nesting
    if (ch === '{') braceDepth++;
    else if (ch === '}') { braceDepth--; if (braceDepth < 0) console.log('Early close brace at char ' + i); }
    if (ch === '(') parenDepth++;
    else if (ch === ')') { parenDepth--; if (parenDepth < 0) console.log('Early close paren at char ' + i); }
    if (ch === '[') bracketDepth++;
    else if (ch === ']') { bracketDepth--; if (bracketDepth < 0) console.log('Early close bracket at char ' + i); }

    // Track depth anomalies
    if (braceDepth > 25 && braceDepth % 10 === 0) {
        const line = content.substring(0, i).split('\n').length;
        console.log(`Line ${line}: high brace depth=${braceDepth}`);
    }
}

console.log(`\nFinal: Braces:${braceDepth}, Parens:${parenDepth}, Brackets:${bracketDepth}`);
if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
    console.log('ALL BALANCED - file structure OK');
} else {
    console.error('IMBALANCE DETECTED!');
}
