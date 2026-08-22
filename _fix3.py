import os

# Read the MapGenerator.js file
with open('world/MapGenerator.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the _removeOrphanedColliders method
old_method = '''	_removeOrphanedColliders() {
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
	}'''

new_method = '''	_removeOrphanedColliders() {
		const box = new THREE.Box3();
		const colliderBox = new THREE.Box3();
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
			colliderBox.setFromCenterSize(
				new THREE.Vector3(
					(collider.min.x + collider.max.x) * 0.5,
					(collider.min.y + collider.max.y) * 0.5,
					(collider.min.z + collider.max.z) * 0.5
				),
				new THREE.Vector3(
					collider.max.x - collider.min.x,
					collider.max.y - collider.min.y,
					collider.max.z - collider.min.z
				)
			);
			for (const vb of visualBounds) {
				if (colliderBox.intersectsBox(vb)) return true;
			}
			return false;
		});
	}'''

if old_method in content:
    content = content.replace(old_method, new_method)
    with open('world/MapGenerator.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: Fixed _removeOrphanedColliders method')
else:
    print('FAILED: Could not find old method')
