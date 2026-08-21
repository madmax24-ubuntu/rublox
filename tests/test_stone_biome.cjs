const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'world', 'MapGenerator.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('=== Stone Biome Collider Test ===');
console.log('');

// Test 1: mazeWalls InstancedMesh order
console.log('Test 1: mazeWalls InstancedMesh order');
let mazeWallsCreate = -1, mazeWallsSetMatrix = -1, mazeWallsNeedsUpdate = -1;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (mazeWallsCreate === -1 && line.includes('const mazeWalls = new THREE.InstancedMesh(')) {
        mazeWallsCreate = i + 1;
    }
    if (mazeWallsSetMatrix === -1 && mazeWallsCreate > 0 && line.includes('mazeWalls.setMatrixAt(')) {
        mazeWallsSetMatrix = i + 1;
    }
    if (mazeWallsNeedsUpdate === -1 && mazeWallsCreate > 0 && line.includes('mazeWalls.instanceMatrix.needsUpdate')) {
        mazeWallsNeedsUpdate = i + 1;
    }
    if (mazeWallsSetMatrix > 0 && mazeWallsNeedsUpdate > 0) break;
}

if (mazeWallsSetMatrix > 0 && mazeWallsNeedsUpdate > mazeWallsSetMatrix) {
    console.log(`  ✓ mazeWalls: setMatrixAt(${mazeWallsSetMatrix}) < needsUpdate(${mazeWallsNeedsUpdate})`);
} else {
    console.log(`  ✗ mazeWalls: setMatrixAt(${mazeWallsSetMatrix}) >= needsUpdate(${mazeWallsNeedsUpdate})`);
    console.log('  BUG: Invisible walls in stone maze!');
    process.exit(1);
}

// Test 2: mazeCollider.isBuildingWall is set
console.log('');
console.log('Test 2: mazeCollider.isBuildingWall');
let mazeColliderBuildingWall = false;
let mazeColliderIsMazeWall = false;
let inMazeLoop = false;
for (let i = mazeWallsCreate - 1; i < Math.min(mazeWallsCreate + 60, lines.length); i++) {
    const line = lines[i];
    if (line.includes('for (let i = 0; i < segments.length; i++)')) {
        inMazeLoop = true;
    }
    if (inMazeLoop) {
        if (line.includes('mazeCollider.isBuildingWall = true')) {
            mazeColliderBuildingWall = true;
        }
        if (line.includes('mazeCollider.isMazeWall = true')) {
            mazeColliderIsMazeWall = true;
        }
        if (line.trim() === '}' && inMazeLoop) {
            break;
        }
    }
}

if (mazeColliderBuildingWall && mazeColliderIsMazeWall) {
    console.log('  ✓ mazeCollider.isBuildingWall = true');
    console.log('  ✓ mazeCollider.isMazeWall = true');
} else {
    console.log('  ✗ mazeCollider flags missing!');
    console.log('    isBuildingWall: ' + mazeColliderBuildingWall);
    console.log('    isMazeWall: ' + mazeColliderIsMazeWall);
    process.exit(1);
}

// Test 3: towerSteps InstancedMesh order
console.log('');
console.log('Test 3: towerSteps InstancedMesh order');
let towerStepsCreate = -1, towerStepsSetMatrix = -1, towerStepsNeedsUpdate = -1;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (towerStepsCreate === -1 && line.includes('const towerSteps = new THREE.InstancedMesh(')) {
        towerStepsCreate = i + 1;
    }
    if (towerStepsSetMatrix === -1 && towerStepsCreate > 0 && line.includes('towerSteps.setMatrixAt(')) {
        towerStepsSetMatrix = i + 1;
    }
    if (towerStepsNeedsUpdate === -1 && towerStepsCreate > 0 && line.includes('towerSteps.instanceMatrix.needsUpdate')) {
        towerStepsNeedsUpdate = i + 1;
    }
    if (towerStepsSetMatrix > 0 && towerStepsNeedsUpdate > 0) break;
}

if (towerStepsSetMatrix > 0 && towerStepsNeedsUpdate > towerStepsSetMatrix) {
    console.log(`  ✓ towerSteps: setMatrixAt(${towerStepsSetMatrix}) < needsUpdate(${towerStepsNeedsUpdate})`);
} else {
    console.log(`  ✗ towerSteps: setMatrixAt(${towerStepsSetMatrix}) >= needsUpdate(${towerStepsNeedsUpdate})`);
    process.exit(1);
}

// Test 4: roofTiles InstancedMesh order
console.log('');
console.log('Test 4: roofTiles InstancedMesh order');
let roofTilesCreate = -1, roofTilesSetMatrix = -1, roofTilesNeedsUpdate = -1;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (roofTilesCreate === -1 && line.includes('const roofTiles = new THREE.InstancedMesh(')) {
        roofTilesCreate = i + 1;
    }
    if (roofTilesSetMatrix === -1 && roofTilesCreate > 0 && line.includes('roofTiles.setMatrixAt(')) {
        roofTilesSetMatrix = i + 1;
    }
    if (roofTilesNeedsUpdate === -1 && roofTilesCreate > 0 && line.includes('roofTiles.instanceMatrix.needsUpdate')) {
        roofTilesNeedsUpdate = i + 1;
    }
    if (roofTilesSetMatrix > 0 && roofTilesNeedsUpdate > 0) break;
}

if (roofTilesSetMatrix > 0 && roofTilesNeedsUpdate > roofTilesSetMatrix) {
    console.log(`  ✓ roofTiles: setMatrixAt(${roofTilesSetMatrix}) < needsUpdate(${roofTilesNeedsUpdate})`);
} else {
    console.log(`  ✗ roofTiles: setMatrixAt(${roofTilesSetMatrix}) >= needsUpdate(${roofTilesNeedsUpdate})`);
    process.exit(1);
}

// Test 5: _addBiomeResidence isBuildingWall
console.log('');
console.log('Test 5: _addBiomeResidence isBuildingWall');
let residenceBuildingWall = false;
// Search the entire file for the pattern in _addBiomeResidence context
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (part.wall) collider.isBuildingWall = true')) {
        residenceBuildingWall = true;
        break;
    }
}

if (residenceBuildingWall) {
    console.log('  ✓ _addBiomeResidence: isBuildingWall set for wall parts');
} else {
    console.log('  ✗ _addBiomeResidence: isBuildingWall NOT set!');
    process.exit(1);
}

console.log('');
console.log('=== ALL TESTS PASSED ===');
console.log('Stone biome invisible walls fix verified:');
console.log('  1. mazeWalls InstancedMesh: setMatrixAt before needsUpdate ✓');
console.log('  2. mazeCollider flags: isBuildingWall + isMazeWall ✓');
console.log('  3. towerSteps InstancedMesh: setMatrixAt before needsUpdate ✓');
console.log('  4. roofTiles InstancedMesh: setMatrixAt before needsUpdate ✓');
console.log('  5. _addBiomeResidence: isBuildingWall for walls ✓');
process.exit(0);
