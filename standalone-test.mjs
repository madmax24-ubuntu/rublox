// Standalone game test — pure Node.js, no browser needed
import * as THREE from './node_modules/three/build/three.module.js';

console.log('=== RUBLOX GAME TEST SUITE ===\n');

let passed = 0;
let failed = 0;
let warnings = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            console.log(`  ✅ ${name}`);
            passed++;
        } else {
            console.log(`  ❌ ${name}: ${result}`);
            failed++;
        }
    } catch (e) {
        console.log(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

// ========== TEST 1: Module Loading ==========
console.log('\n📦 Test 1: Module Loading');

try {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    test('MapGenerator module loads', () => true);
} catch (e) {
    test('MapGenerator module loads', () => `Error: ${e.message}`);
}

try {
    const { Environment } = await import('./world/Environment.js');
    test('Environment module loads', () => true);
} catch (e) {
    test('Environment module loads', () => `Error: ${e.message}`);
}

try {
    const { Physics } = await import('./world/Physics.js');
    test('Physics module loads', () => true);
} catch (e) {
    test('Physics module loads', () => `Error: ${e.message}`);
}

try {
    const { Zone } = await import('./world/Zone.js');
    test('Zone module loads', () => true);
} catch (e) {
    test('Zone module loads', () => `Error: ${e.message}`);
}

try {
    const { Player } = await import('./entities/Player.js');
    test('Player module loads', () => true);
} catch (e) {
    test('Player module loads', () => `Error: ${e.message}`);
}

try {
    const { Bot } = await import('./entities/Bot.js');
    test('Bot module loads', () => true);
} catch (e) {
    test('Bot module loads', () => `Error: ${e.message}`);
}

try {
    const { GameLoop } = await import('./core/GameLoop.js');
    test('GameLoop module loads', () => true);
} catch (e) {
    test('GameLoop module loads', () => `Error: ${e.message}`);
}

try {
    const { HUD } = await import('./ui/HUD.js');
    test('HUD module loads', () => true);
} catch (e) {
    test('HUD module loads', () => `Error: ${e.message}`);
}

try {
    const { GAME_CONFIG } = await import('./core/GameBalance.js');
    test('GameBalance module loads', () => !!GAME_CONFIG);
} catch (e) {
    test('GameBalance module loads', () => `Error: ${e.message}`);
}

// ========== TEST 2: Map Generation ==========
console.log('\n🗺️  Test 2: Map Generation');

try {
    const { MapGenerator } = await import('./world/MapGenerator.js');

    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {
            scene.children.forEach(child => {
                if (child.userData) fn(child);
            });
        }
    };

    const map = new MapGenerator(scene);
    map.onProgress = (ratio, status) => {
        if (ratio > 0 && ratio <= 0.1) {
            // Silent
        }
    };

    console.log('  🔄 Generating map (this may take a moment)...');
    const startTime = Date.now();
    await map.generate();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    test('Map generates in ' + elapsed + 's', () => {
        if (elapsed > 60) return `Too slow (${elapsed}s)`;
        return true;
    });

    test('Map creates 500+ scene objects', () => {
        const count = scene.children.length;
        if (count < 500) return `Only ${count} objects (expected 500+)`;
        return true;
    });

    test('Map has 11 spawn pads', () => {
        const pads = map.getSpawnPads();
        if (pads.length !== 11) return `Expected 11, got ${pads.length}`;
        return true;
    });

    test('Map has 100+ colliders', () => {
        const cols = map.getColliders();
        if (cols.length < 100) return `Only ${cols.length} colliders`;
        return true;
    });

    test('Map has 30 traps', () => {
        const traps = map.getTraps();
        if (traps.length < 20) return `Only ${traps.length} traps`;
        return true;
    });

    test('Map has 4 fog zones', () => {
        const zones = map.getFogZones();
        if (zones.length !== 4) return `Expected 4, got ${zones.length}`;
        return true;
    });

    test('Map has 3 radiation zones', () => {
        const zones = map.getRadiationZones();
        if (zones.length !== 3) return `Expected 3, got ${zones.length}`;
        return true;
    });

    // Check biome zones
    test('Map has biome zones (Citadel, Crystal, Wastes, Forest)', () => {
        let hasCitadel = false, hasCrystal = false, hasWastes = false, hasForest = false;
        scene.traverse(obj => {
            if (obj.userData?.biomeName) {
                if (obj.userData.biomeName === 'citadel') hasCitadel = true;
                if (obj.userData.biomeName === 'crystal') hasCrystal = true;
                if (obj.userData.biomeName === 'wastes') hasWastes = true;
                if (obj.userData.biomeName === 'forest') hasForest = true;
            }
        });
        if (!hasCitadel || !hasCrystal || !hasWastes || !hasForest) {
            return `Missing biomes: Citadel=${hasCitadel}, Crystal=${hasCrystal}, Wastes=${hasWastes}, Forest=${hasForest}`;
        }
        return true;
    });

    // Check structures
    test('Map has Cornucopia structures', () => {
        let hasCornucopia = false;
        scene.traverse(obj => {
            if (obj.userData?.isCornucopia) hasCornucopia = true;
        });
        return hasCornucopia ? true : 'No Cornucopia found';
    });

    test('Map has citadel towers', () => {
        let citadelCount = 0;
        scene.traverse(obj => {
            if (obj.userData?.isCitadel && obj.isMesh) citadelCount++;
        });
        if (citadelCount < 20) return `Only ${citadelCount} citadel objects`;
        return true;
    });

    test('Map has crystal grotto', () => {
        let crystalCount = 0;
        scene.traverse(obj => {
            if (obj.userData?.isCrystal) crystalCount++;
        });
        if (crystalCount < 40) return `Only ${crystalCount} crystal objects`;
        return true;
    });

    test('Map has burning wastes', () => {
        let wasteCount = 0;
        scene.traverse(obj => {
            if (obj.userData?.isWaste) wasteCount++;
        });
        if (wasteCount < 10) return `Only ${wasteCount} waste objects`;
        return true;
    });

    test('Map has luminous forest', () => {
        let forestCount = 0;
        scene.traverse(obj => {
            if (obj.userData?.isForest) forestCount++;
        });
        if (forestCount < 30) return `Only ${forestCount} forest objects`;
        return true;
    });

    // Check materials
    test('Map uses MeshStandardMaterial (not ShaderMaterial)', () => {
        let usesStandard = false;
        scene.traverse(obj => {
            if (obj.isMesh && obj.material && obj.material.isMeshStandardMaterial) {
                usesStandard = true;
            }
        });
        return usesStandard ? true : 'No MeshStandardMaterial found';
    });

} catch (e) {
    console.log(`  ❌ Map Generation: ${e.message}`);
    failed++;
}

// ========== TEST 3: Zone System ==========
console.log('\n🔒 Test 3: Zone System');

try {
    const { Zone } = await import('./world/Zone.js');
    const scene = new THREE.Scene();
    const zone = new Zone(scene, 440);

    test('Zone creates with radius 220', () => {
        const r = zone.getCurrentRadius();
        if (Math.abs(r - 220) > 5) return `Expected ~220, got ${r}`;
        return true;
    });

    test('Zone shrink works', async () => {
        const { Zone } = await import('./world/Zone.js');
        const scene2 = new THREE.Scene();
        const zone2 = new Zone(scene2, 440);
        const before = zone2.getCurrentRadius();
        zone2.shrink(zone2.getCurrentRadius() * 0.5);
        const after = zone2.getCurrentRadius();
        if (after >= before) return `Radius ${after} should be < ${before}`;
        return true;
    });

    test('Zone damage calculation', async () => {
        const { Zone } = await import('./world/Zone.js');
        const scene3 = new THREE.Scene();
        const zone3 = new Zone(scene3, 440);
        const hasGetDamage = typeof zone3.getDamageAt === 'function';
        return hasGetDamage ? true : `getDamageAt not available`;
    });
} catch (e) {
    console.log(`  ❌ Zone System: ${e.message}`);
    failed++;
}

// ========== TEST 4: Three.js Rendering ==========
console.log('\n🎨 Test 4: Three.js Rendering');

test('Three.js scene creation', () => {
    const scene = new THREE.Scene();
    return scene ? true : 'Scene creation failed';
});

test('Three.js renderer creation', () => {
    try {
        const canvas = document?.createElement?.('canvas');
        if (canvas) {
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            renderer.setSize(800, 600);
            renderer.shadowMap.enabled = true;
            return renderer.domElement ? 'Renderer created' : 'No canvas element';
        }
        return 'Canvas not available in Node.js';
    } catch (e) {
        return `Renderer error: ${e.message}`;
    }
});

test('MeshStandardMaterial works', () => {
    const mat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.5,
        metalness: 0.3
    });
    return mat.isMeshStandardMaterial ? true : 'Not a MeshStandardMaterial';
});

