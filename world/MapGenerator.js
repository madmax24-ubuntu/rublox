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
        let s = (seed * 2147483647) | 0;
        for (let i = 255; i > 0; i--) {
            s = ((s * 16807) | 0);
            if (s < 0) s += 2147483647;
            const j = s % (i + 1);
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        for (let i = 0; i < 256; i++) this.p[i] = this.p[i] & 255;
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
    ctx.fillStyle = '#2d5a1e';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 3000; i++) {
        const x = rng() * size, y = rng() * size, r = rng() * 3 + 1;
        const g = rng() * 60 + 30;
        ctx.fillStyle = `rgb(${g},${g + 40},${rng() * 20 + 10})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 20; i++) {
        const px = rng() * size, py = rng() * size, pr = rng() * 12 + 4;
        ctx.fillStyle = `rgba(${60 + rng() * 30},${40 + rng() * 20},${20 + rng() * 10},0.3)`;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 200; i++) {
        const x = rng() * size, y = rng() * size;
        ctx.fillStyle = `rgba(${80 + rng() * 40},${80 + rng() * 40},${70 + rng() * 40},0.4)`;
        ctx.fillRect(x, y, 2, 1);
    }
}

function createStoneTexture(canvas, seed) {
    const rng = seededRandom(seed || 73);
    const ctx = canvas.getContext('2d');
    const size = 256;
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2000; i++) {
        const x = rng() * size, y = rng() * size, r = rng() * 3 + 1;
        const v = rng() * 40 + 90;
        ctx.fillStyle = `rgb(${v},${v},${v + 5})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 40; i++) {
        const x = rng() * size, y = rng() * size;
        ctx.strokeStyle = `rgba(40,40,40,${rng() * 0.3 + 0.1})`;
        ctx.lineWidth = rng() + 0.5;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 20, y + (rng() - 0.5) * 20);
        ctx.stroke();
    }
    for (let i = 0; i < 300; i++) {
        const x = rng() * size, y = rng() * size;
        const v = rng() * 30 + 100;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath(); ctx.arc(x, y, rng() * 2 + 0.5, 0, Math.PI * 2); ctx.fill();
    }
}

function createMilitaryTexture(canvas, seed) {
    const rng = seededRandom(seed || 99);
    const ctx = canvas.getContext('2d');
    const size = 256;
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4000; i++) {
        const x = rng() * size, y = rng() * size;
        const v = rng() * 30 + 110;
        ctx.fillStyle = `rgb(${v + 20},${v + 15},${v - 10})`;
        ctx.fillRect(x, y, rng() * 2 + 0.5, rng() * 2 + 0.5);
    }
    for (let i = 0; i < 8; i++) {
        const x = rng() * size, y = rng() * size;
        ctx.strokeStyle = `rgba(60,50,30,${rng() * 0.15 + 0.05})`;
        ctx.lineWidth = rng() * 3 + 2;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 60);
        ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
        const px = rng() * size, py = rng() * size;
        ctx.fillStyle = `rgba(${160 + rng() * 40},${140 + rng() * 30},${100 + rng() * 30},0.2)`;
        ctx.beginPath(); ctx.arc(px, py, rng() * 8 + 3, 0, Math.PI * 2); ctx.fill();
    }
}

function createSnowTexture(canvas, seed) {
    const rng = seededRandom(seed || 127);
    const ctx = canvas.getContext('2d');
    const size = 256;
    ctx.fillStyle = '#d8e8f0';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2500; i++) {
        const x = rng() * size, y = rng() * size, r = rng() * 2 + 0.5;
        const v = rng() * 20 + 210;
        ctx.fillStyle = `rgba(${v},${v + 5},${v + 15},${rng() * 0.5 + 0.3})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 15; i++) {
        const px = rng() * size, py = rng() * size;
        ctx.fillStyle = `rgba(180,200,220,${rng() * 0.2 + 0.05})`;
        ctx.beginPath(); ctx.arc(px, py, rng() * 10 + 4, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 20; i++) {
        const x = rng() * size, y = rng() * size;
        ctx.strokeStyle = `rgba(150,160,170,${rng() * 0.2})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 15, y + (rng() - 0.5) * 15);
        ctx.stroke();
    }
}

// ============ COLOR CONSTANTS ============
const COLOR = {
    arenaGround: 0x3a5a2a,
    arenaPath: 0x8b7355,
    // Cornucopia
    metalDark: 0x3a3a3a,
    metalLight: 0x6a6a6a,
    metalGold: 0xc8a830,
    metalSilver: 0x9a9a9a,
    rampMetal: 0x4a4a4a,
    chestWood: 0x6b4226,
    chestGold: 0xdaa520,
    chestLock: 0xffd700,
    // Forcefield
    forcefield: 0x4488ff,
    // Ruined Citadel
    ruinStone: 0x8a8580,
    ruinDarkStone: 0x6a6560,
    ruinFloor: 0x7a7570,
    ruinMoss: 0x4a6a3a,
    // Crystal Grotto
    crystalBlue: 0x4488cc,
    crystalPurple: 0x8844aa,
    crystalFloor: 0x2a2a3a,
    crystalReflect: 0x6688aa,
    crystalGlow: 0x88ccff,
    // Burning Wastes
    lava: 0xff4400,
    lavaGlow: 0xff6600,
    obsidian: 0x1a1a2a,
    wasteGround: 0x2a1a0a,
    scorchedRock: 0x2a2a2a,
    smoke: 0x1a1a1a,
    // Luminous Forest
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
    wood: 0x6b4226,
    barrel: 0x5a3a1a,
    rock: 0x7a7a7a,
    sand: 0xc2b280,
    grass: 0x3a6a2a,
    snow: 0xe8e8f0,
    ice: 0xaaccdd,
    mud: 0x4a3a2a,
};

