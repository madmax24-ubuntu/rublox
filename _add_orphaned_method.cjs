// Add _removeOrphanedColliders method after _removeDetachedColliderSources
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'world', 'MapGenerator.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the end of _removeDetachedColliderSources and add new method after it
const target = '	_removeDetachedColliderSources() {
		this.colliders = this.colliders.filter(
			(collider) =>
				!collider.source || this._isAttachedToScene(collider.source),
		);
	}

	_removeUnsupportedWalkableColliders() {';

const newMethod = `
	/** Remove colliders that have no corresponding visual object in the scene */
	_removeOrphanedColliders() {
		const box = new THREE.Box3();
		const tmpMat = new THREE.Matrix4();
		const visualBounds = [];
		
		// Collect bounds of all visual objects
		this.scene.traverse((obj) => {
			if (!obj.userData?.mapGenerated) return;
			if (obj.isInstancedMesh) {
				obj.geometry.computeBoundingBox();
				obj.updateMatrixWorld(true);
				for (let i = 0; i < obj.count; i++) {
					obj.getMatrixAt(i, tmpMat);
					box.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
					visualBounds.push(box.clone());
				}
			} else if (obj.isMesh || obj.isGroup) {
				box.setFromObject(obj);
				if (!box.isEmpty()) visualBounds.push(box.clone());
			}
		});
		
		// Filter colliders: keep only those that overlap with visual bounds
		this.colliders = this.colliders.filter((collider) => {
			// Always preserve special colliders
			if (collider.isTerrain || collider.isCornucopia || collider.isBiomeEntrance ||
				collider.biomeBoundary || collider.gameplayBoundary || collider.isTowerStructure ||
				collider.isTowerStair || collider.isBiomeResidence) return true;
			
			// Check if collider overlaps with any visual bound
			for (const vb of visualBounds) {
				if (box.intersectsBox(vb)) return true;
			}
			return false;
		});
	}

	_removeUnsupportedWalkableColliders() {`;

if (content.includes(target)) {
    content = content.replace(target, newMethod);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('SUCCESS: Added _removeOrphanedColliders method');
} else {
    console.log('FAILED: Could not find target pattern');
    process.exit(1);
}
