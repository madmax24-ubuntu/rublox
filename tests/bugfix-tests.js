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

// TEST 5: Chest count halved (fix #1)
test('Chests: desktop min count 110 (was 220, halved)', () => {
    const code = read('items/LootManager.js');
    const matches = code.match(/Math\.max\(this\.isMobile \? (\d+) : (\d+)/g);
    if (!matches) throw new Error('Cannot find chest count params');
    // Should have two occurrences (generateChests and generateChestsAsync)
    if (matches.length < 2) throw new Error('Expected 2 chest count occurrences');
    // Check that desktop value is 110 (halved from 220)
    const desktopMatch = code.match(/Math\.max\(this\.isMobile \? \d+ : (\d+)/);
    if (!desktopMatch) throw new Error('Cannot find desktop chest count');
    const desktopCount = parseInt(desktopMatch[1]);
    if (desktopCount !== 110) throw new Error(`Desktop chest count=${desktopCount}, expected 110`);
    const mobileMatch = code.match(/Math\.max\(this\.isMobile \? (\d+)/);
    if (!mobileMatch) throw new Error('Cannot find mobile chest count');
    const mobileCount = parseInt(mobileMatch[1]);
    if (mobileCount !== 80) throw new Error(`Mobile chest count=${mobileCount}, expected 80`);
});

// TEST 6: Bot weapon drops improved (fix #2)
test('Weapon drops: rifle+machinegun combined chance >= 30% (was 22%)', () => {
    const code = read('items/LootManager.js');
    // rifle starts at 0.74, MG starts at 0.88
    const rifleStartMatch = code.match(/\} else if \(rand < ([\d.]+)\).*?винтовки/);
    const mgStartMatch = code.match(/\} else if \(rand < ([\d.]+)\).*?пулемета/);
    if (!rifleStartMatch || !mgStartMatch) throw new Error('Cannot find rifle/MG drop chances');
    const rifleStart = parseFloat(rifleStartMatch[1]);
    const mgStart = parseFloat(mgStartMatch[1]);
    // pistol starts at 0.56, so rifle chance = rifleStart - 0.56
    const rifleChance = rifleStart - 0.56;
    const mgChance = mgStart - rifleStart;
    const combined = rifleChance + mgChance;
    if (combined < 0.30) throw new Error(`Combined rifle+MG chance=${combined.toFixed(2)}, need >= 0.30`);
});

test('Bot weapon switch cooldown reduced to 800ms (was 2000ms)', () => {
    const code = read('entities/BotBrain.js');
    const cooldownMatch = code.match(/bot\._weaponSwitchCooldown\s*=\s*performance\.now\(\)\s*\+\s*(\d+)/);
    if (!cooldownMatch) throw new Error('Cannot find weapon switch cooldown');
    const cooldown = parseInt(cooldownMatch[1]);
    if (cooldown !== 800) throw new Error(`Weapon switch cooldown=${cooldown}ms, expected 800ms`);
});

// TEST 7: Physics movement smoothed (fix #3)
test('Physics: bot bonusRadius reduced to 0.15 (was 0.35)', () => {
    const code = read('world/Physics.js');
    const bonusMatch = code.match(/type === 'Bot' \? ([\d.]+)/);
    if (!bonusMatch) throw new Error('Cannot find bot bonusRadius');
    const bonus = parseFloat(bonusMatch[1]);
    if (bonus !== 0.15) throw new Error(`Bot bonusRadius=${bonus}, expected 0.15`);
});

test('Physics: maxPushPerStep increased to 0.40 (was 0.24)', () => {
    const code = read('world/Physics.js');
    const pushMatch = code.match(/const maxPushPerStep\s*=\s*([\d.]+)/);
    if (!pushMatch) throw new Error('Cannot find maxPushPerStep');
    const push = parseFloat(pushMatch[1]);
    if (push < 0.35) throw new Error(`maxPushPerStep=${push}, expected >= 0.35`);
});

test('Physics: step size increased to 0.38 (was 0.28)', () => {
    const code = read('world/Physics.js');
    const stepMatch = code.match(/Math\.ceil\(totalMove\s*\/\s*([\d.]+)/);
    if (!stepMatch) throw new Error('Cannot find step size');
    const step = parseFloat(stepMatch[1]);
    if (step < 0.35) throw new Error(`Step size=${step}, expected >= 0.35`);
});

// TEST 8: Bot looting fix - rebuildChestIndex called on early return
test('LootManager: generateChestsAsync calls rebuildChestIndex before early return', () => {
    const code = read('items/LootManager.js');
    // Find the async version's early return
    const asyncSection = code.substring(code.indexOf('async generateChestsAsync'));
    const earlyReturnMatch = asyncSection.match(/if \(this\.chests\.length >= chestCount\) \{[\s\S]{0,100}return;/);
    if (!earlyReturnMatch) throw new Error('Cannot find early return in generateChestsAsync');
    const returnBlock = earlyReturnMatch[0];
    if (!returnBlock.includes('rebuildChestIndex')) {
        throw new Error('Early return in generateChestsAsync does not call rebuildChestIndex - bots cannot find chests!');
    }
});

// TEST 9: Bot countdown movement (fix #4) — bots frozen during countdown like player
test('Physics: no special countdown exception for bots — all frozen uniformly', () => {
    const code = read('world/Physics.js');
    // Should NOT have mapRef-based exception that lets bots move during countdown
    if (code.match(/isCountdown && \(type === 'Bot' \|\| type === 'Zombie'\).*!entity\.mapRef/)) {
        throw new Error('Found mapRef exception — bots should NOT move during countdown');
    }
});

test('main.js: bots frozen during countdown (isFrozen = true)', () => {
    const code = read('main.js');
    const countdownSection = code.substring(code.indexOf('_updateCountdown'));
    const frozenSection = countdownSection.substring(0, countdownSection.indexOf('_updateSpawnState'));
    // Should freeze bots during countdown
    if (!frozenSection.includes('this.bots.forEach(bot => { bot.isFrozen = true; })')) {
        throw new Error('Bots not frozen during countdown');
    }
    // Should unfreeze bots after countdown
    if (!frozenSection.includes('this.bots.forEach(bot => { bot.isFrozen = false; })')) {
        throw new Error('Bots not unfrozen after countdown');
    }
});

test('Physics: stair collision uses tight ON-surface threshold (0.05, not 0.5)', () => {
    const code = read('world/Physics.js');
    const walkableSection = code.substring(code.indexOf('if (box.walkable) {'));
    const onSurfaceCheck = walkableSection.match(/if \(bottom >= max\.y - ([\d.]+)\)/);
    if (!onSurfaceCheck) throw new Error('Cannot find on-surface check in walkable handling');
    const threshold = parseFloat(onSurfaceCheck[1]);
    if (threshold > 0.1) throw new Error(`On-surface threshold=${threshold} too large (causes bot trapping on stairs)`);
});

test('Physics: downward step handling present', () => {
    const code = read('world/Physics.js');
    const walkableSection = code.substring(code.indexOf('if (box.walkable) {'));
    if (!walkableSection.includes('Downward step')) {
        throw new Error('Missing downward step handling — bots fall under stairs');
    }
    if (!walkableSection.includes('stepHeight < -0.02')) {
        throw new Error('Missing downward step condition');
    }
});

// TEST 11: Biome entrance stairs walkable from ground (fix #1)
test('Physics: removed `bottom >= min.y - 0.2` constraint for stair climbing', () => {
    const code = read('world/Physics.js');
    const walkableSection = code.substring(code.indexOf('if (box.walkable) {'));
    if (walkableSection.includes('bottom >= min.y - 0.2')) {
        throw new Error('Still has `bottom >= min.y - 0.2` constraint — entities cannot climb stairs from ground');
    }
});

// TEST 12: Tower floor collider not filtered in surface height (fix #2)
test('Physics: tower structures not filtered by height delta in _getSurfaceHeight', () => {
    const code = read('world/Physics.js');
    const surfaceSection = code.substring(code.indexOf('_getSurfaceHeight'));
    // Should have isTower check before height delta filter
    if (surfaceSection.includes('isTowerStructure') || surfaceSection.includes('isTowerStair')) {
        // Good — tower structures are handled specially
        if (!surfaceSection.includes('!isTower')) {
            throw new Error('Tower check exists but height delta filter may still apply to towers');
        }
    } else {
        throw new Error('No tower structure check — tower floor may be filtered out by height delta');
    }
});

// TEST 10: Bot pre-loot phase starts during spawn (fix #5)
test('BotBrain: noCombatUntil set during spawnBots() for pre-fight looting', () => {
    const code = read('main.js');
    const spawnBotsSection = code.substring(code.indexOf('spawnBots() {'));
    if (!spawnBotsSection.includes('noCombatUntil')) {
        throw new Error('spawnBots() does not set noCombatUntil — bots cannot enter pre-loot phase during countdown');
    }
    if (!spawnBotsSection.includes('botLootPhaseDuration')) {
        throw new Error('spawnBots() missing botLootPhaseDuration reference');
    }
});

// SUMMARY
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
