const fs = require('fs');
const path = require('path');

const files = [
    'core/GameLoop.js',
    'core/Input.js',
    'entities/Bot.js',
    'entities/Player.js',
    'entities/Zombie.js',
    'entities/BotBrain.js',
    'entities/EntityManager.js',
    'entities/ExplosiveBarrel.js',
    'world/MapGenerator.js',
    'world/Physics.js',
    'world/Zone.js',
    'world/Environment.js',
    'world/AABBGrid.js',
    'world/DebugOverlay.js',
    'items/Weapon.js',
    'items/LootManager.js'
];

files.forEach(f => {
    const fullPath = path.join(process.cwd(), f);
    let content = fs.readFileSync(fullPath, 'utf8');
    const oldImport = "from './node_modules/three/build/three.module.js'";
    const newImport = "from '../node_modules/three/build/three.module.js'";
    if (content.includes(oldImport)) {
        content = content.replace(new RegExp(oldImport.replace('./', '\\.\\/'), 'g'), newImport);
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed:', f);
    }
});
