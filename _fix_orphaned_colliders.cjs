// Update _clearCentralBiomeIntrusions to also remove orphaned colliders
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'world', 'MapGenerator.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the collider filter section in _clearCentralBiomeIntrusions
const target = 'Maze walls that intrude into central biome must be removed';

if (content.includes(target)) {
    // Add orphaned collider check after maze wall check
    const oldLine = 'if (collider.isMazeWall && intrudes(collider)) return false;';
    const newLines = 'if (collider.isMazeWall && intrudes(collider)) return false;\n\t\t\t// Remove orphaned colliders from InstancedMesh optimization\n\t\t\tif (collider.source \&\& !this._isAttachedToScene(collider.source)) return false;';
    
    content = content.replace(oldLine, newLines);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('SUCCESS: Added orphaned collider removal in _clearCentralBiomeIntrusions');
} else {
    console.log('FAILED: Could not find target pattern');
    process.exit(1);
}