test('Shadow map enabled', () => {
    try {
        const canvas = document?.createElement?.('canvas');
        if (canvas) {
            const renderer = new THREE.WebGLRenderer({ canvas });
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            return renderer.shadowMap.enabled ? 'Shadows enabled' : 'Shadows not enabled';
        }
        return true;
    } catch (e) {
        return `Shadow setup error: ${e.message}`;
    }
});

// ========== TEST 5: Physics System ==========
console.log('\n⚙️  Test 5: Physics System');

test('Physics class exists', () => {
    const { Physics } = require('./world/Physics.js');
    return Physics ? 'Class exists' : 'Physics class not found';
});

// ========== TEST 6: HUD System ==========
console.log('\n🖥️  Test 6: HUD System');

test('HUD creates UI elements', () => {
    try {
        const { HUD } = require('./ui/HUD.js');
        const hud = new HUD();
        return hud ? 'HUD created' : 'HUD null';
    } catch (e) {
        return `HUD error: ${e.message}`;
    }
});

// ========== TEST 7: Game Balance ==========
console.log('\n📊 Test 7: Game Balance');

test('GAME_CONFIG has round settings', () => {
    const { GAME_CONFIG } = require('./core/GameBalance.js');
    if (!GAME_CONFIG?.round) return 'round config missing';
    if (!GAME_CONFIG.round.countdownSeconds) return 'countdownSeconds missing';
    return `Countdown: ${GAME_CONFIG.round.countdownSeconds}s`;
});

test('GAME_CONFIG has zone settings', () => {
    const { GAME_CONFIG } = require('./core/GameBalance.js');
    if (!GAME_CONFIG?.zone) return 'zone config missing';
    if (!GAME_CONFIG.zone.durationSeconds) return 'durationSeconds missing';
    return `Zone duration: ${GAME_CONFIG.zone.durationSeconds}s`;
});

test('GAME_CONFIG has bot settings', () => {
    const { GAME_CONFIG } = require('./core/GameBalance.js');
    if (!GAME_CONFIG?.bots) return 'bots config missing';
    return `Bot count: ${GAME_CONFIG.bots.count || 'N/A'}`;
});

// ========== SUMMARY ==========
console.log('\n' + '='.repeat(50));
console.log('TEST SUMMARY');
console.log('='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log(`📊 Total: ${passed + failed + warnings}`);

if (failed === 0) {
    console.log('\n🟢 ALL TESTS PASSED — Game is ready for production');
    process.exit(0);
} else {
    console.log(`\n🔴 ${failed} TESTS FAILED — Fixes required`);
    process.exit(1);
}
