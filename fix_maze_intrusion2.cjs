const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'world', 'MapGenerator.js');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Find the line with "this.colliders = this.colliders.filter" in _clearCentralBiomeIntrusions
let filterLine = -1;
for (let i = 280; i < 310; i++) {
    if (lines[i].includes('this.colliders = this.colliders.filter((collider)')) {
        filterLine = i;
        break;
    }
}

if (filterLine === -1) {
    console.log('ERROR: Could not find filter line!');
    process.exit(1);
}

console.log('Found filter at line', filterLine + 1);
console.log('Content:', JSON.stringify(lines[filterLine]));

// The filter block is:
// this.colliders = this.colliders.filter((collider) => {
//     if (
//         collider.isTerrain ||
//         ...
//         collider.isBuildingWall
//     )
//         return true;
//     if (intrudes(collider)) return false;
//     ...
// });

// We need to add the maze wall check AFTER the opening `{` and BEFORE the `if (`
// The `{` is on the same line as the filter, and `if (` is on the next line

// Find the line with "if (" that starts the preserved colliders check
let ifLine = filterLine + 1;
while (ifLine < lines.length && !lines[ifLine].trim().startsWith('if (')) {
    ifLine++;
}

console.log('if block at line', ifLine + 1);

// Insert the maze wall check BEFORE the if line
const mazeCheck = '\t\t\t// Maze walls that intrude into central biome must be removed\n\t\t\tif (collider.isMazeWall && intrudes(collider)) return false;';

lines.splice(ifLine, 0, mazeCheck);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('\nFix applied successfully!');
