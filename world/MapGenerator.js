import * as THREE from "three";
import { MapGenerator as TileMapGenerator } from "./MapGeneratorNode.js";

// ============ NOISE UTILITY ============
class SimplexNoise {
    constructor(seed = Math.random()) {
        this.grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ];
        this.p = [];
        for (let i = 0; i < 256; i++) this.p[i] = i;
        // Shuffle with seed
        let s = (seed * 2147483647) | 0;
        for (let i = 255; i > 0; i--) {
            s = ((s * 16807) | 0);
            if (s < 0) s += 2147483647;
            const j = s % (i + 1);
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        for (let i = 0; i < 256; i++) this.p[i] = this.p[i] & 255;
        // Duplicate to avoid out-of-bounds
        for (let i = 256; i < 512; i++) this.p[i] = this.p[i - 256];
    }

    noise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const G2 = (3 - Math.sqrt(3)) / 6;
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = (i + 256) & 255;
        const jj = (j + 256) & 255;
        const pi = (v) => ((v % 12) + 12) % 12;
        const gi0 = pi(this.p[ii + this.p[jj]]);
        const gi1 = pi(this.p[ii + i1 + this.p[jj + j1]]);
        const gi2 = pi(this.p[ii + 1 + this.p[jj + 1]]);
        const dot = (g, x, y) => g[0] * x + g[1] * y;
        let n0, n1, n2;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot(this.grad3[gi0], x0, y0));
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot(this.grad3[gi1], x1, y1));
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot(this.grad3[gi2], x2, y2));
        return 70 * (n0 + n1 + n2);
    }

    fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
        let val = 0, amp = 1, freq = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            val += amp * this.noise2D(x * freq, y * freq);
            max += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return val / max;
    }
}

