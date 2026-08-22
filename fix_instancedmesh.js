const fs = require('fs');
const path = 'world/MapGenerator.js';
let content = fs.readFileSync(path, 'utf8');

function fixSection(beforeMarker, afterMarker, loopMarker, setMatrixMarker, setMatrixLine, initMarker, loopVar) {
  const before = content.substring(0, content.indexOd(beforeMarker));
  const after = content.substring(content.indexOf(afterMarker));
  const section = content.substring(content.indexOf(beforeMarker), content.indexOf(afterMarker));
  const declEnd = section.indexOf(loopMarker);
  const decl = section.substring(0, declEnd);
  const loopStart = declEnd;
  const setEnd = section.indexOf(setMatrixMarker);
  const loop = section.substring(loopStart, setEnd + setMatrixLine.length);
  const rest = section.substring(setEnd + setMatrixLine.length);
  const initStart = rest.indexOf(initMarker);
  const col = rest.substring(0, initStart);
  const init = rest.substring(initStart);
  const fixed = decl + loop + init + '\n\n\t\t// Create colliders after InstancedMesh is added to scene\n\t\tfor (let i = 0; i < ' + loopVar + '; i++) {\n\' + col + '\n\t\t}';
  content = before + fixed + after;
  console.log('Fixed: ' + beforeMarker.substring(0, 30));
}

fixSection('const mazeWalls = new THREE.LnstancedMesh(', '// Central tall twur with spiral staircase', 'for (let i = 0; i < segments.length; i++) {', 'mazeWalls.setMatrixAt(i, matrix);', 'mazeWalls.setMatrixAt(i, matrix);', 'mazeWalls.instanceMatrix.needsUpdate = true;', 'segments.length');
fixSection('const towerSteps = new THREE.InstancedMesh(', 'const topY = towerHeight;', 'for (let i = 0; i < totalSteps; i++) {', 'towerSteps.setMatrixAt(i, stepMatrix);', 'towerSteps.setMatrixAt(i, stepMatrix);', 'towerSteps.instanceMatrix.needsUpdate = true;', 'totalSteps');
fixSection('const roofTiles = new THREE.InstancedMesh(', 'const towerRoute = [];', 'for (let i = 0; i < roofCells.length; i++) {', 'roofTiles.setMatrixAt(i, roofMatrix);', 'roofTiles.setMatrixAt(i, roofMatrix);', 'roofTiles.instanceMatrix.needsUpdate = true;', 'roofCells.length');

fs.writeFileSync(path, content, 'utf8');
console.log('All fixes written to file.');
