// Add method to remove orphaned colliders (colliders without visual objects)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'world', 'MapGenerator.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the _removeDetachedColliderSources method
const target = '_removeDetachedColliderSources() {';

if (content.includes(target)) {
    // Add a new method _removeOrphanedColliders after _removeDetachedColliderSources
    const oldMethod = '_removeDetachedColliderSources() {
		this.colliders = this.colliders.filter(
			(collider) =>
				!collider.source || this._isAttachedToScene(collider.source),
		);
	}';
    
    const newMethod = '_removeDetachedColliderSources() {
		this.colliders = this.colliders.filter(
			(collider) =>
				!collider.source || this._isAttachedToScene(collider.source),
		);
	}

	/** Remove colliders that have no corresponding visual object in the scene */
	_removeOrphanedColliders() {
		const box = new THREE.Box3();
		const tmpVec = new THREE.Vector3();
		const visualBounds = [];
		
		// Collect bounds of all visual objects
		this.scene.traverse((obj) => {
			if (!obj.userData?.mapGenerated) return;
			if (obj.isInstancedMesh) {
				obj.geometry.computeBoundingBox();
				obj.updateMatrixWorld(true);
				for (let i = 0; i < obj.count; i++) {
					obj.getMatrixAt(i, tmpVec);
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
	}';
    
    content = content.replace(oldMethod, newMethod);
    fs.writeFileSync(filePath, 'utf8');
    console.log('SUCCESS: Added _removeOrphanedColliders method');
} else {
    console.log('FAILED: Could not find _removeDetachedColliderSources');
    process.exit(1);
}
