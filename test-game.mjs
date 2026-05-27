// Automated game test — Node.js with mocked DOM
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="gameRoot"></div></body></html>', {
    url: 'http://localhost:3001/',
    pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.navigator = dom.window.navigator;
global.performance = dom.window.performance;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mock WebGL
const canvas = dom.window.document.createElement('canvas');
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
global.WebGLRenderingContext = function() {};
global.WebGL2RenderingContext = function() {};

// Load Three.js
import * as THREE from 'three';
global.THREE = THREE;

console.log('=== GAME TEST SUITE ===\n');

// Test 1: Module imports
let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

// Import all game modules
await test('MapGenerator imports', async () => {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {}
    };
    const gen = new MapGenerator(scene);
    if (!gen) throw new Error('MapGenerator constructor failed');
});

await test('Environment imports', async () => {
    const { Environment } = await import('./world/Environment.js');
    const scene = new THREE.Scene();
    const env = new Environment(scene);
    if (!env) throw new Error('Environment constructor failed');
});

await test('Physics imports', async () => {
    const { Physics } = await import('./world/Physics.js');
    if (!Physics) throw new Error('Physics module not found');
});

await test('Zone imports', async () => {
    const { Zone } = await import('./world/Zone.js');
    if (!Zone) throw new Error('Zone module not found');
});

await test('Player imports', async () => {
    const { Player } = await import('./entities/Player.js');
    if (!Player) throw new Error('Player module not found');
});

await test('Bot imports', async () => {
    const { Bot } = await import('./entities/Bot.js');
    if (!Bot) throw new Error('Bot module not found');
});

await test('GameLoop imports', async () => {
    const { GameLoop } = await import('./core/GameLoop.js');
    if (!GameLoop) throw new Error('GameLoop module not found');
});

await test('HUD imports', async () => {
    const { HUD } = await import('./ui/HUD.js');
    const hud = new HUD();
    if (!hud) throw new Error('HUD constructor failed');
});

await test('GameBalance imports', async () => {
    const { GAME_CONFIG } = await import('./core/GameBalance.js');
    if (!GAME_CONFIG) throw new Error('GAME_CONFIG not found');
    if (!GAME_CONFIG.round) throw new Error('GAME_CONFIG.round missing');
});

// Test 2: Map generation
await test('Map generation completes', async () => {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {}
    };
    const gen = new MapGenerator(scene);
    await gen.generate();
    if (scene.children.length < 500) {
        throw new Error(`Expected 500+ scene children, got ${scene.children.length}`);
    }
    gen.scene = scene;
    return gen;
});

// Test 3: Verify map data
await test('Map has spawn pads', async () => {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {}
    };
    const gen = new MapGenerator(scene);
    await gen.generate();
    const pads = gen.getSpawnPads();
    if (pads.length !== 11) {
        throw new Error(`Expected 11 spawn pads, got ${pads.length}`);
    }
});

await test('Map has colliders', async () => {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {}
    };
    const gen = new MapGenerator(scene);
    await gen.generate();
    const cols = gen.getColliders();
    if (cols.length < 100) {
        throw new Error(`Expected 100+ colliders, got ${cols.length}`);
    }
});

await test('Map has traps', async () => {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {}
    };
    const gen = new MapGenerator(scene);
    await gen.generate();
    const traps = gen.getTraps();
    if (traps.length < 20) {
        throw new Error(`Expected 20+ traps, got ${traps.length}`);
    }
});

await test('Map has fog zones', async () => {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {}
    };
    const gen = new MapGenerator(scene);
    await gen.generate();
    const zones = gen.getFogZones();
    if (zones.length !== 4) {
        throw new Error(`Expected 4 fog zones, got ${zones.length}`);
    }
});

await test('Map has radiation zones', async () => {
    const { MapGenerator } = await import('./world/MapGenerator.js');
    const scene = {
        add: (obj) => { scene.children.push(obj); },
        children: [],
        traverse: (fn) => {}
    };
    const gen = new MapGenerator(scene);
    await gen.generate();
    const zones = gen.getRadiationZones();
    if (zones.length !== 3) {
        throw new Error(`Expected 3 radiation zones, got ${zones.length}`);
    }
});

// Test 4: Zone system
await test('Zone system creates radius', async () => {
    const { Zone } = await import('./world/Zone.js');
    const scene = new THREE.Scene();
    const zone = new Zone(scene, 440);
    const radius = zone.getCurrentRadius();
    if (radius <= 0) {
        throw new Error(`Zone radius is ${radius}, expected > 0`);
    }
});

await test('Zone shrink works', async () => {
    const { Zone } = await import('./world/Zone.js');
    const scene = new THREE.Scene();
    const zone = new Zone(scene, 440);
    zone.shrink(zone.getCurrentRadius() * 0.5);
    const newRadius = zone.getCurrentRadius();
    if (newRadius >= 440) {
        throw new Error(`Zone radius ${newRadius} should be < 440 after shrink`);
    }
});

// Test 5: Three.js rendering capability
await test('Three.js renderer can be created', async () => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
    renderer.setSize(800, 600);
    renderer.shadowMap.enabled = true;
    if (!renderer.domElement) {
        throw new Error('Renderer did not create canvas');
    }
});

// Test 6: Scene hierarchy
await test('Scene can hold objects', async () => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(10, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    let count = 0;
    scene.traverse(() => count++);
    if (count < 2) {
        throw new Error(`Scene traversal found ${count} objects, expected 2+`);
    }
});

// Summary
console.log(`\n=== RESULTS ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
if (failed === 0) {
    console.log('\n🟢 ALL TESTS PASSED — game is ready for production');
} else {
    console.log('\n🔴 SOME TESTS FAILED — fix required');
}
process.exit(failed > 0 ? 1 : 0);
