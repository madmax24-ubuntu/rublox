import os

# Read the MapGenerator.js file
with open('world/MapGenerator.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix _removeOrphanedColliders - use correct THREE.Box3 API
old_code = '''		// Filter colliders: keep only those that overlap with visual bounds
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
		});'''

new_code = '''		// Filter colliders: keep only those that overlap with visual bounds
		this.colliders = this.colliders.filter((collider) => {
			// Always preserve special colliders
			if (collider.isTerrain || collider.isCornucopia || collider.isBiomeEntrance ||
				collider.biomeBoundary || collider.gameplayBoundary || collider.isTowerStructure ||
				collider.isTowerStair || collider.isBiomeResidence) return true;
			
			// Check if collider overlaps with any visual bound
			colliderBox.min.set(collider.min.x, collider.min.y, collider.min.z);
			colliderBox.max.set(collider.max.x, collider.max.y, collider.max.z);
			for (const vb of visualBounds) {
				if (colliderBox.intersectsBox(vb)) return true;
			}
			return false;
		});'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('world/MapGenerator.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: Fixed _removeOrphanedColliders')
else:
    print('FAILED: Could not find old code')
