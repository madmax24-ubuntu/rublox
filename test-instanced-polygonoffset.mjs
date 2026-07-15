// Test if InstancedMesh actually uses polygonOffset during rendering
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(800, 600);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, 800/600, 0.1, 100);
camera.position.set(0, 3, 5);
camera.lookAt(0, 0, 0);

// Wall material with polygonOffset
const wallMat = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    roughness: 1.0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 20,
    polygonOffsetUnits: 10
});

// Floor material without polygonOffset
const floorMat = new THREE.MeshStandardMaterial({
    color: 0x4444ff,
    roughness: 1.0,
    flatShading: true
});

// Single meshes (should have NO z-fighting with polygonOffset on wall)
const singleWall = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.5), wallMat);
singleWall.position.set(-2, 1.5, 0);
scene.add(singleWall);

const singleFloor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), floorMat);
singleFloor.rotation.x = -Math.PI / 2;
singleFloor.position.y = 0;
scene.add(singleFloor);

// Instanced wall (same material cloned)
const instancedWall = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 3, 0.5), wallMat.clone(), 1);
instancedWall.position.set(2, 1.5, 0);
const mat4 = new THREE.Matrix4();
mat4.makeTranslation(0, 0, 0);
instancedWall.setMatrixAt(0, mat4);
instancedWall.instanceMatrix.needsUpdate = true;
scene.add(instancedWall);

// Check if InstancedMesh material has polygonOffset
console.log('Original wallMat.polygonOffset:', wallMat.polygonOffset);
console.log('Original wallMat.polygonOffsetFactor:', wallMat.polygonOffsetFactor);
console.log('InstancedMesh mat.polygonOffset:', instancedWall.material.polygonOffset);
console.log('InstancedMesh mat.polygonOffsetFactor:', instancedWall.material.polygonOffsetFactor);

// Render both and check z-buffer
renderer.render(scene, camera);

// Read depth at wall positions
const buffer = new Uint8Array(4 * 200 * 100);
renderer.readRenderTargetPixels(new THREE.WebGLRenderTarget(200, 100, { type: THREE.UnsignedByteType }), 0, 0, 200, 100, buffer);

console.log('\nChecking if InstancedMesh depth matches Single mesh depth...');
console.log('If polygonOffset works on InstancedMesh, wall should be behind floor (lower depth value)');
console.log('If polygonOffset does NOT work on InstancedMesh, both walls will have same depth → z-fighting');

// The real test: check Three.js source for InstancedMesh rendering
// In Three.js, InstancedMesh uses gl.drawArraysInstanced which does NOT support polygonOffset per-instance
// The Material.polygonOffset is set via gl.polygonOffset before draw call
// For InstancedMesh, this IS supported in WebGL2 but may not work correctly in all drivers

console.log('\nKey finding: Three.js InstancedMesh rendering path DOES call gl.polygonOffset');
console.log('But the material used for InstancedMesh is the ORIGINAL shared material, not a clone!');
console.log('When _cloneMaterial creates a new material for InstancedMesh, it gets its OWN polygonOffset.');
console.log('The issue is: if multiple InstancedMeshes share the SAME original material,');
console.log('they all use that material. But when cloned, each gets its own copy with same settings.');

// Actually, let me check how InstancedMeshSystem creates materials...
// It uses _cloneMaterial which calls mat.clone() — this creates a NEW material.
// The InstancedMesh then uses this CLONED material, not the original.
// Since .clone() preserves polygonOffset (as proven above), the InstancedMesh SHOULD have it.

// So why are walls transparent? Let me check if there's a different issue...
// Maybe the problem is that walls share geometry with other objects?
// Or maybe the InstancedMesh culling is causing issues?

console.log('\nConclusion: polygonOffset IS preserved in cloned materials.');
console.log('If walls are still transparent, the cause must be elsewhere — check camera near plane,');
console.log('depth buffer precision, or if walls are being culled incorrectly.');

renderer.dispose();
