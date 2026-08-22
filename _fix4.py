import os

# Read the MapGenerator.js file
with open('world/MapGenerator.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Restore _removeDetachedColliderSources before _removeOrphanedColliders
old_section = '''

	/** Remove colliders that have no corresponding visual object in the scene */
	_removeOrphanedColliders() {'''

new_section = '''
	_removeDetachedColliderSources() {
		this.colliders = this.colliders.filter(
			(collider) =>
				!collider.source || this._isAttachedToScene(collider.source),
		);
	}

	/** Remove colliders that have no corresponding visual object in the scene */
	_removeOrphanedColliders() {'''

if old_section in content:
    content = content.replace(old_section, new_section)
    with open('world/MapGenerator.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: Restored _removeDetachedColliderSources')
else:
    print('FAILED: Could not find target pattern')
