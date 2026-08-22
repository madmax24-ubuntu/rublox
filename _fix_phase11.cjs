// Add _clearCentralBiomeIntrusions after _optimizeInstancing
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'world', 'MapGenerator.js');
let content = fs.readFileSync(filePath, 'utf8');

// Use CRLF line endings as in the original file
const target = ');\r\n\r\n\t\t// Phase 12: Finalize';
const replacement = ');\r\n\r\n\t\t// Phase 11.5: Clear biome intrusions AFTER InstancedMesh optimization\r\n\t\tthis._clearCentralBiomeIntrusions();\r\n\r\n\t\t// Phase 12: Finalize';

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('SUCCESS: Added _clearCentralBiomeIntrusions after _optimizeInstancing');
} else {
    console.log('FAILED: Could not find target pattern');
    process.exit(1);
}
