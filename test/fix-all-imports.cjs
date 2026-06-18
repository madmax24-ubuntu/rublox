const fs = require('fs');
const path = require('path');

function fixFile(filePath, depth) {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return;
    
    let content = fs.readFileSync(fullPath, 'utf8');
    const prefix = '../'.repeat(depth) || './';
    const newImport = `${prefix}node_modules/three/build/three.module.js`;
    
    // Replace any three import
    const regex = /from\s+["'][^"']*three[^"']*["']/g;
    const fixed = content.replace(regex, `from "${newImport}"`);
    
    if (fixed !== content) {
        fs.writeFileSync(fullPath, fixed, 'utf8');
        console.log('Fixed:', filePath);
    }
}

// Root level files
fixFile('main.js', 0);
fixFile('core/GameLoop.js', 1);
fixFile('core/Input.js', 1);
fixFile('entities/Bot.js', 1);
fixFile('entities/Player.js', 1);
fixFile('entities/Zombie.js', 1);
fixFile('entities/BotBrain.js', 1);
fixFile('entities/EntityManager.js', 1);
fixFile('entities/ExplosiveBarrel.js', 1);
fixFile('world/MapGenerator.js', 1);
fixFile('world/Physics.js', 1);
fixFile('world/Zone.js', 1);
fixFile('world/Environment.js', 1);
fixFile('world/AABBGrid.js', 1);
fixFile('world/DebugOverlay.js', 1);
fixFile('items/Weapon.js', 1);
fixFile('items/LootManager.js', 1);
