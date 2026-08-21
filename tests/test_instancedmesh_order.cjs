const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'world', 'MapGenerator.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('=== InstancedMesh Order Test ===');
console.log('Verifying that setMatrixAt is called BEFORE instanceMatrix.needsUpdate');
console.log('');

// Find all InstancedMesh creation patterns
const instancedMeshes = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*(?:const|let|var)\s+(\w+)\s*=\s*new\s+THREE\.InstancedMesh\(/);
    if (match) {
        const name = match[1];
        instancedMeshes.push({ name, createLine: i + 1 });
    }
}

console.log('Found ' + instancedMeshes.length + ' InstancedMesh: ' + instancedMeshes.map(m => m.name).join(', '));
console.log('');

let passed = 0;
let failed = 0;

for (const { name, createLine } of instancedMeshes) {
    let setMatrixAtLine = -1;
    let needsUpdateLine = -1;
    let computeBoundingSphereLine = -1;
    let sceneAddLine = -1;
    
    const searchLimit = Math.min(createLine + 100, lines.length);
    
    for (let i = createLine - 1; i < searchLimit; i++) {
        const line = lines[i];
        if (setMatrixAtLine === -1 && line.includes(name + '.setMatrixAt(')) {
            setMatrixAtLine = i + 1;
        }
        if (needsUpdateLine === -1 && line.includes(name + '.instanceMatrix.needsUpdate')) {
            needsUpdateLine = i + 1;
        }
        if (computeBoundingSphereLine === -1 && line.includes(name + '.computeBoundingSphere()')) {
            computeBoundingSphereLine = i + 1;
        }
        if (sceneAddLine === -1 && line.includes('this.scene.add(' + name + ')')) {
            sceneAddLine = i + 1;
        }
        if (setMatrixAtLine > 0 && needsUpdateLine > 0 && sceneAddLine > 0) break;
    }
    
    // CRITICAL CHECK: setMatrixAt MUST be called BEFORE needsUpdate
    // This is the key fix - if needsUpdate comes before setMatrixAt, 
    // the GPU won't see the instance matrices.
    const criticalOk = setMatrixAtLine > 0 && needsUpdateLine > 0 && setMatrixAtLine < needsUpdateLine;
    
    // SECONDARY CHECK: scene.add should come after needsUpdate
    const sceneAddOk = sceneAddLine > 0 && sceneAddLine > needsUpdateLine;
    
    // computeBoundingSphere is optional but recommended
    const computeBSOk = computeBoundingSphereLine > 0;
    
    const allOk = criticalOk && sceneAddOk;
    
    if (allOk) {
        console.log(`✓ ${name}: PASS`);
        console.log(`  setMatrixAt:${setMatrixAtLine} < needsUpdate:${needsUpdateLine} < sceneAdd:${sceneAddLine}`);
        if (!computeBSOk) {
            console.log(`  ⚠ computeBoundingSphere: NOT CALLED (optional)`);
        } else {
            console.log(`  computeBS:${computeBoundingSphereLine}`);
        }
        passed++;
    } else {
        console.log(`✗ ${name}: FAIL`);
        console.log(`  setMatrixAt:${setMatrixAtLine} needsUpdate:${needsUpdateLine} sceneAdd:${sceneAddLine}`);
        if (!criticalOk) {
            console.log(`  CRITICAL BUG: setMatrixAt(${setMatrixAtLine}) >= needsUpdate(${needsUpdateLine})!`);
            console.log(`  GPU will NOT see instance matrices - invisible walls!`);
        }
        if (!sceneAddOk) {
            console.log(`  scene.add(${sceneAddLine}) before needsUpdate(${needsUpdateLine})!`);
        }
        failed++;
    }
}

console.log('');
console.log('=== RESULTS ===');
console.log(`Passed: ${passed}/${instancedMeshes.length}`);
console.log(`Failed: ${failed}/${instancedMeshes.length}`);

if (failed > 0) {
    console.log('');
    console.log('FAIL: Some InstancedMesh have incorrect order!');
    process.exit(1);
} else {
    console.log('');
    console.log('PASS: All InstancedMesh have correct order!');
    console.log('setMatrixAt is called BEFORE needsUpdate for all InstancedMesh.');
    process.exit(0);
}
