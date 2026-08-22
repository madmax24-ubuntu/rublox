// Add _removeDetachedColliderSources after _clearCentralBiomeIntrusions (Phase 11.5)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'world', 'MapGenerator.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the pattern: "this._clearCentralBiomeIntrusions();\r\n\r\n\t\t// Phase 12: Finalize"
const target = 'this._clearCentralBiomeIntrusions();\r\n\r\n\t\t// Phase 12: Finalize';
const replacement = 'this._clearCentralBiomeIntrusions();\r\n\t\tthis._removeDetachedColliderSources();\r\n\r\n\t\t// Phase 12: Finalize';

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('SUCCESS: Added _removeDetachedColliderSources after Phase 11.5');
} else {
    console.log('FAILED: Could not find target pattern');
    process.exit(1);
}
