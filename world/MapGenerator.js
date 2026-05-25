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

        await this.buildArenaFloor();

        await this.buildForcefield();
        await this.yieldFrame();

        await this.buildCornucopia();
        await this.yieldFrame();

        await this.buildBiomePaths();
        await this.yieldFrame();

        await this.buildRuinedCitadel();
        await this.yieldFrame();

        await this.buildCrystalGrotto();
        await this.yieldFrame();

        await this.buildBurningWastes();
        await this.yieldFrame();

        await this.buildLuminousForest();
        await this.yieldFrame();

        this.buildBridges();
        await this.yieldFrame();

        this.buildHazardZones();

        this.buildArenaProps();
        await this.yieldFrame();

        this.buildBiomeBoundaries();

        this.setupAnimations();

        this.scene.traverse(obj => {
            if (obj.isMesh || obj.isGroup || obj.isInstancedMesh) {
                obj.userData.mapGenerated = true;
                obj.frustumCulled = false;
            }
        });

        this.buildMapBoundaries();

        this._resolveReady();
    }

    yieldFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    async buildArenaFloor() {
        const groundMat = new THREE.MeshStandardMaterial({
            color: COLOR.arenaGround, roughness: 0.95, metalness: 0.05
        });
        const floorGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 0.5, 64);
        const floor = new THREE.Mesh(floorGeo, groundMat);
        floor.position.y = -0.25;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, -0.5, 0), size: new THREE.Vector3(this.arenaRadius * 2, 1, this.arenaRadius * 2) });
        const terrainMat = new THREE.MeshStandardMaterial({ color: 0x2d4a1d, roughness: 1.0 });
        const noise = this.noise;
        for (let i = 0; i < 80; i++) {
            if (i % 30 === 0) await this.yieldFrame();
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * (this.arenaRadius - 50);
            const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
            const h = noise.fbm(x * 0.008, z * 0.008, 3) * 4;
            if (Math.abs(h) < 0.5) continue;
            const size = 5 + Math.abs(h) * 3;
            const hillH = Math.abs(h) * 1.5;
            const hill = new THREE.Mesh(new THREE.BoxGeometry(size, hillH, size * 0.8), terrainMat);
            hill.position.set(x, hillH * 0.3, z); hill.rotation.y = Math.random() * Math.PI;
            hill.receiveShadow = true; hill.castShadow = h > 0;
            this.scene.add(hill);
        }
        await this.yieldFrame();
    }

    async buildForcefield() {
        const ffMat = new THREE.MeshStandardMaterial({
            color: COLOR.forcefield, emissive: COLOR.forcefield, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide
        });
        const ffGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 12, 64, 1, true);
        const forcefield = new THREE.Mesh(ffGeo, ffMat);
        forcefield.position.y = 6;
        this.scene.add(forcefield);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x88bbff, emissive: 0x4488ff, emissiveIntensity: 2, transparent: true, opacity: 0.8 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(this.arenaRadius + 0.5, 0.3, 8, 64), ringMat);
        ring.position.y = 0.3; ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
        const topRing = ring.clone(); topRing.position.y = 12;
        this.scene.add(topRing);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x6699ff, transparent: true, opacity: 0.4 });
        for (let i = 0; i < 32; i++) {
            const a = (i / 32) * Math.PI * 2;
            const pts = [
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 0, Math.sin(a) * this.arenaRadius),
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 12, Math.sin(a) * this.arenaRadius)
            ];
            this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        }
        this.animatedObjects.push({ type: 'forcefield', mesh: forcefield, material: ffMat, baseOpacity: 0.3, baseEmissive: 0.5 });
        await this.yieldFrame();
    }

    async buildCornucopia() {
        const baseMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.6, metalness: 0.8 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(18, 20, 3, 8), baseMat);
        base.position.y = 1.5; base.castShadow = true; base.receiveShadow = true;
        this.scene.add(base);
        const bodyMat = new THREE.MeshStandardMaterial({ color: COLOR.metalLight, roughness: 0.4, metalness: 0.9 });
        const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), bodyMat);
        hull.position.set(0, 9, 0); hull.rotation.y = Math.PI / 4; hull.scale.set(1, 1, 0.6);
        hull.castShadow = true; hull.receiveShadow = true;
        this.scene.add(hull);
        const hornMat = new THREE.MeshStandardMaterial({ color: COLOR.metalGold, roughness: 0.3, metalness: 0.95 });
        const hornLeftGroup = new THREE.Group();
        for (let i = 0; i < 8; i++) {
            const t = i / 8, radius = 3 * (1 - t * 0.7);
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1.2, 8), hornMat);
            const angle = t * Math.PI * 0.6, h = 6 + t * 12, xOff = -t * 8;
            seg.position.set(xOff, h, 0); seg.rotation.z = angle * 0.5; seg.castShadow = true;
            hornLeftGroup.add(seg);
        }
        this.scene.add(hornLeftGroup);
        const hornRightGroup = hornLeftGroup.clone();
        hornRightGroup.children.forEach(s => { s.position.x = -s.position.x; s.rotation.z = -s.rotation.z; });
        this.scene.add(hornRightGroup);
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 8, 8), baseMat);
        spire.position.set(0, 14, -5); spire.castShadow = true;
        this.scene.add(spire);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
        dome.position.set(0, 18, -5); dome.castShadow = true;
        this.scene.add(dome);
        const chestMat = new THREE.MeshStandardMaterial({ color: COLOR.chestWood, roughness: 0.7 });
        const chestTrimMat = new THREE.MeshStandardMaterial({ color: COLOR.chestGold, roughness: 0.3, metalness: 0.8 });
        const chestBody = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2.5), chestMat);
        chestBody.position.set(0, 5.5, 0); chestBody.castShadow = true;
        this.scene.add(chestBody);
        const chestLid = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), chestMat);
        chestLid.position.set(0, 6.5, 0); chestLid.scale.set(1, 0.4, 0.83); chestLid.castShadow = true;
        this.scene.add(chestLid);
        const bandGeo = new THREE.BoxGeometry(3.1, 0.2, 2.6);
        for (let by of [5.5, 6.5]) { const b = new THREE.Mesh(bandGeo, chestTrimMat); b.position.set(0, by, 0); this.scene.add(b); }
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), chestTrimMat);
        lock.position.set(0, 5.5, 1.3); this.scene.add(lock);
        const obsPlatform = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.3, 8), baseMat);
        obsPlatform.position.set(0, 15.2, 0); obsPlatform.receiveShadow = true;
        this.scene.add(obsPlatform);
        const railMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.5, metalness: 0.9 });
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6), railMat);
            post.position.set(Math.cos(a) * 4.8, 16, Math.sin(a) * 4.8); post.castShadow = true;
            this.scene.add(post);
        }
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 10), bodyMat);
        ramp.position.set(0, 4.5, 5); ramp.rotation.x = 0.2;
        ramp.castShadow = true; ramp.receiveShadow = true;
        this.scene.add(ramp);
        const crateMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.7, metalness: 0.6 });
        for (const pos of [{ x: -6, z: 8 }, { x: -3, z: 10 }, { x: 0, z: 11 }, { x: 3, z: 10 }, { x: 6, z: 8 },
            { x: -9, z: 4 }, { x: -6, z: 5 }, { x: 0, z: 6 }, { x: 6, z: 5 }, { x: 9, z: 4 },
            { x: -12, z: -2 }, { x: -8, z: 0 }, { x: 0, z: 1 }, { x: 8, z: 0 }, { x: 12, z: -2 },
            { x: -10, z: -6 }, { x: -5, z: -8 }, { x: 0, z: -9 }, { x: 5, z: -8 }, { x: 10, z: -6 }]) {
            const crate = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 2.5), crateMat);
            crate.position.set(pos.x, 1.5, pos.z); crate.rotation.y = Math.random() * 0.3;
            crate.castShadow = true; crate.receiveShadow = true;
            this.scene.add(crate);
        }
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 2, transparent: true, opacity: 0.8 });
        const glowCore = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat);
        glowCore.position.set(0, 5.5, 0); this.scene.add(glowCore);
        const glowLight = new THREE.PointLight(0xff8800, 3, 30);
        glowLight.position.set(0, 6, 0); this.scene.add(glowLight);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, 1.5, 0), size: new THREE.Vector3(40, 3, 40) });
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, 9, 0), size: new THREE.Vector3(14, 14, 14) });
        this.spawnPads.push({ x: 0, y: 5.5, z: 0, radius: 4 });
        for (let i = 0; i < 5; i++) this.spawnPads.push({ x: -8 + i * 4, y: 3, z: 14, radius: 2.5 });
        this.spawnPads.push({ x: -16, y: 3, z: 0, radius: 2.5 });
        this.spawnPads.push({ x: 16, y: 3, z: 0, radius: 2.5 });
        this.spawnPads.push({ x: -8, y: 3, z: -12, radius: 2.5 });
        this.spawnPads.push({ x: 0, y: 3, z: -14, radius: 2.5 });
        this.spawnPads.push({ x: 8, y: 3, z: -12, radius: 2.5 });
        this.animatedObjects.push({ type: 'cornucopiaGlow', mesh: glowCore, light: glowLight });
        await this.yieldFrame();
    }

    async buildBiomePaths() {
        const pathMat = new THREE.MeshStandardMaterial({ color: COLOR.arenaPath, roughness: 1.0 });
        const angles = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.75, Math.PI * 0.25];
        for (const a of angles) {
            for (let i = 0; i < 30; i++) {
                const t = i / 30, r = 22 + t * (this.arenaRadius - 50), w = 5 * (1 - t * 0.3);
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                const tile = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 0.05, w), pathMat);
                tile.position.set(x, -0.01, z); tile.rotation.y = -a + Math.PI / 2;
                tile.receiveShadow = true; this.scene.add(tile);
            }
            await this.yieldFrame();
        }
    }

    async buildRuinedCitadel() {
        const angle = -Math.PI * 0.75, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 8), new THREE.MeshStandardMaterial({ color: COLOR.ruinFloor, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        const towerMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinStone, roughness: 0.9, metalness: 0.1 });
        const towerDarkMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinDarkStone, roughness: 0.95 });
        for (const tp of [{ x: -10, z: -10, h: 14, r: 3 }, { x: 12, z: -8, h: 10, r: 2.5 },
            { x: -8, z: 12, h: 18, r: 3.5 }, { x: 10, z: 10, h: 8, r: 2 }, { x: 0, z: -15, h: 12, r: 2.8 }]) {
            const mat = Math.random() > 0.5 ? towerMat : towerDarkMat;
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.8, tp.r, tp.h, 8), mat);
            tower.position.set(cx + tp.x, tp.h / 2, cz + tp.z);
            tower.rotation.z = (Math.random() - 0.5) * 0.1;
            tower.castShadow = true; tower.receiveShadow = true;
            this.scene.add(tower);
            if (Math.random() > 0.6) {
                const debris = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.5, tp.r * 0.3, 2, 6), mat);
                debris.position.set(cx + tp.x + (Math.random() - 0.5) * 3, tp.h + 1, cz + tp.z + (Math.random() - 0.5) * 3);
                debris.rotation.z = (Math.random() - 0.5) * 0.8; debris.castShadow = true;
                this.scene.add(debris);
            }
            const opening = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
            opening.position.set(cx + tp.x, tp.h * 0.4, cz + tp.z + tp.r * 0.5);
            this.scene.add(opening);
            this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(cx + tp.x, tp.h / 2, cz + tp.z), radius: tp.r, height: tp.h });
        }

        const archMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinStone, roughness: 0.85, metalness: 0.1 });
        for (const [px, py, pz, sx, sy, sz] of [[-3, 4, 5, 2, 8, 2], [3, 4, 5, 2, 8, 2], [0, 9, 5, 8, 2, 3]]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), archMat);
            p.position.set(cx + px, py, cz + pz); p.castShadow = true;
            this.scene.add(p);
        }

        const mossMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinMoss, roughness: 1.0 });
  for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 60;
            const moss = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), mossMat);
            moss.position.set(cx + Math.cos(a) * r, 0.05, cz + Math.sin(a) * r); moss.receiveShadow = true;
            this.scene.add(moss);
        }
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 58, h = 2 + Math.random() * 5;
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 8), towerMat);
            pillar.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
            pillar.rotation.z = (Math.random() - 0.5) * 0.5; pillar.castShadow = true;
            this.scene.add(pillar);
        }
        const citadelLight = new THREE.PointLight(0xffddaa, 1, 25);
        citadelLight.position.set(cx, 6, cz);
        this.scene.add(citadelLight);
        await this.yieldFrame();
    }

    async buildCrystalGrotto() {
        const angle = -Math.PI * 0.25, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const floor = new THREE.Mesh(new THREE.CircleGeometry(65, 8), new THREE.MeshStandardMaterial({ color: COLOR.crystalFloor, roughness: 0.8, metalness: 0.2 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        const crystalMats = [
            new THREE.MeshStandardMaterial({ color: COLOR.crystalBlue, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.85 }),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalPurple, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.85 }),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalGlow, roughness: 0.1, metalness: 0.7, emissive: COLOR.crystalGlow, emissiveIntensity: 0.3, transparent: true, opacity: 0.8 })
        ];
        for (let i = 0; i < 35; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 58;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const h = 2 + Math.random() * 10, baseR = 0.5 + Math.random() * 1.5;
            const crystal = new THREE.Mesh(new THREE.ConeGeometry(baseR, h, 6), crystalMats[Math.floor(Math.random() * crystalMats.length)]);
            crystal.position.set(x, h / 2, z); crystal.rotation.y = Math.random() * Math.PI;
            crystal.rotation.x = (Math.random() - 0.5) * 0.2; crystal.castShadow = true;
            this.scene.add(crystal);
            if (Math.random() > 0.7) {
                const sc = new THREE.Mesh(new THREE.ConeGeometry(0.5 + Math.random() * 0.5, 2 + Math.random() * 2, 5), crystalMats[Math.floor(Math.random() * crystalMats.length)]);
                sc.position.set(x + (Math.random() - 0.5) * 3, 0.5, z + (Math.random() - 0.5) * 3);
                sc.rotation.z = (Math.random() - 0.5) * 0.5; this.scene.add(sc);
            }
        }

        const poolMat = new THREE.MeshStandardMaterial({ color: COLOR.crystalReflect, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.7 });
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.1, 16), poolMat);
        pool.position.set(cx, 0.1, cz); this.scene.add(pool);
        const poolLight = new THREE.PointLight(0x4488cc, 2, 20); poolLight.position.set(cx, 2, cz); this.scene.add(poolLight);

        const caveMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 1.0 });
        // Small cave-like formations
        for (const side of [-1, 1]) {
            const caveR = 3 + Math.random() * 2;
            const cw = new THREE.Mesh(new THREE.SphereGeometry(caveR, 6, 6), caveMat);
            cw.position.set(cx + side * (8 + Math.random() * 5), caveR * 0.3, cz + (Math.random() - 0.5) * 10);
            cw.scale.set(1.5, 0.6, 1);
            this.scene.add(cw);
        }
        this.animatedObjects.push({ type: 'crystalGlow', mesh: poolLight, baseIntensity: 2, color: COLOR.crystalGlow });
        await this.yieldFrame();
    }

    async buildBurningWastes() {
        const angle = Math.PI * 0.75, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const floor = new THREE.Mesh(new THREE.CircleGeometry(65, 8), new THREE.MeshStandardMaterial({ color: COLOR.wasteGround, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        const lavaMat = new THREE.MeshStandardMaterial({ color: COLOR.lava, emissive: COLOR.lava, emissiveIntensity: 1.5, roughness: 0.3, transparent: true, opacity: 0.85 });
        for (let i = 0; i < 10; i++) {
            const t = i / 10, x = cx - 20 + t * 40, z = cz + Math.sin(t * Math.PI * 2) * 10, w = 3 + Math.sin(t * Math.PI) * 4;
            const lava = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, 3), lavaMat);
            lava.position.set(x, 0.12, z); this.scene.add(lava);
        }

        const obsMat = new THREE.MeshStandardMaterial({ color: COLOR.obsidian, roughness: 0.3, metalness: 0.5 });
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 55, h = 3 + Math.random() * 12;
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + Math.random(), h, 0.5 + Math.random(), 6), obsMat);
            pillar.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
            pillar.rotation.z = (Math.random() - 0.5) * 0.3; pillar.castShadow = true; pillar.receiveShadow = true;
            this.scene.add(pillar);
        }

        const rockMat = new THREE.MeshStandardMaterial({ color: COLOR.scorchedRock, roughness: 0.9 });
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 55;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 2, 0), rockMat);
            rock.position.set(cx + Math.cos(a) * r, 0.5, cz + Math.sin(a) * r);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true; rock.receiveShadow = true;
            this.scene.add(rock);
        }

        const smokeMat = new THREE.MeshStandardMaterial({ color: COLOR.smoke, transparent: true, opacity: 0.12, roughness: 1 });
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 50;
            const smoke = new THREE.Mesh(new THREE.CylinderGeometry(1, 4, 10, 6), smokeMat);
            smoke.position.set(cx + Math.cos(a) * r, 5, cz + Math.sin(a) * r);
            this.scene.add(smoke);
        }
        const lavaLight = new THREE.PointLight(0xff4400, 3, 30); lavaLight.position.set(cx, 3, cz);
        this.scene.add(lavaLight);
        this.animatedObjects.push({ type: 'lavaGlow', light: lavaLight, baseIntensity: 3 });
        await this.yieldFrame();
    }

    async buildLuminousForest() {
        const angle = Math.PI * 0.25, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 8), new THREE.MeshStandardMaterial({ color: COLOR.luminousFloor, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        const barkMat = new THREE.MeshStandardMaterial({ color: COLOR.luminousBark, roughness: 0.9 });
        const glowColors = [COLOR.luminousGlow, 0x44aaff, COLOR.luminousMushroom, 0xffaa44];
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 62;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const treeH = 6 + Math.random() * 10, trunkR = 0.3 + Math.random() * 0.4;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.6, trunkR, treeH, 6), barkMat);
            trunk.position.set(x, treeH / 2, z); trunk.castShadow = true;
            this.scene.add(trunk);

            const canopyColor = glowColors[Math.floor(Math.random() * glowColors.length)];
            const canopyMat = new THREE.MeshStandardMaterial({ color: canopyColor, emissive: canopyColor, emissiveIntensity: 0.5 + Math.random() * 0.5, roughness: 0.7, transparent: true, opacity: 0.7 });
            const canopySize = 2 + Math.random() * 3;
            const canopy = new THREE.Mesh(new THREE.SphereGeometry(canopySize, 8, 6), canopyMat);
            canopy.position.set(x, treeH + canopySize * 0.3, z); canopy.castShadow = true;
            this.scene.add(canopy);

            if (Math.random() > 0.5) {
                const treeLight = new THREE.PointLight(canopyColor, 1, 12);
                treeLight.position.set(x, treeH, z); this.scene.add(treeLight);
                this.animatedObjects.push({ type: 'treeGlow', light: treeLight, baseIntensity: 1, color: canopyColor });
            }
        }

        const mushMat = new THREE.MeshStandardMaterial({ color: COLOR.luminousMushroom, emissive: COLOR.luminousMushroom, emissiveIntensity: 0.8, roughness: 0.6 });
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 60;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const mushH = 0.3 + Math.random() * 0.5;
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, mushH, 6), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 }));
            stem.position.set(x, mushH / 2, z); this.scene.add(stem);
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mushMat);
            cap.position.set(x, mushH, z); this.scene.add(cap);
        }

        const pondMat = new THREE.MeshStandardMaterial({ color: COLOR.luminousPond, emissive: COLOR.luminousGlow, emissiveIntensity: 0.3, roughness: 0.1, transparent: true, opacity: 0.7 });
        const pond = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 12), pondMat);
        pond.position.set(cx + 5, 0.1, cz - 5); this.scene.add(pond);
        const pondLight = new THREE.PointLight(COLOR.luminousGlow, 2, 15); pondLight.position.set(cx + 5, 2, cz - 5);
        this.scene.add(pondLight);
        this.animatedObjects.push({ type: 'pondGlow', light: pondLight, baseIntensity: 2, color: COLOR.luminousGlow });
        await this.yieldFrame();
    }

    buildBridges() {
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9, metalness: 0.1 });
        const bridgeRailMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.7, metalness: 0.5 });
        const bridgeAngles = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.75, Math.PI * 0.25];
        for (const angle of bridgeAngles) {
            const r1 = 30, r2 = this.arenaRadius - 55;
            for (let i = 0; i < 2; i++) {
                const r = i === 0 ? r1 : r2;
                const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
                const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 6), bridgeMat);
                deck.position.set(x, 0.15, z); deck.rotation.y = -angle + Math.PI / 2;
                deck.receiveShadow = true; deck.castShadow = true;
                this.scene.add(deck);
                for (const side of [-1, 1]) {
                    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 4), bridgeRailMat);
                    rail.position.set(x + Math.cos(angle + Math.PI / 2) * side * 2, 0.9, z + Math.sin(angle + Math.PI / 2) * side * 2);
                    this.scene.add(rail);
                }
            }
        }
    }

    buildHazardZones() {
        const lavaPatchMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff4400, emissiveIntensity: 1, transparent: true, opacity: 0.7 });
        for (let i = 0; i < 5; i++) {
            const a = Math.PI * 0.5 + Math.random() * Math.PI * 0.5, r = 100 + Math.random() * 60;
            const patch = new THREE.Mesh(new THREE.CylinderGeometry(3 + Math.random() * 4, 4, 0.1, 8), lavaPatchMat);
            patch.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r); this.scene.add(patch);
            this.hazards.push({ type: 'lava', position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), radius: 4 + Math.random() * 3, damage: 0.5 });
        }
        const shockMat = new THREE.MeshStandardMaterial({ color: 0x8844ff, emissive: 0x8844ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.3 });
        for (let i = 0; i < 3; i++) {
            const a = -Math.PI * 0.4 + Math.random() * 0.3, r = 100 + Math.random() * 60;
            const shock = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 8), shockMat);
            shock.position.set(Math.cos(a) * r, 3, Math.sin(a) * r); this.scene.add(shock);
            this.hazards.push({ type: 'shock', position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), radius: 3, damage: 0.3 });
        }
    }

    buildArenaProps() {
        const supplyMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8, metalness: 0.2 });
        const supplyTrimMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.7 });
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * (this.arenaRadius - 70);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1.8), supplyMat);
            crate.position.set(x, 1, z); crate.rotation.y = Math.random() * Math.PI;
            crate.castShadow = true; crate.receiveShadow = true;
            this.scene.add(crate);
            for (const by of [1, 2]) {
                const band = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 1.85), supplyTrimMat);
                band.position.set(x, by, z); this.scene.add(band);
            }
        }
        const markerMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.5 });
        for (const hz of this.hazards) {
            const marker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1, 4), markerMat);
            marker.position.set(hz.position.x + 1.5, 0.5, hz.position.z);
            this.scene.add(marker);
        }
    }

    buildBiomeBoundaries() {
        // Removed: small sphere markers were visual junk
    }

    setupAnimations() {
        for (const obj of this.animatedObjects) {
            switch (obj.type) {
                case 'forcefield':
                    obj.update = () => { const t = Date.now() * 0.001; obj.material.opacity = obj.baseOpacity + Math.sin(t * 2) * 0.1; obj.material.emissiveIntensity = obj.baseEmissive + Math.sin(t * 3) * 0.3; };
                    break;
                case 'cornucopiaGlow':
                    obj.update = () => { const t = Date.now() * 0.002; obj.mesh.material.emissiveIntensity = 1.5 + Math.sin(t); obj.light.intensity = 2 + Math.sin(t) * 1.5; obj.mesh.scale.setScalar(1 + Math.sin(t * 2) * 0.1); };
                    break;
                case 'crystalGlow': case 'pondGlow':
                    obj.update = () => { const t = Date.now() * 0.001; obj.light.intensity = obj.baseIntensity + Math.sin(t * 0.5) * 0.5; };
                    break;
                case 'treeGlow':
                    obj.update = () => { const t = Date.now() * 0.003; obj.light.intensity = obj.baseIntensity * (0.7 + Math.sin(t) * 0.3); };
                    break;
                case 'lavaGlow':
                    obj.update = () => { const t = Date.now() * 0.004; obj.light.intensity = obj.baseIntensity + Math.sin(t) * 0.8 + Math.sin(t * 1.7) * 0.3; };
                    break;
                default:
                    obj.update = () => {};
            }
        }
    }

    buildMapBoundaries() {
        // Arena edge wall (behind forcefield)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.9 });
        const wallGeo = new THREE.CylinderGeometry(this.arenaRadius + 1, this.arenaRadius + 1, 14, 64, 1, true);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.y = 7;
        wall.frustumCulled = false;
        this.scene.add(wall);
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
