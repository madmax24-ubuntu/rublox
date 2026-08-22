const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'world', 'MapGenerator.js');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Find the line with "collider.isBuildingWall" in the _clearCentralBiomeIntrusions method
let targetLine = -1;
for (let i = 0; i < lines.length; i++) {
    // Look for the specific pattern in _clearCentralBiomeIntrusions
    if (lines[i].includes('collider.isBuildingWall') && i < 350) {
        targetLine = i;
        break;
    }
}

if (targetLine === -1) {
    console.log('ERROR: Could not find target line!');
    process.exit(1);
}

console.log('Found target at line', targetLine + 1);
console.log('Content:', JSON.stringify(lines[targetLine]));

// The line is: 			collider.isBuildingWall
// We need to add a check BEFORE this block for isMazeWall colliders that intrude

// Find the start of the if block (should be a few lines before)
let ifStart = targetLine;
while (ifStart > 0 && !lines[ifStart - 1].includes('if (')) {
    ifStart--;
}

console.log('if block starts at line', ifStart + 1);

// Insert the maze wall check BEFORE the if block
const mazeCheck = '\t\t\t// Maze walls that intrude into central biome must be removed\n\t\t\tif (collider.isMazeWall && intrudes(collider)) return false;';

lines.splice(ifStart, 0, mazeCheck);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('\nFix applied: maze walls that intrude into central biome are now removed');