// ============ PROCEDURAL TEXTURE GENERATORS ============
function createBiomeTexture(drawFn) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 256;
    canvas.width = size;
    canvas.height = size;

    drawFn(canvas, ctx, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(32, 32);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function createForestTexture(canvas, seed) {
    const rng = seededRandom(seed || 42);
    const ctx = canvas.getContext('2d');
    const size = 256;

    // Base dark green
    ctx.fillStyle = '#2d5a1e';
    ctx.fillRect(0, 0, size, size);

    // Noise layer
    for (let i = 0; i < 3000; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = rng() * 3 + 1;
        const g = rng() * 60 + 30;
        const b = rng() * 20 + 10;
        ctx.fillStyle = `rgb(${g},${g + 40},${b})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Dirt patches
    for (let i = 0; i < 20; i++) {
        const px = rng() * size;
        const py = rng() * size;
        const pr = rng() * 12 + 4;
        ctx.fillStyle = `rgba(${60 + rng() * 30},${40 + rng() * 20},${20 + rng() * 10},0.3)`;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
    }

    // Small stones
    for (let i = 0; i < 200; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `rgba(${80 + rng() * 40},${80 + rng() * 40},${70 + rng() * 40},0.4)`;
        ctx.fillRect(x, y, 2, 1);
    }
}

function createStoneTexture(canvas, seed) {
    const rng = seededRandom(seed || 73);
    const ctx = canvas.getContext('2d');
    const size = 256;

    // Base grey
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(0, 0, size, size);

    // Stone variation
    for (let i = 0; i < 2000; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = rng() * 3 + 1;
        const v = rng() * 40 + 90;
        ctx.fillStyle = `rgb(${v},${v},${v + 5})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Cracks
    for (let i = 0; i < 40; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.strokeStyle = `rgba(40,40,40,${rng() * 0.3 + 0.1})`;
        ctx.lineWidth = rng() + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 20, y + (rng() - 0.5) * 20);
        ctx.stroke();
    }

    // Pebbles
    for (let i = 0; i < 300; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const v = rng() * 30 + 100;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.arc(x, y, rng() * 2 + 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createMilitaryTexture(canvas, seed) {
    const rng = seededRandom(seed || 99);
    const ctx = canvas.getContext('2d');
    const size = 256;

    // Base sand
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(0, 0, size, size);

    // Sand grains
    for (let i = 0; i < 4000; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const v = rng() * 30 + 110;
        ctx.fillStyle = `rgb(${v + 20},${v + 15},${v - 10})`;
        ctx.fillRect(x, y, rng() * 2 + 0.5, rng() * 2 + 0.5);
    }

    // Tire tracks / footprints
    for (let i = 0; i < 8; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.strokeStyle = `rgba(60,50,30,${rng() * 0.15 + 0.05})`;
        ctx.lineWidth = rng() * 3 + 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 60);
        ctx.stroke();
    }

    // Dust patches
    for (let i = 0; i < 30; i++) {
        const px = rng() * size;
        const py = rng() * size;
        ctx.fillStyle = `rgba(${160 + rng() * 40},${140 + rng() * 30},${100 + rng() * 30},0.2)`;
        ctx.beginPath();
        ctx.arc(px, py, rng() * 8 + 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createSnowTexture(canvas, seed) {
    const rng = seededRandom(seed || 127);
    const ctx = canvas.getContext('2d');
    const size = 256;

    // Base white-blue
    ctx.fillStyle = '#d8e8f0';
    ctx.fillRect(0, 0, size, size);

    // Snow crystals
    for (let i = 0; i < 2500; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = rng() * 2 + 0.5;
        const v = rng() * 20 + 210;
        ctx.fillStyle = `rgba(${v},${v + 5},${v + 15},${rng() * 0.5 + 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Ice patches
    for (let i = 0; i < 15; i++) {
        const px = rng() * size;
        const py = rng() * size;
        ctx.fillStyle = `rgba(180,200,220,${rng() * 0.2 + 0.05})`;
        ctx.beginPath();
        ctx.arc(px, py, rng() * 10 + 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Subtle cracks
    for (let i = 0; i < 20; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.strokeStyle = `rgba(150,160,170,${rng() * 0.2})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 15, y + (rng() - 0.5) * 15);
        ctx.stroke();
    }
}

// ============ COLOR CONSTANTS ============
const COLOR = {
    // Arena ground
    arenaGround: 0x3a5a2a,
    arenaPath: 0x8b7355,
    // Cornucopia
    metalDark: 0x3a3a3a,
    metalLight: 0x6a6a6a,
    metalGold: 0xc8a830,
    metalSilver: 0x9a9a9a,
    // Cornucopia ramp
    rampMetal: 0x4a4a4a,
    // Chest
    chestWood: 0x6b4226,
    chestGold: 0xdaa520,
    chestLock: 0xffd700,
    // Forcefield
    forcefield: 0x4488ff,
    // Biome: Ruined Citadel (NW) - stone ruins
    ruinStone: 0x8a8580,
    ruinDarkStone: 0x6a6560,
    ruinFloor: 0x7a7570,
    ruinMoss: 0x4a6a3a,
    // Biome: Crystal Grotto (NE) - crystal cavern
    crystalBlue: 0x4488cc,
    crystalPurple: 0x8844aa,
    crystalFloor: 0x2a2a3a,
    crystalReflect: 0x6688aa,
    crystalGlow: 0x88ccff,
    // Biome: Burning Wastes (SW) - volcanic
    lava: 0xff4400,
    lavaGlow: 0xff6600,
    obsidian: 0x1a1a2a,
    wasteGround: 0x2a1a0a,
    scorchedRock: 0x2a2a2a,
    smoke: 0x1a1a1a,
    // Biome: Luminous Forest (SE) - glowing forest
    luminousBark: 0x2a1a0a,
    luminousLeaf: 0x22aa44,
    luminousGlow: 0x44ff88,
    luminousMushroom: 0x8844ff,
    luminousFloor: 0x1a2a1a,
    luminousPond: 0x226644,
    // Misc
    bridgeWood: 0x5a4a3a,
    fenceWood: 0x4a3a2a,
    fire: 0xff6600,
    water: 0x1e78b4,
    fog: 0x888888,
    chest: 0xdaa520,
    gold: 0xffd700,
    stone: 0x8c8c8c,
    brick: 0xa04020,
    concrete: 0x8c8c8c,
    road: 0x7a7a7a,
};

// ============ MAP GENERATOR ============
export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.tileSize = 4;
        this.mapSize = 512;
        this.halfSize = 256;
        this.arenaRadius = 220;
        this.colliders = [];
        this.floorTiles = [];
        this.spawnPads = [];
        this.chestSpots = [];
        this.houseSpots = [];
        this.playerSpawn = { x: 0, z: 0 };
        this.storyPOIs = [];
        this.propMeshes = [];
        this.leafMeshes = [];
        this.smallPropMeshes = [];
        this.heightMap = null;
        this.climbables = [];
        this.biomeColors = {};
        this.animatedObjects = [];
        this.waterMeshes = [];
        this.fireMeshes = [];
        this.hazards = [];
        this.noise = new SimplexNoise(42);
        this.ready = new Promise(resolve => { this._resolveReady = resolve; });
    }

   async startGeneration() {
        await this.generate();
    }

    async generate() {
        this.generateHeightMap();

        // === 1. Circular arena floor ===
        await this.buildArenaFloor();

        // === 2. Forcefield boundary wall ===
        await this.buildForcefield();
        await this.yieldFrame();

        // === 3. Cornucopia (center structure) ===
        await this.buildCornucopia();
        await this.yieldFrame();

        // === 4. Biome paths from Cornucopia ===
        await this.buildBiomePaths();
        await this.yieldFrame();

        // === 5. NW: Ruined Citadel ===
        await this.buildRuinedCitadel();
        await this.yieldFrame();

        // === 6. NE: Crystal Grotto ===
        await this.buildCrystalGrotto();
        await this.yieldFrame();

        // === 7. SW: Burning Wastes ===
        await this.buildBurningWastes();
        await this.yieldFrame();

        // === 8. SE: Luminous Forest ===
        await this.buildLuminousForest();
        await this.yieldFrame();

        // === 9. Bridges between zones ===
        this.buildBridges();
        await this.yieldFrame();

        // === 10. Hazard zones ===
        this.buildHazardZones();

        // === 11. Props & details ===
        this.buildArenaProps();
        await this.yieldFrame();

        // === 12. Biome subtle boundaries ===
        this.buildBiomeBoundaries();

        // === 13. Animations ===
        this.setupAnimations();

        // Disable frustum culling
        this.scene.traverse(obj => {
            if (obj.isMesh || obj.isGroup || obj.isInstancedMesh) {
                obj.userData.mapGenerated = true;
                obj.frustumCulled = false;
            }
        });

        // Arena edge walls
        this.buildMapBoundaries();

        this._resolveReady();
    }

    yieldFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }
    // ========== GETTERS ==========
    getFloorTiles() {
        return this.floorTiles;
    }

    getSpawnPads() {
        return this.spawnPads;
    }

    getHouseSpots() {
        return this.houseSpots;
    }

    getSpawnWorld() {
        return { x: 0, z: 0 };
    }

    getChestSpots() {
        return this.chestSpots;
    }

    getColliders() {
        return this.colliders;
    }

    getStoryPOIs() {
        return this.storyPOIs;
    }

    getPropMeshes() {
        return this.propMeshes;
    }

    getLeafMeshes() {
        return this.leafMeshes;
    }

    getSmallPropMeshes() {
        return this.smallPropMeshes;
    }

    getClimbables() {
        return this.climbables;
    }

    getTraps() {
        return [];
    }

    getFogZones() {
        return [];
    }

    getSlowZones() {
        return [];
    }

    getRadiationZones() {
        return [];
    }

    getLavaPatches() {
        return [];
    }

    getExplosiveBarrelSpots() {
        return [];
    }

    getVerticalCoverSpots() {
        return [];
    }

    getOneWayGates() {
        return [];
    }

    getWaterPatches() {
        return [];
    }

    getZoneMix(x, z) {
        return 0;
    }

    getBiomeSectors() {
        return [];
    }

    getSurfaceTheme() {
        return 'mixed';
    }

    generateHeightMap() {
        const size = 512;
        const res = 128; // Resolution of the heightmap
        const step = size / res;
        this.heightMap = Array.from({ length: res + 1 }, () => new Float32Array(res + 1));

        const amplitude = 15;
        const scale = 0.01;

        for (let i = 0; i <= res; i++) {
            for (let j = 0; j <= res; j++) {
                const x = (i - res / 2) * step;
                const z = (j - res / 2) * step;

                // Use fbm for more natural terrain
                const h = this.noise.fbm(x * scale, z * scale, 4, 2.0, 0.5);
                this.heightMap[i][j] = h * amplitude;
            }
        }
    }

    getHeightAt(x, z) {
        if (!this.heightMap) return 0;

        const size = 512;
        const res = this.heightMap.length - 1;
        const step = size / res;

        // Normalize coordinates to [0, res]
        let i = (x + size / 2) / step;
        let j = (z + size / 2) / step;

        i = Math.max(0, Math.min(res, i));
        j = Math.max(0, Math.min(res, j));

        const i0 = Math.floor(i);
        const j0 = Math.floor(j);
        const i1 = Math.min(res, i0 + 1);
        const j1 = Math.min(res, j0 + 1);

        const dx = i - i0;
        const dz = j - j0;

        // Bilinear interpolation
        const h00 = this.heightMap[i0][j0];
        const h10 = this.heightMap[i1][j0];
        const h01 = this.heightMap[i0][j1];
        const h11 = this.heightMap[i1][j1];

        return (1 - dx) * (1 - dz) * h00 +
               dx * (1 - dz) * h10 +
               (1 - dx) * dz * h01 +
               dx * dz * h11;
    }
}