// ============ HELPER FUNCTIONS ============
function randomInCircle(cx, cz, minR, maxR) {
    const a = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
}

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
        await this.yieldFrame();

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
        this.buildBarrels();
        this.buildRockFormations();
        this.buildFenceLines();
        this.buildDebrisField();
        this.buildSupplyDrops();
        this.buildWatchtowers();
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
        // Ground floor
        const groundMat = new THREE.MeshStandardMaterial({
            color: COLOR.arenaGround, roughness: 0.95, metalness: 0.05
        });
        const floorGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 0.5, 64);
        const floor = new THREE.Mesh(floorGeo, groundMat);
        floor.position.y = -0.25;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, -0.5, 0), size: new THREE.Vector3(this.arenaRadius * 2, 1, this.arenaRadius * 2) });

        // 200 terrain hills for varied terrain
        const terrainMat = new THREE.MeshStandardMaterial({ color: 0x2d4a1d, roughness: 1.0 });
        const noise = this.noise;
        let count = 0;
        for (let i = 0; i < 200; i++) {
            if (i % 50 === 0) await this.yieldFrame();
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * (this.arenaRadius - 50);
            const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
            const h = noise.fbm(x * 0.008, z * 0.008, 3) * 4;
            if (Math.abs(h) < 0.5) continue;
            const size = 5 + Math.abs(h) * 3;
            const hillH = Math.abs(h) * 1.5;
            const hill = new THREE.Mesh(new THREE.BoxGeometry(size, hillH, size * 0.8), terrainMat);
            hill.position.set(x, hillH * 0.3, z);
            hill.rotation.y = Math.random() * Math.PI;
            hill.receiveShadow = true;
            hill.castShadow = h > 0;
            this.scene.add(hill);
            count++;
        }

        // Small mounds (100 extra)
        for (let i = 0; i < 100; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * (this.arenaRadius - 60);
            const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
            const size = 2 + Math.random() * 3;
            const mound = new THREE.Mesh(
                new THREE.SphereGeometry(size, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
                terrainMat
            );
            mound.position.set(x, 0, z);
            mound.receiveShadow = true;
            this.scene.add(mound);
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

        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x88bbff, emissive: 0x4488ff, emissiveIntensity: 2, transparent: true, opacity: 0.8
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(this.arenaRadius + 0.5, 0.3, 8, 64), ringMat);
        ring.position.y = 0.3; ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
        const topRing = ring.clone(); topRing.position.y = 12;
        this.scene.add(topRing);

        // Vertical forcefield lines (64 for dense effect)
        const lineMat = new THREE.LineBasicMaterial({ color: 0x6699ff, transparent: true, opacity: 0.4 });
        for (let i = 0; i < 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            const pts = [
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 0, Math.sin(a) * this.arenaRadius),
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 12, Math.sin(a) * this.arenaRadius)
            ];
            this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        }

        // Inner glow ring
        const glowRingMat = new THREE.MeshStandardMaterial({
            color: 0x4488ff, emissive: 0x4488ff, emissiveIntensity: 1,
            transparent: true, opacity: 0.15, side: THREE.DoubleSide
        });
        const glowRing = new THREE.Mesh(
            new THREE.TorusGeometry(this.arenaRadius - 1, 2, 8, 64),
            glowRingMat
        );
        glowRing.position.y = 6; glowRing.rotation.x = Math.PI / 2;
        this.scene.add(glowRing);

        this.animatedObjects.push({
            type: 'forcefield', mesh: forcefield, material: ffMat,
            baseOpacity: 0.3, baseEmissive: 0.5
        });
        await this.yieldFrame();
    }

    async buildCornucopia() {
        const noise = this.noise;

        // === BASE PLATFORM ===
        const baseMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.6, metalness: 0.8 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(18, 20, 3, 8), baseMat);
        base.position.y = 1.5; base.castShadow = true; base.receiveShadow = true;
        this.scene.add(base);

        // Outer wall ring
        const wallGeo = new THREE.CylinderGeometry(20, 20, 4, 32, 1, true);
        const wall = new THREE.Mesh(wallGeo, baseMat);
        wall.position.y = 5; wall.castShadow = true;
        this.scene.add(wall);

        // === MAIN BODY ===
        const bodyMat = new THREE.MeshStandardMaterial({ color: COLOR.metalLight, roughness: 0.4, metalness: 0.9 });
        const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), bodyMat);
        hull.position.set(0, 9, 0); hull.rotation.y = Math.PI / 4; hull.scale.set(1, 1, 0.6);
        hull.castShadow = true; hull.receiveShadow = true;
        this.scene.add(hull);

        // === LEFT HORN ===
        const hornMat = new THREE.MeshStandardMaterial({ color: COLOR.metalGold, roughness: 0.3, metalness: 0.95 });
        const hornLeftGroup = new THREE.Group();
        for (let i = 0; i < 12; i++) {
            const t = i / 12, radius = 3 * (1 - t * 0.7);
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1.2, 8), hornMat);
            const angle = t * Math.PI * 0.6, h = 6 + t * 14, xOff = -t * 10;
            seg.position.set(xOff, h, 0); seg.rotation.z = angle * 0.5; seg.castShadow = true;
            hornLeftGroup.add(seg);
        }
        this.scene.add(hornLeftGroup);

        // === RIGHT HORN ===
        const hornRightGroup = hornLeftGroup.clone();
        hornRightGroup.children.forEach(s => { s.position.x = -s.position.x; s.rotation.z = -s.rotation.z; });
        this.scene.add(hornRightGroup);

        // === SPIRE + DOME ===
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 8, 8), baseMat);
        spire.position.set(0, 14, -5); spire.castShadow = true;
        this.scene.add(spire);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
        dome.position.set(0, 18, -5); dome.castShadow = true;
        this.scene.add(dome);

        // === GOLDEN SPIRE TOP ===
        const spireTop = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), hornMat);
        spireTop.position.set(0, 20, -5); spireTop.castShadow = true;
        this.scene.add(spireTop);

        // === CHEST (Hollow Knight center) ===
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

        // Chest glow
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 2, transparent: true, opacity: 0.8 });
        const glowCore = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat);
        glowCore.position.set(0, 5.5, 0); this.scene.add(glowCore);
        const glowLight = new THREE.PointLight(0xff8800, 3, 30);
        glowLight.position.set(0, 6, 0); this.scene.add(glowLight);

        // === OBSERVATION PLATFORM ===
        const obsPlatform = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.3, 8), baseMat);
        obsPlatform.position.set(0, 15.2, 0); obsPlatform.receiveShadow = true;
        this.scene.add(obsPlatform);

        const railMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.5, metalness: 0.9 });
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6), railMat);
            post.position.set(Math.cos(a) * 4.8, 16, Math.sin(a) * 4.8); post.castShadow = true;
            this.scene.add(post);
        }
        // Platform rail top
        const railRing = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.08, 6, 16), railMat);
        railRing.position.set(0, 16.75, 0); railRing.rotation.x = Math.PI / 2;
        this.scene.add(railRing);

        // === RAMP ===
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 10), bodyMat);
        ramp.position.set(0, 4.5, 5); ramp.rotation.x = 0.2;
        ramp.castShadow = true; ramp.receiveShadow = true;
        this.scene.add(ramp);

        // === 50 CRATES (massive cornucopia supply) ===
        const crateMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.7, metalness: 0.6 });
        const cratePositions = [
            // Front arc (5)
            { x: -8, z: 8 }, { x: -4, z: 9 }, { x: 0, z: 10 }, { x: 4, z: 9 }, { x: 8, z: 8 },
            // Second row (5)
            { x: -12, z: 4 }, { x: -8, z: 5 }, { x: -4, z: 6 }, { x: 4, z: 6 }, { x: 8, z: 5 }, { x: 12, z: 4 },
            // Third row (5)
            { x: -16, z: -2 }, { x: -10, z: 0 }, { x: -4, z: 1 }, { x: 4, z: 1 }, { x: 10, z: 0 }, { x: 16, z: -2 },
            // Back row (5)
            { x: -10, z: -6 }, { x: -5, z: -8 }, { x: 0, z: -9 }, { x: 5, z: -8 }, { x: 10, z: -6 },
            // Extra stacked (15)
            { x: -6, z: 3, y: 3 }, { x: -3, z: 4, y: 3 }, { x: 0, z: 5, y: 3 }, { x: 3, z: 4, y: 3 }, { x: 6, z: 3, y: 3 },
            { x: -14, z: -4, y: 3 }, { x: -7, z: -5, y: 3 }, { x: 0, z: -6, y: 3 }, { x: 7, z: -5, y: 3 }, { x: 14, z: -4, y: 3 },
            { x: -5, z: -10, y: 3 }, { x: 0, z: -11, y: 3 }, { x: 5, z: -10, y: 3 },
            { x: -16, z: -8, y: 3 }, { x: 16, z: -8, y: 3 },
            // Sides
            { x: -22, z: 0 }, { x: 22, z: 0 },
        ];
        for (const cp of cratePositions) {
            const crate = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 2.5), crateMat);
            crate.position.set(cp.x, (cp.y || 0) + 1.5, cp.z);
            crate.rotation.y = Math.random() * 0.3;
            crate.castShadow = true; crate.receiveShadow = true;
            this.scene.add(crate);
        }

        // === WEAPONS RACKS (5) ===
        const rackMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const rx = Math.cos(a) * 14, rz = Math.sin(a) * 14;
            // Vertical posts
            for (const side of [-1, 1]) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), rackMat);
                post.position.set(rx + side * 1.5, 1.5, rz); post.castShadow = true;
                this.scene.add(post);
            }
            // Horizontal bar
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), rackMat);
            bar.position.set(rx, 3, rz); bar.rotation.z = Math.PI / 2;
            this.scene.add(bar);
            // Weapon on rack (simple sword shape)
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.05), bodyMat);
            blade.position.set(rx, 2.5, rz);
            this.scene.add(blade);
        }

        // === AMMO BOXES (10) ===
        const ammoMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8 });
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 5 + Math.random() * 12;
            const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1), ammoMat);
            box.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
            box.castShadow = true; box.receiveShadow = true;
            this.scene.add(box);
        }

        // === CENTRAL GLOW LIGHT ===
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, 1.5, 0), size: new THREE.Vector3(40, 3, 40) });
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, 9, 0), size: new THREE.Vector3(14, 14, 14) });
        this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(0, 5, 0), radius: 20, height: 10 });

        // === 15 SPAWN PADS ===
        // Center pad (large)
        this.spawnPads.push({ x: 0, y: 5.5, z: 0, radius: 4 });
        // Inner ring (5)
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            this.spawnPads.push({ x: Math.cos(a) * 10, y: 3, z: Math.sin(a) * 10, radius: 2.5 });
        }
        // Mid ring (5)
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
            this.spawnPads.push({ x: Math.cos(a) * 18, y: 3, z: Math.sin(a) * 18, radius: 2 });
        }
        // Outer positions (4)
        this.spawnPads.push({ x: 22, y: 3, z: 0, radius: 2 });
        this.spawnPads.push({ x: -22, y: 3, z: 0, radius: 2 });
        this.spawnPads.push({ x: 0, y: 3, z: 22, radius: 2 });
        this.spawnPads.push({ x: 0, y: 3, z: -22, radius: 2 });

        this.animatedObjects.push({ type: 'cornucopiaGlow', mesh: glowCore, light: glowLight });
        await this.yieldFrame();
    }

    async buildBiomePaths() {
        const pathMat = new THREE.MeshStandardMaterial({ color: COLOR.arenaPath, roughness: 1.0 });
        const angles = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.75, Math.PI * 0.25];

        for (const a of angles) {
            // Path tiles (60 per direction = 240 total)
            for (let i = 0; i < 60; i++) {
                const t = i / 60, r = 22 + t * (this.arenaRadius - 50), w = 5 * (1 - t * 0.2);
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                const tile = new THREE.Mesh(new THREE.BoxGeometry(w * 1.8, 0.05, w * 1.2), pathMat);
                tile.position.set(x, -0.01, z); tile.rotation.y = -a + Math.PI / 2;
                tile.receiveShadow = true; this.scene.add(tile);

                // Path edge stones every 5 tiles
                if (i % 5 === 0) {
                    const edgeMat = new THREE.MeshStandardMaterial({ color: COLOR.stone, roughness: 0.9 });
                    for (const side of [-1, 1]) {
                        const edge = new THREE.Mesh(new THREE.SphereGeometry(0.3, 5, 4), edgeMat);
                        const nx = Math.cos(a + Math.PI / 2), nz = Math.sin(a + Math.PI / 2);
                        edge.position.set(x + nx * w * 0.95, 0.15, z + nz * w * 0.95);
                        this.scene.add(edge);
                    }
                }
            }

            // === LANTERN POSTS (6 per path = 24 total) ===
            const lanternMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.5, metalness: 0.8 });
            const lanternGlowMat = new THREE.MeshStandardMaterial({
                color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.5, transparent: true, opacity: 0.8
            });
            for (let i = 5; i < 60; i += 10) {
                const t = i / 60, r = 22 + t * (this.arenaRadius - 50), w = 5 * (1 - t * 0.2);
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                const nx = Math.cos(a + Math.PI / 2), nz = Math.sin(a + Math.PI / 2);

                for (const side of [-1, 1]) {
                    const px = x + nx * (w * 1.2 + 0.5), pz = z + nz * (w * 1.2 + 0.5);
                    // Post
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 4, 6), lanternMat);
                    post.position.set(px, 2, pz); post.castShadow = true;
                    this.scene.add(post);
                    // Lantern head
                    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), lanternMat);
                    head.position.set(px, 4.2, pz); head.castShadow = true;
                    this.scene.add(head);
                    // Glow
                    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), lanternGlowMat);
                    glow.position.set(px, 4.2, pz);
                    this.scene.add(glow);

                    // Lantern light (every other one)
                    if (side === -1 && i % 20 === 0) {
                        const light = new THREE.PointLight(0xffaa22, 2, 15);
                        light.position.set(px, 4.2, pz); this.scene.add(light);
                        this.animatedObjects.push({ type: 'lanternGlow', light: light, baseIntensity: 2 });
                    }
                }
            }

            await this.yieldFrame();
        }
    }

    async buildRuinedCitadel() {
        const angle = -Math.PI * 0.75, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const noise = this.noise;

        // Citadel floor
        const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 8),
            new THREE.MeshStandardMaterial({ color: COLOR.ruinFloor, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        const towerMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinStone, roughness: 0.9, metalness: 0.1 });
        const towerDarkMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinDarkStone, roughness: 0.95 });

        // === 15 TOWERS ===
        const towerDefs = [
            // Main towers (tall, prominent)
            { x: -15, z: -15, h: 20, r: 4 }, { x: 18, z: -12, h: 18, r: 3.5 },
            { x: -12, z: 18, h: 22, r: 4 }, { x: 15, z: 15, h: 16, r: 3 },
            { x: 0, z: -20, h: 24, r: 4.5 },
            // Mid towers
            { x: -25, z: 0, h: 14, r: 2.5 }, { x: 25, z: -5, h: 12, r: 2.5 },
            { x: 0, z: 22, h: 16, r: 3 }, { x: -20, z: -20, h: 10, r: 2 },
            { x: 20, z: 20, h: 14, r: 2.5 },
            // Outer towers
            { x: -35, z: -15, h: 10, r: 2 }, { x: 35, z: -10, h: 8, r: 1.8 },
            { x: -15, z: 35, h: 12, r: 2.2 }, { x: 15, z: 30, h: 9, r: 1.8 },
            { x: 0, z: 35, h: 11, r: 2 },
            // Watch towers on edges
            { x: -45, z: 5, h: 16, r: 3 }, { x: 45, z: 0, h: 14, r: 2.8 },
            { x: -30, z: -35, h: 13, r: 2.5 }, { x: 30, z: 35, h: 15, r: 2.8 },
            // Extra
            { x: -50, z: -30, h: 8, r: 1.5 }, { x: 50, z: 30, h: 9, r: 1.5 },
        ];

        for (const tp of towerDefs) {
            const mat = Math.random() > 0.4 ? towerMat : towerDarkMat;
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.7, tp.r, tp.h, 8), mat);
            tower.position.set(cx + tp.x, tp.h / 2, cz + tp.z);
            tower.rotation.z = (Math.random() - 0.5) * 0.08;
            tower.rotation.x = (Math.random() - 0.5) * 0.05;
            tower.castShadow = true; tower.receiveShadow = true;
            this.scene.add(tower);

            // Tower top battlements
            const battlementH = tp.h + 0.5;
            for (let b = 0; b < 8; b++) {
                const ba = (b / 8) * Math.PI * 2;
                const bx = Math.cos(ba) * tp.r * 0.8;
                const bz = Math.sin(ba) * tp.r * 0.8;
                const batt = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, 1.5, 1.2), mat
                );
                batt.position.set(cx + tp.x + bx, battlementH, cz + tp.z + bz);
                batt.castShadow = true;
                this.scene.add(batt);
            }

            // Ruined top on some towers
            if (Math.random() > 0.5) {
                const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, tp.r * 0.5, 2, 6), mat);
                top.position.set(cx + tp.x + (Math.random() - 0.5) * 2, tp.h + 2, cz + tp.z + (Math.random() - 0.5) * 2);
                top.rotation.z = (Math.random() - 0.5) * 0.5;
                top.castShadow = true;
                this.scene.add(top);
            }

            // Door opening (dark)
            const opening = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 2.5, 1),
                new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 })
            );
            opening.position.set(cx + tp.x, 1.5, cz + tp.z + tp.r * 0.5);
            this.scene.add(opening);

            // Window openings
            if (tp.h > 12) {
                for (let w = 0; w < 2; w++) {
                    const wa = Math.random() * Math.PI * 2;
                    const win = new THREE.Mesh(
                        new THREE.BoxGeometry(0.8, 1.2, 0.5),
                        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 })
                    );
                    win.position.set(
                        cx + tp.x + Math.cos(wa) * tp.r,
                        tp.h * 0.5,
                        cz + tp.z + Math.sin(wa) * tp.r
                    );
                    win.rotation.y = wa;
                    this.scene.add(win);
                }
            }

            this.colliders.push({
                type: 'cylinder',
                position: new THREE.Vector3(cx + tp.x, tp.h / 2, cz + tp.z),
                radius: tp.r, height: tp.h
            });

            // Debris on ground
            if (Math.random() > 0.4) {
                const debris = new THREE.Mesh(
                    new THREE.CylinderGeometry(tp.r * 0.4, tp.r * 0.3, 2, 6), mat
                );
                debris.position.set(
                    cx + tp.x + (Math.random() - 0.5) * 6,
                    1,
                    cz + tp.z + (Math.random() - 0.5) * 6
                );
                debris.rotation.z = (Math.random() - 0.5) * 1;
                debris.castShadow = true;
                this.scene.add(debris);
            }
        }

        // === WALL SECTIONS (connecting towers) ===
        const wallMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinStone, roughness: 0.9, metalness: 0.1 });
        const wallPositions = [
            // Inner wall segments
            { x1: -15, z1: -15, x2: 18, z2: -12, h: 6 },
            { x1: 18, z1: -12, x2: 15, z2: 15, h: 5 },
            { x1: -15, z1: -15, x2: -12, z2: 18, h: 7 },
            { x1: -12, z1: 18, x2: 15, z2: 15, h: 4 },
            { x1: -25, z1: 0, x2: -15, z2: -15, h: 5 },
            { x1: 25, z1: -5, x2: 18, z2: -12, h: 4 },
            // Outer wall segments
            { x1: -45, z1: 5, x2: -35, z2: -15, h: 6 },
            { x1: 45, z1: 0, x2: 35, z2: -10, h: 5 },
            { x1: -30, z1: -35, x2: -25, z2: 0, h: 4 },
            { x1: 30, z1: 35, x2: 20, z2: 20, h: 5 },
        ];

        for (const wp of wallPositions) {
            const dx = wp.x2 - wp.x1, dz = wp.z2 - wp.z1;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);
            const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wp.h, 1.5), wallMat);
            wall.position.set(cx + (wp.x1 + wp.x2) / 2, wp.h / 2, cz + (wp.z1 + wp.z2) / 2);
            wall.rotation.y = angle;
            wall.castShadow = true; wall.receiveShadow = true;
            this.scene.add(wall);
        }

        // === ARCHES (3 grand arches) ===
        const archMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinStone, roughness: 0.85, metalness: 0.1 });
        for (const [px, py, pz, sx, sy, sz] of [
            [-3, 4, 5, 2, 8, 2], [3, 4, 5, 2, 8, 2], [0, 9, 5, 8, 2, 3]
        ]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), archMat);
            p.position.set(cx + px, py, cz + pz); p.castShadow = true;
            this.scene.add(p);
        }

        // === MOSS PATCHES (30) ===
        const mossMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinMoss, roughness: 1.0 });
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 60;
            const moss = new THREE.Mesh(
                new THREE.SphereGeometry(2 + Math.random() * 3, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
                mossMat
            );
            moss.position.set(cx + Math.cos(a) * r, 0.05, cz + Math.sin(a) * r);
            moss.receiveShadow = true;
            this.scene.add(moss);
        }

        // === PILLARS (30 scattered) ===
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 58;
            const h = 2 + Math.random() * 6;
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, h, 8), towerMat);
            pillar.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
            pillar.rotation.z = (Math.random() - 0.5) * 0.5;
            pillar.rotation.x = (Math.random() - 0.5) * 0.3;
            pillar.castShadow = true;
            this.scene.add(pillar);
        }

        // === RUINED BENCHES/STEPS (15) ===
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 50;
            const step = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 2, 0.5, 1 + Math.random()), wallMat);
            step.position.set(cx + Math.cos(a) * r, 0.25, cz + Math.sin(a) * r);
            step.rotation.y = Math.random() * Math.PI;
            step.castShadow = true; step.receiveShadow = true;
            this.scene.add(step);
        }

        const citadelLight = new THREE.PointLight(0xffddaa, 1, 25);
        citadelLight.position.set(cx, 6, cz);
        this.scene.add(citadelLight);
        await this.yieldFrame();
    }

    async buildCrystalGrotto() {
        const angle = -Math.PI * 0.25, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const noise = this.noise;

        const floor = new THREE.Mesh(new THREE.CircleGeometry(65, 8),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalFloor, roughness: 0.8, metalness: 0.2 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        const crystalMats = [
            new THREE.MeshStandardMaterial({ color: COLOR.crystalBlue, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.85 }),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalPurple, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.85 }),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalGlow, roughness: 0.1, metalness: 0.7, emissive: COLOR.crystalGlow, emissiveIntensity: 0.3, transparent: true, opacity: 0.8 })
        ];

        // === 80 MAIN CRYSTALS ===
        for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 58;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const h = 2 + Math.random() * 12, baseR = 0.5 + Math.random() * 2;
            const crystal = new THREE.Mesh(
                new THREE.ConeGeometry(baseR, h, Math.random() > 0.5 ? 6 : 5),
                crystalMats[Math.floor(Math.random() * crystalMats.length)]
            );
            crystal.position.set(x, h / 2, z);
            crystal.rotation.y = Math.random() * Math.PI;
            crystal.rotation.x = (Math.random() - 0.5) * 0.2;
            crystal.castShadow = true;
            this.scene.add(crystal);

            // Small companion crystals (40% chance)
            if (Math.random() > 0.6) {
                for (let j = 0; j < 2 + Math.floor(Math.random() * 3); j++) {
                    const sc = new THREE.Mesh(
                        new THREE.ConeGeometry(0.3 + Math.random() * 0.5, 1 + Math.random() * 3, 5),
                        crystalMats[Math.floor(Math.random() * crystalMats.length)]
                    );
                    sc.position.set(
                        x + (Math.random() - 0.5) * 4,
                        0.5,
                        z + (Math.random() - 0.5) * 4
                    );
                    sc.rotation.z = (Math.random() - 0.5) * 0.5;
                    sc.castShadow = true;
                    this.scene.add(sc);
                }
            }
        }

        // === CRYSTAL COLUMNS (10 tall columns) ===
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 45;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(1, 1.5, 8 + Math.random() * 6, 8),
                crystalMats[Math.floor(Math.random() * crystalMats.length)]
            );
            col.position.set(x, 4, z);
            col.rotation.x = (Math.random() - 0.5) * 0.1;
            col.castShadow = true;
            this.scene.add(col);
        }

        // === 3 WATER POOLS ===
        const poolPositions = [
            { x: cx, z: cz, r: 7 },
            { x: cx + 25, z: cz - 20, r: 5 },
            { x: cx - 20, z: cz + 25, r: 4 },
        ];
        const poolMat = new THREE.MeshStandardMaterial({
            color: COLOR.crystalReflect, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.7
        });
        for (const pp of poolPositions) {
            const pool = new THREE.Mesh(new THREE.CylinderGeometry(pp.r, pp.r, 0.1, 16), poolMat);
            pool.position.set(pp.x, 0.08, pp.z); this.scene.add(pool);

            const poolLight = new THREE.PointLight(0x4488cc, 2, 15);
            poolLight.position.set(pp.x, 1.5, pp.z); this.scene.add(poolLight);

            // Crystal around pool edge
            for (let i = 0; i < 6; i++) {
                const pa = (i / 6) * Math.PI * 2;
                const pc = new THREE.Mesh(
                    new THREE.ConeGeometry(0.5, 1.5, 5),
                    crystalMats[2]
                );
                pc.position.set(pp.x + Math.cos(pa) * pp.r, 0.75, pp.z + Math.sin(pa) * pp.r);
                this.scene.add(pc);
            }
        }

        // === CAVE FORMATIONS (8) ===
        const caveMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 1.0 });
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 45;
            const caveR = 2 + Math.random() * 3;
            const cave = new THREE.Mesh(new THREE.SphereGeometry(caveR, 6, 6), caveMat);
            cave.position.set(cx + Math.cos(a) * r, caveR * 0.3, cz + Math.sin(a) * r);
            cave.scale.set(1.5, 0.5 + Math.random() * 0.3, 1.2);
            this.scene.add(cave);
        }

        // === STALACTITES (on cave ceilings - pointing down from above) ===
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 30;
            const stal = new THREE.Mesh(
                new THREE.ConeGeometry(0.3 + Math.random() * 0.5, 2 + Math.random() * 3, 5),
                crystalMats[0]
            );
            stal.position.set(cx + Math.cos(a) * r, 6 + Math.random() * 4, cz + Math.sin(a) * r);
            stal.rotation.x = Math.PI; // Point down
            this.scene.add(stal);
        }

        // Crystal pool light animation
        this.animatedObjects.push({ type: 'crystalGlow', light: new THREE.PointLight(0x88ccff, 2, 20), baseIntensity: 2, color: COLOR.crystalGlow });
        await this.yieldFrame();
    }

    async buildBurningWastes() {
        const angle = Math.PI * 0.75, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const noise = this.noise;

        const floor = new THREE.Mesh(new THREE.CircleGeometry(65, 8),
            new THREE.MeshStandardMaterial({ color: COLOR.wasteGround, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        // === 30 LAVA FLOWS ===
        const lavaMat = new THREE.MeshStandardMaterial({
            color: COLOR.lava, emissive: COLOR.lava, emissiveIntensity: 1.5, roughness: 0.3, transparent: true, opacity: 0.85
        });
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 55;
            const w = 1 + Math.random() * 4, h = 0.12, d = 1 + Math.random() * 4;
            const lava = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lavaMat);
            lava.position.set(cx + Math.cos(a) * r, 0.1, cz + Math.sin(a) * r);
            lava.rotation.y = Math.random() * Math.PI;
            this.scene.add(lava);
        }

        // === LAVA FLOW RIVERS (5 rivers) ===
        for (let r = 0; r < 5; r++) {
            const startAngle = Math.random() * Math.PI * 2;
            for (let i = 0; i < 12; i++) {
                const t = i / 12;
                const x = cx + Math.cos(startAngle) * (t * 40);
                const z = cz + Math.sin(startAngle) * (t * 40) + Math.sin(t * 3) * 5;
                const lava = new THREE.Mesh(
                    new THREE.BoxGeometry(2 + Math.sin(t * Math.PI) * 3, 0.12, 2),
                    lavaMat
                );
                lava.position.set(x, 0.12, z);
                lava.rotation.y = startAngle + Math.PI / 2;
                this.scene.add(lava);
            }
        }

        // === 30 OBSIDIAN BARRIERS/WALLS ===
        const obsMat = new THREE.MeshStandardMaterial({ color: COLOR.obsidian, roughness: 0.3, metalness: 0.5 });
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 55;
            const h = 2 + Math.random() * 10;
            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5 + Math.random() * 0.8, h, 0.5 + Math.random() * 0.8, 6),
                obsMat
            );
            pillar.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
            pillar.rotation.z = (Math.random() - 0.5) * 0.3;
            pillar.castShadow = true; pillar.receiveShadow = true;
            this.scene.add(pillar);
        }

        // === OBSIDIAN WALLS (5 continuous walls for cover) ===
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 40;
            const w = 3 + Math.random() * 6, h = 2 + Math.random() * 4;
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.5), obsMat);
            wall.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
            wall.rotation.y = Math.random() * Math.PI;
            wall.castShadow = true; wall.receiveShadow = true;
            this.scene.add(wall);
        }

        // === 40 ROCKS ===
        const rockMat = new THREE.MeshStandardMaterial({ color: COLOR.scorchedRock, roughness: 0.9 });
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 55;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 2.5, 0), rockMat);
            rock.position.set(cx + Math.cos(a) * r, 0.5, cz + Math.sin(a) * r);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true; rock.receiveShadow = true;
            this.scene.add(rock);
        }

        // === 15 SMOKE CLOUDS ===
        const smokeMat = new THREE.MeshStandardMaterial({ color: COLOR.smoke, transparent: true, opacity: 0.15, roughness: 1 });
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 50;
            const smoke = new THREE.Mesh(
                new THREE.SphereGeometry(2 + Math.random() * 3, 6, 4),
                smokeMat
            );
            smoke.position.set(cx + Math.cos(a) * r, 4 + Math.random() * 6, cz + Math.sin(a) * r);
            smoke.scale.set(1, 0.4, 1);
            this.scene.add(smoke);
        }

        // === SMOKE PILLARS (5 tall columns) ===
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 40;
            const smoke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 3, 8 + Math.random() * 6, 6),
                smokeMat
            );
            smoke.position.set(cx + Math.cos(a) * r, 4, cz + Math.sin(a) * r);
            this.scene.add(smoke);
        }

        // === VOLCANIC CRATERS (5) ===
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 45;
            const crater = new THREE.Mesh(
                new THREE.TorusGeometry(2 + Math.random() * 2, 0.5, 6, 12),
                obsMat
            );
            crater.position.set(cx + Math.cos(a) * r, 0.2, cz + Math.sin(a) * r);
            crater.rotation.x = Math.PI / 2;
            this.scene.add(crater);
        }

        const lavaLight = new THREE.PointLight(0xff4400, 3, 30);
        lavaLight.position.set(cx, 3, cz);
        this.scene.add(lavaLight);
        this.animatedObjects.push({ type: 'lavaGlow', light: lavaLight, baseIntensity: 3 });
        await this.yieldFrame();
    }

    async buildLuminousForest() {
        const angle = Math.PI * 0.25, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;
        const noise = this.noise;

        const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 8),
            new THREE.MeshStandardMaterial({ color: COLOR.luminousFloor, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        this.scene.add(floor);

        const barkMat = new THREE.MeshStandardMaterial({ color: COLOR.luminousBark, roughness: 0.9 });

        // === 80 TREES ===
        const glowColors = [COLOR.luminousGlow, 0x44aaff, COLOR.luminousMushroom, 0xffaa44, 0x44ffaa, 0xaa44ff];
        for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 62;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const treeH = 6 + Math.random() * 12, trunkR = 0.3 + Math.random() * 0.5;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.5, trunkR, treeH, 6), barkMat);
            trunk.position.set(x, treeH / 2, z); trunk.castShadow = true;
            this.scene.add(trunk);

            // Multiple canopy layers
            const canopyColor = glowColors[Math.floor(Math.random() * glowColors.length)];
            const canopySize = 2 + Math.random() * 3.5;

            // Main canopy
            const canopyMat = new THREE.MeshStandardMaterial({
                color: canopyColor, emissive: canopyColor, emissiveIntensity: 0.4 + Math.random() * 0.6,
                roughness: 0.7, transparent: true, opacity: 0.7
            });
            const canopy = new THREE.Mesh(new THREE.SphereGeometry(canopySize, 8, 6), canopyMat);
            canopy.position.set(x, treeH + canopySize * 0.3, z); canopy.castShadow = true;
            this.scene.add(canopy);

            // Extra canopy layer
            const canopy2 = new THREE.Mesh(
                new THREE.SphereGeometry(canopySize * 0.7, 6, 5),
                canopyMat
            );
            canopy2.position.set(x + (Math.random() - 0.5) * 2, treeH + canopySize * 0.5, z + (Math.random() - 0.5) * 2);
            this.scene.add(canopy2);

            // Vine drops from canopy
            if (Math.random() > 0.5) {
                for (let v = 0; v < 2 + Math.floor(Math.random() * 3); v++) {
                    const vineAngle = Math.random() * Math.PI * 2;
                    const vineR = Math.cos(vineAngle) * canopySize * 0.5;
                    const vine = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.03, 0.03, 1 + Math.random() * 2, 4),
                        barkMat
                    );
                    vine.position.set(
                        x + vineR,
                        treeH + canopySize * 0.3 - canopySize * 0.5,
                        z + Math.sin(vineAngle) * canopySize * 0.5
                    );
                    vine.rotation.z = (Math.random() - 0.5) * 0.5;
                    this.scene.add(vine);
                }
            }

            // Tree light (30% of trees)
            if (Math.random() > 0.7) {
                const treeLight = new THREE.PointLight(canopyColor, 1, 12);
                treeLight.position.set(x, treeH, z); this.scene.add(treeLight);
                this.animatedObjects.push({ type: 'treeGlow', light: treeLight, baseIntensity: 1, color: canopyColor });
            }
        }

        // === 50 MUSHROOMS in clusters ===
        const mushMat = new THREE.MeshStandardMaterial({
            color: COLOR.luminousMushroom, emissive: COLOR.luminousMushroom, emissiveIntensity: 0.8, roughness: 0.6
        });
        for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 60;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const mushH = 0.3 + Math.random() * 0.8;
            // Stem
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.1, mushH, 6),
                new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })
            );
            stem.position.set(x, mushH / 2, z); this.scene.add(stem);
            // Cap
            const cap = new THREE.Mesh(
                new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
                mushMat
            );
            cap.position.set(x, mushH, z); this.scene.add(cap);
        }

        // === 3 GLOWING PONDS ===
        const pondPositions = [
            { x: cx + 5, z: cz - 5, r: 6 },
            { x: cx - 25, z: cz + 15, r: 4 },
            { x: cx + 30, z: cz + 25, r: 5 },
        ];
        const pondMat = new THREE.MeshStandardMaterial({
            color: COLOR.luminousPond, emissive: COLOR.luminousGlow, emissiveIntensity: 0.3,
            roughness: 0.1, transparent: true, opacity: 0.7
        });
        for (const pp of pondPositions) {
            const pond = new THREE.Mesh(new THREE.CylinderGeometry(pp.r, pp.r, 0.1, 12), pondMat);
            pond.position.set(pp.x, 0.1, pp.z); this.scene.add(pond);
            const pondLight = new THREE.PointLight(COLOR.luminousGlow, 2, 15);
            pondLight.position.set(pp.x, 2, pp.z); this.scene.add(pondLight);

            // Pond edge flowers
            for (let i = 0; i < 6; i++) {
                const pa = (i / 6) * Math.PI * 2;
                const flower = new THREE.Mesh(
                    new THREE.SphereGeometry(0.2, 6, 4),
                    new THREE.MeshStandardMaterial({
                        color: glowColors[Math.floor(Math.random() * glowColors.length)],
                        emissive: glowColors[Math.floor(Math.random() * glowColors.length)],
                        emissiveIntensity: 0.5
                    })
                );
                flower.position.set(pp.x + Math.cos(pa) * pp.r, 0.3, pp.z + Math.sin(pa) * pp.r);
                this.scene.add(flower);
            }
        }

        // === UNDERGROWTH (40 small plants/bushes) ===
        const bushMat = new THREE.MeshStandardMaterial({
            color: 0x228844, emissive: 0x228844, emissiveIntensity: 0.1, roughness: 0.9
        });
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 60;
            const bush = new THREE.Mesh(
                new THREE.SphereGeometry(0.5 + Math.random() * 1, 6, 4),
                bushMat
            );
            bush.position.set(cx + Math.cos(a) * r, 0.5, cz + Math.sin(a) * r);
            bush.castShadow = true;
            this.scene.add(bush);
        }

        await this.yieldFrame();
    }

    buildBridges() {
        const bridgeMat = new THREE.MeshStandardMaterial({ color: COLOR.bridgeWood, roughness: 0.9, metalness: 0.1 });
        const bridgeRailMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.7, metalness: 0.5 });

        const bridgeAngles = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.75, Math.PI * 0.25];

        for (const angle of bridgeAngles) {
            // 5 bridge sections per direction = 20 total
            for (let i = 0; i < 5; i++) {
                const t = (i + 0.5) / 5;
                const r = 35 + t * (this.arenaRadius - 70);
                const x = Math.cos(angle) * r, z = Math.sin(angle) * r;

                // Deck
                const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 8), bridgeMat);
                deck.position.set(x, 0.15, z);
                deck.rotation.y = -angle + Math.PI / 2;
                deck.receiveShadow = true; deck.castShadow = true;
                this.scene.add(deck);

                // Support beams underneath
                for (const side of [-1, 1]) {
                    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 7), bridgeMat);
                    beam.position.set(
                        x + Math.cos(angle + Math.PI / 2) * side * 2,
                        -0.25,
                        z + Math.sin(angle + Math.PI / 2) * side * 2
                    );
                    this.scene.add(beam);
                }

                // Rails
                for (const side of [-1, 1]) {
                    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 4), bridgeRailMat);
                    rail.position.set(
                        x + Math.cos(angle + Math.PI / 2) * side * 2,
                        0.9,
                        z + Math.sin(angle + Math.PI / 2) * side * 2
                    );
                    this.scene.add(rail);
                }

                // Rail top
                const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), bridgeRailMat);
                topRail.position.set(x, 1.65, z);
                topRail.rotation.y = -angle + Math.PI / 2;
                this.scene.add(topRail);
            }

            // Bridge landing platforms (at biome edge)
            const endR = this.arenaRadius - 55;
            const ex = Math.cos(angle) * endR, ez = Math.sin(angle) * endR;
            const platform = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.3, 8), bridgeMat);
            platform.position.set(ex, 0.15, ez);
            platform.receiveShadow = true; platform.castShadow = true;
            this.scene.add(platform);
        }
    }

    buildHazardZones() {
        // === 10 LAVA PATCHES ===
        const lavaPatchMat = new THREE.MeshStandardMaterial({
            color: 0xff2200, emissive: 0xff4400, emissiveIntensity: 1, transparent: true, opacity: 0.7
        });
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 100;
            const patch = new THREE.Mesh(
                new THREE.CylinderGeometry(3 + Math.random() * 5, 4 + Math.random() * 3, 0.1, 8),
                lavaPatchMat
            );
            patch.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
            this.scene.add(patch);
            this.hazards.push({
                type: 'lava',
                position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
                radius: 4 + Math.random() * 4,
                damage: 0.5
            });
        }

        // === 5 SHOCK ZONES ===
        const shockMat = new THREE.MeshStandardMaterial({
            color: 0x8844ff, emissive: 0x8844ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.3
        });
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 100;
            const shock = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 8), shockMat);
            shock.position.set(Math.cos(a) * r, 3, Math.sin(a) * r);
            this.scene.add(shock);
            this.hazards.push({
                type: 'shock',
                position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
                radius: 3,
                damage: 0.3
            });
        }

        // === 5 TRAP SPIKES ===
        const spikeMat = new THREE.MeshStandardMaterial({ color: COLOR.metalLight, roughness: 0.5, metalness: 0.8 });
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 100;
            // Spike cluster (3 spikes each)
            for (let s = 0; s < 3; s++) {
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2, 4), spikeMat);
                const sa = (s / 3) * Math.PI * 2;
                spike.position.set(Math.cos(a) * r + Math.cos(sa) * 1, 1, Math.sin(a) * r + Math.sin(sa) * 1);
                this.scene.add(spike);
            }
            this.hazards.push({
                type: 'spike',
                position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
                radius: 3,
                damage: 0.8
            });
        }
    }

    buildArenaProps() {
        const supplyMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8, metalness: 0.2 });
        const supplyTrimMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.7 });

        // === 40 SUPPLY CRATES in outer arena ===
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * (this.arenaRadius - 70);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const w = 1.5 + Math.random(), h = 1 + Math.random() * 1.5, d = 1 + Math.random();
            const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), supplyMat);
            crate.position.set(x, h / 2, z); crate.rotation.y = Math.random() * Math.PI;
            crate.castShadow = true; crate.receiveShadow = true;
            this.scene.add(crate);
            // Metal bands
            for (let by = h / 2; by > 0; by -= h / 2) {
                const band = new THREE.Mesh(
                    new THREE.BoxGeometry(w + 0.05, 0.1, d + 0.05), supplyTrimMat
                );
                band.position.set(x, by, z); this.scene.add(band);
            }
        }

        // Hazard markers
        const markerMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.5 });
        for (const hz of this.hazards) {
            const marker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1, 4), markerMat);
            marker.position.set(hz.position.x + 1.5, 0.5, hz.position.z);
            this.scene.add(marker);
        }
    }

    buildBarrels() {
        const barrelMat = new THREE.MeshStandardMaterial({ color: COLOR.barrel, roughness: 0.8 });
        const barrelBands = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.5, metalness: 0.7 });

        // === 50 BARRELS scattered ===
        for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * (this.arenaRadius - 50);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const h = 1.2 + Math.random() * 0.8, r2 = 0.4 + Math.random() * 0.3;

            // Barrel body
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r2, r2, h, 8), barrelMat);
            barrel.position.set(x, h / 2, z);
            barrel.rotation.z = Math.random() * 0.2;
            barrel.castShadow = true; barrel.receiveShadow = true;
            this.scene.add(barrel);

            // Bands
            for (let by of [0.15, h - 0.15]) {
                const band = new THREE.Mesh(
                    new THREE.TorusGeometry(r2 + 0.02, 0.05, 4, 8), barrelBands
                );
                band.position.set(x, by, z); band.rotation.x = Math.PI / 2;
                this.scene.add(band);
            }

            // Stack some barrels (20% chance)
            if (Math.random() > 0.8) {
                const stack = new THREE.Mesh(new THREE.CylinderGeometry(r2 * 0.9, r2 * 0.9, h * 0.8, 8), barrelMat);
                stack.position.set(x + (Math.random() - 0.5), h + h * 0.4, z + (Math.random() - 0.5));
                stack.castShadow = true;
                this.scene.add(stack);
            }
        }
    }

    buildRockFormations() {
        const rockMat = new THREE.MeshStandardMaterial({ color: COLOR.stone, roughness: 0.9 });

        // === 60 ROCK FORMATIONS ===
        for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * (this.arenaRadius - 60);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const s = 1 + Math.random() * 3;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
            rock.position.set(x, s * 0.4, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true; rock.receiveShadow = true;
            this.scene.add(rock);
        }

        // === 20 LARGE ROCK CLUSTERS ===
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * (this.arenaRadius - 80);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            for (let j = 0; j < 3; j++) {
                const cluster = new THREE.Mesh(
                    new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.5, 0),
                    rockMat
                );
                cluster.position.set(
                    x + (Math.random() - 0.5) * 3,
                    0.5,
                    z + (Math.random() - 0.5) * 3
                );
                cluster.rotation.set(Math.random(), Math.random(), Math.random());
                cluster.castShadow = true;
                this.scene.add(cluster);
            }
        }
    }

    buildFenceLines() {
        const fenceMat = new THREE.MeshStandardMaterial({ color: COLOR.fenceWood, roughness: 0.9 });

        // === 30 fence sections scattered in open areas ===
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * (this.arenaRadius - 90);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const fenceLen = 2 + Math.random() * 4;

            // Posts
            for (let p = 0; p <= 2; p++) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 5), fenceMat);
                post.position.set(
                    x + (p / 2 - 0.5) * fenceLen,
                    0.75,
                    z
                );
                post.castShadow = true;
                this.scene.add(post);
            }
            // Rails
            for (const height of [0.5, 1.0]) {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(fenceLen, 0.08, 0.08), fenceMat);
                rail.position.set(x, height, z);
                rail.rotation.y = Math.random() * Math.PI;
                this.scene.add(rail);
            }
        }
    }

    buildDebrisField() {
        const debrisMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });

        // === 40 debris pieces ===
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * (this.arenaRadius - 80);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const size = 0.3 + Math.random() * 1;
            const debris = new THREE.Mesh(
                new THREE.BoxGeometry(size, 0.1, size * (0.5 + Math.random())),
                debrisMat
            );
            debris.position.set(x, 0.05, z);
            debris.rotation.y = Math.random() * Math.PI;
            debris.receiveShadow = true;
            this.scene.add(debris);
        }
    }

    buildSupplyDrops() {
        const dropMat = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.8 });

        // === 15 AIRDROP CRATES (larger, with parachute marks) ===
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * (this.arenaRadius - 80);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            // Large crate
            const crate = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), dropMat);
            crate.position.set(x, 1, z);
            crate.castShadow = true; crate.receiveShadow = true;
            this.scene.add(crate);

            // Markings (white cross)
            const markMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
            const hBar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.15), markMat);
            hBar.position.set(x, 2.01, z); this.scene.add(hBar);
            const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2), markMat);
            vBar.position.set(x, 2.01, z); this.scene.add(vBar);

            // Extra supply crates nearby
            for (let j = 0; j < 2; j++) {
                const sideCrate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), dropMat);
                const sa = Math.random() * Math.PI * 2;
                sideCrate.position.set(x + Math.cos(sa) * 3, 0.75, z + Math.sin(sa) * 3);
                sideCrate.rotation.y = Math.random() * Math.PI;
                sideCrate.castShadow = true;
                this.scene.add(sideCrate);
            }
        }
    }

    buildWatchtowers() {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.8 });

        // === 8 WATCHTOWERS in strategic outer positions ===
        const towerPositions = [
            { x: -120, z: -120 }, { x: 120, z: -120 },
            { x: -120, z: 120 }, { x: 120, z: 120 },
            { x: 0, z: -170 }, { x: 170, z: 0 },
            { x: 0, z: 170 }, { x: -170, z: 0 },
        ];

        for (const tp of towerPositions) {
            const { x, z } = tp;
            const tw = 3, th = 10;

            // Support pillars (4)
            for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
                const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, th, 6), woodMat);
                pillar.position.set(x + px, th / 2, z + pz);
                pillar.castShadow = true;
                this.scene.add(pillar);
            }

            // Platform
            const platform = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.3, tw), woodMat);
            platform.position.set(x, th, z);
            platform.castShadow = true; platform.receiveShadow = true;
            this.scene.add(platform);

            // Roof
            const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 2.5, 4), roofMat);
            roof.position.set(x, th + 1.5, z);
            roof.rotation.y = Math.PI / 4;
            roof.castShadow = true;
            this.scene.add(roof);

            // Rail
            const railMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), railMat);
                post.position.set(x + Math.cos(a) * 1.4, th + 0.65, z + Math.sin(a) * 1.4);
                this.scene.add(post);
            }

            // Colliders for tower base
            this.colliders.push({
                type: 'cylinder',
                position: new THREE.Vector3(x, th / 2, z),
                radius: 2, height: th
            });
        }
    }

    buildBiomeBoundaries() {
        // Removed: no visual junk at biome edges
    }

    setupAnimations() {
        for (const obj of this.animatedObjects) {
            switch (obj.type) {
                case 'forcefield':
                    obj.update = () => {
                        const t = Date.now() * 0.001;
                        obj.material.opacity = obj.baseOpacity + Math.sin(t * 2) * 0.1;
                        obj.material.emissiveIntensity = obj.baseEmissive + Math.sin(t * 3) * 0.3;
                    };
                    break;
                case 'cornucopiaGlow':
                    obj.update = () => {
                        const t = Date.now() * 0.002;
                        obj.mesh.material.emissiveIntensity = 1.5 + Math.sin(t);
                        obj.light.intensity = 2 + Math.sin(t) * 1.5;
                        obj.mesh.scale.setScalar(1 + Math.sin(t * 2) * 0.1);
                    };
                    break;
                case 'crystalGlow': case 'pondGlow':
                    obj.update = () => {
                        const t = Date.now() * 0.001;
                        obj.light.intensity = obj.baseIntensity + Math.sin(t * 0.5) * 0.5;
                    };
                    break;
                case 'treeGlow':
                    obj.update = () => {
                        const t = Date.now() * 0.003;
                        obj.light.intensity = obj.baseIntensity * (0.7 + Math.sin(t) * 0.3);
                    };
                    break;
                case 'lavaGlow':
                    obj.update = () => {
                        const t = Date.now() * 0.004;
                        obj.light.intensity = obj.baseIntensity + Math.sin(t) * 0.8 + Math.sin(t * 1.7) * 0.3;
                    };
                    break;
                case 'lanternGlow':
                    obj.update = () => {
                        const t = Date.now() * 0.005;
                        obj.light.intensity = obj.baseIntensity + Math.sin(t * 2) * 0.5;
                    };
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
    getFloorTiles() { return this.floorTiles; }
    getSpawnPads() { return this.spawnPads; }
    getHouseSpots() { return this.houseSpots; }
    getSpawnWorld() { return { x: 0, z: 0 }; }
    getChestSpots() { return this.chestSpots; }
    getColliders() { return this.colliders; }
    getStoryPOIs() { return this.storyPOIs; }
    getPropMeshes() { return this.propMeshes; }
    getLeafMeshes() { return this.leafMeshes; }
    getSmallPropMeshes() { return this.smallPropMeshes; }
    getClimbables() { return this.climbables; }
    getTraps() { return []; }
    getFogZones() { return []; }
    getSlowZones() { return []; }
    getRadiationZones() { return []; }
    getLavaPatches() { return []; }
    getExplosiveBarrelSpots() { return []; }
    getVerticalCoverSpots() { return []; }
    getOneWayGates() { return []; }
    getWaterPatches() { return []; }
    getZoneMix(x, z) { return 0; }
    getBiomeSectors() { return []; }
    getSurfaceTheme() { return 'mixed'; }

    generateHeightMap() {
        const size = 512;
        const res = 128;
        const step = size / res;
        this.heightMap = Array.from({ length: res + 1 }, () => new Float32Array(res + 1));
        const amplitude = 15;
        const scale = 0.01;
        for (let i = 0; i <= res; i++) {
            for (let j = 0; j <= res; j++) {
                const x = (i - res / 2) * step;
                const z = (j - res / 2) * step;
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
        let i = (x + size / 2) / step;
        let j = (z + size / 2) / step;
        i = Math.max(0, Math.min(res, i));
        j = Math.max(0, Math.min(res, j));
        const i0 = Math.floor(i), j0 = Math.floor(j);
        const i1 = Math.min(res, i0 + 1), j1 = Math.min(res, j0 + 1);
        const dx = i - i0, dz = j - j0;
        const h00 = this.heightMap[i0][j0];
        const h10 = this.heightMap[i1][j0];
        const h01 = this.heightMap[i0][j1];
        const h11 = this.heightMap[i1][j1];
        return (1 - dx) * (1 - dz) * h00 + dx * (1 - dz) * h10 + (1 - dx) * dz * h01 + dx * dz * h11;
    }
}
