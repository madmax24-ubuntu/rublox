import os

# Read the MapGenerator.js file
with open('world/MapGenerator.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the Phase 11.5 section and add _removeOrphanedColliders call
target = 'this._clearCentralBiomeIntrusions();\n\t\tthis._removeDetachedColliderSources();\n\n\t\t// Phase 12: Finalize'
replacement = 'this._clearCentralBiomeIntrusions();\n\t\tthis._removeDetachedColliderSources();\n\t\tthis._removeOrphanedColliders();\n\n\t\t// Phase 12: Finalize'

if target in content:
    content = content.replace(target, replacement)
    with open('world/MapGenerator.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: Added _removeOrphanedColliders call after Phase 11.5')
else:
    print('FAILED: Could not find target pattern')
