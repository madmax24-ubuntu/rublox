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

// ============ TEXTURE GENERATOR ============
class TextureGenerator {
    static createTerrainTexture(width, height, baseColor, variationFn, noise, opts = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(width, height);
        const r0 = (baseColor >> 16) & 0xff;
        const g0 = (baseColor >> 8) & 0xff;
        const b0 = baseColor & 0xff;
        const detailOctaves = opts.detailOctaves || 6;
        const detailScale = opts.detailScale || 48; // 2x higher frequency for sharper patterns
        const hasDetail = opts.hasDetail || false;
        const speckleStrength = opts.speckleStrength || 24;

        // Multi-pass noise for rich, sharp detail (same algorithm as original)
        for (let y = 0; y < height; y++) {
            const wy = y / height * detailScale;
            for (let x = 0; x < width; x++) {
                const wx = x / width * detailScale;
                const n = noise.fbm(wx, wy, detailOctaves, 2.0, 0.5);
                const n2 = noise.fbm(wx * 0.5 + 100, wy * 0.5 + 100, 3, 2.0, 0.5);
                const n3 = noise.fbm(wx * 2 + 200, wy * 2 + 200, 3, 2.0, 0.5);
                const v = variationFn(n, n2, n3, x / width, y / height);

                const idx = (y * width + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r0 + v.r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g0 + v.g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b0 + v.b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        // 3x3 convolution sharpen filter for crisp edges
        const src = new Uint8ClampedArray(imgData.data);
        const sharpenKernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    let ki = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const idx = ((y + dy) * width + (x + dx)) * 4 + c;
                            sum += src[idx] * sharpenKernel[ki];
                            ki++;
                        }
                    }
                    const center = src[(y * width + x) * 4 + c];
                    const avg = center * 8;
                    const sharpened = center + (center - avg) * (opts.sharpenAmount || 0.3);
                    imgData.data[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, sharpened | 0));
                }
            }
        }

        // Sparse grain for realistic texture
        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const brightness = (Math.random() - 0.5) * speckleStrength;
                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        const idx = ((y + dy) * width + (x + dx)) * 4;
                        imgData.data[idx]     = Math.max(0, Math.min(255, imgData.data[idx] + brightness));
                        imgData.data[idx + 1] = Math.max(0, Math.min(255, imgData.data[idx + 1] + brightness));
                        imgData.data[idx + 2] = Math.max(0, Math.min(255, imgData.data[idx + 2] + brightness));
                    }
                }
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 1);
        return tex;
    }

    static createWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const r0 = 93, g0 = 64, b0 = 55;
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 64; x++) {
                const n = Math.sin(y * 0.15 + Math.sin(x * 0.3) * 2) * 10;
                const grain = Math.sin((y + n) * 0.2) * 8;
                const idx = (y * 64 + x) * 4;
                ctx.fillStyle = `rgb(${r0 + grain}, ${g0 + grain - 5}, ${b0 + grain - 10})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        return new THREE.CanvasTexture(canvas);
    }

    static createStoneTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const noise = new SimplexNoise(42);
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const n = noise.fbm(x / 64, y / 64, 4, 2.0, 0.5);
                const n2 = noise.fbm(x / 32 + 50, y / 32 + 50, 3, 2.0, 0.5);
                const v = (n + n2) * 30;
                const base = 107;
                ctx.fillStyle = `rgb(${base + v}, ${base + v}, ${base + v})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        return new THREE.CanvasTexture(canvas);
    }

    static createSnowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const noise = new SimplexNoise(77);
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const n = noise.fbm(x / 80, y / 80, 4, 2.0, 0.5);
                const v = n * 20;
                const base = 240;
                ctx.fillStyle = `rgb(${base + v}, ${base + v - 2}, ${base + v - 4})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        return new THREE.CanvasTexture(canvas);
    }

    static createSandTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const noise = new SimplexNoise(99);
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const n = noise.fbm(x / 40, y / 40, 3, 2.0, 0.5);
                const n2 = noise.fbm(x / 20 + 100, y / 20 + 100, 2, 2.0, 0.5);
                const v = (n + n2 * 0.5) * 25;
                const r = 195 + v;
                const g = 175 + v;
                const b = 130 + v;
                ctx.fillStyle = `rgb(${r|0}, ${g|0}, ${b|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        return new THREE.CanvasTexture(canvas);
    }

    static createWaterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const noise = new SimplexNoise(123);
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const n = noise.fbm(x / 50, y / 50, 3, 2.0, 0.5);
                const wave = Math.sin(x * 0.05 + n * 3) * 15;
                const r = 30 + n * 20 + wave;
                const g = 120 + n * 40 + wave;
                const b = 180 + n * 30;
                ctx.fillStyle = `rgb(${r|0}, ${g|0}, ${b|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    static createRoofTexture(baseColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const r0 = (baseColor >> 16) & 0xff;
        const g0 = (baseColor >> 8) & 0xff;
        const b0 = baseColor & 0xff;
        // Tile pattern
        for (let y = 0; y < 128; y++) {
            for (let x = 0; x < 128; x++) {
                const tileX = Math.floor(x / 16);
                const tileY = Math.floor(y / 16);
                const offset = (tileY % 2) * 8;
                const inRow = ((x + offset) % 16);
                const edge = (inRow < 1 || inRow > 14) ? 15 : 0;
                const variant = ((x * 7 + y * 13) % 20) - 10;
                const r = Math.max(0, Math.min(255, r0 + variant + edge * 20));
                const g = Math.max(0, Math.min(255, g0 + variant + edge * 20));
                const b = Math.max(0, Math.min(255, b0 + variant + edge * 20));
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    static createBrickTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const brickH = 12, brickW = 24;
        for (let y = 0; y < 128; y++) {
            for (let x = 0; x < 128; x++) {
                const row = Math.floor(y / brickH);
                const offset = (row % 2) * (brickW / 2);
                const bx = Math.floor((x + offset) / brickW);
                const by = Math.floor(y / brickH);
                const isMortar = (x % brickW < 1) || (y % brickH < 1);
                if (isMortar) {
                    ctx.fillStyle = '#888';
                } else {
                    const v = ((bx * 3 + by * 7) % 30) - 15;
                    ctx.fillStyle = `rgb(${160 + v}, ${70 + v}, ${40 + v})`;
                }
                ctx.fillRect(x, y, 1, 1);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    static createRoadTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const noise = new SimplexNoise(55);
        // Base asphalt - brighter, more visible
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const n = noise.fbm(x / 20, y / 20, 4, 2.0, 0.5);
                const n2 = noise.fbm(x / 10 + 50, y / 10 + 50, 3, 2.0, 0.5);
                const v = (n + n2 * 0.5) * 15;
                const base = 130;
                ctx.fillStyle = `rgb(${base + v|0}, ${base + v - 3|0}, ${base + v - 8|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Tire tracks (darker streaks along edges)
        ctx.fillStyle = 'rgba(60,55,50,0.25)';
        ctx.fillRect(10, 0, 20, 256);
        ctx.fillRect(226, 0, 20, 256);
        // Road edge lines (solid white)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(6, 0); ctx.lineTo(6, 256);
        ctx.moveTo(250, 0); ctx.lineTo(250, 256);
        ctx.stroke();
        // Center dashed line (yellow-white)
        ctx.strokeStyle = 'rgba(240,230,180,0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 20]);
        ctx.beginPath();
        ctx.moveTo(128, 0); ctx.lineTo(128, 256);
        ctx.stroke();
        ctx.setLineDash([]);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    static createConcreteTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const noise = new SimplexNoise(55);
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const n = noise.fbm(x / 60, y / 60, 3, 2.0, 0.5);
                const base = 140 + n * 30;
                ctx.fillStyle = `rgb(${base|0}, ${base|0}, ${base + 5|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    static createBrickTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        // Base mortar color
        ctx.fillStyle = '#8a7a6a';
        ctx.fillRect(0, 0, 256, 256);
        const brickH = 16;
        const brickW = 32;
        const mortarColor = '#7a6a5a';
        // Draw brick rows
        for (let row = -1; row < 256 / brickH + 1; row++) {
            const isOddRow = row % 2 !== 0;
            const offset = isOddRow ? brickW / 2 : 0;
            for (let col = -1; col < 256 / brickW + 2; col++) {
                const bx = col * brickW + offset;
                const by = row * brickH;
                // Brick color variation
                const r = 160 + Math.random() * 40 - 20;
                const g = 70 + Math.random() * 30 - 15;
                const b = 50 + Math.random() * 25 - 12;
                ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
                ctx.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);
            }
        }
        // Mortar lines
        ctx.strokeStyle = mortarColor;
        ctx.lineWidth = 2;
        for (let row = 0; row <= 256; row += brickH) {
            ctx.beginPath();
            ctx.moveTo(0, row);
            ctx.lineTo(256, row);
            ctx.stroke();
        }
        for (let row = 0; row < 256; row += brickH) {
            const isOddRow = (row / brickH) % 2 !== 0;
            const offset = isOddRow ? brickW / 2 : 0;
            for (let col = -1; col <= 256 / brickW + 1; col++) {
                const x = col * brickW + offset;
                ctx.beginPath();
                ctx.moveTo(x, row);
                ctx.lineTo(x, row + brickH);
                ctx.stroke();
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(8, 2);
        return tex;
    }
}

// ============ MAP GENERATOR ============
export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.tileSize = 4;
        this.mapSize = 512;
        this.halfSize = 256;
        this.colliders = [];
        this.floorTiles = [];
        this.spawnPads = [];
        this.chestSpots = [];
        this.houseSpots = [];
        this.textures = {};
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
        this.noise = new SimplexNoise(42);
        this.ready = new Promise(resolve => { this._resolveReady = resolve; });
    }

   async startGeneration() {
        await this.generate();
    }

    async generate() {
        this.generateHeightMap();
        // Pre-generate all textures (reduced sizes for performance)
       this.textures.forestGround = TextureGenerator.createTerrainTexture(
            512, 512, 0x3a7a2e,
            (n, n2, n3) => ({
                r: n * 35 + n3 * 12,
                g: n * 50 + n2 * 25 + 15,
                b: n * 20 + n3 * 8
            }),
            this.noise,
            { detailOctaves: 6, detailScale: 48, sharpenAmount: 0.35 }
        );
         await this.yieldFrame();
        this.textures.stoneGround = TextureGenerator.createTerrainTexture(
            512, 512, 0x7a7a7a,
            (n, n2, n3) => ({
                r: n * 40 + n3 * 15,
                g: n * 40 + n3 * 15,
                b: n * 45 + n3 * 10
            }),
            this.noise,
            { detailOctaves: 6, detailScale: 52, sharpenAmount: 0.4 }
        );
        await this.yieldFrame();
        this.textures.militaryGround = TextureGenerator.createTerrainTexture(
            512, 512, 0x6b6b4a,
            (n, n2, n3) => ({
                r: n * 30 + n2 * 18 + n3 * 10,
                g: n * 25 + n2 * 15 + n3 * 8,
                b: n * 15 + n3 * 5
            }),
            this.noise,
            { detailOctaves: 6, detailScale: 44, sharpenAmount: 0.35 }
        );
       await this.yieldFrame();
        this.textures.snowGround = TextureGenerator.createTerrainTexture(
            512, 512, 0xf0f0f0,
            (n, n2, n3) => ({
                r: n * 20 + n3 * 8,
                g: n * 18 + n3 * 6,
                b: n * 22 + n3 * 10
            }),
            this.noise,
            { detailOctaves: 6, detailScale: 46, sharpenAmount: 0.25 }
        );
     await this.yieldFrame();
        this.textures.wood = TextureGenerator.createWoodTexture();
        this.textures.stone = TextureGenerator.createStoneTexture();
        this.textures.snow = TextureGenerator.createSnowTexture();
        this.textures.sand = TextureGenerator.createSandTexture();
        this.textures.water = TextureGenerator.createWaterTexture();
        this.textures.brick = TextureGenerator.createBrickTexture();
        this.textures.concrete = TextureGenerator.createConcreteTexture();
        this.textures.road = TextureGenerator.createRoadTexture();
       await this.yieldFrame();

      // 1. Center platform
        this.buildCenterPlatform();
     await this.yieldFrame();

     // 2. Roads from center to each biome
        this.buildRoads();
     await this.yieldFrame();

        // 3. Forest biome (northwest)
        this.buildForestBiome();
      await this.yieldFrame();

        // 4. Stone biome (northeast)
        this.buildStoneMazeBiome();
       await this.yieldFrame();

        // 5. Military biome (southwest)
        this.buildMilitaryBiome();
        await this.yieldFrame();

        // 6. Snow biome (southeast)
        this.buildSnowBiome();
        await this.yieldFrame();

        // 7. Props across all biomes
        this.buildProps();
     await this.yieldFrame();

        // 7.5. Biome boundaries (clear separation walls)
        this.buildBiomeBoundaries();

        // 7.6. Fill gaps between biome grounds and boundary walls
        this.fillBoundaryGaps();

        // 8. Animate water/fire
        this.setupAnimations();

       // Disable frustum culling on all map objects
        this.scene.traverse(obj => {
            if (obj.isMesh || obj.isGroup || obj.isInstancedMesh) {
                obj.userData.mapGenerated = true;
                obj.frustumCulled = false;
            }
        });

        // Build boundary walls at map edge
        this.buildMapBoundaries();

        this._resolveReady();
    }

    yieldFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    // ========== CENTER PLATFORM ==========
    async buildCenterPlatform() {
        const radius = 56;

        // Flat circular platform at ground level (same Y as biome ground)
        const platGeo = new THREE.CylinderGeometry(radius, radius, 0.4, 32);
        const platTex = TextureGenerator.createTerrainTexture(512, 512, 0xc9b99a,
            (n) => ({ r: n * 25, g: n * 20, b: n * 15 }),
          this.noise, { detailOctaves: 6, detailScale: 48, sharpenAmount: 0.3 }
        );
        const platMat = new THREE.MeshStandardMaterial({
            map: platTex, roughness: 0.8, flatShading: false
        });
        const platform = new THREE.Mesh(platGeo, platMat);
        platform.position.set(0, 1.4, 0);
        platform.receiveShadow = true;
        platform.castShadow = true;
        this.scene.add(platform);

        // Platform top surface
        const topGeo = new THREE.CylinderGeometry(radius - 2, radius - 2, 0.05, 32);
        const topMat = new THREE.MeshStandardMaterial({
            color: 0xd4c4a0, roughness: 0.7
        });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.set(0, 1.63, 0);
        top.receiveShadow = true;
        this.scene.add(top);

        // Platform edge ring (decorative)
        const edgeGeo = new THREE.TorusGeometry(radius + 4, 0.6, 12, 32);
        const edgeMat = new THREE.MeshStandardMaterial({
            color: 0xb9a98a, roughness: 0.85
        });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(0, 1.6, 0);
        edge.receiveShadow = true;
        this.scene.add(edge);

        // === FULL MAP BASE GROUND — covers entire -256..256 area ===
        // Bottom layer, visible where no biome ground is placed on top
        const baseGroundMat = new THREE.MeshStandardMaterial({
            map: this.textures.forestGround || new THREE.MeshStandardMaterial({ color: 0x6a5a4a }),
            roughness: 0.95, flatShading: false
        });
        const baseGround = new THREE.Mesh(
            new THREE.PlaneGeometry(512, 512, 16, 16),
            baseGroundMat
        );
        baseGround.rotation.x = -Math.PI / 2;
        baseGround.position.set(0, 1.54, 0);
        baseGround.receiveShadow = true;
        this.scene.add(baseGround);

        // === GAP FILLS between biome quadrants — above biome ground ===
        const centerGapMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood || new THREE.MeshStandardMaterial({ color: 0x6a5a4a }),
            roughness: 0.95, flatShading: false
        });
        // North gap (X: -60..60, Z: -256..-60)
        let g = new THREE.Mesh(new THREE.PlaneGeometry(120, 196, 8, 8), centerGapMat);
        g.rotation.x = -Math.PI / 2; g.position.set(0, 1.57, -158); g.receiveShadow = true; this.scene.add(g);
        // South gap (X: -60..60, Z: 60..256)
        g = new THREE.Mesh(new THREE.PlaneGeometry(120, 196, 8, 8), centerGapMat);
        g.rotation.x = -Math.PI / 2; g.position.set(0, 1.57, 158); g.receiveShadow = true; this.scene.add(g);
        // West gap (X: -256..-60, Z: -60..60)
        g = new THREE.Mesh(new THREE.PlaneGeometry(196, 120, 8, 8), centerGapMat);
        g.rotation.x = -Math.PI / 2; g.position.set(-158, 1.57, 0); g.receiveShadow = true; this.scene.add(g);
        // East gap (X: 60..256, Z: -60..60)
        g = new THREE.Mesh(new THREE.PlaneGeometry(196, 120, 8, 8), centerGapMat);
        g.rotation.x = -Math.PI / 2; g.position.set(158, 1.57, 0); g.receiveShadow = true; this.scene.add(g);

        // Spawn pads around platform edge
        const spawnAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        const platSurfaceY = 1.63;
        spawnAngles.forEach((angle, i) => {
            const r = 60 + i * 1.5;
            this.spawnPads.push({
                x: Math.cos(angle) * r,
                y: platSurfaceY,
                z: Math.sin(angle) * r,
                radius: 3
            });
        });

        // Floor tiles for center platform
        for (let i = 0; i < 120; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 50;
            this.floorTiles.push({
                x: Math.cos(angle) * r,
                z: Math.sin(angle) * r,
                size: this.tileSize
            });
        }

        // === FILL DIAGONAL GAPS between circular platform and square biome grounds ===
        this.fillDiagonalGround();

        // === DECORATIVE LANTERNS around the platform ===
        // this.buildPlatformLanterns(); // DISABLED - too many objects

        // === FLOWER BEDS around the platform edge ===
        // this.buildFlowerBeds(); // STUB

        // === DECORATIVE PATHS from platform to roads ===
        // this.buildDecorativePaths(); // STUB

          // === GOLDEN HORN (CORNUCOPIA) ===
        this.buildFountain();
        await this.yieldFrame();
    }

    buildPlatformLanterns() {
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.5,
            metalness: 0.6
        });
        const lightMat = new THREE.MeshStandardMaterial({
            color: 0xffeecc,
            emissive: 0xffddaa,
            emissiveIntensity: 0.6,
            roughness: 0.2
        });

        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const r = 55;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            const lanternGroup = new THREE.Group();

            // Post
            const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 4, 6);
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.y = 2;
            lanternGroup.add(post);

            // Lamp housing
            const housingGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.6, 8);
            const housing = new THREE.Mesh(housingGeo, postMat);
            housing.position.y = 4.3;
            lanternGroup.add(housing);

            // Light
            const lightGeo = new THREE.SphereGeometry(0.3, 6, 6);
            const light = new THREE.Mesh(lightGeo, lightMat);
            light.position.y = 4.2;
            lanternGroup.add(light);

            // Lamp top cap
            const capGeo = new THREE.ConeGeometry(0.5, 0.4, 8);
            const cap = new THREE.Mesh(capGeo, postMat);
            cap.position.y = 4.8;
            lanternGroup.add(cap);

            lanternGroup.position.set(x, 3, z);
            this.scene.add(lanternGroup);
        }
    }


    // ========== CENTER FOUNTAIN ==========
buildFountain() {
        // === GOLDEN HORN (CORNUCOPIA) ===
        // Main pool base - sits on platform surface (Y=1.63)
        const poolGeo = new THREE.CylinderGeometry(12, 14, 1, 16);
        const poolMat = new THREE.MeshStandardMaterial({
            color: 0xdaa520,
            metalness: 0.8,
            roughness: 0.2
        });
        const pool = new THREE.Mesh(poolGeo, poolMat);
        pool.position.set(0, 2.13, 0);
        pool.receiveShadow = true;
        this.scene.add(pool);

        // Water in pool
        const waterGeo = new THREE.CylinderGeometry(5.5, 6.5, 0.3, 16);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x4fc3ff,
            transparent: true,
            opacity: 0.7,
            roughness: 0.1,
            metalness: 0.3
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.set(0, 2.18, 0);
        water.userData.type = 'fountainWater';
        this.scene.add(water);

        // Central pillar
        const pillarGeo = new THREE.CylinderGeometry(0.8, 1.0, 3, 8);
        const pillar = new THREE.Mesh(pillarGeo, poolMat);
        pillar.position.set(0, 4.13, 0);
        pillar.castShadow = true;
        this.scene.add(pillar);

        // Top sphere
        const topSphereGeo = new THREE.SphereGeometry(1.2, 8, 8);
        const topSphereMat = new THREE.MeshStandardMaterial({
            color: 0xdaa520,
            metalness: 0.8,
            roughness: 0.2
        });
        const topSphere = new THREE.Mesh(topSphereGeo, topSphereMat);
        topSphere.position.set(0, 6.13, 0);
        topSphere.castShadow = true;
        this.scene.add(topSphere);

        // Water particles (small spheres spraying up)
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            const particleGeo = new THREE.SphereGeometry(0.15, 4, 4);
            const particleMat = new THREE.MeshStandardMaterial({
                color: 0x87ceeb,
                transparent: true,
                opacity: 0.6,
                roughness: 0.1
            });
            const particle = new THREE.Mesh(particleGeo, particleMat);
            particle.position.set(
                Math.cos(angle) * 1.5,
                9.13 + Math.random() * 2,
                Math.sin(angle) * 1.5
            );
            particle.userData.type = 'fountainParticle';
            particle.userData.angle = angle;
            particle.userData.baseY = 9.13 + Math.random() * 2;
            this.scene.add(particle);
        }

        // Floor tiles around fountain
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 8 + Math.random() * 15;
            this.floorTiles.push({
                x: Math.cos(angle) * r,
                z: Math.sin(angle) * r,
                size: this.tileSize
            });
        }

        // Spawn pads around fountain
        const spawnAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        spawnAngles.forEach((angle, i) => {
            const r = 12 + i;
            this.spawnPads.push({
                x: Math.cos(angle) * r,
                y: 3.5,
                z: Math.sin(angle) * r,
                radius: 3
            });
        });
    }

    buildMapBoundaries() {
        // === HIGH BRICK FENCE around entire map boundary ===
        const fenceMat = new THREE.MeshStandardMaterial({
            map: this.textures.brick,
            color: 0x8b4513,
            roughness: 0.95
        });

        const wallSize = 256;
        const fenceHeight = 10; // Tall brick fence

        // North wall
        const northGeo = new THREE.BoxGeometry(wallSize * 2, fenceHeight, 1.5);
        const north = new THREE.Mesh(northGeo, fenceMat);
        north.position.set(0, fenceHeight / 2, -wallSize);
        north.receiveShadow = true;
        this.scene.add(north);

        // South wall
        const south = new THREE.Mesh(northGeo, fenceMat);
        south.position.set(0, fenceHeight / 2, wallSize);
        south.receiveShadow = true;
        this.scene.add(south);

        // East wall
        const sideGeo = new THREE.BoxGeometry(1.5, fenceHeight, wallSize * 2);
        const east = new THREE.Mesh(sideGeo, fenceMat);
        east.position.set(wallSize, fenceHeight / 2, 0);
        east.receiveShadow = true;
        this.scene.add(east);

        // West wall
        const west = new THREE.Mesh(sideGeo, fenceMat);
        west.position.set(-wallSize, fenceHeight / 2, 0);
        west.receiveShadow = true;
        this.scene.add(west);

        // Fence top crenellation (brick ledge on top)
        const ledgeMat = new THREE.MeshStandardMaterial({
            map: this.textures.brick,
            color: 0x6b3410,
            roughness: 0.9
        });
        const ledgeH = 0.8;
        // North ledge
        const nLedge = new THREE.Mesh(new THREE.BoxGeometry(wallSize * 2 + 1, ledgeH, 2.5), ledgeMat);
        nLedge.position.set(0, fenceHeight + ledgeH / 2, -wallSize);
        nLedge.castShadow = true;
        this.scene.add(nLedge);
        // South ledge
        const sLedge = new THREE.Mesh(new THREE.BoxGeometry(wallSize * 2 + 1, ledgeH, 2.5), ledgeMat);
        sLedge.position.set(0, fenceHeight + ledgeH / 2, wallSize);
        sLedge.castShadow = true;
        this.scene.add(sLedge);
        // East ledge
        const eLedge = new THREE.Mesh(new THREE.BoxGeometry(2.5, ledgeH, wallSize * 2 + 1), ledgeMat);
        eLedge.position.set(wallSize, fenceHeight + ledgeH / 2, 0);
        eLedge.castShadow = true;
        this.scene.add(eLedge);
        // West ledge
        const wLedge = new THREE.Mesh(new THREE.BoxGeometry(2.5, ledgeH, wallSize * 2 + 1), ledgeMat);
        wLedge.position.set(-wallSize, fenceHeight + ledgeH / 2, 0);
        wLedge.castShadow = true;
        this.scene.add(wLedge);

        // Corner towers (brick, matching fence)
        const towerGeo = new THREE.CylinderGeometry(3, 3.5, fenceHeight + 4, 8);
        const towerTopGeo = new THREE.ConeGeometry(3.5, 4, 8);
        const towerMat = new THREE.MeshStandardMaterial({
            map: this.textures.brick,
            color: 0x6b3410,
            roughness: 0.95
        });

        const corners = [
            { x: -wallSize, z: -wallSize },
            { x: wallSize, z: -wallSize },
            { x: wallSize, z: wallSize },
            { x: -wallSize, z: wallSize }
        ];

        corners.forEach(corner => {
            const towerGroup = new THREE.Group();

            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.position.y = (fenceHeight + 4) / 2;
            tower.castShadow = true;
            towerGroup.add(tower);

            const top = new THREE.Mesh(towerTopGeo, towerMat);
            top.position.y = fenceHeight + 4;
            top.castShadow = true;
            towerGroup.add(top);

            towerGroup.position.set(corner.x, 0, corner.z);
            this.scene.add(towerGroup);
        });

        // Gate towers at road entrances (one per biome)
        const gatePositions = [
            { x: 0, z: -wallSize, ry: 0 },    // North gate (forest)
            { x: 0, z: wallSize, ry: 0 },     // South gate (military)
            { x: wallSize, z: 0, ry: Math.PI / 2 },  // East gate (snow)
            { x: -wallSize, z: 0, ry: Math.PI / 2 }   // West gate (stone)
        ];

        gatePositions.forEach(gate => {
            const gateGroup = new THREE.Group();

            // Left pillar
            const pillarGeo = new THREE.CylinderGeometry(0.8, 1, fenceHeight, 8);
            const pillarMat = new THREE.MeshStandardMaterial({
                map: this.textures.brick,
                color: 0x8b4513,
                roughness: 0.95
            });

            const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
            leftPillar.position.set(-3, fenceHeight / 2, 0);
            leftPillar.castShadow = true;
            gateGroup.add(leftPillar);

            // Right pillar
            const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
            rightPillar.position.set(3, fenceHeight / 2, 0);
            rightPillar.castShadow = true;
            gateGroup.add(rightPillar);

            // Top beam
            const beamGeo = new THREE.BoxGeometry(7, 1, 1.5);
            const beam = new THREE.Mesh(beamGeo, pillarMat);
            beam.position.set(0, fenceHeight + 0.5, 0);
            beam.castShadow = true;
            gateGroup.add(beam);

            // Decorative top
            const topGeo = new THREE.BoxGeometry(8, 1.5, 2);
            const top = new THREE.Mesh(topGeo, pillarMat);
            top.position.set(0, fenceHeight + 2, 0);
            top.castShadow = true;
            gateGroup.add(top);

            gateGroup.position.set(gate.x, 0, gate.z);
            gateGroup.rotation.y = gate.ry;
            this.scene.add(gateGroup);
        });
    }

    // ========== BIOME BOUNDARIES (clear separation walls) ==========
    buildBiomeBoundaries() {
        const wallMat = new THREE.MeshStandardMaterial({
            map: this.textures.brick,
            color: 0x6b5a4a,
            roughness: 0.95
        });

        // === BIOME BOUNDARY WALLS (just outside center platform, radius ~56) ===
        // Walls at ±60 from center with gaps for path entrances
        const BOUNDARY = 60;
        const WALL_H = 10;
        const GAP = 12; // Path entrance gap width

        // === NORTH boundary (Z = -60) — separates Stone biome (NE) from center ===
        // Left segment: X from -60 to -GAP
        let wall = new THREE.Mesh(new THREE.BoxGeometry(BOUNDARY - GAP, WALL_H, 3), wallMat);
        wall.position.set(-(BOUNDARY + GAP) / 2, WALL_H / 2, -BOUNDARY);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(-(BOUNDARY + GAP) / 2, WALL_H / 2, -BOUNDARY), size: new THREE.Vector3(BOUNDARY - GAP, WALL_H, 3) });
        // Right segment: X from GAP to 60
        wall = new THREE.Mesh(new THREE.BoxGeometry(BOUNDARY - GAP, WALL_H, 3), wallMat);
        wall.position.set((GAP + BOUNDARY) / 2, WALL_H / 2, -BOUNDARY);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3((GAP + BOUNDARY) / 2, WALL_H / 2, -BOUNDARY), size: new THREE.Vector3(BOUNDARY - GAP, WALL_H, 3) });
        // Corner pillars
        for (const [px, pz] of [[-BOUNDARY, -BOUNDARY], [BOUNDARY, -BOUNDARY]]) {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 12, 8), wallMat);
            pillar.position.set(px, 6, pz);
            this.scene.add(pillar);
            this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(px, 6, pz), radius: 1, height: 12 });
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.6, 8), wallMat);
            cap.position.set(px, 12.3, pz);
            this.scene.add(cap);
        }

        // === SOUTH boundary (Z = 60) — separates Military biome (SW) from center ===
        // Left segment: X from -60 to -GAP
        wall = new THREE.Mesh(new THREE.BoxGeometry(BOUNDARY - GAP, WALL_H, 3), wallMat);
        wall.position.set(-(BOUNDARY + GAP) / 2, WALL_H / 2, BOUNDARY);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(-(BOUNDARY + GAP) / 2, WALL_H / 2, BOUNDARY), size: new THREE.Vector3(BOUNDARY - GAP, WALL_H, 3) });
        // Right segment: X from GAP to 60
        wall = new THREE.Mesh(new THREE.BoxGeometry(BOUNDARY - GAP, WALL_H, 3), wallMat);
        wall.position.set((GAP + BOUNDARY) / 2, WALL_H / 2, BOUNDARY);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3((GAP + BOUNDARY) / 2, WALL_H / 2, BOUNDARY), size: new THREE.Vector3(BOUNDARY - GAP, WALL_H, 3) });
        // Corner pillars
        for (const [px, pz] of [[-BOUNDARY, BOUNDARY], [BOUNDARY, BOUNDARY]]) {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 12, 8), wallMat);
            pillar.position.set(px, 6, pz);
            this.scene.add(pillar);
            this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(px, 6, pz), radius: 1, height: 12 });
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.6, 8), wallMat);
            cap.position.set(px, 12.3, pz);
            this.scene.add(cap);
        }

        // === WEST boundary (X = -60) — separates Forest biome (NW) from center ===
        // Top segment: Z from -60 to -GAP
        wall = new THREE.Mesh(new THREE.BoxGeometry(3, WALL_H, BOUNDARY - GAP), wallMat);
        wall.position.set(-BOUNDARY, WALL_H / 2, -(BOUNDARY + GAP) / 2);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(-BOUNDARY, WALL_H / 2, -(BOUNDARY + GAP) / 2), size: new THREE.Vector3(3, WALL_H, BOUNDARY - GAP) });
        // Bottom segment: Z from GAP to 60
        wall = new THREE.Mesh(new THREE.BoxGeometry(3, WALL_H, BOUNDARY - GAP), wallMat);
        wall.position.set(-BOUNDARY, WALL_H / 2, (GAP + BOUNDARY) / 2);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(-BOUNDARY, WALL_H / 2, (GAP + BOUNDARY) / 2), size: new THREE.Vector3(3, WALL_H, BOUNDARY - GAP) });
        // Corner pillars
        for (const [px, pz] of [[-BOUNDARY, -BOUNDARY], [-BOUNDARY, BOUNDARY]]) {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 12, 8), wallMat);
            pillar.position.set(px, 6, pz);
            this.scene.add(pillar);
            this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(px, 6, pz), radius: 1, height: 12 });
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.6, 8), wallMat);
            cap.position.set(px, 12.3, pz);
            this.scene.add(cap);
        }

        // === EAST boundary (X = 60) — separates Snow biome (SE) from center ===
        // Top segment: Z from -60 to -GAP
        wall = new THREE.Mesh(new THREE.BoxGeometry(3, WALL_H, BOUNDARY - GAP), wallMat);
        wall.position.set(BOUNDARY, WALL_H / 2, -(BOUNDARY + GAP) / 2);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(BOUNDARY, WALL_H / 2, -(BOUNDARY + GAP) / 2), size: new THREE.Vector3(3, WALL_H, BOUNDARY - GAP) });
        // Bottom segment: Z from GAP to 60
        wall = new THREE.Mesh(new THREE.BoxGeometry(3, WALL_H, BOUNDARY - GAP), wallMat);
        wall.position.set(BOUNDARY, WALL_H / 2, (GAP + BOUNDARY) / 2);
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(BOUNDARY, WALL_H / 2, (GAP + BOUNDARY) / 2), size: new THREE.Vector3(3, WALL_H, BOUNDARY - GAP) });
        // Corner pillars
        for (const [px, pz] of [[BOUNDARY, -BOUNDARY], [BOUNDARY, BOUNDARY]]) {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 12, 8), wallMat);
            pillar.position.set(px, 6, pz);
            this.scene.add(pillar);
            this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(px, 6, pz), radius: 1, height: 12 });
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.6, 8), wallMat);
            cap.position.set(px, 12.3, pz);
            this.scene.add(cap);
        }

        // === OUTER PERIMETER WALLS (map boundaries at ±256) ===
        const OUT_H = 10;
        const OP = 256;
        // North edge
        wall = new THREE.Mesh(new THREE.BoxGeometry(512, OUT_H, 3), wallMat);
        wall.position.set(0, OUT_H / 2, -OP); wall.castShadow = true; wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, OUT_H / 2, -OP), size: new THREE.Vector3(512, OUT_H, 3) });
        // South edge
        wall = new THREE.Mesh(new THREE.BoxGeometry(512, OUT_H, 3), wallMat);
        wall.position.set(0, OUT_H / 2, OP); wall.castShadow = true; wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, OUT_H / 2, OP), size: new THREE.Vector3(512, OUT_H, 3) });
        // East edge
        wall = new THREE.Mesh(new THREE.BoxGeometry(3, OUT_H, 512), wallMat);
        wall.position.set(OP, OUT_H / 2, 0); wall.castShadow = true; wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(OP, OUT_H / 2, 0), size: new THREE.Vector3(3, OUT_H, 512) });
        // West edge
        wall = new THREE.Mesh(new THREE.BoxGeometry(3, OUT_H, 512), wallMat);
        wall.position.set(-OP, OUT_H / 2, 0); wall.castShadow = true; wall.receiveShadow = true;
        this.scene.add(wall);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(-OP, OUT_H / 2, 0), size: new THREE.Vector3(3, OUT_H, 512) });
    }

fillBoundaryGaps() {
         // DISABLED - biome grounds now fill from ±60 to ±256 with no gaps.
         // No corner patches needed - they cause visual artifacts.
         return;
    }

    buildFirePits() {
        const pitMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.95,
            flatShading: true
        });
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff4400,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });
        const emberMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            emissive: 0xff6600,
            emissiveIntensity: 1.5,
            depthWrite: false
        });

        const pitPositions = [
            { x: 25, z: 25 }, { x: -25, z: 25 },
            { x: 25, z: -25 }, { x: -25, z: -25 }
        ];

        pitPositions.forEach(pos => {
            const pitGroup = new THREE.Group();

            // Stone ring
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const stoneGeo = new THREE.SphereGeometry(0.4, 5, 4);
                const stone = new THREE.Mesh(stoneGeo, pitMat);
                stone.position.set(
                    Math.cos(angle) * 2.5,
                    3.3,
                    Math.sin(angle) * 2.5
                );
                stone.scale.set(1, 0.6, 1);
                pitGroup.add(stone);
            }

            // Fire glow (inner)
            const fireGeo = new THREE.ConeGeometry(1.2, 2.5, 8);
            const fire = new THREE.Mesh(fireGeo, fireMat);
            fire.position.set(0, 4.5, 0);
            pitGroup.add(fire);
            this.animatedObjects.push({ type: 'firePit', obj: fire, base: pos });
            this.fireMeshes.push(fire);

            // Inner fire (brighter, smaller)
            const innerFireGeo = new THREE.ConeGeometry(0.6, 1.8, 6);
            const innerFire = new THREE.Mesh(innerFireGeo, emberMat);
            innerFire.position.set(0, 4.2, 0);
            pitGroup.add(innerFire);
            this.animatedObjects.push({ type: 'innerFire', obj: innerFire });
            this.fireMeshes.push(innerFire);

            // Embers (small floating particles)
            for (let i = 0; i < 5; i++) {
                const emberGeo = new THREE.SphereGeometry(0.06, 3, 3);
                const ember = new THREE.Mesh(emberGeo, emberMat);
                ember.position.set(
                    (Math.random() - 0.5) * 1.5,
                    4 + Math.random() * 2,
                    (Math.random() - 0.5) * 1.5
                );
                pitGroup.add(ember);
                this.animatedObjects.push({ type: 'ember', obj: ember, basePos: { ...pos } });
            }

            pitGroup.position.set(pos.x, 0, pos.z);
            this.scene.add(pitGroup);
        });
    }

    buildPlatformBenches() {
        const woodMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x6b4a2a,
            roughness: 0.9
        });
        const legMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.6,
            metalness: 0.4
        });

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + Math.PI / 16;
            const r = 30;
            const bx = Math.cos(angle) * r;
            const bz = Math.sin(angle) * r;

            const benchGroup = new THREE.Group();

            // Seat
            const seatGeo = new THREE.BoxGeometry(2, 0.15, 0.8);
            const seat = new THREE.Mesh(seatGeo, woodMat);
            seat.position.y = 1;
            benchGroup.add(seat);

            // Back
            const backGeo = new THREE.BoxGeometry(2, 0.8, 0.1);
            const back = new THREE.Mesh(backGeo, woodMat);
            back.position.set(0, 1.4, -0.35);
            benchGroup.add(back);

            // Legs
            for (let l = -1; l <= 1; l += 2) {
                const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 4);
                const leg = new THREE.Mesh(legGeo, legMat);
                leg.position.set(l * 0.8, 0.5, 0);
                benchGroup.add(leg);
            }

            benchGroup.position.set(bx, 3, bz);
            benchGroup.lookAt(0, 3, 0);
            this.scene.add(benchGroup);
        }
    }

    buildPlatformWell() {
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x8a8a7a,
            roughness: 0.95,
            flatShading: true
        });
        const woodMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5d4037,
            roughness: 0.9
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.5,
            metalness: 0.6
        });

        const wellGroup = new THREE.Group();

        // Well base ring
        const wellRingGeo = new THREE.TorusGeometry(1.2, 0.3, 8, 16);
        const wellRing = new THREE.Mesh(wellRingGeo, stoneMat);
        wellRing.rotation.x = -Math.PI / 2;
        wellRing.position.y = 3.5;
        wellGroup.add(wellRing);

        // Well walls (4 segments)
        for (let i = 0; i < 4; i++) {
            const wallGeo = new THREE.BoxGeometry(0.6, 1.5, 0.4);
            const wall = new THREE.Mesh(wallGeo, stoneMat);
            const angle = (i / 4) * Math.PI * 2;
            wall.position.set(Math.cos(angle) * 1.2, 4.3, Math.sin(angle) * 1.2);
            wall.rotation.y = angle;
            wellGroup.add(wall);
        }

        // Support poles
        for (let i = 0; i < 2; i++) {
            const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 6);
            const pole = new THREE.Mesh(poleGeo, woodMat);
            pole.position.set((i - 0.5) * 2, 5.5, 0);
            wellGroup.add(pole);
        }

        // Cross beam
        const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6);
        const beam = new THREE.Mesh(beamGeo, woodMat);
        beam.rotation.z = Math.PI / 2;
        beam.position.set(0, 7, 0);
        wellGroup.add(beam);

        // Rope (thin cylinder)
        const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, 3, 4);
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 });
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.position.set(0, 5.5, 0);
        wellGroup.add(rope);

        // Bucket
        const bucketGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.4, 8);
        const bucketMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.8 });
        const bucket = new THREE.Mesh(bucketGeo, bucketMat);
        bucket.position.set(0, 3.8, 0);
        wellGroup.add(bucket);

        wellGroup.position.set(15, 0, 15);
        this.scene.add(wellGroup);
    }

   fillDiagonalGround() {
        // Fill 4 diagonal corners with biome-specific ground
        const gapConfigs = [
            { cx: -110, cz: -110, w: 100, h: 100, matKey: 'forestGround', color: 0x4a7a2e },
            { cx: 110, cz: -110, w: 100, h: 100, matKey: 'stoneGround', color: 0x8a8a7a },
            { cx: -110, cz: 110, w: 100, h: 100, matKey: 'militaryGround', color: 0x7a6a4e },
            { cx: 110, cz: 110, w: 100, h: 100, matKey: 'snowGround', color: 0xe8e8f0 },
        ];

        gapConfigs.forEach(cfg => {
            const tex = this.textures[cfg.matKey];
            const groundGeo = new THREE.PlaneGeometry(cfg.w, cfg.h, 32, 32);
            const groundMat = tex
                ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, flatShading: false })
                : new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.95, flatShading: false });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(cfg.cx, 1.55, cfg.cz);
            ground.receiveShadow = true;
            this.scene.add(ground);
        });
    }

    // ========== ROADS ==========
    buildRoads() {
        const roadWidth = 10;

        // North road - from center to north gate (doubled for 512 map)
        this.buildRoad(0, -62, 0, -220, roadWidth);
        // South road - from center to south gate
        this.buildRoad(0, 62, 0, 220, roadWidth);
        // West road - from center to west gate
        this.buildRoad(-62, 0, -220, 0, roadWidth);
        // East road - from center to east gate
        this.buildRoad(62, 0, 220, 0, roadWidth);

        // Street lamps along roads
        this.buildRoadLamps();

        // === INDIVIDUAL PATHS TO EACH BIOME ===
        this.buildBiomePaths();
    }

    buildBiomePaths() {
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.95,
            flatShading: true
        });

        // Forest path (northwest) - winding path from center (doubled for 512 map)
        const forestPathPoints = [
            { x: 0, z: -62 },
            { x: -16, z: -100 },
            { x: -30, z: -130 },
            { x: -40, z: -160 },
            { x: -50, z: -190 },
            { x: -60, z: -220 }
        ];

        for (let i = 0; i < forestPathPoints.length - 1; i++) {
            const p1 = forestPathPoints[i];
            const p2 = forestPathPoints[i + 1];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

            const pathGeo = new THREE.PlaneGeometry(6, len, 8, 8);
            const path = new THREE.Mesh(pathGeo, pathMat);
            path.rotation.x = -Math.PI / 2;
            path.rotation.z = -angle;
            path.position.set((p1.x + p2.x) / 2, 1.57, (p1.z + p2.z) / 2);
            path.receiveShadow = true;
            this.scene.add(path);
            this.deformPathGeometry(pathGeo, angle, {
                x: (p1.x + p2.x) / 2,
                y: 1.57,
                z: (p1.z + p2.z) / 2
            });
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3((p1.x + p2.x) / 2, 0, (p1.z + p2.z) / 2),
                size: new THREE.Vector3(6, 0.1, len)
            });
        }

        // Stone path (northeast) - winding path from center
        const stonePathPoints = [
            { x: 0, z: -62 },
            { x: 16, z: -100 },
            { x: 30, z: -130 },
            { x: 40, z: -160 },
            { x: 50, z: -190 },
            { x: 60, z: -220 }
        ];

        for (let i = 0; i < stonePathPoints.length - 1; i++) {
            const p1 = stonePathPoints[i];
            const p2 = stonePathPoints[i + 1];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

            const pathGeo = new THREE.PlaneGeometry(6, len, 8, 8);
            const path = new THREE.Mesh(pathGeo, pathMat);
            path.rotation.x = -Math.PI / 2;
            path.rotation.z = -angle;
            path.position.set((p1.x + p2.x) / 2, 1.57, (p1.z + p2.z) / 2);
            path.receiveShadow = true;
            this.scene.add(path);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3((p1.x + p2.x) / 2, 0, (p1.z + p2.z) / 2),
                size: new THREE.Vector3(6, 0.1, len)
            });
            this.deformPathGeometry(pathGeo, angle, {
                x: (p1.x + p2.x) / 2,
                y: 1.57,
                z: (p1.z + p2.z) / 2
            });
        }

        // Military path (southwest) - winding path from center
        const militaryPathPoints = [
            { x: -62, z: 0 },
            { x: -100, z: 16 },
            { x: -130, z: 30 },
            { x: -160, z: 40 },
            { x: -190, z: 50 },
            { x: -220, z: 60 }
        ];

        for (let i = 0; i < militaryPathPoints.length - 1; i++) {
            const p1 = militaryPathPoints[i];
            const p2 = militaryPathPoints[i + 1];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

            const pathGeo = new THREE.PlaneGeometry(6, len);
            const path = new THREE.Mesh(pathGeo, pathMat);
            path.rotation.x = -Math.PI / 2;
            path.rotation.z = -angle;
            path.position.set((p1.x + p2.x) / 2, 1.57, (p1.z + p2.z) / 2);
            path.receiveShadow = true;
            this.scene.add(path);
            this.deformPathGeometry(pathGeo, angle, {
                x: (p1.x + p2.x) / 2,
                y: 1.57,
                z: (p1.z + p2.z) / 2
            });
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3((p1.x + p2.x) / 2, 0, (p1.z + p2.z) / 2),
                size: new THREE.Vector3(6, 0.1, len)
            });
        }

        // Snow path (southeast) - winding path from center
        const snowPathPoints = [
            { x: 62, z: 0 },
            { x: 100, z: 16 },
            { x: 130, z: 30 },
            { x: 160, z: 40 },
            { x: 190, z: 50 },
            { x: 220, z: 60 }
        ];

        for (let i = 0; i < snowPathPoints.length - 1; i++) {
            const p1 = snowPathPoints[i];
            const p2 = snowPathPoints[i + 1];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

         const pathGeo = new THREE.PlaneGeometry(6, len);
            const path = new THREE.Mesh(pathGeo, pathMat);
            path.rotation.x = -Math.PI / 2;
            path.rotation.z = -angle;
            path.position.set((p1.x + p2.x) / 2, 1.57, (p1.z + p2.z) / 2);
            path.receiveShadow = true;
            this.scene.add(path);
            this.deformPathGeometry(pathGeo, angle, {
                x: (p1.x + p2.x) / 2,
                y: 1.57,
                z: (p1.z + p2.z) / 2
            });
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3((p1.x + p2.x) / 2, 0, (p1.z + p2.z) / 2),
                size: new THREE.Vector3(6, 0.1, len)
            });
        }
    }

    buildRoad(x1, z1, x2, z2, width) {
        const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
        const geo = new THREE.PlaneGeometry(width, len, 8, 8);
        const tex = this.textures.road.clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(0.5, len / width);
        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.9,
            flatShading: false
        });
        const road = new THREE.Mesh(geo, mat);
        road.rotation.x = -Math.PI / 2;
        road.position.set((x1 + x2) / 2, 1.57, (z1 + z2) / 2);
        road.receiveShadow = true;
        this.scene.add(road);
        this.deformPathGeometry(geo, 0, road.position);

        // Road markings (center line)
        const markGeo = new THREE.PlaneGeometry(0.2, len, 2, 4);
        const markMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.8, flatShading: false
        });
        const mark = new THREE.Mesh(markGeo, markMat);
        mark.rotation.x = -Math.PI / 2;
        mark.position.set((x1 + x2) / 2, 1.58, (z1 + z2) / 2);
        mark.receiveShadow = true;
        this.scene.add(mark);
        this.deformPathGeometry(markGeo, 0, mark.position);

// Road colliders (prevent walking through roads)
        this.colliders.push({
            type: 'box',
            position: new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2),
            size: new THREE.Vector3(width, 0.1, len)
        });

        // Create box collider from mesh dimensions
        function createBoxCollider(position, size) {
            this.colliders.push({
                type: 'box',
                position: position.clone(),
                size: size.clone(),
                min: new THREE.Vector3(
                    position.x - size.x / 2,
                    position.y - size.y / 2,
                    position.z - size.z / 2
                ),
                max: new THREE.Vector3(
                    position.x + size.x / 2,
                    position.y + size.y / 2,
                    position.z + size.z / 2
                )
            });
        }

        // Create box collider from mesh dimensions
        function createBoxCollider(position, size) {
            this.colliders.push({
                type: 'box',
                position: position.clone(),
                size: size.clone(),
                min: new THREE.Vector3(
                    position.x - size.x / 2,
                    position.y - size.y / 2,
                    position.z - size.z / 2
                ),
                max: new THREE.Vector3(
                    position.x + size.x / 2,
                    position.y + size.y / 2,
                    position.z + size.z / 2
                )
            });
        }

        // Biome path colliders (prevent walking through paths)
        this.colliders.push({
            type: 'box',
            position: new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2),
            size: new THREE.Vector3(3, 0.1, len)
        });
    }

    buildRoadLamps() {
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.6,
            metalness: 0.5
        });
        const lightMat = new THREE.MeshStandardMaterial({
            color: 0xffeecc,
            emissive: 0xffddaa,
            emissiveIntensity: 0.5,
            roughness: 0.3
        });

        // North road lamps
        for (let z = -60; z > -216; z -= 60) {
            for (let side = -1; side <= 1; side += 2) {
                const lampGroup = new THREE.Group();
                const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3, 4);
                const pole = new THREE.Mesh(poleGeo, poleMat);
                pole.position.y = 1.5;
                lampGroup.add(pole);
                const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
                const arm = new THREE.Mesh(armGeo, poleMat);
                arm.position.set(side * 0.5, 3, 0);
                arm.rotation.z = Math.PI / 2;
                lampGroup.add(arm);
                const bulbGeo = new THREE.SphereGeometry(0.15, 4, 4);
                const bulb = new THREE.Mesh(bulbGeo, lightMat);
                bulb.position.set(side * 1, 2.8, 0);
                lampGroup.add(bulb);
                lampGroup.position.set(side * 8, 1.56, z);
                this.scene.add(lampGroup);
            }
        }

        // South road lamps
        for (let z = 60; z < 216; z += 60) {
            for (let side = -1; side <= 1; side += 2) {
                const lampGroup = new THREE.Group();
                const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3, 4);
                const pole = new THREE.Mesh(poleGeo, poleMat);
                pole.position.y = 1.5;
                lampGroup.add(pole);
                const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
                const arm = new THREE.Mesh(armGeo, poleMat);
                arm.position.set(side * 0.5, 3, 0);
                arm.rotation.z = Math.PI / 2;
                lampGroup.add(arm);
                const bulbGeo = new THREE.SphereGeometry(0.15, 4, 4);
                const bulb = new THREE.Mesh(bulbGeo, lightMat);
                bulb.position.set(side * 1, 2.8, 0);
                lampGroup.add(bulb);
                lampGroup.position.set(side * 8, 1.56, z);
                this.scene.add(lampGroup);
            }
        }

        // West road lamps
        for (let x = -60; x > -216; x -= 60) {
            for (let side = -1; side <= 1; side += 2) {
                const lampGroup = new THREE.Group();
                const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3, 4);
                const pole = new THREE.Mesh(poleGeo, poleMat);
                pole.position.y = 1.5;
                lampGroup.add(pole);
                const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
                const arm = new THREE.Mesh(armGeo, poleMat);
                arm.position.set(0, 3, side * 0.5);
                arm.rotation.x = Math.PI / 2;
                lampGroup.add(arm);
                const bulbGeo = new THREE.SphereGeometry(0.15, 4, 4);
                const bulb = new THREE.Mesh(bulbGeo, lightMat);
                bulb.position.set(0, 2.8, side * 1);
                lampGroup.add(bulb);
                lampGroup.position.set(x, 1.56, side * 8);
                this.scene.add(lampGroup);
            }
        }

      // East road lamps
        for (let x = 60; x < 216; x += 60) {
            for (let side = -1; side <= 1; side += 2) {
                const lampGroup = new THREE.Group();
                const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3, 4);
                const pole = new THREE.Mesh(poleGeo, poleMat);
                pole.position.y = 1.5;
                lampGroup.add(pole);
                const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
                const arm = new THREE.Mesh(armGeo, poleMat);
                arm.position.set(0, 3, side * 0.5);
                arm.rotation.x = Math.PI / 2;
                lampGroup.add(arm);
                const bulbGeo = new THREE.SphereGeometry(0.15, 4, 4);
                const bulb = new THREE.Mesh(bulbGeo, lightMat);
                bulb.position.set(0, 2.8, side * 1);
                lampGroup.add(bulb);
                lampGroup.position.set(x, 1.56, side * 8);
                this.scene.add(lampGroup);
            }
        }
    }

    // ========== BIOME BOUNDARY WALLS ==========
    // ========== FOREST BIOME (northwest) ==========
    buildForestBiome() {
        // === VERY DENSE FOREST - 2x taller, 3x more trees, more diverse ===
        // Forest biome spans X/Z: -256 to -60
        // Tall pine trees (2x height)
        for (let i = 0; i < 240; i++) {
            const x = -256 + Math.random() * 196;
            const z = -256 + Math.random() * 196;

            if (Math.abs(x) < 28) continue;
            if (z > -62) continue;

            const riverX = -158 + Math.sin((z + 158) * 0.05) * 26;
            if (Math.abs(x - riverX) < 12) continue;

            const variant = Math.random();
            if (variant < 0.5) {
                this.addDetailedTree(x, z, 'forest');
            } else if (variant < 0.8) {
                this.addPineTree(x, z);
            } else {
                this.addOakTree(x, z);
            }
        }

        // Detailed houses (3)
        const housePositions = [
            { x: -168, z: -168 },
            { x: -214, z: -132 },
            { x: -132, z: -194 }
        ];

        housePositions.forEach((pos, i) => {
            this.addDetailedHouse(pos.x, pos.z, i);
        });

        // River flowing through forest
        this.buildForestRiver();

        // Winding forest paths
        this.buildForestPaths();

        // Mushrooms scattered in forest — DISABLED (visual clutter)
        // this.buildForestMushrooms();

        // Glowing orbs/flowers
        this.buildForestOrbs();
    }

    addGrassPatches(ox, oz) {
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x3a7a2e, roughness: 0.9, side: THREE.DoubleSide
        });

        for (let i = 0; i < 10; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;

            if (Math.abs(x) < 10) continue;
            if (z > -25) continue;

            const grassGeo = new THREE.PlaneGeometry(2, 2);
            const grass = new THREE.Mesh(grassGeo, grassMat);
            grass.rotation.x = -Math.PI / 2;
            grass.rotation.z = Math.random() * Math.PI;
             grass.position.set(x, 2.3, z);
            grass.receiveShadow = true;
            this.scene.add(grass);
        }
    }

    deformPathGeometry(geometry, angle, offset, segments = 16) {
        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);
        const { x: offset_x, y: offset_y, z: offset_z } = offset;
        const positions = geometry.attributes.position.array;
        for (let j = 0; j < positions.length; j += 3) {
            const vx = positions[j];
            const vy = positions[j + 1];
            const wx = vx * cosA + offset_x;
            const wz = -vy + offset_z;
            const h = this.getHeightAt(wx, wz);
            if (Math.abs(cosA) > 0.001) {
                positions[j + 2] = (h - offset_y + vx * sinA) / cosA;
            }
        }
        geometry.attributes.position.needsUpdate = true;
    }

    buildForestPaths() {
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.95,
            flatShading: true
        });

        // Main winding path through forest (stays inside forest biome X <= -60, Z <= -60)
        const pathPoints = [
            { x: -220, z: -220 },
            { x: -190, z: -190 },
            { x: -170, z: -160 },
            { x: -150, z: -140 },
            { x: -130, z: -120 },
            { x: -110, z: -100 },
            { x: -90, z: -80 },
            { x: -75, z: -70 }
        ];

        for (let i = 0; i < pathPoints.length - 1; i++) {
            const p1 = pathPoints[i];
            const p2 = pathPoints[i + 1];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

            const pathGeo = new THREE.PlaneGeometry(3, len, 16, 16);
            const path = new THREE.Mesh(pathGeo, pathMat);
            path.rotation.x = -Math.PI / 2;
            path.rotation.z = -angle;
            path.position.set((p1.x + p2.x) / 2, 1.57, (p1.z + p2.z) / 2);
            path.receiveShadow = true;
            this.scene.add(path);

            this.deformPathGeometry(pathGeo, angle, {
                x: (p1.x + p2.x) / 2,
                y: 1.57,
                z: (p1.z + p2.z) / 2
            });
        }

        // Second branching path (stays inside forest biome)
        const path2Points = [
            { x: -168, z: -168 },
            { x: -140, z: -150 },
            { x: -110, z: -130 },
            { x: -75, z: -100 }
        ];

        for (let i = 0; i < path2Points.length - 1; i++) {
            const p1 = path2Points[i];
            const p2 = path2Points[i + 1];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

            const pathGeo = new THREE.PlaneGeometry(2.5, len, 16, 16);
            const path = new THREE.Mesh(pathGeo, pathMat);
            path.rotation.x = -Math.PI / 2;
            path.rotation.z = -angle;
            path.position.set((p1.x + p2.x) / 2, 1.57, (p1.z + p2.z) / 2);
            path.receiveShadow = true;
            this.scene.add(path);

            this.deformPathGeometry(pathGeo, angle, {
                x: (p1.x + p2.x) / 2,
                y: 1.57,
                z: (p1.z + p2.z) / 2
            });
        }
    }

    buildForestMushrooms() {
        const stemMat = new THREE.MeshStandardMaterial({
            color: 0xf5f5dc,
            roughness: 0.8
        });
        const capMatRed = new THREE.MeshStandardMaterial({
            color: 0xcc2222,
            roughness: 0.6
        });
        const capMatPink = new THREE.MeshStandardMaterial({
            color: 0xff6699,
            roughness: 0.6
        });

        for (let i = 0; i < 20; i++) {
            const x = -220 + Math.random() * 200;
            const z = -220 + Math.random() * 200;

            if (Math.abs(x) < 30 || Math.abs(z) < 30) continue;

            const mushroomGroup = new THREE.Group();
            const usePink = Math.random() > 0.5;

            // Stem
            const stemGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6);
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.y = 0.4;
            mushroomGroup.add(stem);

            // Cap
            const capGeo = new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
            const cap = new THREE.Mesh(capGeo, usePink ? capMatPink : capMatRed);
            cap.position.y = 0.8;
            mushroomGroup.add(cap);

            // White dots on cap
            for (let j = 0; j < 5; j++) {
                const dotGeo = new THREE.SphereGeometry(0.08, 4, 4);
                const dot = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    roughness: 0.5
                }));
                const dotAngle = Math.random() * Math.PI * 2;
                const dotH = Math.random() * 0.5;
                dot.position.set(
                    Math.cos(dotAngle) * Math.cos(dotH) * 0.4,
                    0.8 + Math.sin(dotH) * 0.4,
                    Math.sin(dotAngle) * Math.cos(dotH) * 0.4
                );
                mushroomGroup.add(dot);
            }

            mushroomGroup.position.set(x, 2, z);
            this.scene.add(mushroomGroup);
        }
    }

    buildForestOrbs() {
        const orbMat = new THREE.MeshStandardMaterial({
            color: 0xffdd44,
            emissive: 0xffaa00,
            emissiveIntensity: 0.8,
            roughness: 0.2,
            transparent: true,
            opacity: 0.9
        });

        for (let i = 0; i < 15; i++) {
            const x = -220 + Math.random() * 200;
            const z = -220 + Math.random() * 200;

            if (Math.abs(x) < 40 || Math.abs(z) < 40) continue;

            const orbGeo = new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 8, 8);
            const orb = new THREE.Mesh(orbGeo, orbMat.clone());
            orb.position.set(x, 3 + Math.random() * 2, z);
            this.scene.add(orb);

            // Point light for glow
            const orbLight = new THREE.PointLight(0xffaa00, 0.5, 8);
            orbLight.position.set(x, 3, z);
            this.scene.add(orbLight);

            this.animatedObjects.push({
                type: 'forestOrb',
                obj: orb,
                baseY: orb.position.y,
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 0.5
            });
        }
    }

    addDetailedTree(x, z, type) {
        const treeGroup = new THREE.Group();
        const isForest = type === 'forest';

        // Simplified tree: trunk + 1 foliage sphere (2 meshes instead of 8-12)
        const trunkH = isForest ? 7 + Math.random() * 3 : 5 + Math.random() * 2;
        const trunkR = 0.35 + Math.random() * 0.2;

        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 4);
        const trunkMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: isForest ? 0x5d4037 : 0x4a3728,
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Single foliage sphere
        const foliageR = isForest ? 2.5 + Math.random() * 1 : 1.5 + Math.random() * 0.8;
        const baseHue = isForest ? 0.3 + Math.random() * 0.1 : 0.35;
        const foliageColor = new THREE.Color().setHSL(baseHue, isForest ? 0.6 : 0.3, isForest ? 0.25 : 0.7);
        const foliageGeo = new THREE.SphereGeometry(foliageR, 4, 4);
        const foliageMat = new THREE.MeshStandardMaterial({
            color: foliageColor, roughness: 0.95, flatShading: true
        });
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = trunkH + foliageR * 0.5;
        foliage.castShadow = true;
        treeGroup.add(foliage);

        treeGroup.position.set(x, 2, z);
        this.scene.add(treeGroup);
        this.leafMeshes.push(treeGroup);
    }

    addPineTree(x, z) {
        const group = new THREE.Group();
        const trunkH = 14 + Math.random() * 6;
        const trunkR = 0.4 + Math.random() * 0.3;

        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.4, trunkR, trunkH, 4);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        group.add(trunk);

        // Multi-layer cone foliage
        const tiers = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < tiers; i++) {
            const coneR = 3.5 - i * 0.8 + Math.random() * 0.5;
            const coneH = 5 + Math.random() * 3;
            const coneGeo = new THREE.ConeGeometry(coneR, coneH, 5);
            const hue = 0.28 + Math.random() * 0.12;
            const coneMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(hue, 0.7, 0.18 + Math.random() * 0.1),
                roughness: 0.95, flatShading: true
            });
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.y = trunkH * 0.5 + i * coneH * 0.5;
            cone.castShadow = true;
            group.add(cone);
        }

        group.position.set(x, 2, z);
        this.scene.add(group);
        this.leafMeshes.push(group);
    }

    addOakTree(x, z) {
        const group = new THREE.Group();
        const trunkH = 10 + Math.random() * 4;
        const trunkR = 0.5 + Math.random() * 0.3;

        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 4);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        group.add(trunk);

        // Large spherical canopy with multiple clusters
        const clusters = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < clusters; i++) {
            const clusterR = 2.5 + Math.random() * 2;
            const clusterGeo = new THREE.SphereGeometry(clusterR, 4, 4);
            const hue = 0.25 + Math.random() * 0.15;
            const clusterMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(hue, 0.65, 0.2 + Math.random() * 0.15),
                roughness: 0.9, flatShading: true
            });
            const cluster = new THREE.Mesh(clusterGeo, clusterMat);
            const angle = (i / clusters) * Math.PI * 2;
            const dist = clusterR * 0.5;
            cluster.position.set(
                Math.cos(angle) * dist,
                trunkH * 0.6 + Math.random() * 2,
                Math.sin(angle) * dist
            );
            cluster.castShadow = true;
            group.add(cluster);
        }

        group.position.set(x, 2, z);
        this.scene.add(group);
        this.leafMeshes.push(group);
    }

    addDetailedHouse(x, z, variant) {
        this.addBiomeHouse(x, z, variant, 'forest');
    }

    addSnowHouse(x, z, variant) {
        this.addBiomeHouse(x, z, variant, 'snow');
    }

    addStoneHouse(x, z, variant) {
        this.addBiomeHouse(x, z, variant, 'stone');
    }

    addBiomeHouse(x, z, variant, biome) {
        const houseGroup = new THREE.Group();

        // Biome-specific styling
        let wallColor, wallMatConfig, roofH, roofColor, roofType;

        if (biome === 'snow') {
            wallColor = 0xd4c4a8;
            wallMatConfig = { map: this.textures.snow, color: 0xe8dcc8, roughness: 0.85 };
            roofH = 3 + Math.random() * 1.5;
            roofColor = 0x87ceeb; // Snow blue
            roofType = 'snow';
        } else if (biome === 'stone') {
            wallColor = 0x6b6b5a;
            wallMatConfig = { map: this.textures.stone, color: 0x7a7a6a, roughness: 0.95 };
            roofH = 4 + Math.random() * 2;
            roofColor = 0x3d3d3d;
            roofType = 'flat';
        } else { // forest default
            wallColor = [0x8b6917, 0xa0522d, 0xb8860b][variant % 3];
            wallMatConfig = { map: this.textures.brick, color: wallColor, roughness: 0.9 };
            roofH = 4 + Math.random() * 2;
            roofColor = [0x654321, 0x8b0000, 0x4a3728][variant % 3];
            roofType = 'cone';
        }

        // Larger houses - 14x14 base with 6-8 height
        const wallH = 6 + Math.random() * 2;
        const wallW = 14 + Math.random() * 4;
        const wallD = 14 + Math.random() * 4;

        const wallMat = new THREE.MeshStandardMaterial(wallMatConfig);

        // Front wall - split into 3 parts (left pillar, right pillar, top beam) to create doorway opening
        const doorW = 2.0;
        const doorFrameMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x3d2b1f,
            roughness: 0.9
        });
        const pillarW = (wallW - doorW) / 2;
        // Left pillar
        const fwLeftGeo = new THREE.BoxGeometry(pillarW, wallH, 0.4);
        const fwLeft = new THREE.Mesh(fwLeftGeo, wallMat);
 fwLeft.position.set(-(doorW / 2 + pillarW / 2), wallH / 2, wallD / 2);
        houseGroup.add(fwLeft);
        // Right pillar
        const fwRight = new THREE.Mesh(fwLeftGeo, wallMat);
        fwRight.position.set((doorW / 2 + pillarW / 2), wallH / 2, wallD / 2);
        houseGroup.add(fwRight);
        // Top beam above door
        const topBeamH = wallH - 3.0;
        if (topBeamH > 0) {
            const topGeo = new THREE.BoxGeometry(doorW, topBeamH, 0.4);
            const topBeam = new THREE.Mesh(topGeo, wallMat);
            topBeam.position.set(0, 3.0 + topBeamH / 2, wallD / 2);
            houseGroup.add(topBeam);
        }
        // Door frame
        const frameMat = doorFrameMat;
        const frameSideGeo = new THREE.BoxGeometry(0.15, 3.0, 0.5);
        const frameLeft = new THREE.Mesh(frameSideGeo, frameMat);
        frameLeft.position.set(-doorW / 2, 1.5, wallD / 2);
        houseGroup.add(frameLeft);
        const frameRight = new THREE.Mesh(frameSideGeo, frameMat);
        frameRight.position.set(doorW / 2, 1.5, wallD / 2);
        houseGroup.add(frameRight);
        const frameTopGeo = new THREE.BoxGeometry(doorW + 0.3, 0.15, 0.5);
        const frameTop = new THREE.Mesh(frameTopGeo, frameMat);
        frameTop.position.set(0, 3.0, wallD / 2);
        houseGroup.add(frameTop);

       // Back wall
        const bwGeo = new THREE.BoxGeometry(wallW, wallH, 0.4);
        const bw = new THREE.Mesh(bwGeo, wallMat);
        bw.position.set(0, wallH / 2, -wallD / 2);
        houseGroup.add(bw);

        // Side walls
        const swGeo = new THREE.BoxGeometry(0.4, wallH, wallD);
        const sw1 = new THREE.Mesh(swGeo, wallMat);
        sw1.position.set(-wallW / 2, wallH / 2, 0);
        houseGroup.add(sw1);

        const sw2 = new THREE.Mesh(swGeo, wallMat);
        sw2.position.set(wallW / 2, wallH / 2, 0);
        houseGroup.add(sw2);

        // Roof based on biome type
        let roofMat;
        if (roofType === 'snow') {
            const snowRoofTex = TextureGenerator.createSnowTexture();
            roofMat = new THREE.MeshStandardMaterial({
                map: snowRoofTex,
                color: 0xf0f8ff,
                roughness: 0.7,
                flatShading: false
            });
        } else if (roofType === 'flat') {
            const stoneRoofTex = TextureGenerator.createStoneTexture();
            roofMat = new THREE.MeshStandardMaterial({
                map: stoneRoofTex,
                color: roofColor,
                roughness: 0.95,
                flatShading: true
            });
        } else {
            const roofTex = TextureGenerator.createRoofTexture(roofColor);
            roofMat = new THREE.MeshStandardMaterial({
                map: roofTex,
                color: roofColor,
                roughness: 0.95,
                flatShading: false
            });
        }

        if (roofType === 'flat') {
            // Flat stone roof
            const roofGeo = new THREE.BoxGeometry(wallW * 0.8, 0.4, wallD * 0.8);
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.set(0, wallH + 0.2, 0);
            houseGroup.add(roof);
        } else {
            // Cone/pyramid roof for forest and snow
            const roofGeo = new THREE.ConeGeometry(wallW * 0.75, roofH, 4);
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.set(0, wallH + roofH / 2, 0);
            roof.rotation.y = Math.PI / 4;
            houseGroup.add(roof);

            // Snow cap on snow houses
            if (roofType === 'snow') {
                const snowCapGeo = new THREE.ConeGeometry(wallW * 0.5, roofH * 0.3, 4);
                const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
                const snowCap = new THREE.Mesh(snowCapGeo, snowCapMat);
                snowCap.position.set(0, wallH + roofH * 0.75, 0);
                snowCap.rotation.y = Math.PI / 4;
                houseGroup.add(snowCap);
            }
        }

        // Open hinged door (swung open to the side)
        const doorHingeMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5c4033,
            roughness: 0.85
        });
        const hingeDoorGeo = new THREE.BoxGeometry(0.15, 2.8, 1.8);
        const hingeDoor = new THREE.Mesh(hingeDoorGeo, doorHingeMat);
        hingeDoor.position.set(doorW / 2, 1.4, wallD / 2 + 0.6);
        hingeDoor.rotation.y = Math.PI / 2.5;
        houseGroup.add(hingeDoor);
        // Door handle
        const handleGeo = new THREE.SphereGeometry(0.08, 5, 5);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0xdaa040, metalness: 0.8, roughness: 0.2 });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.position.set(doorW / 2 - 0.05, 1.4, wallD / 2 + 0.1);
        houseGroup.add(handle);

        // Interior floor
        const floorGeo = new THREE.BoxGeometry(wallW - 0.8, 0.15, wallD - 0.8);
        const floorMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x6b4c2d,
            roughness: 0.85
        });
        const interiorFloor = new THREE.Mesh(floorGeo, floorMat);
        interiorFloor.position.set(0, 0.15, 0);
        interiorFloor.receiveShadow = true;
        houseGroup.add(interiorFloor);

        // Interior loot table
        const tableMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, color: 0x5c4033, roughness: 0.8 });
        const tableTopGeo = new THREE.BoxGeometry(2.5, 0.12, 1.5);
        const tableTop = new THREE.Mesh(tableTopGeo, tableMat);
        tableTop.position.set(0, 1.0, -wallD / 4);
        houseGroup.add(tableTop);
        // Table legs
        const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 5);
        [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(legGeo, tableMat);
            leg.position.set(lx, 0.5, -wallD / 4 + lz);
            leg.castShadow = true;
            houseGroup.add(leg);
        });

        // Loot chest inside house
        const lootChestGeo = new THREE.BoxGeometry(1.0, 0.7, 0.6);
        const lootChestMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
        const lootChest = new THREE.Mesh(lootChestGeo, lootChestMat);
        lootChest.position.set(-wallW / 4, 0.85, -wallD / 4);
        lootChest.castShadow = true;
        houseGroup.add(lootChest);
        // Chest lid
        const chestLidGeo = new THREE.BoxGeometry(1.05, 0.15, 0.65);
        const chestLid = new THREE.Mesh(chestLidGeo, lootChestMat);
        chestLid.position.set(-wallW / 4, 1.25, -wallD / 4);
        chestLid.rotation.x = -0.3;
        chestLid.castShadow = true;
        houseGroup.add(chestLid);
        // Gold trim on chest
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.7, roughness: 0.3 });
        const trimGeo = new THREE.BoxGeometry(0.08, 0.6, 0.65);
        const trim = new THREE.Mesh(trimGeo, trimMat);
        trim.position.set(-wallW / 4, 0.85, -wallD / 4);
        houseGroup.add(trim);

        // Shelf on back wall with items
        const shelfGeo = new THREE.BoxGeometry(2.0, 0.1, 0.6);
        const shelf = new THREE.Mesh(shelfGeo, tableMat);
        shelf.position.set(wallW / 6, 2.5, -wallD / 2 + 0.4);
        shelf.castShadow = true;
        houseGroup.add(shelf);
        // Shelf brackets
        const bracketGeo = new THREE.BoxGeometry(0.08, 0.4, 0.5);
        const bracket1 = new THREE.Mesh(bracketGeo, tableMat);
        bracket1.position.set(wallW / 6 - 0.8, 2.3, -wallD / 2 + 0.4);
        houseGroup.add(bracket1);
        const bracket2 = new THREE.Mesh(bracketGeo, tableMat);
        bracket2.position.set(wallW / 6 + 0.8, 2.3, -wallD / 2 + 0.4);
        houseGroup.add(bracket2);
        // Items on shelf
        const itemColors = [0xcc3333, 0x3366cc, 0x33aa33, 0xffcc00];
        for (let i = 0; i < 4; i++) {
            const itemGeo = new THREE.BoxGeometry(0.25, 0.35 + Math.random() * 0.2, 0.25);
            const itemMat = new THREE.MeshStandardMaterial({
                color: itemColors[i],
                roughness: 0.6,
                metalness: i > 1 ? 0.3 : 0.0
            });
            const item = new THREE.Mesh(itemGeo, itemMat);
            item.position.set(wallW / 6 - 0.6 + i * 0.4, 2.75, -wallD / 2 + 0.4);
            item.castShadow = true;
            houseGroup.add(item);
        }

        // Windows with frame
        const winFrameMat = new THREE.MeshStandardMaterial({
            color: 0x4a3728, roughness: 0.8
        });
        const winGlassMat = new THREE.MeshStandardMaterial({
            color: 0x87ceeb, roughness: 0.1, metalness: 0.3,
            transparent: true, opacity: 0.7
        });

        const winPositions = [
            { x: -2.5, z: wallD / 2 + 0.2 },
            { x: 2.5, z: wallD / 2 + 0.2 }
        ];

        winPositions.forEach(wp => {
            // Frame
            const frameGeo = new THREE.BoxGeometry(1.4, 1.4, 0.15);
            const frame = new THREE.Mesh(frameGeo, winFrameMat);
            frame.position.set(wp.x, 3, wp.z);
            houseGroup.add(frame);
            // Glass
            const winGeo = new THREE.BoxGeometry(1.2, 1.2, 0.1);
            const win = new THREE.Mesh(winGeo, winGlassMat);
            win.position.set(wp.x, 3, wp.z);
            houseGroup.add(win);
        });

        // Chimney
        if (Math.random() > 0.3) {
            const chimGeo = new THREE.BoxGeometry(1, 3, 1);
            const chimMat = new THREE.MeshStandardMaterial({
                map: this.textures.brick,
                color: 0x6b6b6b,
                roughness: 0.95
            });
            const chimney = new THREE.Mesh(chimGeo, chimMat);
            chimney.position.set(wallW / 4, wallH + roofH * 0.6, 0);
            chimney.castShadow = true;
            houseGroup.add(chimney);

            // Chimney pot
            const potGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.8, 6);
            const pot = new THREE.Mesh(potGeo, chimMat);
            pot.position.set(wallW / 4, wallH + roofH * 0.6 + 1.8, 0);
            pot.castShadow = true;
            houseGroup.add(pot);
        }

        // Decorative trim/cornice at roof line
        const corniceMat = new THREE.MeshStandardMaterial({
            color: 0xf5f5dc, roughness: 0.7
        });
        const corniceGeo = new THREE.BoxGeometry(wallW + 0.6, 0.3, 0.6);
        const cornice = new THREE.Mesh(corniceGeo, corniceMat);
        cornice.position.set(0, wallH - 0.15, wallD / 2 + 0.1);
        cornice.castShadow = true;
        houseGroup.add(cornice);

        // Corner trim boards
        const cornerTrimGeo = new THREE.BoxGeometry(0.2, wallH, 0.2);
        const ct1 = new THREE.Mesh(cornerTrimGeo, corniceMat);
        ct1.position.set(-wallW / 2 - 0.05, wallH / 2, wallD / 2);
        houseGroup.add(ct1);
        const ct2 = new THREE.Mesh(cornerTrimGeo, corniceMat);
        ct2.position.set(wallW / 2 + 0.05, wallH / 2, wallD / 2);
        houseGroup.add(ct2);

        // Foundation stone band
        const foundGeo = new THREE.BoxGeometry(wallW + 0.4, 0.5, wallD + 0.4);
        const foundMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x8a8a7a,
            roughness: 0.95
        });
        const foundation = new THREE.Mesh(foundGeo, foundMat);
        foundation.position.set(0, 0.25, 0);
        foundation.castShadow = true;
        houseGroup.add(foundation);

        // Porch with steps
        const porchMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x6b4a2a,
            roughness: 0.85
        });
        // Porch roof
        const porchRoofGeo = new THREE.BoxGeometry(3.5, 0.2, 2.5);
        const porchRoof = new THREE.Mesh(porchRoofGeo, porchMat);
        porchRoof.position.set(0, wallH - 0.5, wallD / 2 + 1.5);
        porchRoof.castShadow = true;
        houseGroup.add(porchRoof);

        // Porch posts
        const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2, 6);
        const post1 = new THREE.Mesh(postGeo, porchMat);
        post1.position.set(-1.5, wallH - 1.5, wallD / 2 + 2.2);
        post1.castShadow = true;
        houseGroup.add(post1);
        const post2 = new THREE.Mesh(postGeo, porchMat);
        post2.position.set(1.5, wallH - 1.5, wallD / 2 + 2.2);
        post2.castShadow = true;
        houseGroup.add(post2);

        // Porch floor
        const porchFloorGeo = new THREE.BoxGeometry(3.5, 0.15, 2.5);
        const porchFloor = new THREE.Mesh(porchFloorGeo, porchMat);
        porchFloor.position.set(0, 0.08, wallD / 2 + 1.5);
        porchFloor.receiveShadow = true;
        houseGroup.add(porchFloor);

        // Steps
        for (let s = 0; s < 3; s++) {
            const stepGeo = new THREE.BoxGeometry(2.5 - s * 0.2, 0.15, 0.5);
            const step = new THREE.Mesh(stepGeo, porchMat);
            step.position.set(0, 0.15 * (3 - s), wallD / 2 + 2.8 + s * 0.4);
            step.castShadow = true;
            step.receiveShadow = true;
            houseGroup.add(step);
        }

        // Windows on side walls too
        const sideWinMat = new THREE.MeshStandardMaterial({
            color: 0x4a3728, roughness: 0.8
        });
        const sideGlassMat = new THREE.MeshStandardMaterial({
            color: 0x87ceeb, roughness: 0.1, metalness: 0.3,
            transparent: true, opacity: 0.7
        });
        // Left side window
        const sideWinGeo = new THREE.BoxGeometry(0.1, 1.2, 1.2);
        const lWin = new THREE.Mesh(sideWinGeo, sideGlassMat);
        lWin.position.set(-wallW / 2 - 0.05, 3, 0);
        houseGroup.add(lWin);
        const lFrame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.4), sideWinMat);
        lFrame.position.set(-wallW / 2 - 0.08, 3, 0);
        houseGroup.add(lFrame);

        // Right side window
        const rWin = new THREE.Mesh(sideWinGeo, sideGlassMat);
        rWin.position.set(wallW / 2 + 0.05, 3, 0);
        houseGroup.add(rWin);
        const rFrame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.4), sideWinMat);
        rFrame.position.set(wallW / 2 + 0.08, 3, 0);
        houseGroup.add(rFrame);

        // Window boxes with flowers on front windows
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
        winPositions.forEach(wp => {
            const boxGeo = new THREE.BoxGeometry(1.4, 0.3, 0.4);
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set(wp.x, 2.2, wp.z);
            houseGroup.add(box);

            // Small flowers in box
            const boxFlowerColors = [0xff4466, 0xffaa22, 0xff66cc, 0x44aaff];
            for (let f = 0; f < 4; f++) {
                const flowerGeo = new THREE.SphereGeometry(0.1, 4, 3);
                const flowerMat = new THREE.MeshStandardMaterial({
                    color: boxFlowerColors[f % boxFlowerColors.length],
                    roughness: 0.6
                });
                const flower = new THREE.Mesh(flowerGeo, flowerMat);
                flower.position.set(wp.x - 0.5 + f * 0.35, 2.45, wp.z);
                houseGroup.add(flower);
            }
        });

        // === WEATHERVANE / FLAG on roof ===
        const flagPoleGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 4);
        const flagPole = new THREE.Mesh(flagPoleGeo, new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 }));
        flagPole.position.set(0, wallH + roofH + 0.5, 0);
        houseGroup.add(flagPole);
        // Flag
        const flagGeo = new THREE.PlaneGeometry(0.8, 0.5);
        const flagColors = [0xcc3333, 0x3366cc, 0x33aa33, 0xffcc00, 0xff66cc];
        const flagMat = new THREE.MeshStandardMaterial({
            color: flagColors[Math.floor(Math.random() * flagColors.length)],
            side: THREE.DoubleSide,
            roughness: 0.8
        });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.4, wallH + roofH + 1.2, 0);
        houseGroup.add(flag);

        houseGroup.position.set(x, 2, z);
        this.scene.add(houseGroup);

        this.houseSpots.push({ x, z, width: wallW, depth: wallD, height: wallH });
    }

 
    buildForestRiver() {
        const segments = 20;
        const waterTex = this.textures.water;
        waterTex.repeat.set(4, 1);

        const waterMat = new THREE.MeshStandardMaterial({
            map: waterTex,
            color: 0x4fc3ff,
            transparent: true,
            opacity: 0.7,
            roughness: 0.05,
            metalness: 0.15,
            depthWrite: false
        });

        for (let i = 0; i < segments; i++) {
            const z = -256 + i * 6;
            const x = -110 + Math.sin(i * 0.3) * 32 + Math.sin(i * 0.5) * 20;
            const width = 3 + Math.sin(i * 0.2) * 2;

            // Main water surface
            const waterGeo = new THREE.PlaneGeometry(width, 9);
            const water = new THREE.Mesh(waterGeo, waterMat);
            water.rotation.x = -Math.PI / 2;
            water.position.set(x, 2.08, z + 4.5);
            water.receiveShadow = true;
            this.scene.add(water);

            // River banks - stones and pebbles
            for (let s = -1; s <= 1; s += 2) {
                for (let j = 0; j < 2; j++) {
                    const stoneGeo = new THREE.SphereGeometry(
                        0.2 + Math.random() * 0.3, 4, 4
                    );
                    const stoneMat = new THREE.MeshStandardMaterial({
                        map: this.textures.stone,
                        color: new THREE.Color().setHSL(0, 0, 0.35 + Math.random() * 0.2),
                        roughness: 0.9
                    });
                    const stone = new THREE.Mesh(stoneGeo, stoneMat);
                    stone.position.set(
                        x + s * (width / 2 + j * 0.5 + Math.random() * 0.5),
                        2.1 + j * 0.2,
                        z + 4.5 + (Math.random() - 0.5) * 5
                    );
                    stone.scale.y = 0.4;
                    this.scene.add(stone);
                }
            }

            // Small waterfalls/rapids at intervals
            if (i % 8 === 0) {
                const rapidGeo = new THREE.PlaneGeometry(width * 1.2, 3);
                const rapidMat = new THREE.MeshStandardMaterial({
                    map: waterTex,
                    color: 0x88ddff,
                    transparent: true,
                    opacity: 0.5,
                    roughness: 0.1
                });
                const rapid = new THREE.Mesh(rapidGeo, rapidMat);
                rapid.rotation.x = -Math.PI / 2;
                rapid.position.set(x + Math.random() * 5, 2.12, z + 4.5);
                this.scene.add(rapid);
            }
        }

        // Small bridge over river
        this.addRiverBridge(-128, -102);
        this.addRiverBridge(-76, -56);
        this.addRiverBridge(-154, -164);
        this.addRiverBridge(-76, -76);

        // River flow animation ripples
        this.buildRiverFlow();

        // Riverbank trees (willows and birches along river)
        for (let i = 0; i < 15; i++) {
            const z = -256 + Math.random() * 256;
            const riverX = -110 + Math.sin((z + 256) * 0.05) * 32 + Math.sin((z + 256) * 0.1) * 12;
            const side = Math.random() > 0.5 ? 1 : -1;
            const tx = riverX + side * (16 + Math.random() * 24);
            const tz = z;
            if (Math.abs(tx) < 40) continue;
            // Slightly different tree for riverbank
            this.addRiverBankTree(tx, tz);
        }
    }

    buildRiverFlow() {
        const flowMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            emissive: 0x4488aa,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.5,
            roughness: 0.05,
            side: THREE.DoubleSide
        });

        // Flow lines along river (reduced)
        for (let i = 0; i < 15; i++) {
            const z = -128 + Math.random() * 128;
            const riverX = -55 + Math.sin((z + 128) * 0.05) * 16 + Math.sin((z + 128) * 0.1) * 6;
            const flowGeo = new THREE.PlaneGeometry(0.2 + Math.random() * 0.3, 1 + Math.random() * 2);
            const flow = new THREE.Mesh(flowGeo, flowMat.clone());
            flow.rotation.x = -Math.PI / 2;
            flow.rotation.z = Math.random() * 0.3 - 0.15;
            flow.position.set(
                riverX + (Math.random() - 0.5) * 3,
                2.1,
                z
            );
            this.scene.add(flow);
            this.animatedObjects.push({
                type: 'riverFlow',
                obj: flow,
                baseZ: z,
                phase: Math.random() * Math.PI * 2
            });
        }

        // Small eddies/circles in river (reduced)
        for (let i = 0; i < 4; i++) {
            const z = -128 + Math.random() * 100;
            const riverX = -55 + Math.sin((z + 128) * 0.05) * 16;
            const eddyGeo = new THREE.CircleGeometry(0.3 + Math.random() * 0.5, 8);
            const eddy = new THREE.Mesh(eddyGeo, flowMat.clone());
            eddy.material.opacity = 0.3;
            eddy.rotation.x = -Math.PI / 2;
            eddy.position.set(riverX + (Math.random() - 0.5) * 2, 2.12, z);
            this.scene.add(eddy);
            this.animatedObjects.push({
                type: 'riverEddy',
                obj: eddy,
                baseZ: z,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    addRiverBankTree(x, z) {
        const treeGroup = new THREE.Group();
        const trunkH = 5 + Math.random() * 3;
        const trunkR = 0.2 + Math.random() * 0.15;
        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5d4037,
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Willow-like canopy - drooping
        const canopyMat = new THREE.MeshStandardMaterial({
            color: 0x2d7a1e,
            roughness: 0.8,
            flatShading: true
        });
        for (let i = 0; i < 5; i++) {
            const cGeo = new THREE.SphereGeometry(1.2 + Math.random() * 0.8, 5, 5);
            const canopy = new THREE.Mesh(cGeo, canopyMat);
            canopy.position.set(
                (Math.random() - 0.5) * 2,
                trunkH + Math.random() * 1,
                (Math.random() - 0.5) * 2
            );
            canopy.scale.set(1, 0.6, 1);
            canopy.castShadow = true;
            treeGroup.add(canopy);
        }
        treeGroup.position.set(x, 2.3, z);
        this.scene.add(treeGroup);
    }

    addRiverBridge(x, z) {
        const bridgeGroup = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x6b4c2d,
            roughness: 0.9
        });

        // Bridge deck
        const deckGeo = new THREE.BoxGeometry(6, 0.4, 8);
        const deck = new THREE.Mesh(deckGeo, woodMat);
        deck.position.y = 1.5;
        deck.castShadow = true;
        bridgeGroup.add(deck);

        // Railings
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 4; i++) {
                const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 4);
                const post = new THREE.Mesh(postGeo, woodMat);
                post.position.set(side * 2.8, 2.2, -3 + i * 2);
                post.castShadow = true;
                bridgeGroup.add(post);
            }

            // Rail
            const railGeo = new THREE.BoxGeometry(0.15, 0.15, 8);
            const rail = new THREE.Mesh(railGeo, woodMat);
            rail.position.set(side * 2.8, 2.8, 0);
            bridgeGroup.add(rail);
        }

        bridgeGroup.position.set(x, 2, z);
        this.scene.add(bridgeGroup);
    }

    addForestProps(ox, oz) {
        // Rocks with stone texture
        const rockMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x6b6b6b,
            roughness: 0.9,
            flatShading: true
        });

        for (let i = 0; i < 15; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;

            if (Math.abs(x) < 20) continue;

            const rockGeo = new THREE.SphereGeometry(0.5 + Math.random() * 1.5, 5, 5);
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.set(x, 0.8, z);
            rock.scale.set(1, 0.5 + Math.random() * 0.5, 1);
            rock.rotation.y = Math.random() * Math.PI;
            rock.castShadow = true;
            this.scene.add(rock);
        }

        // Mushrooms - DISABLED
        // for (let i = 0; i < 15; i++) { ... }

        // Fallen logs
        const logMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x4a3728,
            roughness: 0.95
        });
        for (let i = 0; i < 8; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;

            if (Math.abs(x) < 20) continue;

            const logGeo = new THREE.CylinderGeometry(0.3, 0.4, 3 + Math.random() * 3, 6);
            const log = new THREE.Mesh(logGeo, logMat);
            log.position.set(x, 0.5, z);
            log.rotation.z = Math.PI / 2;
            log.rotation.y = Math.random() * Math.PI;
            log.castShadow = true;
            this.scene.add(log);
        }

       // Flowers scattered in forest - DISABLED
        // const flowerColors = [...]; for (...) { ... }

       // Grass tufts - DISABLED
        // const grassTuftMat = ...; for (...) { ... }

        // Small ferns - DISABLED
        // for (...) { ... }
    }

    addForestStumps(ox, oz) {
        const stumpMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5a4a3a,
            roughness: 0.95
        });
        for (let i = 0; i < 10; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            const height = 0.5 + Math.random() * 1;
            const radius = 0.3 + Math.random() * 0.4;
            const stumpGeo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 8);
            const stump = new THREE.Mesh(stumpGeo, stumpMat);
            stump.position.set(x, height / 2, z);
            stump.castShadow = true;
            this.scene.add(stump);

            // Tree rings on top
            const ringGeo = new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 0.05, 8);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.9 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(x, height + 0.02, z);
            this.scene.add(ring);
        }
    }

    addForestBushes(ox, oz) {
        const bushMat = new THREE.MeshStandardMaterial({
            color: 0x2d6a1e,
            roughness: 0.85,
            flatShading: true
        });
        const darkBushMat = new THREE.MeshStandardMaterial({
            color: 0x1a4a12,
            roughness: 0.9,
            flatShading: true
        });
        // 120 bushes throughout forest
        for (let i = 0; i < 15; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            if (z > -30) continue;

            const bushGroup = new THREE.Group();
            const bushCount = 3 + Math.floor(Math.random() * 4);
            for (let j = 0; j < bushCount; j++) {
                const size = 0.4 + Math.random() * 0.8;
                const bGeo = new THREE.SphereGeometry(size, 5, 5);
                const mat = Math.random() > 0.4 ? bushMat : darkBushMat;
                const bush = new THREE.Mesh(bGeo, mat);
                bush.position.set(
                    (Math.random() - 0.5) * 1.5,
                    size * 0.6,
                    (Math.random() - 0.5) * 1.5
                );
                bush.scale.set(1, 0.7 + Math.random() * 0.3, 1);
                bush.castShadow = true;
                bushGroup.add(bush);
            }
          bushGroup.position.set(x, 2.05, z);
            bushGroup.children.forEach(b => b.castShadow = true);
            this.scene.add(bushGroup);
        }
    }

    addForestMushrooms(ox, oz) {
        const stemMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.9 });
        const capColors = [0xcc3333, 0xcc8833, 0xeeee88, 0x884422, 0xddddcc];

        for (let i = 0; i < 10; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            if (z > -50) continue;

            const mushGroup = new THREE.Group();
            const count = 1 + Math.floor(Math.random() * 4);
            const color = capColors[Math.floor(Math.random() * capColors.length)];
            const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });

            for (let j = 0; j < count; j++) {
                const stemGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6);
                const stem = new THREE.Mesh(stemGeo, stemMat);
                const capGeo = new THREE.SphereGeometry(0.25, 6, 6, 0, Math.PI * 2, 0, Math.PI / 2);
                const cap = new THREE.Mesh(capGeo, capMat);
                cap.position.y = 0.25;

                const mx = (Math.random() - 0.5) * 0.8;
                const mz = (Math.random() - 0.5) * 0.8;
                stem.position.set(mx, 0.25, mz);
                cap.position.set(mx, 0.5, mz);
                mushGroup.add(stem);
                mushGroup.add(cap);
            }

            mushGroup.position.set(x, 2.3, z);
            mushGroup.children.forEach(c => c.castShadow = true);
            this.scene.add(mushGroup);
        }
    }

    addForestBirdNests(ox, oz) {
        const nestMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
        const eggMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.5 });

        for (let i = 0; i < 10; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            if (z > -50) continue;

            const nestGroup = new THREE.Group();

            // Nest (hollow sphere)
            const nestGeo = new THREE.SphereGeometry(0.4, 6, 6, 0, Math.PI * 2, 0, Math.PI * 0.4);
            const nest = new THREE.Mesh(nestGeo, nestMat);
            nest.rotation.x = Math.PI;
            nestGroup.add(nest);

            // Eggs
            for (let j = 0; j < 3; j++) {
                const eggGeo = new THREE.SphereGeometry(0.12, 5, 5);
                const egg = new THREE.Mesh(eggGeo, eggMat);
                egg.position.set((j - 1) * 0.2, 0.1, 0);
                egg.scale.set(1, 1.3, 1);
                nestGroup.add(egg);
            }

            nestGroup.position.set(x, 6 + Math.random() * 4, z);
            nestGroup.children.forEach(c => c.castShadow = true);
            this.scene.add(nestGroup);
        }
    }

    addFallenLogs(ox, oz) {
        const logMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5d4037,
            roughness: 0.95
        });
        const barkMat = new THREE.MeshStandardMaterial({
            color: 0x3e2a1a,
            roughness: 1.0
        });

        for (let i = 0; i < 15; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            if (z > -50) continue;

            const logGroup = new THREE.Group();
            const logLen = 2 + Math.random() * 4;
            const logR = 0.15 + Math.random() * 0.15;

            // Main log
            const mainGeo = new THREE.CylinderGeometry(logR * 0.7, logR, logLen, 6);
            const main = new THREE.Mesh(mainGeo, logMat);
            main.rotation.z = Math.PI / 2;
            main.rotation.y = Math.random() * Math.PI;
            logGroup.add(main);

            // Branch stubs
            for (let j = 0; j < 3; j++) {
                const branchGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.5 + Math.random() * 0.5, 4);
                const branch = new THREE.Mesh(branchGeo, barkMat);
                branch.position.set(
                    (Math.random() - 0.5) * logLen * 0.6,
                    logR * 0.8,
                    (Math.random() - 0.5) * 0.3
                );
                branch.rotation.set(
                    Math.random() * 0.5,
                    Math.random() * Math.PI,
                    Math.random() * 0.5
                );
                logGroup.add(branch);
            }

            logGroup.position.set(x, logR * 0.8, z);
            logGroup.children.forEach(c => c.castShadow = true);
            this.scene.add(logGroup);
        }
    }

    addForestFlowers(ox, oz) {
        const flowerColors = [0xff4466, 0xffaa22, 0xff66cc, 0x8866ff, 0xffff44, 0xff8844];

        for (let i = 0; i < 50; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            if (z > -50) continue;

            const flowerGroup = new THREE.Group();
            const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            const stemH = 0.3 + Math.random() * 0.5;

            // Stem
            const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, stemH, 4);
            const stemMat = new THREE.MeshStandardMaterial({ color: 0x2d6a1e, roughness: 0.8 });
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.y = stemH / 2;
            flowerGroup.add(stem);

            // Flower head
            const headGeo = new THREE.SphereGeometry(0.1 + Math.random() * 0.1, 5, 5);
            const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = stemH;
            flowerGroup.add(head);

            // Petals
            for (let p = 0; p < 5; p++) {
                const petalGeo = new THREE.PlaneGeometry(0.12, 0.12);
                const petal = new THREE.Mesh(petalGeo, headMat);
                const pAngle = (p / 5) * Math.PI * 2;
                petal.position.set(Math.cos(pAngle) * 0.12, stemH + 0.05, Math.sin(pAngle) * 0.12);
                petal.rotation.set(Math.random(), Math.random(), Math.random());
                flowerGroup.add(petal);
            }

            flowerGroup.position.set(x, 2.3, z);
            this.scene.add(flowerGroup);
        }
    }

    addGrassTufts(ox, oz) {
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x3a8a2e,
            roughness: 0.9,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 30; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            if (z > -50) continue;

            const tuftGroup = new THREE.Group();
            const bladeCount = 3 + Math.floor(Math.random() * 4);

            for (let j = 0; j < bladeCount; j++) {
                const bladeGeo = new THREE.PlaneGeometry(0.08, 0.3 + Math.random() * 0.4);
                const blade = new THREE.Mesh(bladeGeo, grassMat);
                blade.position.set(
                    (Math.random() - 0.5) * 0.3,
                    0.15 + Math.random() * 0.15,
                    (Math.random() - 0.5) * 0.3
                );
                blade.rotation.y = Math.random() * Math.PI;
                blade.rotation.z = (Math.random() - 0.5) * 0.3;
                tuftGroup.add(blade);
            }

            tuftGroup.position.set(x, 2.06, z);
            this.scene.add(tuftGroup);
        }
    }

    addAutumnGrass() {
        const autumnMat = new THREE.MeshStandardMaterial({
            color: 0xaa8833,
            roughness: 0.95,
            side: THREE.DoubleSide,
            flatShading: true
        });

        for (let i = 0; i < 30; i++) {
            const x = -55 + Math.random() * 100;
            const z = -55 + Math.random() * 100;
            if (Math.sqrt(x * x + z * z) < 25) continue;

            const tuftGroup = new THREE.Group();
            const bladeCount = 4 + Math.floor(Math.random() * 4);

            for (let j = 0; j < bladeCount; j++) {
                const bladeGeo = new THREE.PlaneGeometry(0.06, 0.4 + Math.random() * 0.3);
                const blade = new THREE.Mesh(bladeGeo, autumnMat);
                blade.rotation.y = Math.random() * Math.PI;
                blade.rotation.z = (Math.random() - 0.5) * 0.5;
                tuftGroup.add(blade);
            }

            tuftGroup.position.set(x, 2.06, z);
            this.scene.add(tuftGroup);
        }
    }

    addWaterfalls() {
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            emissive: 0x4488aa,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.6,
            roughness: 0.05,
            side: THREE.DoubleSide
        });

        // Small waterfall where river meets forest edge
        const waterfallPositions = [
            { x: -60, z: -60 },
            { x: -50, z: -50 },
        ];

        waterfallPositions.forEach(wp => {
            const wfGroup = new THREE.Group();

            // Water curtain
            const curtainGeo = new THREE.PlaneGeometry(3, 4, 4, 8);
            const curtain = new THREE.Mesh(curtainGeo, waterMat);
            curtain.position.set(0, 4, 0);
            wfGroup.add(curtain);
            this.animatedObjects.push({
                type: 'waterfall',
                obj: curtain,
                phase: Math.random() * Math.PI * 2
            });

            // Splash pool
            const poolGeo = new THREE.CircleGeometry(2, 8);
            const pool = new THREE.Mesh(poolGeo, waterMat.clone());
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(0, 2.1, 0);
            wfGroup.add(pool);

            // Rocks around pool
            const rockMat = new THREE.MeshStandardMaterial({
                color: 0x6a6a5a,
                roughness: 0.9,
                flatShading: true
            });
            for (let i = 0; i < 8; i++) {
                const rockGeo = new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 4, 4);
                const rock = new THREE.Mesh(rockGeo, rockMat);
                const angle = (i / 8) * Math.PI * 2;
                rock.position.set(Math.cos(angle) * 2, 2.1, Math.sin(angle) * 2);
                rock.scale.y = 0.5;
                wfGroup.add(rock);
            }

            wfGroup.position.set(wp.x, 0, wp.z);
            this.scene.add(wfGroup);
        });
    }

    addWarBanners() {
        const bannerColors = [0x882222, 0x664422, 0x444466, 0x555533];

        for (let i = 0; i < 12; i++) {
            const color = bannerColors[Math.floor(Math.random() * bannerColors.length)];
            const bannerGroup = new THREE.Group();

            // Pole
            const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 3, 5);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 1.5;
            bannerGroup.add(pole);

            // Banner cloth (waving)
            const bannerGeo = new THREE.PlaneGeometry(0.8, 1.5, 3, 4);
            const bannerMat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.7,
                side: THREE.DoubleSide,
                flatShading: true
            });
            const banner = new THREE.Mesh(bannerGeo, bannerMat);
            banner.position.set(0.45, 2.3, 0);
            bannerGroup.add(banner);

            // Banner trim
            const trimGeo = new THREE.ConeGeometry(0.06, 0.15, 4);
            const trimMat = new THREE.MeshStandardMaterial({ color: 0xccaa44 });
            for (let j = 0; j < 3; j++) {
                const trim = new THREE.Mesh(trimGeo, trimMat);
                trim.position.set(0.8, 1.5 + j * 0.4 - 0.2, 0);
                bannerGroup.add(trim);
            }

            const wx = -128 + Math.random() * 128;
            const wz = -128 + Math.random() * 128;
            bannerGroup.position.set(wx, 0, wz);
            this.scene.add(bannerGroup);
            this.animatedObjects.push({
                type: 'warBanner',
                group: bannerGroup,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    addForestVines(ox, oz) {
        const vineMat = new THREE.MeshStandardMaterial({
            color: 0x2d6a1e,
            roughness: 0.8
        });
        const leafMat = new THREE.MeshStandardMaterial({
            color: 0x3a8a2e,
            roughness: 0.7,
            side: THREE.DoubleSide
        });
        for (let i = 0; i < 10; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            if (z > -30) continue;

            const vineGroup = new THREE.Group();
            const vineLen = 2 + Math.random() * 4;
            const segments = Math.floor(vineLen / 0.5);
            for (let s = 0; s < segments; s++) {
                const vGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 4);
                const vine = new THREE.Mesh(vGeo, vineMat);
                vine.position.set((Math.random() - 0.5) * 0.3, s * 0.5, 0);
                vine.rotation.z = (Math.random() - 0.5) * 0.3;
                vineGroup.add(vine);

                // Leaves at intervals
                if (s % 2 === 0) {
                    const leafGeo = new THREE.PlaneGeometry(0.4, 0.2);
                    const leaf = new THREE.Mesh(leafGeo, leafMat);
                    leaf.position.set((Math.random() - 0.5) * 0.5, s * 0.5, (Math.random() - 0.5) * 0.3);
                    leaf.rotation.set(Math.random(), Math.random(), Math.random());
                    vineGroup.add(leaf);
                }
            }
            vineGroup.position.set(x, 0, z);
            this.scene.add(vineGroup);
        }
    }

    addForestRocks(ox, oz) {
        const rockMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x7a7a6a,
            roughness: 0.9,
            flatShading: true
        });
        for (let i = 0; i < 15; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;
            const size = 0.3 + Math.random() * 0.8;
            const rockGeo = new THREE.DodecahedronGeometry(size, 0);
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.set(x, size * 0.4, z);
            rock.scale.set(1, 0.6, 0.8);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true;
            this.scene.add(rock);
        }
    }

    // ========== STONE MAZE BIOME (northeast) ==========
    buildStoneMazeBiome() {
        // Stone ground patches - only inside stone biome (X >= 60, Z <= -60)
        for (let i = 0; i < 8; i++) {
            const x = 60 + Math.random() * 196;
            const z = -256 + Math.random() * 196;

            const stoneGeo = new THREE.PlaneGeometry(3 + Math.random() * 5, 3 + Math.random() * 5);
            const stoneMat = new THREE.MeshStandardMaterial({
                map: this.textures.stone,
                color: new THREE.Color().setHSL(0, 0, 0.35 + Math.random() * 0.15),
                roughness: 0.95,
                flatShading: true
            });
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.rotation.x = -Math.PI / 2;
            stone.rotation.z = Math.random() * Math.PI;
            stone.position.set(x, 2.5, z);
            this.scene.add(stone);
        }

        // Fortress walls with gates
        this.buildFortressWalls();

        // Maze walls with sine-wave pattern
        this.buildStoneMaze();

        // Fortress with spiral staircase
        this.buildFortress(150, -150);
        this.buildFortress(194, -116);
        this.buildFortress(116, -194);
        this.buildFortress(168, -168);

        // Stone houses (reduced)
        for (let i = 0; i < 2; i++) {
            const x = 96 + Math.random() * 102;
            const z = -96 - Math.random() * 102;
            if (x > 20) this.addStoneHouse(x, z, i);
        }

       // Stone props
        this.addStoneProps(150, -150);

        // Stone well
        this.addStoneWell(168, -150);

       // Stone pillars
        this.addStonePillar(132, -142);
        this.addStonePillar(184, -132);
        this.addStonePillar(142, -184);
        this.addStonePillar(194, -174);

        // Stone biome torches
        this.addStoneTorches(150, -150);

        // Stone ruins / broken columns
        this.addStoneRuins(150, -150);

        // Chains on stone pillars
        this.addStoneChains(150, -150);

        // Stone bushes and scrub
        this.addStoneBushes(150, -150);

        // Runestones - standing stones with carved patterns
        this.addRunestones(150, -150);

        // Stone circle (megalithic)
        this.addStoneCircle(184, -184);

       // Small altar
        this.addStoneAltar(132, -132);

        // Windmill
        this.addWindmill(194, -142);
    }

    addStoneWell(x, z) {
        const wellGroup = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x7a7a6a,
            roughness: 0.95
        });

        // Well base ring
        const baseGeo = new THREE.TorusGeometry(2, 0.8, 8, 16);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 1;
        base.rotation.x = Math.PI / 2;
        base.castShadow = true;
        wellGroup.add(base);

        // Well walls (cylinder)
        const wallGeo = new THREE.CylinderGeometry(2.2, 2.2, 2, 16, 4, true);
        const wall = new THREE.Mesh(wallGeo, stoneMat);
        wall.position.y = 2;
        wall.castShadow = true;
        wellGroup.add(wall);

        // Well posts
        for (let i = 0; i < 2; i++) {
            const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 4, 6);
            const post = new THREE.Mesh(postGeo, stoneMat);
            post.position.set(-1.8 + i * 3.6, 3, 0);
            post.castShadow = true;
            wellGroup.add(post);
        }

        // Cross beam
        const beamGeo = new THREE.BoxGeometry(4, 0.3, 0.3);
        const beam = new THREE.Mesh(beamGeo, stoneMat);
        beam.position.y = 5;
        beam.castShadow = true;
        wellGroup.add(beam);

        wellGroup.position.set(x, 2, z);
        this.scene.add(wellGroup);
    }

    addStonePillar(x, z) {
        const pillarGroup = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x6a6a5a,
            roughness: 0.95
        });

        // Pillar base
        const baseGeo = new THREE.BoxGeometry(1.5, 0.5, 1.5);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 0.25;
        pillarGroup.add(base);

        // Pillar shaft
        const shaftGeo = new THREE.CylinderGeometry(0.4, 0.5, 5, 6);
        const shaft = new THREE.Mesh(shaftGeo, stoneMat);
        shaft.position.y = 3;
        shaft.castShadow = true;
        pillarGroup.add(shaft);

        // Pillar top
        const topGeo = new THREE.ConeGeometry(0.8, 1, 6);
        const top = new THREE.Mesh(topGeo, stoneMat);
        top.position.y = 6;
        top.castShadow = true;
        pillarGroup.add(top);

        pillarGroup.position.set(x, 2, z);
        this.scene.add(pillarGroup);
    }

    addStoneTorches(ox, oz) {
        const torchMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            emissive: 0xff4400,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8
        });

        const torchPositions = [
            { x: 100, z: -140 }, { x: 140, z: -100 }, { x: -100, z: -160 },
            { x: 120, z: -120 }, { x: -140, z: -80 }, { x: 80, z: -180 },
            { x: -120, z: -140 }, { x: 140, z: -60 }, { x: -80, z: -160 },
            { x: 110, z: -130 }, { x: -150, z: -110 }, { x: 90, z: -170 },
        ];

        torchPositions.forEach(tp => {
            const torchGroup = new THREE.Group();
            // Stick
            const stickGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.5, 5);
            const stick = new THREE.Mesh(stickGeo, torchMat);
            stick.position.y = 0.75;
            torchGroup.add(stick);
            // Fire
            const fireGeo = new THREE.SphereGeometry(0.25, 5, 5);
            const fire = new THREE.Mesh(fireGeo, fireMat);
            fire.position.y = 1.7;
            fire.scale.set(1, 1.5, 1);
            torchGroup.add(fire);
            // Small flame
            const flameGeo = new THREE.ConeGeometry(0.15, 0.6, 5);
            const flameMat = new THREE.MeshStandardMaterial({
                color: 0xffcc00, emissive: 0xff8800, emissiveIntensity: 1.0
            });
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.y = 2.0;
            torchGroup.add(flame);
            torchGroup.position.set(tp.x, 2, tp.z);
            this.scene.add(torchGroup);
        });
    }

    addStoneRuins(ox, oz) {
        const ruinMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x7a7a6a,
            roughness: 0.95,
            flatShading: true
        });
        // Broken column segments
        for (let i = 0; i < 8; i++) {
            const x = -110 + Math.random() * 220;
            const z = -110 + Math.random() * 220;
            if (Math.abs(x) < 40) continue;

            const ruinGroup = new THREE.Group();
            const type = Math.random();

            if (type < 0.4) {
                // Broken column piece
                const h = 0.5 + Math.random() * 1.5;
                const r = 0.3 + Math.random() * 0.3;
                const colGeo = new THREE.CylinderGeometry(r, r * 1.1, h, 8);
                const col = new THREE.Mesh(colGeo, ruinMat);
                col.position.y = h / 2;
                col.rotation.z = (Math.random() - 0.5) * 0.3;
                col.castShadow = true;
                ruinGroup.add(col);
            } else if (type < 0.7) {
                // Stone slab
                const slabGeo = new THREE.BoxGeometry(1.5 + Math.random(), 0.3, 0.5 + Math.random());
                const slab = new THREE.Mesh(slabGeo, ruinMat);
                slab.position.y = 0.15;
                slab.rotation.y = Math.random() * Math.PI;
                slab.rotation.z = (Math.random() - 0.5) * 0.2;
                slab.castShadow = true;
                ruinGroup.add(slab);
            } else {
                // Pile of stones
                for (let j = 0; j < 3 + Math.floor(Math.random() * 4); j++) {
                    const stoneGeo = new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.4, 0);
                    const stone = new THREE.Mesh(stoneGeo, ruinMat);
                    stone.position.set((Math.random() - 0.5) * 1, j * 0.3, (Math.random() - 0.5) * 1);
                    stone.rotation.set(Math.random(), Math.random(), Math.random());
                    stone.castShadow = true;
                    ruinGroup.add(stone);
                }
            }
            ruinGroup.position.set(x, 2, z);
            this.scene.add(ruinGroup);
        }
    }

    addStoneChains(ox, oz) {
        const chainMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.7,
            metalness: 0.6
        });

        const chainPositions = [
            { x: 100, z: -140 }, { x: 140, z: -100 }, { x: -100, z: -160 },
            { x: 120, z: -120 }, { x: -140, z: -80 }, { x: 80, z: -180 },
        ];

        chainPositions.forEach(cp => {
            const chainGroup = new THREE.Group();
            // Chain links hanging down
            for (let i = 0; i < 4; i++) {
                const linkGeo = new THREE.TorusGeometry(0.12, 0.03, 4, 8);
                const link = new THREE.Mesh(linkGeo, chainMat);
                link.position.y = 4 - i * 0.4;
                link.rotation.x = (i % 2) * Math.PI / 2;
                link.castShadow = true;
                chainGroup.add(link);
            }
            chainGroup.position.set(cp.x, 2, cp.z);
            this.scene.add(chainGroup);
        });
    }

    addStoneBushes(ox, oz) {
        const stoneBushMat = new THREE.MeshStandardMaterial({
            color: 0x5a6a4a,
            roughness: 0.9,
            flatShading: true
        });
        // 30 stone-age bushes/scrub
        for (let i = 0; i < 30; i++) {
            const x = ox + (Math.random() - 0.5) * 200;
            const z = oz + (Math.random() - 0.5) * 200;
            if (Math.abs(x) < 40) continue;

            const size = 0.3 + Math.random() * 0.6;
            const bushGeo = new THREE.DodecahedronGeometry(size, 0);
            const bush = new THREE.Mesh(bushGeo, stoneBushMat);
            bush.position.set(x, size * 0.5, z);
            bush.scale.set(1, 0.6 + Math.random() * 0.4, 1);
            bush.rotation.set(Math.random(), Math.random(), Math.random());
          bush.castShadow = true;
            this.scene.add(bush);
        }
    }

    addRunestones(ox, oz) {
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x6a6a5a,
            roughness: 0.9,
            flatShading: true
        });
        const runeGlowMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            emissive: 0x4488cc,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.6
        });

        for (let i = 0; i < 15; i++) {
            const x = ox + (Math.random() - 0.5) * 560;
            const z = oz + (Math.random() - 0.5) * 560;
            if (x < 200) continue;

            const runeGroup = new THREE.Group();

            // Standing stone
            const stoneGeo = new THREE.BoxGeometry(
                0.5 + Math.random() * 0.5,
                1.5 + Math.random() * 1.5,
                0.3 + Math.random() * 0.3
            );
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.y = stoneGeo.parameters.height / 2;
            stone.rotation.y = Math.random() * 0.2;
            runeGroup.add(stone);

            // Rune carving (small glowing diamond)
            const runeGeo = new THREE.OctahedronGeometry(0.1);
            const rune = new THREE.Mesh(runeGeo, runeGlowMat.clone());
            rune.position.set(0, 1 + Math.random() * 0.5, 0.18);
            rune.material.opacity = 0.4 + Math.random() * 0.4;
            runeGroup.add(rune);

            runeGroup.position.set(x, 2, z);
            this.scene.add(runeGroup);
        }
    }

    addStoneCircle(ox, oz) {
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x7a7a6a,
            roughness: 0.9,
            flatShading: true
        });
        const runeGlowMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            emissive: 0x4488cc,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.6
        });

        const circleRadius = 12;
        const pillarCount = 8;

        for (let i = 0; i < pillarCount; i++) {
            const angle = (i / pillarCount) * Math.PI * 2;
            const pillarGroup = new THREE.Group();

            // Tall pillar
            const pillarGeo = new THREE.CylinderGeometry(0.3, 0.4, 3 + Math.random(), 8);
            const pillar = new THREE.Mesh(pillarGeo, stoneMat);
            pillar.position.y = pillarGeo.parameters.height / 2;
            pillar.castShadow = true;
            pillarGroup.add(pillar);

            // Top cap
            const capGeo = new THREE.ConeGeometry(0.5, 0.5, 8);
            const cap = new THREE.Mesh(capGeo, stoneMat);
            cap.position.y = pillarGeo.parameters.height + 0.25;
            cap.castShadow = true;
            pillarGroup.add(cap);

            const px = ox + Math.cos(angle) * circleRadius;
            const pz = oz + Math.sin(angle) * circleRadius;
            pillarGroup.position.set(px, 2, pz);
            pillarGroup.rotation.y = -angle + Math.PI / 2;
            this.scene.add(pillarGroup);
        }

        // Central altar stone
        const altarGeo = new THREE.BoxGeometry(2, 0.8, 1.5);
        const altar = new THREE.Mesh(altarGeo, stoneMat);
        altar.position.set(ox, 2.4, oz);
        altar.castShadow = true;
        this.scene.add(altar);

        // Glowing rune on altar
        const altarRuneGeo = new THREE.OctahedronGeometry(0.2);
        const altarRune = new THREE.Mesh(altarRuneGeo, runeGlowMat);
        altarRune.position.set(ox, 2.9, oz);
        this.scene.add(altarRune);
    }

    addStoneAltar(ox, oz) {
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x8a8a7a,
            roughness: 0.85,
            flatShading: true
        });

        const altarGroup = new THREE.Group();

        // Base
        const baseGeo = new THREE.BoxGeometry(3, 0.5, 2);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 0.25;
        base.castShadow = true;
        altarGroup.add(base);

        // Table top
        const tableGeo = new THREE.BoxGeometry(3.2, 0.3, 2.2);
        const table = new THREE.Mesh(tableGeo, stoneMat);
        table.position.y = 0.65;
        table.castShadow = true;
        altarGroup.add(table);

        // Back wall
        const backGeo = new THREE.BoxGeometry(3, 2, 0.3);
        const back = new THREE.Mesh(backGeo, stoneMat);
        back.position.set(0, 1.55, -0.85);
        back.castShadow = true;
        altarGroup.add(back);

        // Side pillars
        for (let side = -1; side <= 1; side += 2) {
            const pillarGeo = new THREE.CylinderGeometry(0.2, 0.25, 2, 6);
            const pillar = new THREE.Mesh(pillarGeo, stoneMat);
            pillar.position.set(side * 1.3, 1.55, 0);
            pillar.castShadow = true;
            altarGroup.add(pillar);
        }

        altarGroup.position.set(ox, 2, oz);
        this.scene.add(altarGroup);
    }

    addWindmill(ox, oz) {
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x6b4a2a,
            roughness: 0.9,
            flatShading: true
        });
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x8a8a7a,
            roughness: 0.85,
            flatShading: true
        });
        const sailMat = new THREE.MeshStandardMaterial({
            color: 0xd4c4a0,
            roughness: 0.8,
            side: THREE.DoubleSide
        });

        const windmillGroup = new THREE.Group();

        // Tower body (tapered cylinder)
        const bodyGeo = new THREE.CylinderGeometry(2, 3, 10, 12);
        const body = new THREE.Mesh(bodyGeo, stoneMat);
        body.position.y = 5;
        body.castShadow = true;
        windmillGroup.add(body);

        // Roof (cone)
        const roofGeo = new THREE.ConeGeometry(3, 3, 12);
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
            color: 0x5a3a2a,
            roughness: 0.9
        }));
        roof.position.y = 11.5;
        roof.castShadow = true;
        windmillGroup.add(roof);

        // Door
        const doorGeo = new THREE.BoxGeometry(1.2, 2, 0.2);
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1, 2.9);
        windmillGroup.add(door);

        // Windows
        const winGeo = new THREE.BoxGeometry(0.6, 0.8, 0.2);
        const winMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.6,
            metalness: 0.3,
            roughness: 0.1
        });
        for (let i = 0; i < 3; i++) {
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(0, 3 + i * 2.5, 2.9);
            windmillGroup.add(win);
        }

        // Hub
        const hubGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 8);
        const hub = new THREE.Mesh(hubGeo, woodMat);
        hub.position.set(0, 9, 2.5);
        hub.rotation.x = Math.PI / 2;
        windmillGroup.add(hub);

        // Blades
        const bladeGroup = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const bladeGeo = new THREE.BoxGeometry(0.3, 5, 0.05);
            const blade = new THREE.Mesh(bladeGeo, woodMat);
            blade.position.y = 2.5;
            bladeGroup.add(blade);

            // Sail cloth
            const sailGeo = new THREE.PlaneGeometry(1.5, 4);
            const sail = new THREE.Mesh(sailGeo, sailMat);
            sail.position.set(0.8, 2.5, 0);
            sail.rotation.z = 0.1;
            bladeGroup.add(sail);
        }
        bladeGroup.position.set(0, 9, 2.8);
        bladeGroup.rotation.z = Math.PI / 8; // Slight tilt
        windmillGroup.add(bladeGroup);
        this.animatedObjects.push({ type: 'windmill', group: bladeGroup });

        windmillGroup.position.set(ox, 2, oz);
        this.scene.add(windmillGroup);
    }

    buildFortressWalls() {
        const wallMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x7a7a6a,
            roughness: 0.95,
            flatShading: true
        });

        // Outer wall segments forming a perimeter (inside stone biome X >= 60, Z <= -60)
        const wallPositions = [
            // North wall
            { x: 75, z: -90, w: 60, h: 8, d: 3, ry: 0 },
            { x: 55, z: -90, w: 15, h: 8, d: 3, ry: 0 },
            { x: 95, z: -90, w: 15, h: 8, d: 3, ry: 0 },
            // South wall
            { x: 75, z: -55, w: 60, h: 8, d: 3, ry: 0 },
            // East wall
            { x: 95, z: -75, w: 60, h: 8, d: 3, ry: Math.PI / 2 },
            // West wall
            { x: 55, z: -75, w: 60, h: 8, d: 3, ry: Math.PI / 2 },
        ];

        wallPositions.forEach(wp => {
            const wallGeo = new THREE.BoxGeometry(wp.w, wp.h, wp.d);
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(wp.x, wp.h / 2 + 2, wp.z);
            wall.rotation.y = wp.ry;
            wall.receiveShadow = true;
            this.scene.add(wall);

            // Battlements on top
            const count = Math.floor(wp.w / 4);
            for (let i = 0; i < count; i++) {
                const battGeo = new THREE.BoxGeometry(1.5, 2, 1.2);
                const batt = new THREE.Mesh(battGeo, wallMat);
                const offset = -wp.w / 2 + i * 4 + 2;
                if (wp.ry === 0) {
                    batt.position.set(wp.x + offset, wp.h + 3, wp.z);
                } else {
                    batt.position.set(wp.x, wp.h + 3, wp.z + offset);
                }
                this.scene.add(batt);
            }
        });

        // Gate towers at cardinal points (inside stone biome)
        this.buildGateTower(75, -90);
        this.buildGateTower(75, -55);
    }

    buildGateTower(x, z) {
        const towerGroup = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x6a6a5a,
            roughness: 0.95
        });

       // Tower base
        const baseGeo = new THREE.CylinderGeometry(5, 6, 16, 6);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 8;
        towerGroup.add(base);

        // Tower top
        const topGeo = new THREE.ConeGeometry(6, 6, 6);
        const topMat = new THREE.MeshStandardMaterial({
            color: 0x5a5a4a,
            roughness: 0.95
        });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = 22;
        towerGroup.add(top);

        // Gate opening
        const gateGeo = new THREE.BoxGeometry(4, 6, 4);
        const gateMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a2a,
            roughness: 0.95
        });
        const gate = new THREE.Mesh(gateGeo, gateMat);
        gate.position.y = 3;
        towerGroup.add(gate);

        towerGroup.position.set(x, 2, z);
        this.scene.add(towerGroup);
    }

    buildStoneMaze() {
        const wallMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x5a5a5a,
            roughness: 0.95,
            flatShading: true
        });

        // Vertical walls with sine-wave gaps (inside stone biome X >= 60, Z <= -60)
        for (let x = 60; x < 180; x += 20) {
            for (let z = -180; z < -60; z += 20) {
                const wallX = x + 20;
                const wallZ = z + 20;
                if (wallX < 60 || wallZ > -60) continue;

                const pattern = Math.sin(x * 0.1) + Math.cos(z * 0.1);
                if (pattern > 0 && Math.random() > 0.3) {
                    const wallH = 8 + Math.random() * 6;
                    const wallGeo = new THREE.BoxGeometry(3, wallH, 18);
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(wallX, wallH / 2 + 2, wallZ);
                    wall.receiveShadow = true;
                    this.scene.add(wall);

                    // Wall top detail
                    if (Math.random() > 0.5) {
                        const topGeo = new THREE.BoxGeometry(3.5, 1, 2);
                        const top = new THREE.Mesh(topGeo, wallMat);
                        top.position.set(wallX, wallH + 2.5, wallZ);
                        this.scene.add(top);
                    }
                }
            }
        }

        // Horizontal walls (inside stone biome)
        for (let z = -180; z < -60; z += 20) {
            for (let x = 60; x < 180; x += 20) {
                const wallX = x + 20;
                const wallZ = z + 20;
                if (wallX < 60 || wallZ > -60) continue;

                const pattern = Math.cos(x * 0.08) + Math.sin(z * 0.08);
                if (pattern > 0.2 && Math.random() > 0.4) {
                    const wallH = 8 + Math.random() * 6;
                    const wallGeo = new THREE.BoxGeometry(18, wallH, 3);
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(wallX, wallH / 2 + 2, wallZ);
                    wall.receiveShadow = true;
                    this.scene.add(wall);

                    // Wall top detail
                    if (Math.random() > 0.5) {
                        const topGeo = new THREE.BoxGeometry(2, 1, 3.5);
                        const top = new THREE.Mesh(topGeo, wallMat);
                        top.position.set(wallX, wallH + 2.5, wallZ);
                        this.scene.add(top);
                    }
                }
            }
        }
    }

    buildFortress(x, z) {
        const fortGroup = new THREE.Group();

        // Main base with stone texture
        const baseGeo = new THREE.BoxGeometry(20, 16, 20);
        const baseMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x6b6b6b,
            roughness: 0.9,
            flatShading: true
        });
       const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 8;
        base.receiveShadow = true;
        fortGroup.add(base);

       // Tower
        const towerGeo = new THREE.CylinderGeometry(5, 7, 12, 6);
        const towerMat = new THREE.MeshStandardMaterial({
            map: this.textures.concrete,
            color: 0x5a5a5a,
            roughness: 0.95
        });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.y = 22;
        tower.castShadow = true;
        fortGroup.add(tower);

        // Tower top
        const topGeo = new THREE.ConeGeometry(6, 5, 6);
        const topMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.95,
            flatShading: true
        });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = 31;
        this.scene.add(top);

        // Spiral staircase (inside tower) — disabled for performance
        // for (let i = 0; i < 24; i++) { ... }

        // Battlements on top
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const battGeo = new THREE.BoxGeometry(1.5, 2, 1);
            const batt = new THREE.Mesh(battGeo, baseMat);
            batt.position.set(
                Math.cos(angle) * 5.5,
                28,
                Math.sin(angle) * 5.5
            );
            this.scene.add(batt);
        }

        fortGroup.position.set(x, 2, z);
        this.scene.add(fortGroup);
        this.houseSpots.push({ x, z, width: 40, depth: 40, height: 16 });
    }


    addStoneProps(ox, oz) {
        // Large boulders with stone texture (inside stone biome)
        const boulderMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x6b6b6b,
            roughness: 0.95,
            flatShading: true
        });

        for (let i = 0; i < 30; i++) {
            const x = ox + (Math.random() - 0.5) * 360;
            const z = oz + (Math.random() - 0.5) * 360;

            if (x < 60 || z > -60) continue;

            const bGeo = new THREE.SphereGeometry(1 + Math.random() * 2, 6, 6);
            const boulder = new THREE.Mesh(bGeo, boulderMat);
            boulder.position.set(x, 1.5, z);
            boulder.scale.set(1, 0.6 + Math.random() * 0.4, 1);
            boulder.rotation.y = Math.random() * Math.PI;
            this.scene.add(boulder);
        }
    }

    // ========== MILITARY BIOME (southwest) ==========
    buildMilitaryBiome() {
        // Sand patches - only inside military biome (X <= -60, Z >= 60)
        for (let i = 0; i < 8; i++) {
            const x = -256 + Math.random() * 196;
            const z = 60 + Math.random() * 196;

            const sandGeo = new THREE.PlaneGeometry(4 + Math.random() * 6, 4 + Math.random() * 6);
            const sandMat = new THREE.MeshStandardMaterial({
                map: this.textures.sand,
                color: new THREE.Color().setHSL(0.12, 0.3, 0.45 + Math.random() * 0.1),
                roughness: 0.95
            });
            const sand = new THREE.Mesh(sandGeo, sandMat);
            sand.rotation.x = -Math.PI / 2;
            sand.rotation.z = Math.random() * Math.PI;
            sand.position.set(x, 3.0, z);
            this.scene.add(sand);
        }

        // Crater marks on ground
        this.addCraters(-75, 75);

    // Broken 2-story houses (reduced)
        const housePositions = [
            { x: -224, z: 168 },
            { x: -168, z: 194 },
            { x: -194, z: 116 },
            { x: -116, z: 168 },
            { x: -142, z: 224 }
        ];

        housePositions.forEach((pos, i) => {
            this.addBrokenHouse(pos.x, pos.z, i);
        });

        // Tanks - only inside military biome (X <= -60, Z >= 60)
        for (let i = 0; i < 3; i++) {
            const x = -256 + Math.random() * 196;
            const z = 60 + Math.random() * 196;
            this.addTank(x, z);
        }

        // Military jeeps - only inside military biome (X <= -60, Z >= 60)
        for (let i = 0; i < 2; i++) {
            const x = -256 + Math.random() * 196;
            const z = 60 + Math.random() * 196;
            this.addJeep(x, z);
        }

        // Bunkers
        this.addBunker(-194, 142);
        this.addBunker(-142, 194);
        this.addBunker(-204, 184);
        this.addBunker(-132, 152);

        // Sandbag fortifications
        this.addSandbags(-75, 75);

        // Barbed wire fences
        this.addBarbedWire(-75, 75);

        // Military crates
        this.addMilitaryCrates(-75, 75);

        // Military houses (reduced)
        for (let i = 0; i < 2; i++) {
            const x = -116 - Math.random() * 76;
            const z = 116 + Math.random() * 76;
            if (Math.abs(x) > 20) this.addMilitaryHouse(x, z);
        }

        // Anti-aircraft guns
        this.addAntiAircraftGun(-144, 92);
        this.addAntiAircraftGun(-102, 144);

        // Radio tower
        this.addRadioTower(-116, 116);

        // Military tents (reduced)
        this.addMilitaryTent(-184, 168);
        this.addMilitaryTent(-152, 184);
        this.addMilitaryTent(-204, 152);

        // Command post / field shelter
        this.addFieldShelter(-174, 158);

        // Ammo crates scattered around
        for (let i = 0; i < 10; i++) {
            const x = -150 + Math.random() * 180;
            const z = 150 + Math.random() * 180;
            if (Math.abs(x) > 40) this.addAmmoCrate(x, z);
        }

        // Military signs / warning signs
        this.addMilitarySign(-168, 132);
        this.addMilitarySign(-132, 168);
        this.addMilitarySign(-194, 184);

        // More barbed wire posts (reduced)
        for (let i = 0; i < 8; i++) {
            const x = -220 + Math.random() * 180;
            const z = 96 + Math.random() * 180;
            if (Math.abs(x) > 20) this.addBarbedWirePost(x, z);
        }

        // Wire fence panels
        this.addWireFence(-168, 132);
        this.addWireFence(-132, 194);

        // Camo netting over positions
        this.addCamoNetting(-75, 75);

        // Field desk with map
    this.addFieldDesk(-174, 174);

        // Wrecked military vehicle
        this.addWreckedVehicle(-194, 152);

        // Watchtower
        this.addWatchtower(-184, 174);
    }

    addSandbagWalls(ox, oz) {
        const bagMat = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.95
        });

        // Create wall sections at strategic points (reduced)
        const wallPositions = [
            { x: -110, z: 154, ry: 0 },
            { x: -154, z: 128, ry: Math.PI / 2 },
        ];

        wallPositions.forEach(wp => {
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 4; col++) {
                    const bagGeo = new THREE.BoxGeometry(
                        0.8 + Math.random() * 0.2,
                        0.4 + Math.random() * 0.1,
                        0.5 + Math.random() * 0.2
                    );
                    const bag = new THREE.Mesh(bagGeo, bagMat);
                    bag.position.set(
                        wp.x + col * 0.9,
                        0.3 + row * 0.45,
                        wp.z
                    );
                    bag.rotation.y = wp.ry + (Math.random() - 0.5) * 0.1;
                    bag.rotation.z = (Math.random() - 0.5) * 0.15;
                    bag.castShadow = true;
                    this.scene.add(bag);
                }
            }
        });
    }

    addEquipmentYard(ox, oz) {
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x556655,
            roughness: 0.8,
            metalness: 0.3,
            flatShading: true
        });

        // Barrrel stacks
        for (let i = 0; i < 5; i++) {
            const barrelGroup = new THREE.Group();
            for (let j = 0; j < 3; j++) {
                const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8);
                const barrel = new THREE.Mesh(barrelGeo, metalMat);
                barrel.position.y = 0.4 + j * 0.8;
                barrelGroup.add(barrel);
            }
            barrelGroup.position.set(
                ox + (Math.random() - 0.5) * 10,
                2,
                oz + (Math.random() - 0.5) * 10
            );
            barrelGroup.rotation.y = Math.random() * Math.PI;
            this.scene.add(barrelGroup);
        }

        // Cargo crates stacked
        for (let i = 0; i < 3; i++) {
            const crateGroup = new THREE.Group();
            for (let j = 0; j < 2 + Math.floor(Math.random() * 2); j++) {
                const crateGeo = new THREE.BoxGeometry(
                    0.8 + Math.random() * 0.4,
                    0.8 + Math.random() * 0.4,
                    0.8 + Math.random() * 0.4
                );
                const crate = new THREE.Mesh(crateGeo, metalMat);
                crate.position.y = 0.4 + j * 0.9;
                crate.rotation.y = Math.random() * 0.2;
                crate.castShadow = true;
                crateGroup.add(crate);
            }
            crateGroup.position.set(
                ox + 10 + (Math.random() - 0.5) * 8,
                2,
                oz + (Math.random() - 0.5) * 8
            );
            this.scene.add(crateGroup);
        }
    }

    addWatchtower(ox, oz) {
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.9
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.5,
            roughness: 0.6
        });

        const towerGroup = new THREE.Group();

        // 4 legs
        const legGeo = new THREE.CylinderGeometry(0.15, 0.2, 8, 5);
        const legPositions = [
            { x: -1.5, z: -1.5 }, { x: 1.5, z: -1.5 },
            { x: -1.5, z: 1.5 }, { x: 1.5, z: 1.5 }
        ];
        legPositions.forEach(lp => {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(lp.x, 4, lp.z);
            leg.castShadow = true;
            towerGroup.add(leg);
        });

        // Cross beams
        const beamGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 4);
        for (let y of [2, 5]) {
            const beam1 = new THREE.Mesh(beamGeo, woodMat);
            beam1.position.set(0, y, 0);
            beam1.rotation.z = Math.PI / 2;
            towerGroup.add(beam1);
            const beam2 = new THREE.Mesh(beamGeo, woodMat);
            beam2.position.set(0, y, 0);
            beam2.rotation.x = Math.PI / 2;
            towerGroup.add(beam2);
        }

        // Platform
        const platformGeo = new THREE.BoxGeometry(4, 0.2, 4);
        const platform = new THREE.Mesh(platformGeo, woodMat);
        platform.position.y = 8;
        platform.castShadow = true;
        towerGroup.add(platform);

        // Railing
        const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 4);
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const rail = new THREE.Mesh(railGeo, woodMat);
            rail.position.set(Math.cos(angle) * 1.8, 8.6, Math.sin(angle) * 1.8);
            towerGroup.add(rail);
        }

        // Roof
        const roofGeo = new THREE.ConeGeometry(3, 1.5, 4);
        const roof = new THREE.Mesh(roofGeo, woodMat);
        roof.position.y = 9.5;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        towerGroup.add(roof);

        // Searchlight on top
        const lightGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.5, 8);
        const searchlight = new THREE.Mesh(lightGeo, metalMat);
        searchlight.position.set(0, 8.5, 1.5);
        towerGroup.add(searchlight);

        towerGroup.position.set(ox, 2, oz);
        this.scene.add(towerGroup);
    }

    addMilitaryTent(x, z) {
        const tentGroup = new THREE.Group();
        const tentMat = new THREE.MeshStandardMaterial({
            color: 0x4a5d23,
            roughness: 0.9
        });

        // Tent body - triangular prism shape
        const tentGeo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            // Bottom triangle
            -2.5, 0, -1.5,
             2.5, 0, -1.5,
             0, 0,  1.5,
            // Top point
            -2.5, 0, -1.5,
             2.5, 0, -1.5,
             0, 2.5, 0,
            // Side 1
            -2.5, 0, -1.5,
             0, 0,  1.5,
             0, 2.5, 0,
            // Side 2
             2.5, 0, -1.5,
             0, 0,  1.5,
             0, 2.5, 0,
        ]);
        tentGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        tentGeo.computeVertexNormals();

        const tent = new THREE.Mesh(tentGeo, tentMat);
        tent.castShadow = true;
        tentGroup.add(tent);

        // Tent pole
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 4);
        const pole = new THREE.Mesh(poleGeo, tentMat);
        pole.position.y = 1.25;
        tentGroup.add(pole);

        tentGroup.position.set(x, 2, z);
        this.scene.add(tentGroup);
    }

    addCamoNetting(ox, oz) {
        const camoMat = new THREE.MeshStandardMaterial({
            color: 0x3a4a2a,
            roughness: 0.9,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });

        for (let i = 0; i < 4; i++) {
            const x = ox + (Math.random() - 0.5) * 200;
            const z = oz + (Math.random() - 0.5) * 200;
            if (Math.abs(x) < 40) continue;

            const netGroup = new THREE.Group();
            // Netting as a draped plane
            const netGeo = new THREE.PlaneGeometry(6 + Math.random() * 4, 4 + Math.random() * 2, 6, 4);
            const pos = netGeo.getAttribute('position');
            for (let v = 0; v < pos.count; v++) {
                const px = pos.getX(v);
                const py = pos.getY(v);
                pos.setZ(v, Math.sin(px * 0.5) * 0.5 + Math.cos(py * 0.8) * 0.3);
            }
            netGeo.computeVertexNormals();
            const net = new THREE.Mesh(netGeo, camoMat);
            net.position.set(x, 3, z);
            net.rotation.y = Math.random() * Math.PI;
            net.castShadow = true;
            netGroup.add(net);

            // Support poles
            const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 4, 4);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });
            const p1 = new THREE.Mesh(poleGeo, poleMat);
            p1.position.set(x - 2.5, 2, z - 1);
            netGroup.add(p1);
            const p2 = new THREE.Mesh(poleGeo, poleMat);
            p2.position.set(x + 2.5, 2, z + 1);
            netGroup.add(p2);

            this.scene.add(netGroup);
        }
    }

    addFieldDesk(x, z) {
        const deskGroup = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5a4a3a,
            roughness: 0.9
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x4a5a3a,
            roughness: 0.8,
            metalness: 0.2
        });

        // Desk top
        const topGeo = new THREE.BoxGeometry(2.5, 0.1, 1.5);
        const top = new THREE.Mesh(topGeo, woodMat);
        top.position.y = 1.2;
        top.castShadow = true;
        deskGroup.add(top);

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 4);
        [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(legGeo, metalMat);
            leg.position.set(lx, 0.6, lz);
            deskGroup.add(leg);
        });

        // Map on desk
        const mapGeo = new THREE.PlaneGeometry(1.2, 0.8);
        const mapMat = new THREE.MeshStandardMaterial({
            color: 0xc9b99a,
            roughness: 0.8
        });
        const map = new THREE.Mesh(mapGeo, mapMat);
        map.position.set(0, 1.26, 0);
        map.rotation.x = -Math.PI / 2;
        deskGroup.add(map);

        // Compass on desk
        const compassGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 8);
        const compassMat = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.6,
            metalness: 0.3
        });
        const compass = new THREE.Mesh(compassGeo, compassMat);
        compass.position.set(0.6, 1.28, 0.2);
        deskGroup.add(compass);

        deskGroup.position.set(x, 2, z);
        this.scene.add(deskGroup);
    }

    addWreckedVehicle(x, z) {
        const wreckGroup = new THREE.Group();
        const rustMat = new THREE.MeshStandardMaterial({
            color: 0x5a4a3a,
            roughness: 0.95,
            metalness: 0.3
        });
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x2d2d2d,
            roughness: 0.95
        });

        // Wrecked body - tilted
        const bodyGeo = new THREE.BoxGeometry(3, 1.5, 5);
        const body = new THREE.Mesh(bodyGeo, rustMat);
        body.position.set(0, 1.2, 0);
        body.rotation.z = 0.15;
        body.rotation.x = -0.1;
        body.castShadow = true;
        wreckGroup.add(body);

        // Missing roof - just partial
        const roofGeo = new THREE.BoxGeometry(2.8, 0.1, 3);
        const roof = new THREE.Mesh(roofGeo, rustMat);
        roof.position.set(0.3, 2.2, -0.5);
        roof.rotation.z = 0.3;
        wreckGroup.add(roof);

        // Flat tires
        const tireGeo = new THREE.TorusGeometry(0.5, 0.2, 6, 8);
        [[-1.3, -1.5], [1.3, -1.5], [-1.3, 1.5], [1.3, 1.5]].forEach(([tx, tz]) => {
            const tire = new THREE.Mesh(tireGeo, tireMat);
            tire.position.set(tx, 0.5, tz);
            tire.rotation.y = Math.PI / 2;
            // Flat
            tire.scale.set(1, 0.6, 1);
            wreckGroup.add(tire);
        });

        // Broken windshield
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x88aacc,
            transparent: true,
            opacity: 0.3,
            roughness: 0.1
        });
        const glassGeo = new THREE.PlaneGeometry(2.5, 1.2);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(0.5, 1.8, 2.6);
        glass.rotation.x = -0.3;
        wreckGroup.add(glass);

        wreckGroup.position.set(x, 2, z);
        wreckGroup.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(wreckGroup);
    }

    addAmmoPiles(ox, oz) {
        const ammoMat = new THREE.MeshStandardMaterial({
            color: 0x5a6a3a,
            roughness: 0.85,
            metalness: 0.1
        });

        for (let i = 0; i < 8; i++) {
            const x = ox + (Math.random() - 0.5) * 100;
            const z = oz + (Math.random() - 0.5) * 100;
            if (Math.abs(x) < 20) continue;

            const pileGroup = new THREE.Group();
            const ammoCount = 3 + Math.floor(Math.random() * 5);
            for (let j = 0; j < ammoCount; j++) {
                const ammoGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6);
                const ammo = new THREE.Mesh(ammoGeo, ammoMat);
                ammo.position.set((Math.random() - 0.5) * 0.5, j * 0.3, (Math.random() - 0.5) * 0.5);
                ammo.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
                ammo.rotation.y = Math.random() * Math.PI;
                ammo.castShadow = true;
                pileGroup.add(ammo);
            }
            pileGroup.position.set(x, 2, z);
            this.scene.add(pileGroup);
        }
    }

    addMilitaryGroundDetails(ox, oz) {
        // Dirt/mud patches on military ground
        const mudMat = new THREE.MeshStandardMaterial({
            color: 0x5a5040,
            roughness: 1.0,
            flatShading: true
        });
        for (let i = 0; i < 60; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;
            if (Math.abs(x) < 20) continue;
            const size = 2 + Math.random() * 4;
            const patchGeo = new THREE.CircleGeometry(size, 6);
            const patch = new THREE.Mesh(patchGeo, mudMat);
            patch.rotation.x = -Math.PI / 2;
            patch.rotation.z = Math.random() * Math.PI;
            patch.position.set(x, 2.07, z);
            this.scene.add(patch);
        }

        // Wire coils scattered
        const wireMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.8,
            metalness: 0.4
        });
        for (let i = 0; i < 20; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;
            if (Math.abs(x) < 20) continue;
            const coilGroup = new THREE.Group();
            for (let j = 0; j < 6; j++) {
                const wireGeo = new THREE.TorusGeometry(0.3 + j * 0.15, 0.02, 4, 8);
                const wire = new THREE.Mesh(wireGeo, wireMat);
                wire.position.y = j * 0.1;
                wire.rotation.x = Math.PI / 2;
                coilGroup.add(wire);
            }
            coilGroup.position.set(x, 2.1, z);
            coilGroup.rotation.z = Math.random() * Math.PI;
            this.scene.add(coilGroup);
        }
    }

    addFieldShelter(x, z) {
        const shelterGroup = new THREE.Group();
        const shelterMat = new THREE.MeshStandardMaterial({
            color: 0x5a5a4a,
            roughness: 0.9
        });

        // Main structure
        const bodyGeo = new THREE.BoxGeometry(6, 3, 4);
        const body = new THREE.Mesh(bodyGeo, shelterMat);
        body.position.y = 1.5;
        body.castShadow = true;
        shelterGroup.add(body);

        // Roof
        const roofGeo = new THREE.BoxGeometry(7, 0.3, 5);
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a3a,
            roughness: 0.95
        });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 3.15;
        roof.castShadow = true;
        shelterGroup.add(roof);

        // Door
        const doorGeo = new THREE.BoxGeometry(1.5, 2.5, 0.2);
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.9
        });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1.25, 2.1);
        shelterGroup.add(door);

        shelterGroup.position.set(x, 2, z);
        this.scene.add(shelterGroup);
        this.houseSpots.push({ x, z, width: 6, depth: 4, height: 3 });
    }

    addAmmoCrate(x, z) {
        const crateGroup = new THREE.Group();
        const crateMat = new THREE.MeshStandardMaterial({
            color: 0x6b6b4a,
            roughness: 0.9,
            flatShading: true
        });

        // Crate body
        const crateGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8);
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.y = 0.4;
        crate.castShadow = true;
        crateGroup.add(crate);

        // Crate lid
        const lidGeo = new THREE.BoxGeometry(1.3, 0.1, 0.9);
        const lid = new THREE.Mesh(lidGeo, crateMat);
        lid.position.y = 0.85;
        lid.castShadow = true;
        crateGroup.add(lid);

        // Metal bands
        const bandMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.7,
            metalness: 0.5
        });
        const bandGeo = new THREE.BoxGeometry(1.25, 0.05, 0.85);
        const band1 = new THREE.Mesh(bandGeo, bandMat);
        band1.position.y = 0.4;
        crateGroup.add(band1);
        const band2 = new THREE.Mesh(bandGeo, bandMat);
        band2.position.y = 0.7;
        crateGroup.add(band2);

        crateGroup.position.set(x, 2, z);
        crateGroup.rotation.y = Math.random() * Math.PI;
        this.scene.add(crateGroup);
    }

    addMilitarySign(x, z) {
        const signGroup = new THREE.Group();
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0x5a5a5a,
            roughness: 0.8,
            metalness: 0.3
        });

        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 3, 6);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.5;
        pole.castShadow = true;
        signGroup.add(pole);

        // Sign board
        const signGeo = new THREE.BoxGeometry(1.5, 0.8, 0.1);
        const signMat = new THREE.MeshStandardMaterial({
            color: 0x8b0000,
            roughness: 0.7
        });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, 2.8, 0);
        sign.castShadow = true;
        signGroup.add(sign);

        // Warning stripe
        const stripeGeo = new THREE.BoxGeometry(1.4, 0.15, 0.11);
        const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.6 });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(0, 2.8, 0);
        signGroup.add(stripe);

        signGroup.position.set(x, 2, z);
        signGroup.rotation.y = Math.random() * Math.PI;
        this.scene.add(signGroup);
    }

    addBarbedWirePost(x, z) {
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.8,
            metalness: 0.4
        });

        const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 2, 4);
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 1, z);
        post.castShadow = true;
        this.scene.add(post);
    }

    addWireFence(x, z) {
        const fenceMat = new THREE.MeshStandardMaterial({
            color: 0x6a6a6a,
            roughness: 0.8,
            metalness: 0.5
        });

        // Create a wire mesh fence panel
        const panelW = 4;
        const panelH = 2;
        const meshSize = 0.5;

        // Horizontal wires
        for (let y = 0; y <= panelH; y += meshSize) {
            const wireGeo = new THREE.CylinderGeometry(0.01, 0.01, panelW, 3);
            const wire = new THREE.Mesh(wireGeo, fenceMat);
            wire.position.set(x, 2 + y, z);
            wire.rotation.z = Math.PI / 2;
            this.scene.add(wire);
        }

        // Vertical wires
        for (let dx = -panelW / 2; dx <= panelW / 2; dx += meshSize) {
            const wireGeo = new THREE.CylinderGeometry(0.01, 0.01, panelH, 3);
            const wire = new THREE.Mesh(wireGeo, fenceMat);
            wire.position.set(x + dx, 2 + panelH / 2, z);
            this.scene.add(wire);
        }

        // Posts
        const postGeo = new THREE.CylinderGeometry(0.06, 0.07, panelH + 0.5, 4);
        [-panelW / 2, panelW / 2].forEach(dx => {
            const post = new THREE.Mesh(postGeo, fenceMat);
            post.position.set(x + dx, 2 + panelH / 2 - 0.25, z);
            post.castShadow = true;
            this.scene.add(post);
        });
    }

    addCraters(ox, oz) {
        for (let i = 0; i < 15; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;

            if (Math.abs(x) < 20) continue;

            const craterGeo = new THREE.CircleGeometry(2 + Math.random() * 3, 12);
            const craterMat = new THREE.MeshStandardMaterial({
                color: 0x3a3a2a,
                roughness: 1.0
            });
            const crater = new THREE.Mesh(craterGeo, craterMat);
            crater.rotation.x = -Math.PI / 2;
            crater.position.set(x, 2.06, z);
            this.scene.add(crater);

            // Crater rim
            const rimGeo = new THREE.RingGeometry(2 + Math.random() * 2, 2.5 + Math.random() * 3.5, 12);
            const rimMat = new THREE.MeshStandardMaterial({
                color: 0x5a5a4a,
                roughness: 0.95,
                side: THREE.DoubleSide
            });
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.x = -Math.PI / 2;
            rim.position.set(x, 2.07, z);
            this.scene.add(rim);
        }
    }

    addAntiAircraftGun(x, z) {
        const gunGroup = new THREE.Group();
        const gunMat = new THREE.MeshStandardMaterial({
            color: 0x4a5d23,
            roughness: 0.9
        });

        // Base platform
        const baseGeo = new THREE.CylinderGeometry(2, 2.5, 0.5, 8);
        const base = new THREE.Mesh(baseGeo, gunMat);
        base.position.y = 0.25;
        base.castShadow = true;
        gunGroup.add(base);

        // Gun mount
        const mountGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
        const mount = new THREE.Mesh(mountGeo, gunMat);
        mount.position.y = 1;
        mount.castShadow = true;
        gunGroup.add(mount);

        // Gun barrel (elevated)
        const barrelGeo = new THREE.CylinderGeometry(0.2, 0.2, 5, 8);
        const barrel = new THREE.Mesh(barrelGeo, gunMat);
        barrel.position.set(0, 2, 1);
        barrel.rotation.x = -Math.PI / 4;
        barrel.castShadow = true;
        gunGroup.add(barrel);

        gunGroup.position.set(x, 2, z);
        this.scene.add(gunGroup);
    }

    addRadioTower(x, z) {
        const towerGroup = new THREE.Group();
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x5a5a5a,
            roughness: 0.7,
            metalness: 0.5
        });

        // Main pole
        const poleGeo = new THREE.CylinderGeometry(0.3, 0.5, 15, 6);
        const pole = new THREE.Mesh(poleGeo, metalMat);
        pole.position.y = 7.5;
        pole.castShadow = true;
        towerGroup.add(pole);

        // Cross beams
        for (let i = 0; i < 3; i++) {
            const beamGeo = new THREE.BoxGeometry(3 + i, 0.2, 0.2);
            const beam = new THREE.Mesh(beamGeo, metalMat);
            beam.position.y = 5 + i * 4;
            beam.castShadow = true;
            towerGroup.add(beam);
        }

        // Antenna dish
        const dishGeo = new THREE.ConeGeometry(2, 1, 8, 1, true);
        const dishMat = new THREE.MeshStandardMaterial({
            color: 0x8a8a8a,
            roughness: 0.4,
            metalness: 0.6,
            side: THREE.DoubleSide
        });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.set(0, 14, 0);
        dish.rotation.x = Math.PI;
        dish.castShadow = true;
        towerGroup.add(dish);

        // Blinking light on top
        const lightGeo = new THREE.SphereGeometry(0.2, 6, 6);
        const lightMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1.0
        });
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.y = 15.5;
        towerGroup.add(light);

        towerGroup.position.set(x, 2, z);
        this.scene.add(towerGroup);
        this.animatedObjects.push({ type: 'radioLight', obj: light });
    }

    addBrokenHouse(x, z, variant = 0) {
        const houseGroup = new THREE.Group();

        // Damaged walls with concrete texture
        const wallMat = new THREE.MeshStandardMaterial({
            map: this.textures.concrete,
            color: 0x6b6b6b,
            roughness: 0.95,
            flatShading: true
        });

        const wallColors = [0x7a7a6a, 0x6a6a5a, 0x5a5a4a];
        wallMat.color = new THREE.Color(wallColors[variant % wallColors.length]);

        // Front wall (damaged at random height)
        const frontHeights = [6, 8, 4, 7];
        const fh = frontHeights[variant % frontHeights.length];
        const fwGeo = new THREE.BoxGeometry(12, fh, 0.5);
        const fw = new THREE.Mesh(fwGeo, wallMat);
        fw.position.set(0, fh / 2, 6);
        fw.castShadow = true;
        houseGroup.add(fw);

        // Back wall
        const bh = variant % 3 === 0 ? 5 : 8;
        const bwGeo = new THREE.BoxGeometry(12, bh, 0.5);
        const bw = new THREE.Mesh(bwGeo, wallMat);
        bw.position.set(0, bh / 2, -6);
        bw.castShadow = true;
        houseGroup.add(bw);

        // Side walls (partially destroyed)
        const swGeo = new THREE.BoxGeometry(0.5, 8, 12);
        const sw1 = new THREE.Mesh(swGeo, wallMat);
        sw1.position.set(-6, 4, 0);
        sw1.castShadow = true;
        houseGroup.add(sw1);

        const sw2H = variant % 2 === 0 ? 3 : 6;
        const sw2Geo = new THREE.BoxGeometry(0.5, sw2H, 12);
        const sw2 = new THREE.Mesh(sw2Geo, wallMat);
        sw2.position.set(6, sw2H / 2, 0);
        sw2.castShadow = true;
        houseGroup.add(sw2);

        // Floor (partial)
        const floorGeo = new THREE.BoxGeometry(12, 0.4, 12);
        const floor = new THREE.Mesh(floorGeo, wallMat);
        floor.position.set(0, 4, 0);
        floor.castShadow = true;
        houseGroup.add(floor);

        // Exposed beams
        for (let i = 0; i < 3; i++) {
            const beamGeo = new THREE.BoxGeometry(0.3, 0.3, 12);
            const beamMat = new THREE.MeshStandardMaterial({
                color: 0x3d3d3d,
                roughness: 0.95
            });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.position.set(
                (Math.random() - 0.5) * 10,
                4 + Math.random() * 3,
                (Math.random() - 0.5) * 5
            );
            beam.castShadow = true;
            houseGroup.add(beam);
        }

        // Debris
        for (let i = 0; i < 12; i++) {
            const debrisGeo = new THREE.BoxGeometry(
                0.5 + Math.random(), 0.3 + Math.random() * 0.5,
                0.5 + Math.random()
            );
            const debris = new THREE.Mesh(debrisGeo, wallMat);
            debris.position.set(
                (Math.random() - 0.5) * 16,
                0.3 + Math.random() * 0.5,
                6 + Math.random() * 4
            );
            debris.rotation.y = Math.random() * Math.PI;
            debris.rotation.z = (Math.random() - 0.5) * 0.3;
            houseGroup.add(debris);
        }

        houseGroup.position.set(x, 2, z);
        this.scene.add(houseGroup);
        this.houseSpots.push({ x, z, width: 12, depth: 12, height: 8 });
    }

    addTank(x, z) {
        const tankGroup = new THREE.Group();
        const tankColor = 0x4a5d23;
        const tankMat = new THREE.MeshStandardMaterial({
            color: tankColor, roughness: 0.85, metalness: 0.1
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x2d3d1d, roughness: 0.9
        });
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0x555555, roughness: 0.5, metalness: 0.6
        });

        // Lower hull
        const lowerGeo = new THREE.BoxGeometry(5.5, 1.8, 9);
        const lower = new THREE.Mesh(lowerGeo, tankMat);
        lower.position.y = 1.2;
        lower.castShadow = true;
        tankGroup.add(lower);

        // Upper hull (sloped front)
        const upperGeo = new THREE.BoxGeometry(5, 1.2, 7);
        const upper = new THREE.Mesh(upperGeo, tankMat);
        upper.position.set(0, 2.4, -0.5);
        tankGroup.add(upper);

        // Sloped front armor
        const armorGeo = new THREE.BoxGeometry(5, 1.5, 0.3);
        const armor = new THREE.Mesh(armorGeo, tankMat);
        armor.position.set(0, 2.2, 3.8);
        armor.rotation.x = -0.3;
        tankGroup.add(armor);

        // Engine deck on top rear
        const engineGeo = new THREE.BoxGeometry(4, 0.5, 3);
        const engine = new THREE.Mesh(engineGeo, darkMat);
        engine.position.set(0, 3.3, -2.5);
        tankGroup.add(engine);

        // Turret base
        const turretBaseGeo = new THREE.CylinderGeometry(2, 2.2, 0.6, 6);
        const turretBase = new THREE.Mesh(turretBaseGeo, tankMat);
        turretBase.position.set(0, 3.0, 0.5);
        tankGroup.add(turretBase);

        // Turret dome
        const turretGeo = new THREE.SphereGeometry(1.8, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const turret = new THREE.Mesh(turretGeo, tankMat);
        turret.position.set(0, 3.0, 0.5);
        tankGroup.add(turret);

        // Main cannon
        const cannonGeo = new THREE.CylinderGeometry(0.25, 0.35, 8, 8);
        const cannon = new THREE.Mesh(cannonGeo, steelMat);
        cannon.rotation.x = Math.PI / 2;
        cannon.position.set(0, 3.2, 6);
        cannon.castShadow = false;
        tankGroup.add(cannon);

        // Cannon muzzle brake
        const muzzleGeo = new THREE.CylinderGeometry(0.4, 0.25, 1, 6);
        const muzzle = new THREE.Mesh(muzzleGeo, steelMat);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 3.2, 10);
        tankGroup.add(muzzle);

        // Coaxial machine gun
        const mgGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 4);
        const mg = new THREE.Mesh(mgGeo, steelMat);
        mg.rotation.x = Math.PI / 2;
        mg.position.set(0.5, 3.4, 5.5);
        tankGroup.add(mg);

        // Hatches on turret — disabled for performance
        // for (let i = 0; i < 3; i++) { ... }

        // Tracks with detailed design
        const trackMat = new THREE.MeshStandardMaterial({
            color: 0x2d2d2d, roughness: 0.95
        });

        // Left track assembly
        this._addTrackAssembly(tankGroup, -3.2, trackMat, darkMat);
        this._addTrackAssembly(tankGroup, 3.2, trackMat, darkMat);

        // Random rotation for variety
        tankGroup.rotation.y = Math.random() * Math.PI * 2;
        tankGroup.position.set(x, 2, z);
        this.scene.add(tankGroup);
    }

    _addTrackAssembly(group, offset, trackMat, darkMat) {
        // Track housing
        const housingGeo = new THREE.BoxGeometry(0.8, 1.8, 10);
        const housing = new THREE.Mesh(housingGeo, trackMat);
        housing.position.set(offset, 0.9, 0);
        housing.castShadow = true;
        group.add(housing);

        // Track pads
        for (let i = -4; i <= 4; i++) {
            const padGeo = new THREE.BoxGeometry(1.0, 0.3, 0.6);
            const pad = new THREE.Mesh(padGeo, darkMat);
            pad.position.set(offset, 0.3, i * 1.1);
            group.add(pad);
        }

        // Road wheels
        for (let i = -3; i <= 3; i++) {
            const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10);
            const wheel = new THREE.Mesh(wheelGeo, darkMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(offset, 0.6, i * 1.2);
            group.add(wheel);
        }

        // Drive sprocket at rear
        const sprocketGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12);
        const sprocket = new THREE.Mesh(sprocketGeo, trackMat);
        sprocket.rotation.z = Math.PI / 2;
        sprocket.position.set(offset, 0.9, -5);
        group.add(sprocket);

        // Idler at front
        const idlerGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10);
        const idler = new THREE.Mesh(idlerGeo, trackMat);
        idler.rotation.z = Math.PI / 2;
        idler.position.set(offset, 0.9, 5);
        group.add(idler);
    }

    addJeep(x, z) {
        const jeepGroup = new THREE.Group();
        const jeepMat = new THREE.MeshStandardMaterial({
            color: 0x4a5d23, roughness: 0.9
        });

        // Body
        const bodyGeo = new THREE.BoxGeometry(2.5, 1.5, 4.5);
        const body = new THREE.Mesh(bodyGeo, jeepMat);
        body.position.y = 0.75;
        body.castShadow = true;
        jeepGroup.add(body);

        // Cabin
        const cabinGeo = new THREE.BoxGeometry(2.2, 1.2, 2);
        const cabinMat = new THREE.MeshStandardMaterial({
            color: 0x3d4a1d, roughness: 0.9
        });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, 2.1, -0.5);
        cabin.castShadow = true;
        jeepGroup.add(cabin);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
        const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, roughness: 0.95
        });

        [[-1.3, -2], [-1.3, 2], [1.3, -2], [1.3, 2]].forEach(([wx, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(wx, 0.5, wz);
            jeepGroup.add(wheel);
        });

        jeepGroup.position.set(x, 2, z);
        this.scene.add(jeepGroup);
    }

    addBunker(x, z) {
        const bunkerGroup = new THREE.Group();

        // Main bunker body with concrete texture
        const bodyGeo = new THREE.BoxGeometry(8, 3, 6);
        const bodyMat = new THREE.MeshStandardMaterial({
            map: this.textures.concrete,
            color: 0x5a5a4a,
            roughness: 0.95,
            flatShading: true
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.5;
        body.castShadow = true;
        bunkerGroup.add(body);

        // Dome top
        const domeGeo = new THREE.SphereGeometry(4, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, bodyMat);
        dome.position.y = 3;
        dome.castShadow = true;
        bunkerGroup.add(dome);

        // Gun slit
        const slitGeo = new THREE.BoxGeometry(0.5, 0.8, 6);
        const slitMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d });
        const slit = new THREE.Mesh(slitGeo, slitMat);
        slit.position.set(4.1, 2, 0);
        bunkerGroup.add(slit);

        bunkerGroup.position.set(x, 2, z);
        this.scene.add(bunkerGroup);
    }

    addSandbags(ox, oz) {
        const bagMat = new THREE.MeshStandardMaterial({
            color: 0x8b7355, roughness: 0.95
        });

        for (let i = 0; i < 60; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;

            if (x > -60) continue;

            const bagGeo = new THREE.BoxGeometry(1.2, 0.6, 0.8);
            const bag = new THREE.Mesh(bagGeo, bagMat);
            bag.position.set(x, 0.3, z);
            bag.rotation.y = Math.random() * Math.PI;
            bag.rotation.z = (Math.random() - 0.5) * 0.2;
            bag.castShadow = true;
            this.scene.add(bag);
        }
    }

    addBarbedWire(ox, oz) {
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a, roughness: 0.95
        });

        // Fence posts
        for (let i = 0; i < 40; i++) {
            const x = -90 + i * 10;
            const z = -37 + (Math.random() - 0.5) * 60;

            if (Math.abs(x) < 20) continue;

            const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 3, 4);
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(x, 1.5, z);
            pole.castShadow = true;
            this.scene.add(pole);

            // Wire between posts
            if (i < 39) {
                const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, 18, 3);
                const wireMat = new THREE.MeshStandardMaterial({
                    color: 0x666666, metalness: 0.5, roughness: 0.5
                });
                const wire = new THREE.Mesh(wireGeo, wireMat);
                wire.position.set(x + 9, 2.8, z);
                wire.rotation.z = Math.PI / 2;
                this.scene.add(wire);
            }
        }
    }

    addMilitaryCrates(ox, oz) {
        const crateMat = new THREE.MeshStandardMaterial({
            color: 0x556b2f, roughness: 0.8
        });

        for (let i = 0; i < 30; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;

            if (x > -60) continue;

            const crateGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
            const crate = new THREE.Mesh(crateGeo, crateMat);
            crate.position.set(x, 0.6, z);
            crate.rotation.y = Math.random() * Math.PI;
            crate.castShadow = true;
            this.scene.add(crate);
        }
    }

    addMilitaryHouse(x, z) {
        const houseGroup = new THREE.Group();

        // Simple military building with concrete texture
        const wallGeo = new THREE.BoxGeometry(12, 6, 10);
        const wallMat = new THREE.MeshStandardMaterial({
            map: this.textures.concrete,
            color: 0x5a5a4a,
            roughness: 0.95,
            flatShading: true
        });
        const walls = new THREE.Mesh(wallGeo, wallMat);
        walls.position.y = 3;
        walls.castShadow = true;
        houseGroup.add(walls);

        // Flat roof
        const roofGeo = new THREE.BoxGeometry(13, 0.5, 11);
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a3a,
            roughness: 0.95
        });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 6.25;
        roof.castShadow = true;
        houseGroup.add(roof);

        // Door
        const doorGeo = new THREE.BoxGeometry(2, 3, 0.2);
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.9
        });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1.5, 5.1);
        houseGroup.add(door);

        houseGroup.position.set(x, 2, z);
        this.scene.add(houseGroup);
        this.houseSpots.push({ x, z, width: 12, depth: 10, height: 6 });
    }

    // ========== SNOW BIOME (southeast) ==========
    buildSnowBiome() {
        // Snow ground variation - only inside snow biome (X >= 60, Z >= 60)
        for (let i = 0; i < 8; i++) {
            const x = 60 + Math.random() * 196;
            const z = 60 + Math.random() * 196;

            const snowGeo = new THREE.PlaneGeometry(3 + Math.random() * 5, 3 + Math.random() * 5);
            const snowMat = new THREE.MeshStandardMaterial({
                map: this.textures.snow,
                color: new THREE.Color().setHSL(0, 0, 0.9 + Math.random() * 0.1),
                roughness: 0.8
            });
            const snow = new THREE.Mesh(snowGeo, snowMat);
            snow.rotation.x = -Math.PI / 2;
            snow.rotation.z = Math.random() * Math.PI;
            snow.position.set(x, 3.5, z);
            this.scene.add(snow);
        }

        // Snow fir trees (reduced)
        for (let i = 0; i < 10; i++) {
            const x = 96 + Math.random() * 180;
            const z = 96 + Math.random() * 180;

            if (x < 20) continue;

            this.addSnowTree(x, z);
        }

        // Frozen pond
        this.addFrozenPond(150, 150);

        // Second frozen pond
        this.addFrozenPond(184, 132);

        // Igloos (reduced)
        for (let i = 0; i < 4; i++) {
            const x = 96 + Math.random() * 180;
            const z = 96 + Math.random() * 180;

            if (x > 20) this.addIgu(x, z);
        }

        // Snow biome houses (wooden cabins with snow-covered roofs)
        for (let i = 0; i < 6; i++) {
            const hx = 80 + Math.random() * 160;
            const hz = 80 + Math.random() * 160;
            if (hx < 20) continue;
            this.addSnowHouse(hx, hz, i);
        }

        // Ice spikes
        this.addIceSpikes(150, 150);

       // Snow mounds / drifts
        this.addSnowDrifts(150, 150);

        // Dead trees in snow (reduced)
        for (let i = 0; i < 8; i++) {
            const x = 96 + Math.random() * 180;
            const z = 96 + Math.random() * 180;
            if (x < 20) continue;
            this.addDeadSnowTree(x, z);
        }

        // Snow rocks (reduced)
        for (let i = 0; i < 10; i++) {
            const x = 96 + Math.random() * 180;
            const z = 96 + Math.random() * 180;
            if (x < 20) continue;
            this.addSnowRock(x, z);
        }

        // Snow sleds
        this.addSnowSleds(150, 150);

        // Snowman
        this.addSnowman(184, 184);

       // Snow-covered igloo variant
        this.addSnowIglooCluster(142, 194);

        // Snow ice patches on ground
        this.addSnowIcePatches(150, 150);

        // Snow bushes
        this.addSnowBushes(150, 150);

        // Ice cave entrance
        this.addIceCave(194, 184);

        // Snow sculpture (animal shape)
        this.addSnowSculpture(168, 204);

        // Snow drifts around trees - DISABLED
        // this.addSnowDriftDetails(55, 55);

        // Falling snow particles - DISABLED
        // this.addSnowParticles();

        // Frozen pond ripples - DISABLED
        // this.addFrozenPondRipples(55, 55);

        // Ice crystal clusters - DISABLED
        // this.addIceCrystals();

        // Snow tracks / paths - DISABLED
        // this.addSnowTracks(128, 128);

        // Snow mounds - DISABLED
        // this.addSnowMounds();
    }

    addSnowMounds() {
        const snowMoundMat = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5,
            roughness: 0.7,
            flatShading: true
        });

        for (let i = 0; i < 10; i++) {
            const x = 110 + Math.random() * 110;
            const z = 110 + Math.random() * 110;
            if (x < 40) continue;

            const moundGeo = new THREE.SphereGeometry(1 + Math.random() * 2, 6, 5);
            const mound = new THREE.Mesh(moundGeo, snowMoundMat);
            mound.position.set(x, 1.5, z);
            mound.scale.y = 0.4 + Math.random() * 0.3;
            this.scene.add(mound);
        }
    }

    addSnowParticles() {
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x8899aa,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.7
        });

        for (let i = 0; i < 40; i++) {
            const snowGeo = new THREE.SphereGeometry(0.06 + Math.random() * 0.1, 3, 3);
            const snow = new THREE.Mesh(snowGeo, snowMat.clone());
            snow.material.opacity = 0.4 + Math.random() * 0.4;
            snow.position.set(
                56 + Math.random() * 180,
                5 + Math.random() * 25,
                56 + Math.random() * 180
            );
            this.scene.add(snow);
            this.animatedObjects.push({
                type: 'snow',
                obj: snow,
                baseX: snow.position.x,
                baseZ: snow.position.z,
                phase: Math.random() * Math.PI * 2,
                speed: 0.3 + Math.random() * 0.5
            });
        }
    }

    addFrozenPondRipples(ox, oz) {
        const rippleMat = new THREE.MeshStandardMaterial({
            color: 0xccddff,
            transparent: true,
            opacity: 0.3,
            roughness: 0.1,
            side: THREE.DoubleSide
        });

        // Add ripples to each frozen pond
        const pondPositions = [
            { x: 480, z: 480 },
            { x: 640, z: 360 }
        ];

        pondPositions.forEach(pond => {
            for (let i = 0; i < 15; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = 3 + Math.random() * 18;
                const rippleGeo = new THREE.RingGeometry(r - 0.1, r + 0.1, 16);
                const ripple = new THREE.Mesh(rippleGeo, rippleMat.clone());
                ripple.material.opacity = 0.15 + Math.random() * 0.2;
                ripple.rotation.x = -Math.PI / 2;
                ripple.position.set(
                    pond.x + Math.cos(angle) * r * 0.5,
                    2.13,
                    pond.z + Math.sin(angle) * r * 0.5
                );
                this.scene.add(ripple);
                this.animatedObjects.push({
                    type: 'iceRipple',
                    obj: ripple,
                    phase: Math.random() * Math.PI * 2
                });
            }
        });
    }

    addSnowTracks(ox, oz) {
        const trackMat = new THREE.MeshStandardMaterial({
            color: 0xd0d8e0,
            roughness: 0.85
        });

        // Animal tracks - small depressions
        for (let i = 0; i < 20; i++) {
            const x = -110 + Math.random() * 220;
            const z = -110 + Math.random() * 220;
            if (Math.abs(x) < 40) continue;

            const trackGeo = new THREE.PlaneGeometry(0.15, 0.25);
            const track = new THREE.Mesh(trackGeo, trackMat);
            track.rotation.x = -Math.PI / 2;
            track.rotation.z = Math.random() * Math.PI;
            track.position.set(x, 2.3, z);
            this.scene.add(track);
        }
    }

    addIceCave(ox, oz) {
        const iceMat = new THREE.MeshStandardMaterial({
            color: 0x88ccdd,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.2,
            flatShading: true
        });
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x5a5a4a,
            roughness: 0.95,
            flatShading: true
        });

        const caveGroup = new THREE.Group();

        // Cave opening - rock arch
        const archGeo = new THREE.TorusGeometry(3, 1.5, 6, 8, Math.PI);
        const arch = new THREE.Mesh(archGeo, rockMat);
        arch.position.set(0, 2, 0);
        arch.castShadow = true;
        caveGroup.add(arch);

        // Ice stalactites inside
        for (let i = 0; i < 8; i++) {
            const stalGeo = new THREE.ConeGeometry(0.2 + Math.random() * 0.3, 1 + Math.random() * 2, 5);
            const stal = new THREE.Mesh(stalGeo, iceMat);
            stal.position.set(
                (Math.random() - 0.5) * 4,
                3 + Math.random(),
                (Math.random() - 0.5) * 3
            );
            stal.rotation.z = Math.PI;
            caveGroup.add(stal);
        }

        // Ice stalagmites
        for (let i = 0; i < 6; i++) {
            const stagGeo = new THREE.ConeGeometry(0.15 + Math.random() * 0.2, 0.5 + Math.random() * 1, 5);
            const stag = new THREE.Mesh(stagGeo, iceMat);
            stag.position.set(
                (Math.random() - 0.5) * 4,
                0.5,
                (Math.random() - 0.5) * 3
            );
            caveGroup.add(stag);
        }

        caveGroup.position.set(ox, 2, oz);
        this.scene.add(caveGroup);
    }

    addSnowSculpture(ox, oz) {
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xe8eef0,
            roughness: 0.6,
            flatShading: true
        });

        const sculptureGroup = new THREE.Group();

        // Deer-like snow sculpture
        // Body
        const bodyGeo = new THREE.SphereGeometry(1.2, 8, 8);
        const body = new THREE.Mesh(bodyGeo, snowMat);
        body.scale.set(1.5, 0.8, 1);
        body.position.y = 1.5;
        sculptureGroup.add(body);

        // Head
        const headGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const head = new THREE.Mesh(headGeo, snowMat);
        head.position.set(2, 2.2, 0);
        sculptureGroup.add(head);

        // Neck
        const neckGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.8, 6);
        const neck = new THREE.Mesh(neckGeo, snowMat);
        neck.position.set(1.5, 1.8, 0);
        sculptureGroup.add(neck);

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5);
        const legPositions = [
            { x: 1.2, z: 0.5 }, { x: 1.2, z: -0.5 },
            { x: -0.5, z: 0.5 }, { x: -0.5, z: -0.5 }
        ];
        legPositions.forEach(lp => {
            const leg = new THREE.Mesh(legGeo, snowMat);
            leg.position.set(lp.x, 0.6, lp.z);
            sculptureGroup.add(leg);
        });

        // Antlers
        const antlerMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.8 });
        for (let side = -1; side <= 1; side += 2) {
            const antlerGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.8, 4);
            const antler = new THREE.Mesh(antlerGeo, antlerMat);
            antler.position.set(2.1, 2.8, side * 0.3);
            antler.rotation.z = side * 0.3;
            sculptureGroup.add(antler);

            // Antler branch
            const branchGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 4);
            const branch = new THREE.Mesh(branchGeo, antlerMat);
            branch.position.set(2.1 + side * 0.2, 3, side * 0.5);
            branch.rotation.z = side * 0.8;
            sculptureGroup.add(branch);
        }

        sculptureGroup.position.set(ox, 2, oz);
        this.scene.add(sculptureGroup);
    }

    addSnowDriftDetails(ox, oz) {
        const driftMat = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0,
            roughness: 0.7,
            flatShading: true
        });

        for (let i = 0; i < 60; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;
            if (x < 100) continue;

            const driftGeo = new THREE.SphereGeometry(1 + Math.random() * 2, 5, 4);
            const drift = new THREE.Mesh(driftGeo, driftMat);
            drift.position.set(x, 2.1, z);
            drift.scale.set(1, 0.3, 1 + Math.random());
            drift.receiveShadow = true;
            this.scene.add(drift);
        }
    }

    addDeadSnowTree(x, z) {
        const treeGroup = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x3d2b1f,
            roughness: 0.95
        });

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 6, 6);
        const trunk = new THREE.Mesh(trunkGeo, woodMat);
        trunk.position.y = 3;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Branches
        for (let i = 0; i < 4; i++) {
            const branchGeo = new THREE.CylinderGeometry(0.05, 0.1, 2, 4);
            const branch = new THREE.Mesh(branchGeo, woodMat);
            branch.position.set(
                (Math.random() - 0.5) * 2,
                3 + Math.random() * 3,
                (Math.random() - 0.5) * 2
            );
            branch.rotation.z = (Math.random() - 0.5) * 1;
            branch.rotation.y = Math.random() * Math.PI * 2;
            branch.castShadow = true;
            treeGroup.add(branch);
        }

        treeGroup.position.set(x, 2, z);
        this.scene.add(treeGroup);
    }

    addSnowRock(x, z) {
        const rockMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x7a7a7a,
            roughness: 0.9
        });

        const rockGeo = new THREE.SphereGeometry(0.5 + Math.random() * 1.5, 6, 5);
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(x, 0.8, z);
        rock.scale.set(1, 0.5 + Math.random() * 0.5, 1);
        rock.castShadow = true;
        this.scene.add(rock);

        // Snow on top
        const snowGeo = new THREE.SphereGeometry(0.6 + Math.random() * 1.2, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xf8f8f8,
            roughness: 0.8
        });
        const snow = new THREE.Mesh(snowGeo, snowMat);
        snow.position.set(x, 1.2, z);
        this.scene.add(snow);
    }

    addSnowSleds(ox, oz) {
        const sledMat = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.8
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.6,
            metalness: 0.5
        });

        for (let i = 0; i < 3; i++) {
            const x = -55 + Math.random() * 110;
            const z = -55 + Math.random() * 110;
            if (Math.abs(x) < 20) continue;

            const sledGroup = new THREE.Group();
            // Sled body
            const bodyGeo = new THREE.BoxGeometry(0.8, 0.1, 2);
            const body = new THREE.Mesh(bodyGeo, sledMat);
            body.position.y = 0.4;
            sledGroup.add(body);
            // Runners
            const runnerGeo = new THREE.BoxGeometry(0.05, 0.05, 2.2);
            const r1 = new THREE.Mesh(runnerGeo, metalMat);
            r1.position.set(-0.35, 0.2, 0);
            sledGroup.add(r1);
            const r2 = new THREE.Mesh(runnerGeo, metalMat);
            r2.position.set(0.35, 0.2, 0);
            sledGroup.add(r2);
            // Handle
            const handleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4);
            const handle = new THREE.Mesh(handleGeo, metalMat);
            handle.position.set(0, 0.8, -1);
            handle.rotation.z = 0.3;
            sledGroup.add(handle);

            sledGroup.position.set(x, 2, z);
            sledGroup.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(sledGroup);
        }
    }

    addSnowman(x, z) {
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xf8f8f8,
            roughness: 0.8
        });
        const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });

        const smGroup = new THREE.Group();
        // Bottom
        const bottomGeo = new THREE.SphereGeometry(1.2, 8, 8);
        const bottom = new THREE.Mesh(bottomGeo, snowMat);
        bottom.position.y = 1.2;
        bottom.scale.set(1, 0.9, 1);
        smGroup.add(bottom);
        // Middle
        const midGeo = new THREE.SphereGeometry(0.8, 8, 8);
        const mid = new THREE.Mesh(midGeo, snowMat);
        mid.position.y = 2.8;
        smGroup.add(mid);
        // Head
        const headGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const head = new THREE.Mesh(headGeo, snowMat);
        head.position.y = 3.9;
        smGroup.add(head);
        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.08, 4, 4);
        const eye1 = new THREE.Mesh(eyeGeo, coalMat);
        eye1.position.set(-0.2, 4.0, 0.55);
        smGroup.add(eye1);
        const eye2 = new THREE.Mesh(eyeGeo, coalMat);
        eye2.position.set(0.2, 4.0, 0.55);
        smGroup.add(eye2);
        // Nose (carrot)
        const noseGeo = new THREE.ConeGeometry(0.08, 0.4, 5);
        const noseMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.7 });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 3.85, 0.6);
        nose.rotation.x = -0.3;
        smGroup.add(nose);
        // Mouth (coal buttons)
        for (let i = 0; i < 3; i++) {
            const button = new THREE.Mesh(eyeGeo, coalMat);
            button.position.set(0, 3.5 + i * 0.15, 0.58);
            smGroup.add(button);
        }
        // Hat
        const hatBrimGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
        const hatMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
        const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
        hatBrim.position.set(0, 4.45, 0);
        smGroup.add(hatBrim);
        const hatTopGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8);
        const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
        hatTop.position.set(0, 4.75, 0);
        smGroup.add(hatTop);
        // Arms (sticks)
        const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4);
        const arm1 = new THREE.Mesh(armGeo, woodMat);
        arm1.position.set(-0.9, 2.8, 0);
        arm1.rotation.z = 0.8;
        smGroup.add(arm1);
        const arm2 = new THREE.Mesh(armGeo, woodMat);
        arm2.position.set(0.9, 2.8, 0);
        arm2.rotation.z = -0.8;
        smGroup.add(arm2);

        smGroup.position.set(x, 2, z);
        this.scene.add(smGroup);
    }

    addSnowIglooCluster(ox, oz) {
        const iglooMat = new THREE.MeshStandardMaterial({
            map: this.textures.snow,
            color: 0xf0f0f0,
            roughness: 0.8
        });
        const snowCapMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7
        });

        const positions = [
            { x: ox, z: oz },
            { x: ox + 8, z: oz + 5 },
            { x: ox - 6, z: oz + 8 },
        ];

        positions.forEach((pos, i) => {
            const igGroup = new THREE.Group();
            const r = 2 + Math.random() * 1.5;
          // Igloo dome
            const domeGeo = new THREE.SphereGeometry(r, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55);
            const dome = new THREE.Mesh(domeGeo, iglooMat);
            dome.position.y = 0;
            igGroup.add(dome);
            // Door hole
            const doorGeo = new THREE.BoxGeometry(1, 1.5, 0.5);
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.9 });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(0, 0.75, r - 0.1);
            igGroup.add(door);
            // Snow cap on top
            const capGeo = new THREE.SphereGeometry(r * 0.8, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.4);
            const cap = new THREE.Mesh(capGeo, snowCapMat);
            cap.position.y = 0.1;
            igGroup.add(cap);

            igGroup.position.set(pos.x, 2, pos.z);
            this.scene.add(igGroup);
        });
    }

    addSnowIcePatches(ox, oz) {
        const iceMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7
        });
        // 80 ice patches on snow ground
        for (let i = 0; i < 30; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;
            if (x < 20) continue;
            const size = 1 + Math.random() * 3;
            const iceGeo = new THREE.CircleGeometry(size, 6);
            const ice = new THREE.Mesh(iceGeo, iceMat);
            ice.rotation.x = -Math.PI / 2;
            ice.rotation.z = Math.random() * Math.PI;
            ice.position.set(x, 2.3, z);
            this.scene.add(ice);
        }
    }

    addSnowBushes(ox, oz) {
        const snowBushMat = new THREE.MeshStandardMaterial({
            color: 0x8a9a7a,
            roughness: 0.85,
            flatShading: true
        });
        // 50 snow-covered bushes
        for (let i = 0; i < 50; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;
            if (x < 20) continue;
            const size = 0.4 + Math.random() * 0.7;
            const bushGroup = new THREE.Group();
            // Bush base
            const bGeo = new THREE.SphereGeometry(size, 5, 5);
            const bush = new THREE.Mesh(bGeo, snowBushMat);
            bush.scale.set(1, 0.6, 1);
            bush.castShadow = true;
            bushGroup.add(bush);
            // Snow on top
            const snowGeo = new THREE.SphereGeometry(size * 0.9, 5, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
            const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
            const snowCap = new THREE.Mesh(snowGeo, snowCapMat);
            snowCap.position.y = size * 0.3;
            bushGroup.add(snowCap);
 bushGroup.position.set(x, 2.3, z);
            this.scene.add(bushGroup);
        }
    }

    addSnowDrifts(ox, oz) {
        const driftMat = new THREE.MeshStandardMaterial({
            map: this.textures.snow,
            color: 0xf8f8f5,
            roughness: 0.8
        });

        for (let i = 0; i < 40; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;

            if (x < 20) continue;

            const driftGeo = new THREE.SphereGeometry(1 + Math.random() * 2, 6, 4);
            const drift = new THREE.Mesh(driftGeo, driftMat);
            drift.position.set(x, 1.5, z);
            drift.scale.set(1 + Math.random(), 0.3 + Math.random() * 0.3, 1 + Math.random());
            drift.receiveShadow = true;
            this.scene.add(drift);
        }
    }

    addSnowTree(x, z) {
        const treeGroup = new THREE.Group();
        const treeKind = Math.random(); // 0=fir, 1=pine, 2=sparse birch

        // Trunk
        const trunkH = 5 + Math.random() * 3;
        const trunkR = 0.25 + Math.random() * 0.2;
        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: treeKind < 0.3 ? 0x8b6917 : 0x4a3728,
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.6
        });

        if (treeKind < 0.55) {
            // Fir - classic Christmas tree shape with snow
            const firColor = new THREE.Color().setHSL(0.38, 0.35, 0.28 + Math.random() * 0.1);
            const layers = 4 + Math.floor(Math.random() * 2);
            for (let i = 0; i < layers; i++) {
                const layerR = (2.8 - i * 0.6) * (0.8 + Math.random() * 0.3);
                const layerGeo = new THREE.ConeGeometry(layerR, 2.8, 6);
                const layerMat = new THREE.MeshStandardMaterial({
                    color: firColor, roughness: 0.95, flatShading: true
                });
                const layer = new THREE.Mesh(layerGeo, layerMat);
                layer.position.y = trunkH * 0.6 + i * 1.8;
                layer.position.x = (Math.random() - 0.5) * 0.4;
                layer.position.z = (Math.random() - 0.5) * 0.4;
                layer.castShadow = true;
                treeGroup.add(layer);

                // Snow cap on each layer
                const snowGeo = new THREE.ConeGeometry(layerR * 0.9, 1.2, 6);
                const snow = new THREE.Mesh(snowGeo, snowMat);
                snow.position.y = trunkH * 0.6 + i * 1.8 + 1.3;
                snow.position.x = (Math.random() - 0.5) * 0.2;
                snow.position.z = (Math.random() - 0.5) * 0.2;
                treeGroup.add(snow);
            }
        } else if (treeKind < 0.8) {
            // Pine - tall, thin with sparse snow
            const pineColor = new THREE.Color().setHSL(0.35, 0.4, 0.2 + Math.random() * 0.1);
            const pineLayers = 3 + Math.floor(Math.random() * 2);
            for (let i = 0; i < pineLayers; i++) {
                const layerR = (2 - i * 0.4) * (0.7 + Math.random() * 0.3);
                const layerGeo = new THREE.ConeGeometry(layerR, 2.2, 5);
                const layerMat = new THREE.MeshStandardMaterial({
                    color: pineColor, roughness: 0.95, flatShading: true
                });
                const layer = new THREE.Mesh(layerGeo, layerMat);
                layer.position.y = trunkH * 0.5 + i * 2;
                layer.position.x = (Math.random() - 0.5) * 0.6;
                layer.position.z = (Math.random() - 0.5) * 0.6;
                layer.castShadow = true;
                treeGroup.add(layer);
            }
        } else {
            // Sparse birch in snow - thin white trunk, light canopy
            const birchTrunkGeo = new THREE.CylinderGeometry(0.1, 0.2, trunkH * 1.1, 6);
            const birchTrunkMat = new THREE.MeshStandardMaterial({
                color: 0xe8dcc8, roughness: 0.8
            });
            const birchTrunk = new THREE.Mesh(birchTrunkGeo, birchTrunkMat);
            birchTrunk.position.y = trunkH * 0.55;
            birchTrunk.castShadow = true;
            treeGroup.add(birchTrunk);

            const birchColor = new THREE.Color().setHSL(0.3, 0.4, 0.65 + Math.random() * 0.15);
            const bLayers = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < bLayers; i++) {
                const layerR = (1.2 + Math.random() * 0.8) * (0.7 + Math.random() * 0.3);
                const layerGeo = new THREE.SphereGeometry(layerR, 6, 4);
                const layerMat = new THREE.MeshStandardMaterial({
                    color: birchColor, roughness: 0.9, flatShading: true
                });
                const layer = new THREE.Mesh(layerGeo, layerMat);
                layer.position.y = trunkH * 0.5 + i * 2;
                layer.position.x = (Math.random() - 0.5) * 1.5;
                layer.position.z = (Math.random() - 0.5) * 1.5;
                layer.castShadow = true;
                treeGroup.add(layer);
            }
        }

        treeGroup.position.set(x, 2, z);
        this.scene.add(treeGroup);
        this.leafMeshes.push(treeGroup);
    }

    addFrozenPond(ox, oz) {
        const waterTex = this.textures.water;

        // Pond base
        const pondGeo = new THREE.CircleGeometry(25, 32);
        const pondMat = new THREE.MeshStandardMaterial({
            map: waterTex,
            color: 0xaaddff,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.2
        });
        const pond = new THREE.Mesh(pondGeo, pondMat);
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(ox, 2.08, oz);
        this.scene.add(pond);

        // Ice edge
        const iceGeo = new THREE.RingGeometry(22, 28, 32);
        const iceMat = new THREE.MeshStandardMaterial({
            color: 0xccddff,
            transparent: true,
            opacity: 0.7,
            roughness: 0.3,
            side: THREE.DoubleSide
        });
        const ice = new THREE.Mesh(iceGeo, iceMat);
        ice.rotation.x = -Math.PI / 2;
        ice.position.set(ox, 2.1, oz);
        this.scene.add(ice);

        // Ice cracks
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 5 + Math.random() * 15;
            const crackGeo = new THREE.PlaneGeometry(0.1, 8 + Math.random() * 10);
            const crackMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5
            });
            const crack = new THREE.Mesh(crackGeo, crackMat);
            crack.rotation.x = -Math.PI / 2;
            crack.rotation.z = angle;
            crack.position.set(
                ox + Math.cos(angle) * r,
                2.12,
                oz + Math.sin(angle) * r
            );
            this.scene.add(crack);
        }
    }

    addIgu(x, z) {
        const iguGroup = new THREE.Group();

      // Igloo dome with snow texture
        const iguGeo = new THREE.SphereGeometry(4, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const iguMat = new THREE.MeshStandardMaterial({
            map: this.textures.snow,
            color: 0xf5f5f0,
            roughness: 0.8
        });
        const igu = new THREE.Mesh(iguGeo, iguMat);
        igu.position.y = 0;
        igu.castShadow = true;
        iguGroup.add(igu);

        // Snow texture bumps
        for (let i = 0; i < 15; i++) {
            const bumpGeo = new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 4, 4);
            const bump = new THREE.Mesh(bumpGeo, iguMat);
            const angle = Math.random() * Math.PI * 2;
            const h = Math.random() * Math.PI * 0.4;
            bump.position.set(
                Math.cos(angle) * Math.cos(h) * 4,
                Math.sin(h) * 4,
                Math.sin(angle) * Math.cos(h) * 4
            );
            iguGroup.add(bump);
        }

        // Door
        const doorGeo = new THREE.BoxGeometry(1.5, 2, 0.3);
        const doorMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5d4037,
            roughness: 0.9
        });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1, 4);
        iguGroup.add(door);

        // Fire inside (visible through door)
        const fireGeo = new THREE.ConeGeometry(0.4, 1.2, 6);
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff4400,
            emissiveIntensity: 0.8
        });
        const fire = new THREE.Mesh(fireGeo, fireMat);
        fire.position.set(0, 0.6, 2);
        iguGroup.add(fire);

        iguGroup.position.set(x, 2, z);
        this.scene.add(iguGroup);
        this.houseSpots.push({ x, z, width: 8, depth: 8, height: 4 });
    }

    addIceSpikes(ox, oz) {
        const spikeMat = new THREE.MeshStandardMaterial({
            color: 0xb3e5fc,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.1
        });

        for (let i = 0; i < 60; i++) {
            const x = ox + (Math.random() - 0.5) * 180;
            const z = oz + (Math.random() - 0.5) * 180;

            if (x < 20) continue;

            const h = 2 + Math.random() * 4;
            const spikeGeo = new THREE.ConeGeometry(0.3 + Math.random() * 0.3, h, 6);
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            spike.position.set(x, h / 2, z);
            spike.rotation.z = (Math.random() - 0.5) * 0.3;
            this.scene.add(spike);
        }
    }

    // ========== PROPS SYSTEM ==========
    buildProps() {
        // Scatter small props across all biomes
       // this.addBushes(); // DISABLED
        // this.addFences(); // DISABLED
        // this.addLamps(); // DISABLED

        // Flying birds - DISABLED
        // this.addFlyingBirds();

        // Falling leaves in forest - DISABLED
        // this.addFallingLeaves();

        // Military smoke from destroyed buildings - DISABLED
        // this.addMilitarySmoke();

        // Banners and flags on fortress walls - DISABLED
        // this.addBanners();

        // Road puddles - DISABLED
        // this.addRoadPuddles();

        // Stone biome ground details - DISABLED
        // this.addStoneGroundDetails();
    }

    addBushes() {
        const bushColors = [0x2d5a1e, 0x3a7a2e, 0x1b5e20, 0x4a6a3a];

        for (let i = 0; i < 20; i++) {
            const x = -128 + Math.random() * 256;
            const z = -128 + Math.random() * 256;

            // Avoid roads
            if (Math.abs(x) < 16 && Math.abs(z) < 200) continue;
            if (Math.abs(z) < 16 && Math.abs(x) < 200) continue;

            const bushGeo = new THREE.SphereGeometry(0.5 + Math.random() * 0.7, 6, 6);
            const bushMat = new THREE.MeshStandardMaterial({
                color: bushColors[Math.floor(Math.random() * bushColors.length)],
                roughness: 0.95,
                flatShading: true
            });
            const bush = new THREE.Mesh(bushGeo, bushMat);
            bush.position.set(x, 1.2, z);
            bush.castShadow = true;
            this.scene.add(bush);
        }
    }

    addFences() {
        const fenceMat = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            color: 0x5d4037,
            roughness: 0.9
        });

        for (let i = 0; i < 10; i++) {
            const x = -128 + Math.random() * 256;
            const z = -128 + Math.random() * 256;

            if (Math.abs(x) < 16 && Math.abs(z) < 200) continue;
            if (Math.abs(z) < 16 && Math.abs(x) < 200) continue;

            const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.5, 4);
            const post = new THREE.Mesh(postGeo, fenceMat);
            post.position.set(x, 1, z);
            post.castShadow = true;
            this.scene.add(post);

            // Rail
            const railGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 4);
            const rail = new THREE.Mesh(railGeo, fenceMat);
            rail.position.set(x, 1.5, z);
            rail.rotation.z = Math.PI / 2;
            rail.rotation.y = Math.random() * Math.PI;
            this.scene.add(rail);
        }
    }

    addLamps() {
        const lampMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.5,
            roughness: 0.5
        });
        const lightMat = new THREE.MeshStandardMaterial({
            color: 0xffffcc,
            emissive: 0xffaa00,
            emissiveIntensity: 0.5
        });

        for (let i = 0; i < 12; i++) {
            const x = (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 200);
            const z = (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 200);

            const lampGroup = new THREE.Group();

            // Pole
            const poleGeo = new THREE.CylinderGeometry(0.1, 0.15, 6, 6);
            const pole = new THREE.Mesh(poleGeo, lampMat);
            pole.position.y = 3;
            lampGroup.add(pole);

            // Light
            const lightGeo = new THREE.SphereGeometry(0.3, 6, 6);
            const light = new THREE.Mesh(lightGeo, lightMat);
            light.position.y = 6.2;
            lampGroup.add(light);

            lampGroup.position.set(x, 2, z);
            this.scene.add(lampGroup);
        }
    }

    addFlyingBirds() {
        const birdBodyMat = new THREE.MeshStandardMaterial({
            color: 0x2c2c2c,
            roughness: 0.8
        });
        const wingMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 8; i++) {
            const birdGroup = new THREE.Group();

            // Body
            const bodyGeo = new THREE.SphereGeometry(0.3, 5, 5);
            bodyGeo.scale(1, 0.7, 1.5);
            const body = new THREE.Mesh(bodyGeo, birdBodyMat);
            birdGroup.add(body);

            // Head
            const headGeo = new THREE.SphereGeometry(0.2, 5, 5);
            const head = new THREE.Mesh(headGeo, birdBodyMat);
            head.position.set(0, 0.2, 0.4);
            birdGroup.add(head);

            // Beak
            const beakGeo = new THREE.ConeGeometry(0.05, 0.3, 4);
            const beakMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
            const beak = new THREE.Mesh(beakGeo, beakMat);
            beak.position.set(0, 0.2, 0.7);
            beak.rotation.x = Math.PI / 2;
            birdGroup.add(beak);

            // Wings (two separate groups for animation)
            const wingGeo = new THREE.PlaneGeometry(0.8, 0.3);

            const leftWing = new THREE.Mesh(wingGeo, wingMat);
            leftWing.position.set(-0.5, 0.1, 0);
            birdGroup.add(leftWing);

            const rightWing = new THREE.Mesh(wingGeo, wingMat);
            rightWing.position.set(0.5, 0.1, 0);
            birdGroup.add(rightWing);

            // Tail
            const tailGeo = new THREE.PlaneGeometry(0.4, 0.3);
            const tail = new THREE.Mesh(tailGeo, wingMat);
            tail.position.set(0, 0, -0.4);
            tail.rotation.y = Math.PI / 2;
            birdGroup.add(tail);

            const bx = -180 + Math.random() * 240;
            const bz = -180 + Math.random() * 240;
            const by = 15 + Math.random() * 10;
            birdGroup.position.set(bx, by, bz);
            birdGroup.rotation.set(
                -0.2 + Math.random() * 0.4,
                Math.random() * Math.PI * 2,
                0
            );

            this.scene.add(birdGroup);
            this.animatedObjects.push({
                type: 'bird',
                group: birdGroup,
                leftWing,
                rightWing,
                baseY: by,
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 0.5,
                orbitRadius: 30 + Math.random() * 60,
                orbitSpeed: (0.05 + Math.random() * 0.1) * (Math.random() > 0.5 ? 1 : -1),
                orbitPhase: Math.random() * Math.PI * 2
            });
        }
    }

    addFallingLeaves() {
        const leafColors = [0x2d8a1e, 0x4a9a2e, 0xcc6622, 0xdd8833, 0xeeaa44, 0xcc4422];

        for (let i = 0; i < 30; i++) {
            const color = leafColors[Math.floor(Math.random() * leafColors.length)];
            const leafGeo = new THREE.PlaneGeometry(0.15, 0.1);
            const leafMat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.8,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8
            });
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.set(
                -90 + Math.random() * 90,
                8 + Math.random() * 12,
                -90 + Math.random() * 90
            );
            leaf.rotation.set(Math.random(), Math.random(), Math.random());
            this.scene.add(leaf);
            this.animatedObjects.push({
                type: 'leaf',
                obj: leaf,
                baseY: leaf.position.y,
                baseX: leaf.position.x,
                baseZ: leaf.position.z,
                phase: Math.random() * Math.PI * 2,
                speed: 0.3 + Math.random() * 0.4
            });
        }
    }

    addMilitarySmoke() {
        const smokeMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            transparent: true,
            opacity: 0.2,
            roughness: 1
        });

        for (let i = 0; i < 10; i++) {
            const smokeGroup = new THREE.Group();
            for (let j = 0; j < 3; j++) {
                const sGeo = new THREE.SphereGeometry(0.4 + j * 0.2, 5, 5);
                const smoke = new THREE.Mesh(sGeo, smokeMat.clone());
                smoke.material.opacity = 0.15 - j * 0.04;
                smoke.position.set(0, 1 + j * 1.2, 0);
                smokeGroup.add(smoke);
                this.animatedObjects.push({
                    type: 'militarySmoke',
                    obj: smoke,
                    baseY: smoke.position.y,
                    index: j
                });
            }
            const sx = -55 + Math.random() * 110;
            const sz = -55 + Math.random() * 110;
            if (Math.abs(sx) < 20) {
                smokeGroup.position.set(sx, 5, sz);
                this.scene.add(smokeGroup);
            }
        }
    }

    addBanners() {
        const bannerColors = [0xcc3333, 0x3366cc, 0x33aa33, 0xffcc00, 0xff6600, 0x8844cc];

        // Fortress wall banners
        const bannerPositions = [
            { x: 55, z: -55 }, { x: 70, z: -40 },
            { x: 40, z: -70 }, { x: 55, z: -64 },
            { x: 45, z: -55 }, { x: 64, z: -45 }
        ];

        bannerPositions.forEach((pos, idx) => {
            const bannerGroup = new THREE.Group();
            const color = bannerColors[idx % bannerColors.length];

            // Pole
            const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 4, 4);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 2;
            bannerGroup.add(pole);

            // Banner cloth
            const bannerGeo = new THREE.PlaneGeometry(1.2, 2, 4, 4);
            const bannerMat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.8,
                side: THREE.DoubleSide
            });
            const banner = new THREE.Mesh(bannerGeo, bannerMat);
            banner.position.set(0.6, 3, 0);
            bannerGroup.add(banner);

            bannerGroup.position.set(pos.x, 2, pos.z);
            this.scene.add(bannerGroup);
            this.animatedObjects.push({
                type: 'banner',
                group: bannerGroup,
                phase: Math.random() * Math.PI * 2
            });
        });
    }

    addButterflies() {
        const wingColors = [0xff6688, 0xffaa44, 0x66aaff, 0xaa66ff, 0xffcc44, 0x44dd88];

        for (let i = 0; i < 5; i++) {
            const butterflyGroup = new THREE.Group();
            const color = wingColors[Math.floor(Math.random() * wingColors.length)];

            // Body
            const bodyGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.rotation.x = Math.PI / 2;
            butterflyGroup.add(body);

            // Wings
            const wingGeo = new THREE.PlaneGeometry(0.25, 0.2);
            const wingMat = new THREE.MeshStandardMaterial({
                color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85
            });

            const leftWing = new THREE.Mesh(wingGeo, wingMat);
            leftWing.position.set(-0.15, 0.05, 0);
            butterflyGroup.add(leftWing);

            const rightWing = new THREE.Mesh(wingGeo, wingMat);
            rightWing.position.set(0.15, 0.05, 0);
            butterflyGroup.add(rightWing);

            const bx = -90 + Math.random() * 90;
            const bz = -90 + Math.random() * 90;
            butterflyGroup.position.set(bx, 2 + Math.random() * 3, bz);
            this.scene.add(butterflyGroup);
            this.animatedObjects.push({
                type: 'butterfly',
                group: butterflyGroup,
                leftWing,
                rightWing,
                baseX: bx,
                baseZ: bz,
                baseY: butterflyGroup.position.y,
                phase: Math.random() * Math.PI * 2,
                speed: 0.3 + Math.random() * 0.4,
                orbitRadius: 3 + Math.random() * 8,
                orbitSpeed: 0.2 + Math.random() * 0.3,
                orbitPhase: Math.random() * Math.PI * 2
            });
        }
    }

    addStoneBridges() {
        const bridgeMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x9a9a8a,
            roughness: 0.85
        });

        // Bridges across the forest river
        const bridgePositions = [
            { x: -75, z: -60 },
            { x: -50, z: -40 },
            { x: -40, z: -75 },
        ];

        bridgePositions.forEach(bp => {
            const bridgeGroup = new THREE.Group();

            // Bridge deck
            const deckGeo = new THREE.BoxGeometry(4, 0.3, 12);
            const deck = new THREE.Mesh(deckGeo, bridgeMat);
            deck.position.y = 2.5;
            bridgeGroup.add(deck);

            // Railings
            const railGeo = new THREE.BoxGeometry(0.2, 1, 12);
            const leftRail = new THREE.Mesh(railGeo, bridgeMat);
            leftRail.position.set(-1.9, 3.2, 0);
            bridgeGroup.add(leftRail);

            const rightRail = new THREE.Mesh(railGeo, bridgeMat);
            rightRail.position.set(1.9, 3.2, 0);
            bridgeGroup.add(rightRail);

            // Support pillars
            const pillarGeo = new THREE.BoxGeometry(0.5, 2.5, 0.5);
            for (let i = -1; i <= 1; i++) {
                const pillar = new THREE.Mesh(pillarGeo, bridgeMat);
                pillar.position.set(0, 1.25, i * 4);
                bridgeGroup.add(pillar);
            }

            bridgeGroup.position.set(bp.x, 0, bp.z);
            this.scene.add(bridgeGroup);
        });
    }

    addRoadRuneStones() {
        const runeMat = new THREE.MeshStandardMaterial({
            color: 0x5a5a6a,
            emissive: 0x4422aa,
            emissiveIntensity: 0.15,
            roughness: 0.7,
            flatShading: true
        });

        // Rune stones along roads
        for (let i = 0; i < 30; i++) {
            const side = Math.random() > 0.5 ? 1 : -1;
            const axis = Math.random() > 0.5 ? 'x' : 'z';
            const dist = 20 + Math.random() * 120;

            const runeGroup = new THREE.Group();

            // Stone base
            const stoneGeo = new THREE.BoxGeometry(0.4, 1.2 + Math.random() * 0.6, 0.3);
            const stone = new THREE.Mesh(stoneGeo, runeMat);
            stone.position.y = 0.6;
            runeGroup.add(stone);

            // Rune glow (small sphere on top)
            const glowGeo = new THREE.SphereGeometry(0.1, 5, 5);
            const glowMat = new THREE.MeshStandardMaterial({
                color: 0x8844ff,
                emissive: 0x6622cc,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.6
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.y = 1.5;
            runeGroup.add(glow);

            if (axis === 'x') {
                runeGroup.position.set(side * (8 + Math.random() * 3), 0, dist * (Math.random() > 0.5 ? 1 : -1));
            } else {
                runeGroup.position.set(dist * (Math.random() > 0.5 ? 1 : -1), 0, side * (8 + Math.random() * 3));
            }

            runeGroup.rotation.y = Math.random() * Math.PI;
            this.scene.add(runeGroup);
        }
    }

    addRoadPuddles() {
        const puddleMat = new THREE.MeshStandardMaterial({
            color: 0x334455,
            transparent: true,
            opacity: 0.5,
            roughness: 0.05,
            metalness: 0.3
        });

        // Puddles along roads
        for (let i = 0; i < 40; i++) {
            const isNorthRoad = Math.random() > 0.5;
            let px, pz;

            if (isNorthRoad) {
                px = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 15);
                pz = -55 + Math.random() * 110;
            } else {
                pz = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 15);
                px = -55 + Math.random() * 110;
            }

            const puddleGeo = new THREE.CircleGeometry(1 + Math.random() * 2, 8);
            const puddle = new THREE.Mesh(puddleGeo, puddleMat.clone());
            puddle.material.opacity = 0.3 + Math.random() * 0.3;
            puddle.rotation.x = -Math.PI / 2;
            puddle.position.set(px, 2.3, pz);
            this.scene.add(puddle);
            this.animatedObjects.push({
                type: 'puddle',
                obj: puddle,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    addStoneGroundDetails() {
        // Small stones and debris across stone biome
        const stoneDetailMat = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            color: 0x8a8a7a,
            roughness: 0.95,
            flatShading: true
        });

        for (let i = 0; i < 30; i++) {
            const x = -55 + Math.random() * 110;
            const z = -55 + Math.random() * 110;
            if (Math.abs(x) < 20) continue;

            const detailGeo = new THREE.SphereGeometry(0.1 + Math.random() * 0.3, 4, 4);
            const detail = new THREE.Mesh(detailGeo, stoneDetailMat);
            detail.position.set(x, 2.1, z);
            detail.scale.y = 0.3 + Math.random() * 0.3;
            detail.rotation.set(Math.random(), Math.random(), Math.random());
            this.scene.add(detail);
        }

        // Chipped stone fragments
        for (let i = 0; i < 15; i++) {
            const x = -55 + Math.random() * 110;
            const z = -55 + Math.random() * 110;
            if (Math.abs(x) < 20) continue;

            const fragGeo = new THREE.BoxGeometry(
                0.2 + Math.random() * 0.4,
                0.1 + Math.random() * 0.1,
                0.2 + Math.random() * 0.4
            );
            const fragMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0, 0, 0.35 + Math.random() * 0.2),
                roughness: 0.95,
                flatShading: true
            });
            const frag = new THREE.Mesh(fragGeo, fragMat);
            frag.position.set(x, 2.08, z);
            frag.rotation.set(Math.random(), Math.random(), Math.random());
            this.scene.add(frag);
        }
    }

    addCampfireSparks() {
        const sparkMat = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff4400,
            emissiveIntensity: 2.0,
            transparent: true,
            opacity: 0.8
        });

        const campfirePositions = [
            { x: -55, z: -55 }, { x: -70, z: -80 },
            { x: -40, z: -70 }, { x: -80, z: -64 },
            { x: 55, z: 55 }, { x: -55, z: 55 },
            { x: 70, z: -70 }, { x: -70, z: 70 }
        ];

        campfirePositions.forEach(cfPos => {
            for (let i = 0; i < 15; i++) {
                const sparkGeo = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 3, 3);
                const spark = new THREE.Mesh(sparkGeo, sparkMat.clone());
                spark.position.set(
                    cfPos.x + (Math.random() - 0.5) * 0.8,
                    3 + Math.random() * 3,
                    cfPos.z + (Math.random() - 0.5) * 0.8
                );
                this.scene.add(spark);
                this.animatedObjects.push({
                    type: 'spark',
                    obj: spark,
                    baseX: cfPos.x + (Math.random() - 0.5) * 0.5,
                    baseZ: cfPos.z + (Math.random() - 0.5) * 0.5,
                    baseY: spark.position.y,
                    phase: Math.random() * Math.PI * 2,
                    speed: 1 + Math.random() * 2,
                    life: Math.random()
                });
            }
        });
    }

    addFireflies() {
        const fireflyMat = new THREE.MeshStandardMaterial({
            color: 0xccff44,
            emissive: 0x88cc00,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.7
        });

        for (let i = 0; i < 5; i++) {
            const ffGeo = new THREE.SphereGeometry(0.06, 3, 3);
            const ff = new THREE.Mesh(ffGeo, fireflyMat.clone());
            ff.position.set(
                -90 + Math.random() * 90,
                2 + Math.random() * 6,
                -90 + Math.random() * 90
            );
            this.scene.add(ff);
            this.animatedObjects.push({
                type: 'firefly',
                obj: ff,
                baseX: ff.position.x,
                baseZ: ff.position.z,
                baseY: ff.position.y,
                phase: Math.random() * Math.PI * 2,
                speed: 0.3 + Math.random() * 0.5,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    addGroundRocks() {
        // Scattered rocks across forest and military biomes
        const rockColors = [0x6a6a5a, 0x7a7a6a, 0x5a5a4a, 0x8a8a7a];

        for (let i = 0; i < 30; i++) {
            const x = -90 + Math.random() * 100;
            const z = -90 + Math.random() * 100;
            if (Math.abs(x) < 15 && Math.abs(z) < 20) continue;
            if (Math.abs(z) < 15 && Math.abs(x) < 20) continue;
            if (Math.sqrt(x * x + z * z) < 30) continue;

            const rockGeo = new THREE.SphereGeometry(0.15 + Math.random() * 0.35, 5, 4);
            const rockColor = rockColors[Math.floor(Math.random() * rockColors.length)];
            const rockMat = new THREE.MeshStandardMaterial({
                color: rockColor,
                roughness: 0.9,
                flatShading: true
            });
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.set(x, 2.3, z);
            rock.scale.set(
                0.7 + Math.random() * 0.6,
                0.3 + Math.random() * 0.5,
                0.7 + Math.random() * 0.6
            );
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            this.scene.add(rock);
        }
    }

    addMossPatches() {
        const mossMat = new THREE.MeshStandardMaterial({
            color: 0x3a7a1e,
            roughness: 1.0,
            flatShading: true
        });

        for (let i = 0; i < 15; i++) {
            const x = -55 + Math.random() * 100;
            const z = -55 + Math.random() * 100;
            if (Math.sqrt(x * x + z * z) < 25) continue;

            const mossGeo = new THREE.CircleGeometry(0.5 + Math.random() * 1.0, 6);
            const moss = new THREE.Mesh(mossGeo, mossMat);
             moss.position.set(x, 2.3, z);
            moss.rotation.x = -Math.PI / 2;
            moss.rotation.z = Math.random() * Math.PI;
            this.scene.add(moss);
        }
    }

    addRoadArches() {
        const archMat = new THREE.MeshStandardMaterial({
            color: 0x6a6a6a,
            roughness: 0.7,
            metalness: 0.1
        });

        // Decorative arches on each road
        const archPositions = [
            { x: 0, z: 60, rot: 0 },
            { x: 0, z: 120, rot: 0 },
            { x: 0, z: -60, rot: 0 },
            { x: 0, z: -120, rot: 0 },
            { x: 60, z: 0, rot: Math.PI / 2 },
            { x: 120, z: 0, rot: Math.PI / 2 },
            { x: -60, z: 0, rot: Math.PI / 2 },
            { x: -120, z: 0, rot: Math.PI / 2 },
        ];

        archPositions.forEach(ap => {
            const archGroup = new THREE.Group();

            // Two pillars
            const pillarGeo = new THREE.CylinderGeometry(0.2, 0.25, 6, 6);
            const leftPillar = new THREE.Mesh(pillarGeo, archMat);
            leftPillar.position.set(-2.5, 3, 0);
            archGroup.add(leftPillar);

            const rightPillar = new THREE.Mesh(pillarGeo, archMat);
            rightPillar.position.set(2.5, 3, 0);
            archGroup.add(rightPillar);

            // Top arch curve using arc
            const archArcGeo = new THREE.TorusGeometry(2.5, 0.15, 6, 12, Math.PI);
            const archArc = new THREE.Mesh(archArcGeo, archMat);
            archArc.position.set(0, 6, 0);
            archGroup.add(archArc);

            // Decorative finials on top
            const finialGeo = new THREE.SphereGeometry(0.2, 5, 5);
            const finialMat = new THREE.MeshStandardMaterial({
                color: 0x4a9a2e,
                roughness: 0.6,
                flatShading: true
            });
            const leftFinial = new THREE.Mesh(finialGeo, finialMat);
            leftFinial.position.set(-2.5, 6.2, 0);
            archGroup.add(leftFinial);

            const rightFinial = new THREE.Mesh(finialGeo, finialMat);
            rightFinial.position.set(2.5, 6.2, 0);
            archGroup.add(rightFinial);

            archGroup.position.set(ap.x, 0, ap.z);
            archGroup.rotation.y = ap.rot;
            this.scene.add(archGroup);
        });
    }

    addIceCrystals() {
        const crystalMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            emissive: 0x4488aa,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.7,
            roughness: 0.1,
            metalness: 0.2,
            flatShading: true
        });

        for (let i = 0; i < 20; i++) {
            const x = -55 + Math.random() * 110;
            const z = -55 + Math.random() * 110;

            // Crystal cluster
            const clusterGroup = new THREE.Group();
            const crystalCount = 3 + Math.floor(Math.random() * 5);

            for (let j = 0; j < crystalCount; j++) {
                const h = 0.3 + Math.random() * 1.2;
                const crystalGeo = new THREE.ConeGeometry(0.05 + Math.random() * 0.08, h, 5);
                const crystal = new THREE.Mesh(crystalGeo, crystalMat.clone());
                crystal.position.set(
                    (Math.random() - 0.5) * 0.8,
                    h / 2,
                    (Math.random() - 0.5) * 0.8
                );
                crystal.rotation.set(
                    (Math.random() - 0.5) * 0.3,
                    Math.random() * Math.PI,
                    (Math.random() - 0.5) * 0.3
                );
                clusterGroup.add(crystal);
            }

            clusterGroup.position.set(x, 2.1, z);
            this.scene.add(clusterGroup);
        }
    }

    buildAtmosphericParticles() {
        // Floating dust motes across the entire map
        const dustMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffcc,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.4
        });

        for (let i = 0; i < 20; i++) {
            const dustGeo = new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 3, 3);
            const dust = new THREE.Mesh(dustGeo, dustMat.clone());
            dust.material.opacity = 0.2 + Math.random() * 0.4;
            dust.position.set(
                (Math.random() - 0.5) * 128,
                3 + Math.random() * 15,
                (Math.random() - 0.5) * 128
            );
            this.scene.add(dust);
            this.animatedObjects.push({
                type: 'dust',
                obj: dust,
                baseY: dust.position.y,
                phase: Math.random() * Math.PI * 2,
                speed: 0.2 + Math.random() * 0.3
            });
        }

        // Forest pollen (greenish)
        const pollenMat = new THREE.MeshStandardMaterial({
            color: 0x88cc44,
            emissive: 0x44aa00,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.3
        });

        for (let i = 0; i < 10; i++) {
            const pollenGeo = new THREE.SphereGeometry(0.05, 3, 3);
            const pollen = new THREE.Mesh(pollenGeo, pollenMat.clone());
            pollen.position.set(
                -90 + Math.random() * 90,
                4 + Math.random() * 10,
                -90 + Math.random() * 90
            );
            this.scene.add(pollen);
            this.animatedObjects.push({
                type: 'pollen',
                obj: pollen,
                baseY: pollen.position.y,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    buildCampfires() {
        const campfirePositions = [
            { x: -75, z: -75 }, { x: -100, z: -120 },
            { x: -50, z: -100 }, { x: -120, z: -90 },
            { x: 75, z: 75 }, { x: -75, z: 75 }
        ];

        campfirePositions.forEach(pos => {
            const cfGroup = new THREE.Group();
            const logMat = new THREE.MeshStandardMaterial({
                color: 0x4a3520,
                roughness: 0.95
            });
            const fireMat = new THREE.MeshStandardMaterial({
                color: 0xff6600,
                emissive: 0xff4400,
                emissiveIntensity: 1.2,
                transparent: true,
                opacity: 0.85
            });

            // Logs in circle
            for (let i = 0; i < 4; i++) {
                const logGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.5, 5);
                const log = new THREE.Mesh(logGeo, logMat);
                log.position.set(0, 2.2, 0);
                log.rotation.z = Math.PI / 2;
                log.rotation.y = (i / 4) * Math.PI;
                cfGroup.add(log);
            }

            // Fire
            const fireGeo = new THREE.ConeGeometry(0.6, 2, 8);
            const fire = new THREE.Mesh(fireGeo, fireMat);
            fire.position.set(0, 3.5, 0);
            cfGroup.add(fire);
            this.animatedObjects.push({ type: 'campfire', obj: fire, base: pos });
            this.fireMeshes.push(fire);

            // Inner fire
            const innerGeo = new THREE.ConeGeometry(0.3, 1.5, 6);
            const innerMat = new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                emissive: 0xff8800,
                emissiveIntensity: 1.5
            });
            const inner = new THREE.Mesh(innerGeo, innerMat);
            inner.position.set(0, 3.2, 0);
            cfGroup.add(inner);
            this.animatedObjects.push({ type: 'campfireInner', obj: inner });
            this.fireMeshes.push(inner);

            // Point light
            const light = new THREE.PointLight(0xff6600, 2, 15);
            light.position.set(0, 4, 0);
            cfGroup.add(light);
            this.animatedObjects.push({ type: 'campfireLight', light: light, base: pos });

            cfGroup.position.set(pos.x, 0, pos.z);
            this.scene.add(cfGroup);
        });
    }

    buildChimneySmoke() {
        const smokeMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.25,
            roughness: 1
        });

        // Add smoke to some houses across all biomes
        const smokePositions = [];
        for (let i = 0; i < 25; i++) {
            const x = (Math.random() - 0.5) * 256;
            const z = (Math.random() - 0.5) * 256;
            if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;
            smokePositions.push({ x, z });
        }

        smokePositions.forEach(pos => {
            const smokeGroup = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const smokeGeo = new THREE.SphereGeometry(0.3 + i * 0.15, 5, 5);
                const smoke = new THREE.Mesh(smokeGeo, smokeMat.clone());
                smoke.position.set(0, 1 + i * 0.8, 0);
                smoke.material.opacity = 0.3 - i * 0.06;
                smokeGroup.add(smoke);
                this.animatedObjects.push({
                    type: 'smoke',
                    obj: smoke,
                    baseY: smoke.position.y,
                    index: i
                });
            }
            smokeGroup.position.set(pos.x, 8, pos.z);
            this.scene.add(smokeGroup);
        });
    }

    buildRiverSparkles() {
        const sparkleMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x88ccff,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.6
        });

        for (let i = 0; i < 30; i++) {
            const sparkleGeo = new THREE.SphereGeometry(0.06, 3, 3);
            const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat.clone());
            sparkle.position.set(
                -64 + Math.random() * 128,
                2.5 + Math.random() * 0.5,
                -64 + Math.random() * 128
            );
            sparkle.material.opacity = 0.2 + Math.random() * 0.5;
            this.scene.add(sparkle);
            this.waterMeshes.push(sparkle);
            this.animatedObjects.push({
                type: 'sparkle',
                obj: sparkle,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // ========== ANIMATIONS ==========
    setupAnimations() {
        // Water shimmer (animated water materials)
        this.animatedObjects.push({ type: 'water' });

        // Fire flicker
        this.animatedObjects.push({ type: 'fire' });

        // Atmospheric particles - floating dust/pollen
        this.buildAtmosphericParticles();

        // Campfires in forest
        this.buildCampfires();

       // Campfire sparks - DISABLED
        // this.addCampfireSparks();

        // Fireflies in forest - DISABLED
        // this.addFireflies();

        // Ground rocks across all biomes - DISABLED
        // this.addGroundRocks();

        // Moss patches on forest ground - DISABLED
        // this.addMossPatches();

        // Road arches - DISABLED
        // this.addRoadArches();

        // Butterflies in forest - DISABLED
        // this.addButterflies();

        // Stone bridges across river - DISABLED
        // this.addStoneBridges();

        // Rune stones along roads - DISABLED
        // this.addRoadRuneStones();

        // Ice crystals in snow biome - DISABLED
        // this.addIceCrystals();

        // Waterfalls at forest edge - DISABLED
        // this.addWaterfalls();

        // Autumn grass in forest - DISABLED
        // this.addAutumnGrass();

        // War banners in military area - DISABLED
        // this.addWarBanners();

        // Chimney smoke for houses - DISABLED
        // this.buildChimneySmoke();

        // River sparkles - DISABLED
        // this.buildRiverSparkles();
    }

    update(delta) {
        const time = performance.now() * 0.001;

       this.animatedObjects.forEach(obj => {
            if (obj.type === 'water') {
                // Water shimmer via stored references
                for (let i = 0; i < this.waterMeshes.length; i++) {
                    const m = this.waterMeshes[i];
                    if (m.material) {
                        m.material.opacity = 0.65 + Math.sin(time * 2 + i) * 0.05;
                    }
                }
            }

            if (obj.type === 'fire') {
                // Fire flicker via stored references
                for (let i = 0; i < this.fireMeshes.length; i++) {
                    const m = this.fireMeshes[i];
                    if (m.material) {
                        m.material.emissiveIntensity = 0.7 + Math.sin(time * 6 + i) * 0.2;
                    }
                }
            }

            if (obj.type === 'radioLight') {
                // Blinking red light on radio tower
                obj.obj.material.emissiveIntensity = 0.8 + Math.sin(time * 4) * 0.2;
            }

            if (obj.type === 'spire') {
                // Floating crystals rotation
                obj.group.children.forEach(child => {
                    if (child.isMesh && child.geometry.type === 'OctahedronGeometry') {
                        child.rotation.y = time * 0.5;
                        child.position.y += Math.sin(time * 2 + child.id) * 0.005;
                    }
                });
            }

            if (obj.type === 'fountainWater') {
                // Fountain water ripple
                obj.obj.scale.y = 1 + Math.sin(time * 3) * 0.05;
            }

            if (obj.type === 'fountainWater2') {
                obj.obj.scale.y = 1 + Math.sin(time * 3 + 1) * 0.05;
            }

            if (obj.type === 'waterDrop') {
                // Cascading water drops
                const dropPhase = (time * 1.5 + obj.angle) % (Math.PI * 2);
                obj.obj.position.y = 7 + Math.sin(dropPhase) * 1.5;
                obj.obj.material.opacity = 0.3 + Math.abs(Math.sin(dropPhase)) * 0.4;
            }

            if (obj.type === 'firePit') {
                // Fire pit flicker
                obj.obj.scale.y = 1 + Math.sin(time * 10 + obj.base.x) * 0.2;
                obj.obj.scale.x = 1 + Math.sin(time * 8 + obj.base.z) * 0.1;
            }

            if (obj.type === 'innerFire') {
                obj.obj.scale.y = 1 + Math.sin(time * 12) * 0.25;
            }

            if (obj.type === 'ember') {
                // Floating embers
                obj.obj.position.y += 0.01;
                obj.obj.position.x += Math.sin(time * 3 + obj.basePos.x) * 0.005;
                if (obj.obj.position.y > 7) {
                    obj.obj.position.y = 4;
                    obj.obj.position.x = (Math.random() - 0.5) * 1.5;
                    obj.obj.position.z = (Math.random() - 0.5) * 1.5;
                }
            }

            if (obj.type === 'dust') {
                // Floating dust motes
                obj.obj.position.y = obj.baseY + Math.sin(time * obj.speed + obj.phase) * 0.5;
                obj.obj.position.x += Math.sin(time * 0.1 + obj.phase) * 0.002;
                obj.obj.position.z += Math.cos(time * 0.1 + obj.phase) * 0.002;
            }

            if (obj.type === 'pollen') {
                // Forest pollen drift
                obj.obj.position.y = obj.baseY + Math.sin(time * 0.5 + obj.phase) * 0.8;
                obj.obj.position.x += Math.sin(time * 0.3 + obj.phase) * 0.003;
            }

            if (obj.type === 'butterfly') {
                // Butterflies fluttering in forest
                const t = time * obj.orbitSpeed + obj.orbitPhase;
                obj.group.position.x = obj.baseX + Math.cos(t) * obj.orbitRadius * 0.1;
                obj.group.position.z = obj.baseZ + Math.sin(t) * obj.orbitRadius * 0.1;
                obj.group.position.y = obj.baseY + Math.sin(time * obj.speed + obj.phase) * 1;

                // Wing flapping
                const flapAngle = Math.sin(time * 6 + obj.phase) * 0.6;
                obj.leftWing.rotation.z = flapAngle;
                obj.rightWing.rotation.z = -flapAngle;

                // Face direction of movement
                obj.group.rotation.y = t + Math.PI / 2;
            }

            if (obj.type === 'campfire') {
                obj.obj.scale.y = 1 + Math.sin(time * 9) * 0.2;
                obj.obj.rotation.y = time * 0.5;
            }

            if (obj.type === 'campfireInner') {
                obj.obj.scale.y = 1 + Math.sin(time * 11) * 0.3;
            }

            if (obj.type === 'campfireLight') {
                obj.light.intensity = 1.5 + Math.sin(time * 8) * 0.8;
            }

            if (obj.type === 'smoke') {
                obj.obj.position.y = obj.baseY + Math.sin(time * 0.5 + obj.index) * 0.3;
                obj.obj.position.x += Math.sin(time * 0.3 + obj.index) * 0.003;
                obj.obj.scale.setScalar(1 + obj.index * 0.2 + Math.sin(time + obj.index) * 0.1);
            }

            if (obj.type === 'sparkle') {
                obj.obj.material.opacity = 0.4 + Math.abs(Math.sin(time * 2 + obj.phase)) * 0.3;
                obj.obj.scale.setScalar(0.7 + Math.sin(time * 2 + obj.phase) * 0.3);
            }

            if (obj.type === 'spark') {
                // Rising campfire sparks
                obj.obj.position.y += obj.speed * 0.02;
                obj.obj.position.x = obj.baseX + Math.sin(time * 2 + obj.phase) * 0.3;
                obj.obj.position.z = obj.baseZ + Math.cos(time * 1.5 + obj.phase) * 0.3;
                obj.obj.material.opacity = Math.max(0, 0.8 - (obj.obj.position.y - 3) * 0.2);
                if (obj.obj.position.y > 7 || obj.obj.material.opacity <= 0) {
                    obj.obj.position.y = 3 + Math.random();
                    obj.obj.position.x = obj.baseX + (Math.random() - 0.5) * 0.3;
                    obj.obj.position.z = obj.baseZ + (Math.random() - 0.5) * 0.3;
                    obj.obj.material.opacity = 0.8;
                }
            }

            if (obj.type === 'firefly') {
                // Pulsing fireflies drifting in forest
                const dx = Math.sin(time * obj.speed + obj.phase) * 0.01;
                const dz = Math.cos(time * obj.speed * 0.7 + obj.phase) * 0.01;
                obj.obj.position.x += dx;
                obj.obj.position.z += dz;
                obj.obj.position.y = obj.baseY + Math.sin(time * 0.5 + obj.phase) * 0.5;
                const pulse = Math.abs(Math.sin(time * 1.2 + obj.pulsePhase));
                obj.obj.material.opacity = 0.4 + pulse * 0.4;
                obj.obj.scale.setScalar(0.6 + pulse * 0.4);
            }

            if (obj.type === 'riverFlow') {
                // Flow lines move along river
                obj.obj.position.z = obj.baseZ + Math.sin(time * 1.5 + obj.phase) * 3;
                obj.obj.material.opacity = 0.3 + Math.abs(Math.sin(time * 2 + obj.phase)) * 0.3;
            }

            if (obj.type === 'riverEddy') {
                obj.obj.rotation.z = time * 0.5 + obj.phase;
                obj.obj.material.opacity = 0.2 + Math.sin(time * 1.5 + obj.phase) * 0.15;
            }

            if (obj.type === 'snow') {
                // Falling snow particles
                obj.obj.position.y -= 0.02;
                obj.obj.position.x += Math.sin(time * 0.5 + obj.phase) * 0.01;
                obj.obj.position.z += Math.cos(time * 0.3 + obj.phase) * 0.01;
                if (obj.obj.position.y < 2) {
                    obj.obj.position.y = 20 + Math.random() * 10;
                    obj.obj.position.x = obj.baseX + (Math.random() - 0.5) * 10;
                    obj.obj.position.z = obj.baseZ + (Math.random() - 0.5) * 10;
                }
            }

            if (obj.type === 'iceRipple') {
                obj.obj.scale.setScalar(1 + Math.sin(time * 2 + obj.phase) * 0.3);
                obj.obj.material.opacity = 0.1 + Math.abs(Math.sin(time * 1.5 + obj.phase)) * 0.2;
            }

            if (obj.type === 'bird') {
                // Orbiting birds with flapping wings
                const t = time * obj.orbitSpeed + obj.orbitPhase;
                obj.group.position.x = obj.group.position.x + Math.cos(t) * obj.orbitRadius * 0.001;
                obj.group.position.z = obj.group.position.z + Math.sin(t) * obj.orbitRadius * 0.001;
                obj.group.position.y = obj.baseY + Math.sin(time * obj.speed + obj.phase) * 2;

                // Wing flapping
                const flapAngle = Math.sin(time * 8 + obj.phase) * 0.4;
                obj.leftWing.rotation.z = flapAngle;
                obj.rightWing.rotation.z = -flapAngle;
                obj.leftWing.rotation.x = flapAngle * 0.5;
                obj.rightWing.rotation.x = -flapAngle * 0.5;

                // Face direction of travel
                obj.group.rotation.y = t + Math.PI / 2;
            }

            if (obj.type === 'leaf') {
                // Falling leaves with spiral
                obj.obj.position.y = obj.baseY - ((time * obj.speed) % 15);
                obj.obj.position.x = obj.baseX + Math.sin(time * 0.5 + obj.phase) * 3;
                obj.obj.position.z = obj.baseZ + Math.cos(time * 0.3 + obj.phase) * 2;
                obj.obj.rotation.x = time * 2;
                obj.obj.rotation.z = time * 1.5;

                // Reset when fallen
                if (obj.obj.position.y < 2) {
                    obj.obj.position.y = 15 + Math.random() * 5;
                    obj.obj.position.x = obj.baseX;
                    obj.obj.position.z = obj.baseZ;
                }
            }

            if (obj.type === 'militarySmoke') {
                obj.obj.position.y = obj.baseY + Math.sin(time * 0.5 + obj.index) * 0.5;
                obj.obj.scale.setScalar(1 + Math.sin(time + obj.index) * 0.2);
                obj.obj.position.x += Math.sin(time * 0.3 + obj.index) * 0.003;
            }

            if (obj.type === 'banner') {
                // Simple sway via rotation (cheap)
                obj.group.rotation.z = Math.sin(time * 2 + obj.phase) * 0.05;
            }

            if (obj.type === 'puddle') {
                // Subtle ripple in puddle
                obj.obj.material.opacity = 0.3 + Math.abs(Math.sin(time * 1.5 + obj.phase)) * 0.2;
            }

            if (obj.type === 'waterfall') {
                // Animated water curtain
                const pos = obj.obj.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    const wave = Math.sin(time * 3 + y * 2 + obj.phase) * 0.15;
                    pos.setZ(i, pos.getZ(i) + wave * 0.01);
                }
                pos.needsUpdate = true;
                obj.obj.material.opacity = 0.5 + Math.sin(time * 2 + obj.phase) * 0.1;
            }

            if (obj.type === 'warBanner') {
                // Simple sway via rotation (cheap)
                obj.group.rotation.z = Math.sin(time * 2 + obj.phase) * 0.06;
            }
        });
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
