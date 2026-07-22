// Auto tests for bug fixes
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`FAIL: ${name}: ${e.message}`);
        failed++;
    }
}

// TEST 1: Forest path no flicker
test('Forest path: elevated above terrain (y >= 0.25)', () => {
    const code = read('world/MapGenerator.js');
    const match = code.match(/seg\.position\.set\(x1 \+ dx \* t,\s*([\d.]+)/);
    if (!match) throw new Error('Cannot find seg.position.set');
    const y = parseFloat(match[1]);
    if (y < 0.25) throw new Error(`Path y=${y} too close to terrain`);
});

test('Forest path: thick enough (thickness >= 0.4)', () => {
    const code = read('world/MapGenerator.js');
    const match = code.match(/getGeoBox\(8\.5,\s*([\d.]+)/);
    if (!match) throw new Error('Cannot find path geometry');
    const thickness = parseFloat(match[1]);
    if (thickness < 0.4) throw new Error(`Path thickness=${thickness} too thin`);
});

// TEST 2: PolygonOffset for texture visibility
test('PolygonOffset: DoubleSide materials have sufficient offset', () => {
    const code = read('world/MeshPool.js');
    if (!code.includes('polygonOffset')) throw new Error('Cannot find polygonOffset');
    // Проверяем что есть wall-специфичные значения
    if (!code.includes('wall ?') || !code.includes('4') || !code.includes('2')) {
        throw new Error('Wall polygonOffset not configured');
    }
});

// TEST 2b: MapGenerator biome boundaries don't override polygonOffset excessively
test('MapGenerator: biome boundaries use pool polygonOffset (no flicker)', () => {
    const code = read('world/MapGenerator.js');
    const boundarySection = code.substring(
        code.indexOf('_placeBiomeBoundaries() {'),
        code.indexOf('_placeBiomeBoundaries() {') + 2000
    );
    // Should NOT manually override polygonOffset after getMatStd call
    if (boundarySection.includes('polygonOffsetFactor = 12')) {
        throw new Error('Biome boundaries override polygonOffset to 12, causes flicker');
    }
});

// TEST 2c: Player excluded from stuck-teleport
test('Physics: Player excluded from stuck-detection teleport', () => {
    const code = read('world/Physics.js');
    if (!code.includes('isPlayer') || !code.includes("entity.type === 'Player'")) {
        throw new Error('Player stuck-exclusion not found');
    }
});

// TEST 2d: Player has type property
test('Player: has type property for identification', () => {
    const code = read('entities/Player.js');
    if (!code.includes("this.type = 'Player'")) {
        throw new Error('Player missing type property');
    }
});

// TEST 3: No objects inside buildings
test('LootManager: blocks chests inside structures (margin >= 2)', () => {
    const code = read('items/LootManager.js');
    const matches = code.match(/getStructureAtPoint\?\.\(tile\.x,\s*tile\.z,\s*(\d+)/g);
    if (!matches || matches.length === 0) throw new Error('No getStructureAtPoint checks');
    const margins = matches.map(m => parseInt(m.match(/\d+/)[0]));
    const minMargin = Math.min(...margins);
    if (minMargin < 2) throw new Error(`Structure margin=${minMargin} too small`);
});

test('LootManager: random fallback blocks structure spawning', () => {
    const code = read('items/LootManager.js');
    const randomFallbackMatch = code.match(/for \(let i = this\.chests\.length.*?console\.log\(`\[LootManager\] random fallback/s);
    if (!randomFallbackMatch) throw new Error('Cannot find random fallback');
    const fallbackCode = randomFallbackMatch[0];
    if (!fallbackCode.includes('getStructureAtPoint')) {
        throw new Error('Random fallback missing getStructureAtPoint check');
    }
});

// TEST 4: Door access
test('LogCabin: door width >= 2.3m', () => {
    const code = read('world/MapGenerator.js');
    const cabinMatch = code.match(/_addLogCabin\([^)]*\)\s*\{[\s\S]{0,2000}?const doorW\s*=\s*([\d.]+)/);
    if (!cabinMatch) throw new Error('Cannot find _addLogCabin doorW');
    const doorW = parseFloat(cabinMatch[1]);
    if (doorW < 2.3) throw new Error(`LogCabin doorW=${doorW} too narrow`);
});

test('TwoStoryCabin: door width >= 2.3m', () => {
    const code = read('world/MapGenerator.js');
    const cabinMatch = code.match(/_addTwoStoryCabin\([^)]*\)\s*\{[\s\S]{0,2000}?const doorW\s*=\s*([\d.]+)/);
    if (!cabinMatch) throw new Error('Cannot find _addTwoStoryCabin doorW');
    const doorW = parseFloat(cabinMatch[1]);
    if (doorW < 2.3) throw new Error(`TwoStoryCabin doorW=${doorW} too narrow`);
});

test('LogCabin: has segmented front wall colliders', () => {
    const code = read('world/MapGenerator.js');
    const firstMatch = code.indexOf('_addLogCabin(');
    const logCabinSection = code.substring(firstMatch, firstMatch + 5000);
    
    if (!logCabinSection.includes('frontSegmentW')) {
        throw new Error('LogCabin missing frontSegmentW collider calculation');
    }
    if (!logCabinSection.includes('doorW + frontSegmentW')) {
        throw new Error('LogCabin missing segmented door gap colliders');
    }
});

test('Bushes: spawned after buildings with structure check', () => {
    const code = read('world/MapGenerator.js');
    const funcStart = code.indexOf('_generateForestQuadrant() {');
    const forestSection = code.substring(funcStart, funcStart + 12000);
    
    const buildingIdx = forestSection.indexOf('_addTwoStoryCabin');
    const bushIdx = forestSection.indexOf('_addForestBush');
    if (bushIdx < buildingIdx) {
        throw new Error('Bushes spawned before buildings');
    }
    
    if (!forestSection.includes('getStructureAtPoint')) {
        throw new Error('Bush spawn missing structure check');
    }
});

test('Bot LOD: has emissive to prevent black appearance', () => {
    const code = read('main.js');
    const lodSection = code.substring(code.indexOf('setupBotLodBatch'), code.indexOf('setupBotLodBatch') + 1000);
    
    if (!lodSection.includes('emissive')) {
        throw new Error('Bot LOD batch missing emissive');
    }
});

test('Zombie: emissiveIntensity sufficient for visibility', () => {
    const code = read('entities/Zombie.js');
    const bodyMatMatch = code.match(/bodyMat = new THREE\.MeshStandardMaterial\({[^}]*emissiveIntensity:\s*([\d.]+)/);
    if (!bodyMatMatch) throw new Error('Cannot find bodyMat emissiveIntensity');
    const intensity = parseFloat(bodyMatMatch[1]);
    if (intensity < 0.15) throw new Error(`Zombie body emissiveIntensity=${intensity} too low`);
});

// SUMMARY
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
