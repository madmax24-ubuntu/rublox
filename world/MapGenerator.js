import * as THREE from "three";
import { mergeBufferGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

// ============ COLOR CONSTANTS ============
const COLOR = {
    // Arena — bright vibrant colors
    arenaGround: 0x5a8a3a,
    arenaPath: 0xc8b898,
    // Cornucopia
    metalDark: 0x6a6a6a,
    metalLight: 0x9a9a9a,
    metalGold: 0xf8d840,
    // Ruined Citadel (NW)
    ruinStone: 0xc8c2c0,
    ruinDarkStone: 0x9a9590,
    ruinFloor: 0xb0aaa5,
    ruinMoss: 0x7a9a5a,
    // Crystal Grotto (NE)
    crystalBlue: 0x4488cc,
    crystalPurple: 0x8844aa,
    crystalFloor: 0x5a5a6a,
    crystalReflect: 0x99bbdd,
    crystalGlow: 0x88ccff,
    // Burning Wastes (SW)
    lava: 0xff4400,
    obsidian: 0x4a4a5a,
    wasteGround: 0x7a5a3a,
    scorchedRock: 0x5a5a5a,
    smoke: 0x4a4a4a,
    // Luminous Forest (SE)
    luminousBark: 0x5a4a3a,
    luminousLeaf: 0x22aa44,
    luminousGlow: 0x44ff88,
    luminousMushroom: 0x8844ff,
    luminousFloor: 0x5a8a5a,
    luminousPond: 0x226644,
    // Misc
    bridgeWood: 0x8a7a6a,
    fenceWood: 0x7a6a5a,
    stone: 0xb0b0b0,
    wood: 0x9b6236,
    chestWood: 0x9b6236,
    chestGold: 0xdaa520,
    forcefield: 0x4488ff,
    // Terrain
    terrain: 0x5a8a3a,
};

// ============ MAP GENERATOR ============
export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.arenaRadius = 220;
        this.spawnCourtyardRadius = 40;
        this.halfSize = this.arenaRadius;
        this.waterLevel = 0;
        this.colliders = [];
        this.spawnPads = [];
        this.hazards = [];
        this.traps = [];
        this.fogZones = [];
        this.radiationZones = [];
        this.lootData = [];
        this.animatedObjects = [];
        this.waterMeshes = [];
        this.particleSystems = [];
        this.noise = new SimplexNoise(42);
        this.heightMap = null;
        this.currentFogPhase = 0;
        this.zoneTransitionTime = 0;
        this.activeFogRing = null;
        this.onProgress = null; // callback(ratio, statusText)
        this.ready = new Promise(resolve => { this._resolveReady = resolve; });
    }

    reportProgress(ratio, status) {
        this.onProgress?.(ratio, status);
    }

    // ============ PERFORMANCE: INSTANCED MESH BUILDER ============
    // Converts multiple individual meshes with shared geometry+material into a single InstancedMesh
    batchInstances(geometry, material, items, userData = {}) {
        const count = items.length;
        if (count === 0) return;
        if (count === 1) {
            const m = new THREE.Mesh(geometry, material);
            const it = items[0];
            m.position.set(it.x || 0, it.y || 0, it.z || 0);
            if (it.sx !== undefined) m.scale.set(it.sx, it.sy || it.sx, it.sz || it.sx);
            if (it.rotX) m.rotation.x = it.rotX;
            if (it.rotY) m.rotation.y = it.rotY;
            if (it.rotZ) m.rotation.z = it.rotZ;
            m.castShadow = it.castShadow !== false;
            m.receiveShadow = it.receiveShadow !== false;
            m.userData = { ...userData, ...it.userData };
            this.scene.add(m);
            return;
        }

        const instanced = new THREE.InstancedMesh(geometry, material, count);
        const dummy = new THREE.Object3D();
        const entries = [];

        for (let i = 0; i < count; i++) {
            const it = items[i];
            dummy.position.set(it.x || 0, it.y || 0, it.z || 0);
            dummy.rotation.set(it.rotX || 0, it.rotY || 0, it.rotZ || 0);
            const s = it.s || 1;
            dummy.scale.set(it.sx || s, it.sy || s, it.sz || s);
            dummy.updateMatrix();
            instanced.setMatrixAt(i, dummy.matrix);
            entries.push(it);
        }

        instanced.instanceMatrix.needsUpdate = true;
        instanced.castShadow = true;
        instanced.receiveShadow = true;
        instanced.userData = { isMapObject: true, ...userData };
        this.scene.add(instanced);

        // Add individual colliders/props from entries
        if (entries[0]?.userData?.isCollider) {
            entries.forEach(it => {
                this.colliders.push(it.collider);
            });
        }
    }

    // ============ PERFORMANCE: BATCH PROPS BY GEOMETRY ============
    // Groups meshes by their geometry params and material, creates InstancedMesh for each group
    batchPropsByMaterial(geometries, material, items) {
        const key = `${geometries.key}-${material.uuid}`;
        if (!this._batchCache) this._batchCache = new Map();
        if (this._batchCache.has(key)) {
            this._batchCache.get(key).push(...items);
            return;
        }
        const cache = { geometries, material, items: [...items] };
        this._batchCache.set(key, cache);
    }

    flushBatches() {
        if (!this._batchCache) return;
        for (const [key, cache] of this._batchCache) {
            const { geometries, material, items } = cache;
            // Use batchInstances for the first item's geometry type
            const geoKey = Object.keys(geometries).find(k => geometries[k].type === items[0]?._geoType);
            if (geoKey && geometries[geoKey]) {
                this.batchInstances(geometries[geoKey], material, items.map(i => {
                    const { _geoType, collider, ...rest } = i;
                    return rest;
                }), items[0]?.userData || {});
            }
        }
        this._batchCache = null;
    }

    // Helper: tag a mesh with gameplay identifiers
    tagMesh(mesh, ...tags) {
        mesh.userData.isMapObject = true;
        for (const t of tags) mesh.userData[t] = true;
    }

    async startGeneration() { await this.generate(); }
    yieldFrame() { return new Promise(resolve => setTimeout(resolve, 0)); }

    async generate() {
        this.generateHeightMap();
        this.reportProgress(0.05, 'Создание ландшафта...');

        await this.buildArenaFloor();
        this.reportProgress(0.12, 'Ландшафт готов');
        await this.yieldFrame();

        await this.buildForcefield();
        this.reportProgress(0.18, 'Арена построена');
        await this.yieldFrame();

        await this.buildCornucopia();
        this.reportProgress(0.25, 'Корнукопия');
        await this.yieldFrame();

        await this.buildInnerRing();
        this.reportProgress(0.32, 'Внутреннее кольцо');
        await this.yieldFrame();

        await this.buildBiomePaths();
        this.reportProgress(0.38, 'Пути биомов');
        await this.yieldFrame();

        await this.buildRuinedCitadel();
        this.reportProgress(0.45, 'Руины Цитадели');
        await this.yieldFrame();

        await this.buildCrystalGrotto();
        this.reportProgress(0.52, 'Хрустальная гротовка');
        await this.yieldFrame();

        await this.buildBurningWastes();
        this.reportProgress(0.58, 'Пылающие пустоши');
        await this.yieldFrame();

        await this.buildLuminousForest();
        this.reportProgress(0.65, 'Светящийся лес');
        await this.yieldFrame();

        this.reportProgress(0.68, 'Мосты и форпосты...');
        this.buildBridges();
        this.buildOuterOutposts();
        this.buildHazardZones();
        this.buildLootClusters();
        this.buildFirePits();
        this.reportProgress(0.75, 'Объекты размещены');
        await this.yieldFrame();

        this.buildParticleSystems();
        this.reportProgress(0.82, 'Частицы');
        this.buildTraps();
        this.buildFogZones();
        this.buildRadiationZones();
        this.buildLootData();
        this.reportProgress(0.90, 'Лут и ловушки');
        await this.yieldFrame();

        this.setupAnimations();

        this.scene.traverse(obj => {
            if (obj.isMesh || obj.isGroup || obj.isInstancedMesh) {
                obj.userData.mapGenerated = true;
                obj.frustumCulled = false;
            }
        });

        this.reportProgress(0.95, 'Мир готов');
        this._resolveReady();
    }

    // ===================== ZONE 0: ARENA FLOOR (Multi-Biome Shader Terrain) =====================
    async buildArenaFloor() {
        const halfSize = this.arenaRadius;

        // ---- Shader uniforms for each biome zone ----
        const terrainMat = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec2 vUV;
                varying vec3 vWorldPos;
                varying vec3 vNormal;
                uniform float uTime;

                // Hash-based pseudo-random
                vec3 hash3(vec3 p) {
                    p = fract(p * vec3(9.547, 7.213, 3.887));
                    p += dot(p, p.yzx * 0.1);
                    return fract(vec3(12.9898, 78.233, 45.164) * sin(dot(p, vec3(1.0))));
                }

                // Multi-octave noise for terrain displacement
                float terrainNoise(vec2 p) {
                    float n = 0.0;
                    float amp = 1.0, freq = 0.012;
                    for (int i = 0; i < 6; i++) {
                        n += (hash3(vec3(p, fract(uTime * 0.1 + float(i)))).x - 0.5) * amp;
                        p *= 2.0;
                        amp *= 0.5;
                        freq *= 2.0;
                    }
                    return n;
                }

                void main() {
                    vUV = uv;
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;

                    // Displacement: flatten at center, roughen at edges
                    float dist = length(position.xz);
                    float centerMask = clamp(1.0 - (dist - 30.0) / 80.0, 0.0, 1.0);
                    float edgeMask = clamp((dist - 120.0) / 80.0, 0.0, 1.0);
                    float disp = terrainNoise(position.xz * 0.5) * (0.2 + edgeMask * 2.0) * centerMask;
                    disp += terrainNoise(position.xz * 1.5) * 0.3 * (1.0 - centerMask);

                    // Compute normal via finite differences
                    float eps = 1.0;
                    float hL = terrainNoise((position.xz - vec2(eps, 0.0)) * 0.5);
                    float hR = terrainNoise((position.xz + vec2(eps, 0.0)) * 0.5);
                    float hU = terrainNoise((position.xz - vec2(0.0, eps)) * 0.5);
                    float hD = terrainNoise((position.xz + vec2(0.0, eps)) * 0.5);
                    vec3 norm = normalize(vec3(hL - hR, eps * 2.0, hU - hD));
                    vNormal = norm;

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, disp, 0.0), 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                varying vec2 vUV;
                varying vec3 vWorldPos;
                varying vec3 vNormal;
                uniform float uTime;

                // Pseudo-random grain
                float grain(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                // Zone weight: smooth blending from 5 biome zones
                vec4 zoneWeights(vec2 pos) {
                    // pos: normalized ~[-1.3, 1.3] range based on arena size
                    vec2 center = vec2(0.0, 0.0);        // Cornucopia (center)
                    vec2 nw     = vec2(-0.65, 0.65);      // Citadel (NW)
                    vec2 ne     = vec2(0.65, 0.65);       // Crystal (NE)
                    vec2 sw     = vec2(-0.65, -0.65);     // Volcano (SW)
                    vec2 se     = vec2(0.65, -0.65);      // Forest (SE)

                    float s = 0.4;
                    float dC = length(pos - center), dN = length(pos - nw);
                    float dE = length(pos - ne), dW = length(pos - sw);
                    float dS = length(pos - se);

                    float wC = 1.0 / (1.0 + pow(dC / s, 4.0) * exp(length(pos - nw) * length(pos - nw) / (2.0 * s * s)));
                    float wN = 1.0 / (1.0 + pow(dN / s, 4.0) * exp(length(pos - center) * length(pos - center) / (2.0 * s * s)));
                    float wE = 1.0 / (1.0 + pow(dE / s, 4.0) * exp(length(pos - center) * length(pos - center) / (2.0 * s * s)));
                    float wW = 1.0 / (1.0 + pow(dW / s, 4.0) * exp(length(pos - center) * length(pos - center) / (2.0 * s * s)));
                    float wS = 1.0 / (1.0 + pow(dS / s, 4.0) * exp(length(pos - center) * length(pos - center) / (2.0 * s * s)));

                    float sum = wC + wN + wE + wW + wS;
                    return vec4(wC/sum, wN/sum, wE/sum, wW/sum);
                }

                void main() {
                    vec2 wp = vWorldPos.xz / 220.0; // normalize to ~[-1, 1]
                    vec4 zw = zoneWeights(wp);
                    float wSE = 1.0 - zw.r - zw.g - zw.b - zw.a;

                    // Biome colors (pre-computed from COLOR constants)
                    vec3 corn = vec3(0.42, 0.40, 0.38);  // metallic dark with gold
                    vec3 cit  = vec3(0.78, 0.76, 0.75);  // stone gray
                    vec3 cry  = vec3(0.35, 0.28, 0.55);  // blue-purple crystal
                    vec3 vol  = vec3(0.24, 0.22, 0.28);  // dark obsidian
                    vec3 fore = vec3(0.18, 0.38, 0.18);  // forest green

                    // Per-biome grain variation
                    float gC = grain(vWorldPos.xz * 0.3), gN = grain(vWorldPos.xz * 0.4);
                    float gE = grain(vWorldPos.xz * 0.5), gW = grain(vWorldPos.xz * 0.6);
                    float gS = grain(vWorldPos.xz * 0.7);
                    corn += (gC - 0.5) * 0.06;
                    cit  += (gN - 0.5) * 0.08;
                    cry  += (gE - 0.5) * 0.10;
                    vol  += (gW - 0.5) * 0.06;
                    fore += (gS - 0.5) * 0.07;

                    // Subtle pulsing glow per biome
                    float pulse = sin(uTime * 0.5) * 0.12 + 0.88;
                    corn += vec3(0.12, 0.08, 0.0) * pulse;    // gold shimmer
                    cry  += vec3(0.0, 0.06, 0.10) * pulse;     // blue glow
                    vol  += vec3(0.06, 0.01, 0.0) * pulse;     // lava glow
                    fore += vec3(0.0, 0.05, 0.01) * pulse;     // green glow

                    // Road overlay: radial paths from center to each corner
                    float rw = 0.02;
                    float r1 = abs(wp.x) - rw, r2 = abs(wp.y) - rw;
                    float r3 = abs(wp.x - wp.y) / 1.4 - rw, r4 = abs(wp.x + wp.y) / 1.4 - rw;
                    float r5 = smoothstep(0.1, 0.0, length(wp) - 0.15) * 0.15; // inner ring
                    float road = min(min(r1, r2), min(min(r3, r4), r5));
                    float roadMask = 1.0 - smoothstep(-0.01, 0.02, road);

                    vec3 roadColor = vec3(0.28, 0.26, 0.22);
                    vec3 color = corn * zw.r + cit * zw.g + cry * zw.b + vol * zw.a + fore * wSE;
                    color = mix(color, roadColor, roadMask);

                    // Diffuse lighting
                    vec3 lightDir = normalize(vec3(1.0, 2.5, 1.0));
                    float diff = max(dot(normalize(vNormal), lightDir), 0.35);
                    color *= diff;

                    // Rim light for dramatic top-down view
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);
                    float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 3.0);
                    color += rim * vec3(0.04, 0.03, 0.05);

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            uniforms: {
                uTime: { value: 0 }
            },
            side: THREE.FrontSide
        });

        // PlaneGeometry: 440x440, 128x128 segments for smooth displacement
        const floorGeo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, 128, 128);
        floorGeo.rotateX(-Math.PI / 2);

        const floor = new THREE.Mesh(floorGeo, terrainMat);
        floor.position.y = -0.25;
        floor.receiveShadow = true;
        floor.userData.isArena = true;
        floor.userData.isFloor = true;
        floor.userData.isGround = true;
        floor.userData.isMapObject = true;
        this.scene.add(floor);
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, -0.5, 0), size: new THREE.Vector3(this.arenaRadius * 2, 1, this.arenaRadius * 2) });

        // 60 gentle hills across arena for terrain interest (not overwhelming)
        const terrainMatHill = new THREE.MeshStandardMaterial({ color: COLOR.terrain, roughness: 1.0 });
        const noise = this.noise;
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 35 + Math.random() * (this.arenaRadius - 60);
            const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
            const h = noise.fbm(x * 0.008, z * 0.008, 3) * 4;
            if (Math.abs(h) < 0.5) continue;
            const size = 4 + Math.abs(h) * 2;
            const hillH = Math.abs(h) * 1.2;
            const hill = new THREE.Mesh(new THREE.BoxGeometry(size, hillH, size * 0.8), terrainMatHill);
            hill.position.set(x, hillH * 0.3, z);
            hill.rotation.y = Math.random() * Math.PI;
            hill.receiveShadow = true;
            hill.castShadow = h > 0;
            hill.userData.isArena = true; hill.userData.isTerrain = hill.userData.isHill = true; hill.userData.isCover = true; hill.userData.isMapObject = true;
            this.scene.add(hill);
        }

        // ---- Canvas detail texture for road/terrain overlay ----
        const detailCanvas = document.createElement('canvas');
        detailCanvas.width = detailCanvas.height = 256;
        const dCtx = detailCanvas.getContext('2d');

        // Base grain: subtle noise variation
        for (let y = 0; y < 256; y += 4) {
            for (let x = 0; x < 256; x += 4) {
                const n = (Math.random() - 0.5) * 16;
                dCtx.fillStyle = `rgb(${128 + n | 0}, ${128 + n | 0}, ${128 + n | 0})`;
                dCtx.fillRect(x, y, 4, 4);
            }
        }

        // Draw subtle radial road lines from center
        dCtx.strokeStyle = 'rgba(70, 65, 50, 0.3)';
        dCtx.lineWidth = 2;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            dCtx.beginPath();
            dCtx.moveTo(128, 128);
            dCtx.lineTo(128 + Math.cos(a) * 256, 128 + Math.sin(a) * 256);
            dCtx.stroke();
        }

        const detailTex = new THREE.CanvasTexture(detailCanvas);
        detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
        detailTex.repeat.set(32, 32);
        detailTex.colorSpace = THREE.SRGBColorSpace;
        terrainMat.uniforms.uDetailTex = { value: detailTex };

        await this.yieldFrame();
    }

    // ===================== ZONE 0: FORCEFIELD =====================
    async buildForcefield() {
        const ffMat = new THREE.MeshStandardMaterial({
            color: COLOR.forcefield, emissive: COLOR.forcefield, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide
        });
        const ffGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 12, 64, 1, true);
        const forcefield = new THREE.Mesh(ffGeo, ffMat);
        forcefield.position.y = 6;
        forcefield.userData.isArena = true; forcefield.userData.isForcefield = true; forcefield.userData.isHazard = true; forcefield.userData.isMapObject = true;
        this.scene.add(forcefield);

        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x88bbff, emissive: 0x4488ff, emissiveIntensity: 2, transparent: true, opacity: 0.8
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(this.arenaRadius + 0.5, 0.3, 8, 64), ringMat);
        ring.position.y = 0; ring.rotation.x = Math.PI / 2; ring.userData.isArena = true; ring.userData.isForcefield = true; ring.userData.isRing = true; ring.userData.isMapObject = true;
        this.scene.add(ring);
        const topRing = ring.clone(); topRing.position.y = 12;
        topRing.userData.isArena = true; topRing.userData.isForcefield = true; topRing.userData.isRing = true; topRing.userData.isMapObject = true;
        this.scene.add(topRing);

        // 48 forcefield lines
        const lineMat = new THREE.LineBasicMaterial({ color: 0x6699ff, transparent: true, opacity: 0.35 });
        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const pts = [
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 0, Math.sin(a) * this.arenaRadius),
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 12, Math.sin(a) * this.arenaRadius)
            ];
 const ffLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
            ffLine.userData.isArena = true; ffLine.userData.isForcefield = true; ffLine.userData.isLine = true; ffLine.userData.isMapObject = true;
            this.scene.add(ffLine);
        }

        this.animatedObjects.push({ type: 'forcefield', mesh: forcefield, material: ffMat, baseOpacity: 0.3, baseEmissive: 0.5 });
        await this.yieldFrame();
    }

    // ===================== ZONE 0: CORNICOPIA =====================
    // Role: Maximum reward, maximum risk. High-tier loot, 4-way sightlines, first-fight zone
    async buildCornucopia() {
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.8 });
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.4, metalness: 0.9 });
        const hornMat = new THREE.MeshStandardMaterial({ color: COLOR.metalGold, roughness: 0.3, metalness: 0.95 });

        // Base platform (R=16, sits on ground y=0)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(16, 18, 3, 8), baseMat);
        base.position.y = 1.5; base.castShadow = true; base.receiveShadow = true;
        base.userData.isCornucopia = true; base.userData.isPlatform = true; base.userData.isMapObject = true;
        this.scene.add(base);

        // Outer wall ring with gates (4 openings at cardinal directions)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.7, metalness: 0.8 });
        // Build wall in 4 arcs with gaps
        for (let i = 0; i < 4; i++) {
            const startA = i * Math.PI / 2 + Math.PI / 8;
            const endA = i * Math.PI / 2 + Math.PI / 2 - Math.PI / 8;
            const segments = Math.floor((endA - startA) / (Math.PI / 16)) * 2;
            for (let s = 0; s < segments; s++) {
                const a = startA + (s / segments) * (endA - startA);
               const seg = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4, 1.5), wallMat);
                seg.position.set(Math.cos(a) * 18, 2, Math.sin(a) * 18);
                seg.rotation.y = -a + Math.PI / 2;
                seg.castShadow = true;
                seg.userData.isCornucopia = true; seg.userData.isWall = true; seg.userData.isMapObject = true;
                this.scene.add(seg);
            }
        }

        // Main body
         const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), bodyMat);
        hull.position.set(0, 8, 0); hull.rotation.y = Math.PI / 4; hull.scale.set(1, 1, 0.6);
        hull.castShadow = true; hull.receiveShadow = true;
        hull.userData.isCornucopia = true; hull.userData.isBody = true; hull.userData.isMapObject = true;
        this.scene.add(hull);

        // Left horn
        const hornLeftGroup = new THREE.Group();
        for (let i = 0; i < 10; i++) {
            const t = i / 10, radius = 2.5 * (1 - t * 0.7);
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1.4, 8), hornMat);
            const angle = t * Math.PI * 0.5, h = 5 + t * 12, xOff = -t * 8;
            seg.position.set(xOff, h, 0); seg.rotation.z = angle * 0.5; seg.castShadow = true;
            seg.userData.isCornucopia = true; seg.userData.isHorn = true; seg.userData.isCornucopiaPart = true; seg.userData.isMapObject = true;
            hornLeftGroup.add(seg);
        }
        this.scene.add(hornLeftGroup);
        const hornRightGroup = hornLeftGroup.clone();
        hornRightGroup.children.forEach(s => { s.position.x = -s.position.x; s.rotation.z = -s.rotation.z; });
        this.scene.add(hornRightGroup);

      // Spire
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3, 8, 8), baseMat);
        spire.position.set(0, 13, -5); spire.castShadow = true;
        spire.userData.isCornucopia = true; spire.userData.isSpire = true;
        this.scene.add(spire);
        const spireTop = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), hornMat);
        spireTop.position.set(0, 17.5, -5); spireTop.castShadow = true;
        spireTop.userData.isCornucopia = true; spireTop.userData.isSpire = true; spireTop.userData.isTop = true;
        this.scene.add(spireTop);

        // Chest (center loot)
        const chestMat = new THREE.MeshStandardMaterial({ color: COLOR.chestWood, roughness: 0.7 });
        const chestTrimMat = new THREE.MeshStandardMaterial({ color: COLOR.chestGold, roughness: 0.3, metalness: 0.8 });
        const chestBody = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 2.2), chestMat);
        chestBody.position.set(0, 5, 0); chestBody.castShadow = true;
        chestBody.userData.isCornucopia = true; chestBody.userData.isChest = true; chestBody.userData.isLootContainer = true; chestBody.userData.isMapObject = true;
        this.scene.add(chestBody);
        const chestLid = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), chestMat);
        chestLid.position.set(0, 5.9, 0); chestLid.scale.set(1, 0.4, 0.83); chestLid.castShadow = true;
        chestLid.userData.isCornucopia = true; chestLid.userData.isChest = true; chestLid.userData.isLootContainer = true; chestLid.userData.isMapObject = true;
        this.scene.add(chestLid);
   for (let by of [5, 5.9]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.15, 2.3), chestTrimMat); b.position.set(0, by, 0); b.userData.isCornucopia = true; b.userData.isChest = true; b.userData.isTrim = true; b.userData.isMapObject = true; this.scene.add(b); }
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.25), chestTrimMat);
        lock.position.set(0, 5, 1.15); lock.userData.isCornucopia = true; lock.userData.isChest = true; lock.userData.isLock = true; lock.userData.isMapObject = true;
        this.scene.add(lock);

        // Chest glow
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 2, transparent: true, opacity: 0.8 });
        const glowCore = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat);
        glowCore.position.set(0, 5, 0); glowCore.userData.isCornucopia = true; glowCore.userData.isLootGlow = true; glowCore.userData.isMarker = true; glowCore.userData.isMapObject = true;
        this.scene.add(glowCore);
        const glowLight = new THREE.PointLight(0xff8800, 4, 35);
        glowLight.position.set(0, 5.5, 0); this.scene.add(glowLight);

        // Observation platform (R=4.5, height=15)
        // Support pillar connecting to hull
        const supportPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 10, 8), baseMat);
        supportPillar.position.set(0, 13, 0); supportPillar.castShadow = true; supportPillar.receiveShadow = true;
        supportPillar.userData.isCornucopia = true; supportPillar.userData.isSupport = true; supportPillar.userData.isMapObject = true;
        this.scene.add(supportPillar);

        const obsPlatform = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.3, 8), baseMat);
        obsPlatform.position.set(0, 14.5, 0); obsPlatform.receiveShadow = true;
        obsPlatform.userData.isCornucopia = true; obsPlatform.userData.isObservationPlatform = true; obsPlatform.userData.isElevated = true; obsPlatform.userData.isMapObject = true;
        this.scene.add(obsPlatform);
        const railMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.5, metalness: 0.9 });
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), railMat);
            post.position.set(Math.cos(a) * 4.3, 15, Math.sin(a) * 4.3);
            post.userData.isCornucopia = true; post.userData.isObservationPlatform = true; post.userData.isRail = true; post.userData.isMapObject = true;
            this.scene.add(post);
        }

        // Ramp (one side, main entrance) — connects ground to Cornucopia platform edge
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 10), bodyMat);
        ramp.position.set(0, 1.5, 9); ramp.rotation.x = -0.12;
        ramp.castShadow = true; ramp.receiveShadow = true;
        ramp.userData.isCornucopia = true; ramp.userData.isRamp = true; ramp.userData.isEntrance = true; ramp.userData.isMapObject = true;
        this.scene.add(ramp);

        // Supply crates (arranged around Cornucopia for additional loot)
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7, metalness: 0.6 });
        const cratePositions = [
            { x: -7, z: 7 }, { x: -3, z: 9 }, { x: 3, z: 9 }, { x: 7, z: 7 },
            { x: -10, z: 2 }, { x: 0, z: 3 }, { x: 10, z: 2 },
            { x: -13, z: -3 }, { x: -6, z: -4 }, { x: 6, z: -4 }, { x: 13, z: -3 },
            { x: -9, z: -8 }, { x: 0, z: -9 }, { x: 9, z: -8 },
        ];
        for (const cp of cratePositions) {
            const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 2), crateMat);
            crate.position.set(cp.x, 1.25, cp.z);
 crate.castShadow = true; crate.receiveShadow = true;
            crate.userData.isCornucopia = true; crate.userData.isSupplyCrate = true; crate.userData.isLootContainer = true; crate.userData.isMapObject = true;
            this.scene.add(crate);
        }

        // Weapons racks (4 at cardinal directions inside Cornucopia)
        const rackMat = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.8 });
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const rx = Math.cos(a) * 10, rz = Math.sin(a) * 10;
            for (const side of [-1, 1]) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 6), rackMat);
                post.position.set(rx + side * 1.2, 1.25, rz); post.castShadow = true;
                post.userData.isCornucopia = true; post.userData.isWeaponsRack = true; post.userData.isSupport = true; post.userData.isMapObject = true;
                this.scene.add(post);
            }
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), rackMat);
            bar.position.set(rx, 2.5, rz); bar.rotation.z = Math.PI / 2;
            bar.userData.isCornucopia = true; bar.userData.isWeaponsRack = true; bar.userData.isWeaponHolder = true; bar.userData.isMapObject = true;
            this.scene.add(bar);
        }

        // Colliders
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, 1.5, 0), size: new THREE.Vector3(36, 3, 36) });
        this.colliders.push({ type: 'box', position: new THREE.Vector3(0, 8, 0), size: new THREE.Vector3(14, 12, 14) });
        this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(0, 4, 0), radius: 18, height: 8 });

        // Spawn pads (11 total) — visual markers + data
        // Center pad
        const centerPad = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.1, 16),
            new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 }));
        centerPad.position.set(0, 3.05, 0); centerPad.userData.isCornucopia = true; centerPad.userData.isSpawnPad = true;
        this.scene.add(centerPad); this.spawnPads.push({ x: 0, y: 5, z: 0, radius: 3.5 });
        // Inner ring (5)
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const pad = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.1, 12),
                new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.5 }));
            pad.position.set(Math.cos(a) * 8, 3.05, Math.sin(a) * 8); pad.userData.isCornucopia = true; pad.userData.isSpawnPad = true;
            this.scene.add(pad);
            this.spawnPads.push({ x: Math.cos(a) * 8, y: 3, z: Math.sin(a) * 8, radius: 2 });
        }
        // Outer positions (5)
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
            const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.1, 12),
                new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.5 }));
            pad.position.set(Math.cos(a) * 16, 3.05, Math.sin(a) * 16); pad.userData.isCornucopia = true; pad.userData.isSpawnPad = true;
            this.scene.add(pad);
            this.spawnPads.push({ x: Math.cos(a) * 16, y: 3, z: Math.sin(a) * 16, radius: 1.8 });
        }

        this.animatedObjects.push({ type: 'cornucopiaGlow', mesh: glowCore, light: glowLight });
        await this.yieldFrame();
    }

    // ===================== ZONE 1: INNER RING (R=25-60) =====================
    // Role: First skirmish zone. Dense cover, loot clusters, escape routes from Cornucopia
    // Contains: 8 loot outposts (2 per cardinal direction), cover walls, elevated positions
    async buildInnerRing() {
        const stoneMat = new THREE.MeshStandardMaterial({ color: COLOR.stone, roughness: 0.9 });
        const woodMat = new THREE.MeshStandardMaterial({ color: COLOR.wood, roughness: 0.85 });

        // 8 inner ring outposts (small defensive structures)
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = 38 + (i % 2) * 6; // Alternate between 38 and 44 for variety
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            if (i % 2 === 0) {
                // Stone outpost (4 walls with gate, central loot platform)
                const wallH = 3, wallThick = 0.8;
                // 4 walls
                for (let w = 0; w < 4; w++) {
                    const wa = (w / 4) * Math.PI * 2;
                    const nx = Math.cos(wa + Math.PI / 4), nz = Math.sin(wa + Math.PI / 4);
                    const wallLen = 5;
                    // Skip one wall per outpost to create entrance
                    if (w === ((i / 2) % 4)) continue;
                    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallLen, wallH, wallThick), stoneMat);
                    wall.position.set(x + nx * 3, wallH / 2, z + nz * 3);
                    wall.rotation.y = wa + Math.PI / 2;
                    wall.castShadow = true; wall.receiveShadow = true;
                wall.userData.isInnerRing = true; wall.userData.isOutpost = true; wall.userData.isStone = true; wall.userData.isCover = true; wall.userData.isMapObject = true;
                this.scene.add(wall);
                }
                // Corner posts
                for (let c = 0; c < 4; c++) {
                    const ca = (c / 4) * Math.PI * 2 + Math.PI / 4;
                    const post = new THREE.Mesh(new THREE.BoxGeometry(1, wallH + 1, 1), stoneMat);
                    post.position.set(x + Math.cos(ca) * 3.5, (wallH + 1) / 2, z + Math.sin(ca) * 3.5);
                    post.castShadow = true;
                    post.userData.isInnerRing = true; post.userData.isOutpost = true; post.userData.isCornerPost = true; post.userData.isMapObject = true;
                    this.scene.add(post);
                }
                // Roof ring
                const roof = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.3, 4, 8), stoneMat);
                roof.position.set(x, wallH + 0.5, z); roof.rotation.x = Math.PI / 2;
                roof.userData.isInnerRing = true; roof.userData.isOutpost = true; roof.userData.isRoof = true; roof.userData.isMapObject = true;
                this.scene.add(roof);

                this.colliders.push({ type: 'box', position: new THREE.Vector3(x, wallH / 2, z), size: new THREE.Vector3(8, wallH, 8) });
            } else {
                // Wooden barricade cluster (3-4 barricades forming cover maze)
                for (let b = 0; b < 3; b++) {
                    const ba = (b / 3) * Math.PI * 2;
                    const bx = x + Math.cos(ba) * 3, bz = z + Math.sin(ba) * 3;
                    // Vertical posts
                    for (const side of [-1, 1]) {
                        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.5, 5), woodMat);
                        post.position.set(bx + side * 1, 1.25, bz); post.castShadow = true;
                        post.userData.isInnerRing = true; post.userData.isBarricade = true; post.userData.isWooden = true; post.userData.isCover = true; post.userData.isMapObject = true;
                        this.scene.add(post);
                    }
                    // Horizontal planks
                    for (let p = 0; p < 3; p++) {
                        const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.12), woodMat);
                        plank.position.set(bx, 0.5 + p * 0.7, bz);
                        plank.rotation.y = Math.random() * Math.PI;
                        plank.castShadow = true; plank.receiveShadow = true;
                    plank.userData.isInnerRing = true; plank.userData.isBarricade = true; plank.userData.isWooden = true; plank.userData.isCover = true; plank.userData.isMapObject = true;
                    this.scene.add(plank);
                    }
                    this.colliders.push({ type: 'box', position: new THREE.Vector3(bx, 1.25, bz), size: new THREE.Vector3(2.5, 2.5, 0.5) });
                }
            }

            // Loot marker glow at each outpost
            const lootGlow = new THREE.MeshStandardMaterial({
                color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.5,
                transparent: true, opacity: 0.6
            });
 const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), lootGlow);
            glow.position.set(x, 2, z); glow.userData.isInnerRing = true; glow.userData.isLootGlow = true; glow.userData.isMarker = true; glow.userData.isMapObject = true;
            this.scene.add(glow);
            this.animatedObjects.push({
                type: 'lanternGlow', light: new THREE.PointLight(0xffaa22, 1.5, 12),
                baseIntensity: 1.5
            });
            // Reuse the last one
            const lastLight = this.animatedObjects[this.animatedObjects.length - 1].light;
            lastLight.position.set(x, 2.5, z);
            this.scene.add(lastLight);
        }

        // Elevated scouting mounds (4 at diagonal positions)
        const moundMat = new THREE.MeshStandardMaterial({ color: COLOR.terrain, roughness: 1.0 });
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const r = 45;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            // Mound
            const mound = new THREE.Mesh(new THREE.ConeGeometry(4, 3, 8), moundMat);
            mound.position.set(x, 1.5, z);
            mound.castShadow = true; mound.receiveShadow = true;
            mound.userData.isInnerRing = true; mound.userData.isScoutingMound = true; mound.userData.isElevated = true; mound.userData.isMapObject = true;
            this.scene.add(mound);
            // Scouting platform on top
            const plat = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.2, 8), stoneMat);
            plat.position.set(x, 3.1, z); plat.receiveShadow = true;
            plat.userData.isInnerRing = true; plat.userData.isScoutingMound = true; plat.userData.isPlatform = true; plat.userData.isElevated = true; plat.userData.isMapObject = true;
            this.scene.add(plat);
            // Rail
            const railMat2 = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.6, metalness: 0.8 });
            for (let r2 = 0; r2 < 8; r2++) {
                const ra = (r2 / 8) * Math.PI * 2;
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), railMat2);
                post.position.set(x + Math.cos(ra) * 1.9, 3.7, z + Math.sin(ra) * 1.9);
                post.userData.isInnerRing = true; post.userData.isScoutingMound = true; post.userData.isRail = true; post.userData.isMapObject = true;
                this.scene.add(post);
            }
        }

       // Cover rocks between Cornucopia and inner ring
        const innerRocks = [];
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 22 + Math.random() * 18;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const s = 1 + Math.random() * 2;
            innerRocks.push({
                x, y: s * 0.3, z,
                sx: s, sy: s * 0.6, sz: s,
                rotX: Math.random(), rotY: Math.random(), rotZ: Math.random(),
                isInnerRing: true, isRock: true, isCover: true
            });
        }
        this.batchInstances(new THREE.DodecahedronGeometry(1, 0), stoneMat, innerRocks, { isInnerRing: true, isRock: true });
        await this.yieldFrame();
    }

    // ===================== ZONE 2: BIOME PATHS =====================
 async buildBiomePaths() {
        const pathMat = new THREE.MeshStandardMaterial({ color: COLOR.arenaPath, roughness: 1.0 });
        const angles = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.75, Math.PI * 0.25];

        // Collect lantern data for InstancedMesh batching
        const lanternPosts = [];
        const lanternHeads = [];
        const lanternGlows = [];
        const lanternMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.5, metalness: 0.8 });

        for (const ang of angles) {
            for (let i = 0; i < 45; i++) {
                const t = i / 45, r = 22 + t * (this.arenaRadius - 55), w = 5 * (1 - t * 0.25);
                const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
                const tile = new THREE.Mesh(new THREE.BoxGeometry(w * 1.6, 0.05, w * 1.1), pathMat);
                tile.position.set(x, -0.01, z); tile.rotation.y = -ang + Math.PI / 2;
                tile.receiveShadow = true; tile.userData.isPath = true; tile.userData.isFloor = true; tile.userData.isMapObject = true;
                this.scene.add(tile);
            }

            // Lantern posts every 12 tiles
            for (let i = 6; i < 45; i += 10) {
                const t = i / 45, r = 22 + t * (this.arenaRadius - 55), w = 5 * (1 - t * 0.25);
                const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
                const nx = Math.cos(ang + Math.PI / 2), nz = Math.sin(ang + Math.PI / 2);
                for (const side of [-1, 1]) {
                    const px = x + nx * (w * 1.1 + 0.5), pz = z + nz * (w * 1.1 + 0.5);
                    lanternPosts.push({ x: px, y: 1.75, z: pz, isPath: true, isLanternPost: true, isSupport: true });
                    lanternHeads.push({ x: px, y: 3.6, z: pz, isPath: true, isLanternPost: true, isLanternHead: true });
                    lanternGlows.push({ x: px, y: 3.6, z: pz, isPath: true, isLanternGlow: true, isMarker: true });
                    if (side === -1) {
                        const light = new THREE.PointLight(0xffaa22, 1.5, 12);
                        light.position.set(px, 3.6, pz); this.scene.add(light);
                        this.animatedObjects.push({ type: 'lanternGlow', light: light, baseIntensity: 1.5 });
                    }
                }
            }
            await this.yieldFrame();
        }

        // Batch lantern posts (24 → 1 InstancedMesh)
        this.batchInstances(new THREE.CylinderGeometry(0.08, 0.12, 3.5, 6), lanternMat, lanternPosts, { isPath: true, isLanternPost: true });
        // Batch lantern heads (24 → 1 InstancedMesh)
        this.batchInstances(new THREE.BoxGeometry(0.4, 0.5, 0.4), lanternMat, lanternHeads, { isPath: true, isLanternPost: true });
        // Batch lantern glows (24 → 1 InstancedMesh)
        const lgMat = new THREE.MeshStandardMaterial({
            color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.5, transparent: true, opacity: 0.8
        });
        this.batchInstances(new THREE.SphereGeometry(0.2, 6, 6), lgMat, lanternGlows, { isPath: true, isLanternGlow: true });
    }

    // ===================== BIOME 1: RUINED CITADEL (NW) =====================
    // Role: Mid-Range Combat & Verticality
    // 10-140 units engagement range. Towers for scouting. Walls for cover. AR/DMR meta.
    async buildRuinedCitadel() {
        const angle = -Math.PI * 0.75, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;

        // Citadel floor
        const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 8),
            new THREE.MeshStandardMaterial({ color: COLOR.ruinFloor, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        floor.userData.isCitadel = true; floor.userData.isFloor = true; floor.userData.isMapObject = true;
        this.scene.add(floor);

        const towerMat = new THREE.MeshStandardMaterial({
            color: COLOR.ruinStone, roughness: 0.9, metalness: 0.1,
            map: this.createProceduralTexture(COLOR.ruinStone, 30, 256),
            normalScale: new THREE.Vector2(0.2, 0.2)
        });
        const towerDarkMat = new THREE.MeshStandardMaterial({
            color: COLOR.ruinDarkStone, roughness: 0.95,
            map: this.createProceduralTexture(COLOR.ruinDarkStone, 35, 256),
            normalScale: new THREE.Vector2(0.2, 0.2)
        });

        // === 10 TOWERS (3 types: Main, Watch, Outpost) ===
        // Main towers (tall, scouting platforms) — 4
        const mainTowers = [
            { x: -12, z: -12, h: 20, r: 3.5 },
            { x: 15, z: -10, h: 18, r: 3 },
            { x: -10, z: 15, h: 22, r: 3.5 },
            { x: 12, z: 12, h: 16, r: 2.8 },
        ];
        for (const tp of mainTowers) {
            const mat = Math.random() > 0.4 ? towerMat : towerDarkMat;
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.7, tp.r, tp.h, 8), mat);
            tower.position.set(cx + tp.x, tp.h / 2, cz + tp.z);
            tower.castShadow = true; tower.receiveShadow = true;
            tower.userData.isCitadel = true; tower.userData.isTower = true; tower.userData.isMainTower = true; tower.userData.isMapObject = true;
            this.scene.add(tower);
            // Battlements
            for (let b = 0; b < 8; b++) {
                const ba = (b / 8) * Math.PI * 2;
                const batt = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 1), mat);
                batt.position.set(cx + tp.x + Math.cos(ba) * tp.r * 0.8, tp.h + 0.75, cz + tp.z + Math.sin(ba) * tp.r * 0.8);
                batt.castShadow = true;
                batt.userData.isCitadel = true; batt.userData.isBattlement = true; batt.userData.isMapObject = true;
                this.scene.add(batt);
            }
            // Door
            const door = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 2, 0.5),
                new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 })
            );
            door.position.set(cx + tp.x, 1.2, cz + tp.z + tp.r * 0.5);
            door.userData.isCitadel = true; door.userData.isDoor = true; door.userData.isMapObject = true;
            this.scene.add(door);
            // Window
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 1, 0.5),
                new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 })
            );
            win.position.set(cx + tp.x, tp.h * 0.6, cz + tp.z + tp.r * 0.5);
            win.userData.isCitadel = true; win.userData.isWindow = true; win.userData.isMapObject = true;
            this.scene.add(win);

            this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(cx + tp.x, tp.h / 2, cz + tp.z), radius: tp.r, height: tp.h });
        }

        // Watch towers (mid-height, fewer) — 3
        const watchTowers = [
            { x: -25, z: -5, h: 14, r: 2.5 },
            { x: 5, z: 20, h: 12, r: 2.2 },
            { x: 20, z: -18, h: 13, r: 2.3 },
        ];
         for (const tp of watchTowers) {
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.7, tp.r, tp.h, 6), towerMat);
            tower.position.set(cx + tp.x, tp.h / 2, cz + tp.z);
            tower.rotation.z = (Math.random() - 0.5) * 0.06;
            tower.castShadow = true; tower.receiveShadow = true;
            tower.userData.isCitadel = true; tower.userData.isTower = true; tower.userData.isWatchTower = true; tower.userData.isMapObject = true;
            this.scene.add(tower);
            // Small platform
            const plat = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.9, tp.r * 0.9, 0.2, 6), towerDarkMat);
            plat.position.set(cx + tp.x, tp.h - 1, cz + tp.z); plat.receiveShadow = true;
            plat.userData.isCitadel = true; plat.userData.isPlatform = true; plat.userData.isMapObject = true;
            this.scene.add(plat);

            this.colliders.push({ type: 'cylinder', position: new THREE.Vector3(cx + tp.x, tp.h / 2, cz + tp.z), radius: tp.r, height: tp.h });
        }

        // Outpost ruins (low, broken) — 3
        const outpostPositions = [
            { x: -35, z: 0, h: 8, r: 2 },
            { x: 30, z: 10, h: 7, r: 1.8 },
            { x: -5, z: 30, h: 9, r: 2 },
        ];
        for (const tp of outpostPositions) {
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.6, tp.r, tp.h, 6), towerMat);
            tower.position.set(cx + tp.x, tp.h / 2, cz + tp.z);
            tower.rotation.z = (Math.random() - 0.5) * 0.15;
            tower.castShadow = true; tower.receiveShadow = true;
            tower.userData.isCitadel = true; tower.userData.isTower = true; tower.userData.isOutpost = true; tower.userData.isMapObject = true;
            this.scene.add(tower);
            // Broken top
            const broken = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.4, tp.r * 0.3, 2, 5), towerMat);
            broken.position.set(cx + tp.x + 1, tp.h + 1, cz + tp.z);
            broken.rotation.z = 0.4; broken.castShadow = true;
            broken.userData.isCitadel = true; broken.userData.isBroken = true; broken.userData.isMapObject = true;
            this.scene.add(broken);
        }

        // === WALL SECTIONS (connecting towers, creating defensive perimeter) ===
  const wallMat = new THREE.MeshStandardMaterial({
            color: COLOR.ruinStone, roughness: 0.9, metalness: 0.1,
            map: this.createProceduralTexture(COLOR.ruinStone, 30, 256)
        });
        const wallSegments = [
            // Inner defensive wall
            { x1: -12, z1: -12, x2: 15, z2: -10, h: 5 },
            { x1: 15, z1: -10, x2: 12, z2: 12, h: 4 },
            { x1: -12, z1: -12, x2: -10, z2: 15, h: 6 },
            { x1: -10, z1: 15, x2: 12, z2: 12, h: 4 },
            // Outer wall segments
            { x1: -25, z1: -5, x2: -12, z2: -12, h: 5 },
            { x1: 5, z1: 20, x2: 12, z2: 12, h: 4 },
            { x1: 20, z1: -18, x2: 15, z2: -10, h: 4 },
            { x1: -35, z1: 0, x2: -25, z2: -5, h: 4 },
            { x1: 30, z1: 10, x2: 20, z2: -18, h: 3 },
        ];
        for (const wp of wallSegments) {
            const dx = wp.x2 - wp.x1, dz = wp.z2 - wp.z1;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);
            const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wp.h, 1.5), wallMat);
            wall.position.set(cx + (wp.x1 + wp.x2) / 2, wp.h / 2, cz + (wp.z1 + wp.z2) / 2);
            wall.rotation.y = angle;
            wall.castShadow = true; wall.receiveShadow = true;
            wall.userData.isCitadel = true; wall.userData.isWall = true; wall.userData.isMapObject = true;
            this.scene.add(wall);
        }

        // === MOSS PATCHES (15) ===
        const mossMat = new THREE.MeshStandardMaterial({ color: COLOR.ruinMoss, roughness: 1.0 });
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 55;
            const moss = new THREE.Mesh(
                new THREE.SphereGeometry(1.5 + Math.random() * 2.5, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
                mossMat
            );
          moss.userData.isCitadel = true; moss.userData.isMoss = true; moss.userData.isMapObject = true;
            moss.position.set(cx + Math.cos(a) * r, 0.05, cz + Math.sin(a) * r);
            moss.receiveShadow = true;
            this.scene.add(moss);
        }

        // === PILLARS (15 scattered, some fallen) ===
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 55;
            const h = 2 + Math.random() * 5;
            const isFallen = Math.random() > 0.6;
   const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, h, 8), towerMat);
            pillar.position.set(cx + Math.cos(a) * r, isFallen ? 0.3 : h / 2, cz + Math.sin(a) * r);
            pillar.rotation.z = isFallen ? Math.PI / 2 : (Math.random() - 0.5) * 0.3;
            pillar.castShadow = true;
            pillar.userData.isCitadel = true; pillar.userData.isPillar = true; pillar.userData.isFallen = isFallen; pillar.userData.isMapObject = true;
            this.scene.add(pillar);
        }

        // === CENTRAL COURTYARD — open area for mid-range combat ===
        // Low cover walls in courtyard
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = 8 + Math.random() * 5;
            const wall = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 2, 1.5, 0.8), wallMat);
            wall.position.set(cx + Math.cos(a) * r, 0.75, cz + Math.sin(a) * r);
            wall.rotation.y = Math.random() * Math.PI;
            wall.castShadow = true; wall.receiveShadow = true;
            wall.userData.isCitadel = true; wall.userData.isCover = true; wall.userData.isMapObject = true;
            this.scene.add(wall);
        }

        const citadelLight = new THREE.PointLight(0xffddaa, 1.5, 30);
        citadelLight.position.set(cx, 8, cz);
        this.scene.add(citadelLight);
        await this.yieldFrame();
    }

    // ===================== BIOME 2: CRYSTAL GROTTO (NE) =====================
    // Role: Close-Quarters & Stealth
    // 0-40 units engagement. Dense cover, low visibility, caves for flanking. Shotgun/SMG meta.
    async buildCrystalGrotto() {
        const angle = -Math.PI * 0.25, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;

        const floor = new THREE.Mesh(new THREE.CircleGeometry(65, 8),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalFloor, roughness: 0.8, metalness: 0.2 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        floor.userData.isCrystalGrotto = true; floor.userData.isFloor = true; floor.userData.isMapObject = true;
        this.scene.add(floor);

        const crystalMats = [
            new THREE.MeshStandardMaterial({
            color: COLOR.crystalBlue, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.8,
            map: this.createProceduralTexture(COLOR.crystalBlue, 25, 256)
        }),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalPurple, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.8 }),
            new THREE.MeshStandardMaterial({ color: COLOR.crystalGlow, roughness: 0.1, metalness: 0.7, emissive: COLOR.crystalGlow, emissiveIntensity: 0.3, transparent: true, opacity: 0.75 })
        ];

        // === 50 LARGE CRYSTALS (dense formations) ===
        for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 55;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const h = 3 + Math.random() * 10, baseR = 0.6 + Math.random() * 1.8;
            const crystal = new THREE.Mesh(
                new THREE.ConeGeometry(baseR, h, Math.random() > 0.5 ? 6 : 5),
                crystalMats[Math.floor(Math.random() * crystalMats.length)]
            );
            crystal.position.set(x, h / 2, z);
            crystal.rotation.y = Math.random() * Math.PI;
            crystal.rotation.x = (Math.random() - 0.5) * 0.15;
        crystal.castShadow = true;
            crystal.userData.isCrystalGrotto = true; crystal.userData.isCrystal = true; crystal.userData.isLargeCrystal = true; crystal.userData.isCover = true; crystal.userData.isMapObject = true;
            this.scene.add(crystal);

            // Companion crystals
            if (Math.random() > 0.5) {
                for (let j = 0; j < 2; j++) {
                    const sc = new THREE.Mesh(
                        new THREE.ConeGeometry(0.3 + Math.random() * 0.4, 1.5 + Math.random() * 3, 5),
                        crystalMats[Math.floor(Math.random() * crystalMats.length)]
                    );
                    sc.position.set(x + (Math.random() - 0.5) * 3, 0.5, z + (Math.random() - 0.5) * 3);
                    sc.rotation.z = (Math.random() - 0.5) * 0.4;
                    sc.userData.isCrystalGrotto = true; sc.userData.isCrystal = true; sc.userData.isSmallCrystal = true; sc.userData.isCover = true; sc.userData.isMapObject = true;
                    this.scene.add(sc);
                }
            }
        }

        // === CRYSTAL COLUMNS (6 tall, providing vertical cover) ===
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 40;
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.8, 1.2, 6 + Math.random() * 6, 6),
                crystalMats[Math.floor(Math.random() * crystalMats.length)]
            );
            col.position.set(cx + Math.cos(a) * r, 3, cz + Math.sin(a) * r);
            col.castShadow = true;
            col.userData.isCrystalGrotto = true; col.userData.isCrystal = true; col.userData.isColumn = true; col.userData.isCover = true; col.userData.isMapObject = true;
            this.scene.add(col);
        }

        // === 3 CAVE SYSTEMS (with tunnels and chambers) ===
        const caveMat = new THREE.MeshStandardMaterial({ color: 0x5a5a6a, roughness: 1.0 });
        for (let c = 0; c < 3; c++) {
            const ca = Math.random() * Math.PI * 2;
            const cr2 = 15 + Math.random() * 35;
            const baseX = cx + Math.cos(ca) * cr2, baseZ = cz + Math.sin(ca) * cr2;

            // Cave entrance
            const entrance = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 5), caveMat);
            entrance.position.set(baseX, 2, baseZ);
            entrance.scale.set(1, 0.6, 1.5);
            entrance.userData.isCrystalGrotto = true; entrance.userData.isCave = true; entrance.userData.isEntrance = true; entrance.userData.isShelter = true; entrance.userData.isMapObject = true;
            this.scene.add(entrance);

            // Cave interior glow
            const caveGlow = new THREE.Mesh(
                new THREE.SphereGeometry(0.5, 6, 6),
                new THREE.MeshStandardMaterial({ color: COLOR.crystalGlow, emissive: COLOR.crystalGlow, emissiveIntensity: 1, transparent: true, opacity: 0.6 })
            );
            caveGlow.position.set(baseX, 2, baseZ + 2);
            caveGlow.userData.isCrystalGrotto = true; caveGlow.userData.isCaveGlow = true; caveGlow.userData.isMapObject = true;
            this.scene.add(caveGlow);

            // Crystal stalactites inside
            for (let s = 0; s < 4; s++) {
                const stal = new THREE.Mesh(
                    new THREE.ConeGeometry(0.2 + Math.random() * 0.4, 1.5 + Math.random() * 2, 5),
                    crystalMats[Math.floor(Math.random() * crystalMats.length)]
                );
                stal.position.set(
                    baseX + (Math.random() - 0.5) * 4,
                    3 + Math.random() * 2,
                    baseZ + (Math.random() - 0.5) * 3
                );
                stal.rotation.x = Math.PI; // point down
                stal.userData.isCrystalGrotto = true; stal.userData.isStalactite = true; stal.userData.isCrystal = true; stal.userData.isCover = true; stal.userData.isMapObject = true;
                this.scene.add(stal);
            }

            // Stalagmites
            for (let s = 0; s < 3; s++) {
                const stag = new THREE.Mesh(
                    new THREE.ConeGeometry(0.3 + Math.random() * 0.5, 1 + Math.random() * 2, 5),
                    crystalMats[Math.floor(Math.random() * crystalMats.length)]
                );
                stag.position.set(
                    baseX + (Math.random() - 0.5) * 4,
                    0.5 + Math.random(),
                    baseZ + (Math.random() - 0.5) * 4
                );
                stag.userData.isCrystalGrotto = true; stag.userData.isStalagmite = true; stag.userData.isCrystal = true; stag.userData.isCover = true; stag.userData.isMapObject = true;
                this.scene.add(stag);
            }

            this.colliders.push({ type: 'box', position: new THREE.Vector3(baseX, 2, baseZ), size: new THREE.Vector3(8, 4, 8) });
        }

        // === 2 WATER POOLS ===
        const poolMat = new THREE.MeshStandardMaterial({
            color: COLOR.crystalReflect, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.7
        });
        const poolPositions = [
            { x: cx, z: cz, r: 6 },
            { x: cx + 20, z: cz - 18, r: 4 },
        ];
        const poolLights = [];
        for (const pp of poolPositions) {
            const pool = new THREE.Mesh(new THREE.CylinderGeometry(pp.r, pp.r, 0.1, 12), poolMat);
            pool.position.set(pp.x, 0.08, pp.z); pool.userData.isCrystalGrotto = true; pool.userData.isPool = true; pool.userData.isWater = true; pool.userData.isMapObject = true;
            this.waterMeshes.push(pool);
            const posAttr = pool.geometry.getAttribute('position');
            pool._origPositions = new Float32Array(posAttr.array);
            this.scene.add(pool);
            const poolLight = new THREE.PointLight(0x4488cc, 2, 15);
            poolLight.position.set(pp.x, 1.5, pp.z); this.scene.add(poolLight);
            poolLights.push(poolLight);

            // Edge crystals
            for (let i = 0; i < 5; i++) {
                const pa = (i / 5) * Math.PI * 2;
                const ec = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 5), crystalMats[2]);
                ec.position.set(pp.x + Math.cos(pa) * pp.r, 0.6, pp.z + Math.sin(pa) * pp.r);
                ec.userData.isCrystalGrotto = true; ec.userData.isEdgeCrystal = true; ec.userData.isCrystal = true; ec.userData.isMapObject = true;
                this.scene.add(ec);
            }
        }
        // Register all pool lights for animation
        for (const pl of poolLights) {
            this.animatedObjects.push({ type: 'crystalGlow', light: pl, baseIntensity: 2, color: COLOR.crystalGlow });
        }
        await this.yieldFrame();
    }

    // ===================== BIOME 3: BURNING WASTES (SW) =====================
    // Role: Long-Range Open Combat
    // 75-150 units engagement. Flat terrain, minimal cover, obsidian barriers for tactical cover. Sniper meta.
    async buildBurningWastes() {
        const angle = Math.PI * 0.75, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;

        const floor = new THREE.Mesh(new THREE.CircleGeometry(65, 8),
            new THREE.MeshStandardMaterial({
            color: COLOR.wasteGround, roughness: 1.0,
            map: this.createProceduralTexture(COLOR.wasteGround, 40, 256)
        }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        floor.userData.isBurningWastes = true; floor.userData.isFloor = true; floor.userData.isMapObject = true;
        this.scene.add(floor);

        const lavaMat = new THREE.MeshStandardMaterial({
            color: COLOR.lava, emissive: COLOR.lava, emissiveIntensity: 1.5, roughness: 0.3, transparent: true, opacity: 0.85
        });
 const obsMat = new THREE.MeshStandardMaterial({
            color: COLOR.obsidian, roughness: 0.3, metalness: 0.5,
            map: this.createProceduralTexture(COLOR.obsidian, 20, 256)
        });
        const rockMat = new THREE.MeshStandardMaterial({ color: COLOR.scorchedRock, roughness: 0.9 });
        const smokeMat = new THREE.MeshStandardMaterial({ color: COLOR.smoke, transparent: true, opacity: 0.12, roughness: 1 });

        // === 15 LAVA POOLS (scattered across biome) ===
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 55;
            const w = 2 + Math.random() * 5, d = 1.5 + Math.random() * 3;
            const lava = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), lavaMat);
            lava.position.set(cx + Math.cos(a) * r, 0.1, cz + Math.sin(a) * r);
            lava.rotation.y = Math.random() * Math.PI;
            lava.userData.isBurningWastes = true; lava.userData.isLavaPool = true; lava.userData.isHazard = true; lava.userData.isMapObject = true;
            this.scene.add(lava);
        }

        // === 3 LAVA FLOW RIVERS ===
        for (let r = 0; r < 3; r++) {
            const startAngle = Math.random() * Math.PI * 2;
            for (let i = 0; i < 8; i++) {
                const t = i / 8;
                const lava = new THREE.Mesh(
                    new THREE.BoxGeometry(2 + Math.sin(t * Math.PI) * 3, 0.12, 1.5),
                    lavaMat
                );
                lava.position.set(
                    cx + Math.cos(startAngle) * (t * 50),
                    0.1,
                    cz + Math.sin(startAngle) * (t * 50) + Math.sin(t * 3) * 3
                );
                lava.rotation.y = startAngle + Math.PI / 2;
                lava.userData.isBurningWastes = true; lava.userData.isLavaFlow = lava.userData.isHazard = lava.userData.isMapObject = true;
                this.scene.add(lava);
            }
        }

        // === 15 OBSIDIAN BARRIERS (tactical cover in open biome) ===
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 50;
            const h = 2 + Math.random() * 5;
            const isWall = Math.random() > 0.5;
           if (isWall) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 4, h, 1.2), obsMat);
                wall.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
                wall.rotation.y = Math.random() * Math.PI;
                wall.castShadow = true; wall.receiveShadow = true;
                wall.userData.isBurningWastes = true; wall.userData.isObsidian = true; wall.userData.isBarrier = true; wall.userData.isCover = true; wall.userData.isMapObject = true;
                this.scene.add(wall);
            } else {
                const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + Math.random() * 0.5, h, 0.5 + Math.random() * 0.5, 6), obsMat);
                pillar.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
                pillar.rotation.z = (Math.random() - 0.5) * 0.2;
                pillar.castShadow = true;
                pillar.userData.isBurningWastes = true; pillar.userData.isObsidian = true; pillar.userData.isBarrier = true; pillar.userData.isCover = true; pillar.userData.isMapObject = true;
                this.scene.add(pillar);
            }
        }

        // === 25 ROCKS (scattered cover) ===
        const burningRocks = [];
        for (let i = 0; i < 25; i++) {
            const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 55;
            const rockSize = 1 + Math.random() * 2;
            const rx = cx + Math.cos(a) * r, rz = cz + Math.sin(a) * r;
            burningRocks.push({
                x: rx, y: 0.5, z: rz,
                sx: rockSize, sy: rockSize * 0.6, sz: rockSize,
                rotX: Math.random(), rotY: Math.random(), rotZ: Math.random(),
                isBurningWastes: true, isRock: true, isCover: true
            });
        }
        this.batchInstances(new THREE.DodecahedronGeometry(1, 0), rockMat, burningRocks, { isBurningWastes: true, isRock: true });

        // === 8 SMOKE CLOUDS ===
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 50;
            const smoke = new THREE.Mesh(
                new THREE.SphereGeometry(2 + Math.random() * 3, 6, 4),
                smokeMat
            );
            smoke.position.set(cx + Math.cos(a) * r, 4 + Math.random() * 5, cz + Math.sin(a) * r);
            smoke.scale.set(1, 0.4, 1);
            smoke.userData.isBurningWastes = true; smoke.userData.isSmoke = true; smoke.userData.isHazard = true; smoke.userData.isMapObject = true;
            this.scene.add(smoke);
        }

        // === 3 RUINED BUNKERS (elevated cover positions) ===
        const bunkerPositions = [
            { x: -20, z: -15 }, { x: 25, z: 10 }, { x: -10, z: 25 }
        ];
        const bunkerMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.8 });
        for (const bp of bunkerPositions) {
            // Bunker body (low rectangular with open top)
            const bx = cx + bp.x, bz = cz + bp.z;
            const bw = 4, bd = 3, bh = 2.5;
            // Walls
            for (let w = 0; w < 4; w++) {
                const isFront = w === 0; // Open front
                if (isFront) continue;
                const wa = (w / 4) * Math.PI * 2;
                const nx = Math.cos(wa), nz = Math.sin(wa);
                const wallLen = w % 2 === 0 ? bd : bw;
                const wall = new THREE.Mesh(new THREE.BoxGeometry(wallLen, bh, 0.8), bunkerMat);
                wall.position.set(bx + nx * (bw / 2), bh / 2, bz + nz * (bd / 2));
                wall.rotation.y = wa;
                wall.castShadow = true; wall.receiveShadow = true;
                wall.userData.isBurningWastes = true; wall.userData.isBunker = true; wall.userData.isCover = true; wall.userData.isShelter = true; wall.userData.isMapObject = true;
                this.scene.add(wall);
            }
            // Door frame
            for (const side of [-1, 1]) {
                const doorPost = new THREE.Mesh(new THREE.BoxGeometry(0.5, bh, 0.8), bunkerMat);
                doorPost.position.set(bx + side * 1.75, bh / 2, bz + bd / 2);
                doorPost.castShadow = true;
                doorPost.userData.isBurningWastes = true; doorPost.userData.isBunker = true; doorPost.userData.isCover = true; doorPost.userData.isMapObject = true;
                this.scene.add(doorPost);
            }
            // Roof edge
            const roofEdge = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.5, 0.2, bd + 0.5), bunkerMat);
            roofEdge.position.set(bx, bh, bz);
            roofEdge.castShadow = true;
            roofEdge.userData.isBurningWastes = true; roofEdge.userData.isBunker = true; roofEdge.userData.isRoof = true; roofEdge.userData.isCover = true; roofEdge.userData.isMapObject = true;
            this.scene.add(roofEdge);

            this.colliders.push({ type: 'box', position: new THREE.Vector3(bx, bh / 2, bz), size: new THREE.Vector3(bw, bh, bd) });
        }

        // === 5 VOLCANIC CRATERS ===
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 45;
            const crater = new THREE.Mesh(
                new THREE.TorusGeometry(1.5 + Math.random() * 2, 0.4, 6, 12),
                obsMat
            );
            crater.position.set(cx + Math.cos(a) * r, 0.15, cz + Math.sin(a) * r);
            crater.rotation.x = Math.PI / 2;
            crater.userData.isBurningWastes = true; crater.userData.isCrater = true; crater.userData.isHazard = true; crater.userData.isMapObject = true;
            this.scene.add(crater);
        }

        const lavaLight = new THREE.PointLight(0xff4400, 3, 35);
        lavaLight.position.set(cx, 3, cz);
        this.scene.add(lavaLight);
        this.animatedObjects.push({ type: 'lavaGlow', light: lavaLight, baseIntensity: 3 });
        await this.yieldFrame();
    }

    // ===================== BIOME 4: LUMINOUS FOREST (SE) =====================
    // Role: Mixed Combat & Late-Game Survival
    // All engagement ranges. Dense trees with canopy, ponds for flanking, mushroom clusters, bushes.
    async buildLuminousForest() {
        const angle = Math.PI * 0.25, cr = 130;
        const cx = Math.cos(angle) * cr, cz = Math.sin(angle) * cr;

        const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 8),
            new THREE.MeshStandardMaterial({ color: COLOR.luminousFloor, roughness: 1.0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
        floor.userData.isLuminousForest = true; floor.userData.isFloor = true; floor.userData.isMapObject = true;
        this.scene.add(floor);

        const barkMat = new THREE.MeshStandardMaterial({ color: COLOR.luminousBark, roughness: 0.9 });
        const glowColors = [COLOR.luminousGlow, 0x44aaff, COLOR.luminousMushroom, 0xffaa44, 0x44ffaa];

        // Collect tree data for InstancedMesh batching
        const treeTrunks = [];
        const treeVines = [];

        // === 50 TREES (varied heights and canopy layers) ===
        for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 60;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const treeH = 8 + Math.random() * 10, trunkR = 0.3 + Math.random() * 0.4;

            // Trunk - batched
            treeTrunks.push({
                x, y: treeH / 2, z,
                sx: trunkR * 0.5, sy: treeH, sz: trunkR,
                isLuminousForest: true, isTree: true, isTrunk: true, isCover: true
            });

            const canopyColor = glowColors[Math.floor(Math.random() * glowColors.length)];
            const canopySize = 2 + Math.random() * 3;
            const canopyMat = new THREE.MeshStandardMaterial({
                color: canopyColor, emissive: canopyColor, emissiveIntensity: 0.4 + Math.random() * 0.5,
                roughness: 0.7, transparent: true, opacity: 0.65
            });
            const canopy = new THREE.Mesh(new THREE.SphereGeometry(canopySize, 8, 6), canopyMat);
            canopy.position.set(x, treeH + canopySize * 0.3, z); canopy.castShadow = true;
            canopy.userData.isLuminousForest = true; canopy.userData.isTree = true; canopy.userData.isCanopy = true; canopy.userData.isCover = true; canopy.userData.isMapObject = true;
            this.scene.add(canopy);

            // Second canopy layer
            const c2 = new THREE.Mesh(
                new THREE.SphereGeometry(canopySize * 0.6, 6, 5),
                canopyMat
            );
            c2.position.set(x + (Math.random() - 0.5) * 1.5, treeH + canopySize * 0.5, z + (Math.random() - 0.5) * 1.5);
            c2.userData.isLuminousForest = true; c2.userData.isTree = true; c2.userData.isCanopy = true; c2.userData.isMapObject = true;
            this.scene.add(c2);

            // Vines (30% of trees) - batched separately
            if (Math.random() > 0.7) {
                for (let v = 0; v < 2; v++) {
                    const vineH = 1 + Math.random() * 1.5;
                    const va = Math.random() * Math.PI * 2;
                    treeVines.push({
                        x: x + Math.cos(va) * canopySize * 0.4,
                        y: treeH - 1,
                        z: z + Math.sin(va) * canopySize * 0.4,
                        rotZ: (Math.random() - 0.5) * 0.5,
                        sx: 0.02, sy: vineH, sz: 0.02,
                        isLuminousForest: true, isVine: true, isDecor: true
                    });
                }
            }

            // Tree light (20%)
            if (Math.random() > 0.8) {
                const treeLight = new THREE.PointLight(canopyColor, 1, 10);
                treeLight.position.set(x, treeH, z); this.scene.add(treeLight);
                this.animatedObjects.push({ type: 'treeGlow', light: treeLight, baseIntensity: 1, color: canopyColor });
            }
        }

        // Batch tree trunks (50 → 1 InstancedMesh)
        // Use unit cylinder, scale per instance for varying radii/heights
        const trunkGeo = new THREE.CylinderGeometry(0.5, 1, 1, 6);
        this.batchInstances(trunkGeo, barkMat, treeTrunks.map(t => ({
            x: t.x, y: t.y, z: t.z,
            // Uniform scale for trunk (use average of sx and sy as base, then scaleY for height)
            s: 1,
            sx: t.sx, sy: t.sy, sz: t.sz,
            isLuminousForest: true, isTree: true, isTrunk: true, isCover: true,
            castShadow: true, receiveShadow: true
        })), { isLuminousForest: true, isTree: true });

        // Batch vines (~20-30 → 1 InstancedMesh)
        if (treeVines.length > 0) {
            this.batchInstances(new THREE.CylinderGeometry(1, 1, 1, 3), barkMat, treeVines, { isLuminousForest: true, isVine: true });
        }

        // === 30 MUSHROOMS ===
        const mushMat = new THREE.MeshStandardMaterial({
            color: COLOR.luminousMushroom, emissive: COLOR.luminousMushroom, emissiveIntensity: 0.8, roughness: 0.6
        });
        const mushStemMat = new THREE.MeshStandardMaterial({ color: COLOR.luminousBark, roughness: 0.8 });
        const mushroomStems = [];
        const mushroomCaps = [];
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 58;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            const mushH = 0.3 + Math.random() * 0.6;
            const capR = 0.25 + Math.random() * 0.35;

            // Stem - batched
            mushroomStems.push({
                x, y: mushH / 2, z,
                sx: 0.04, sy: mushH, sz: 0.08,
                isLuminousForest: true, isMushroom: true, isStem: true
            });

            // Cap - batched (half-sphere using scale)
            mushroomCaps.push({
                x, y: mushH, z,
                sx: capR, sy: capR * 0.5, sz: capR,
                isLuminousForest: true, isMushroom: true, isCap: true, isGlow: true
            });
        }
        // Batch mushroom stems (30 → 1 InstancedMesh)
        this.batchInstances(new THREE.CylinderGeometry(0.04, 0.08, 1, 6), mushStemMat, mushroomStems, { isLuminousForest: true, isMushroom: true });
        // Batch mushroom caps (30 → 1 InstancedMesh)
        this.batchInstances(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mushMat, mushroomCaps, { isLuminousForest: true, isMushroom: true });

        // === 2 PONDS (tactical water features) ===
        const pondPositions = [
            { x: cx + 8, z: cz - 8, r: 5 },
            { x: cx - 22, z: cz + 18, r: 4 },
        ];
        for (const pp of pondPositions) {
            // Animated water shader
            const pondMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uColor: { value: new THREE.Color(COLOR.luminousPond) },
                    uGlow: { value: new THREE.Color(COLOR.luminousGlow) },
                },
                vertexShader: `
                    uniform float uTime;
                    varying vec2 vUv;
                    varying float vWave;
                    void main() {
                        vUv = uv;
                        vec3 pos = position;
                        float wave = sin(pos.x * 0.5 + uTime * 1.5) * 0.05 + cos(pos.z * 0.6 + uTime * 1.2) * 0.05;
                        pos.y += wave;
                        vWave = wave;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform vec3 uGlow;
                    uniform float uTime;
                    varying vec2 vUv;
                    varying float vWave;
                    void main() {
                        float sparkle = pow(max(0.0, vWave * 10.0), 3.0) * 0.5;
                        vec3 col = mix(uColor, uGlow, 0.3) + vec3(sparkle);
                        float alpha = 0.75 + vWave * 0.5;
                        gl_FragColor = vec4(col, alpha);
                    }
                `,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const pond = new THREE.Mesh(new THREE.CylinderGeometry(pp.r, pp.r, 0.1, 16), pondMat);
            pond.position.set(pp.x, 0.1, pp.z); pond.userData.isLuminousForest = true; pond.userData.isPond = true; pond.userData.isWater = true; pond.userData.isMapObject = true;
            this.scene.add(pond);
            this.waterMeshes.push(pond);
            const pPos = pond.geometry.getAttribute('position');
            pond._origPositions = new Float32Array(pPos.array);
            const pondLight = new THREE.PointLight(COLOR.luminousGlow, 2, 12);
            pondLight.position.set(pp.x, 1.5, pp.z); this.scene.add(pondLight);
            this.animatedObjects.push({ type: 'pondGlow', light: pondLight, baseIntensity: 2, color: COLOR.luminousGlow });

            // Edge flowers
            for (let i = 0; i < 5; i++) {
                const pa = (i / 5) * Math.PI * 2;
                const flower = new THREE.Mesh(
                    new THREE.SphereGeometry(0.15, 5, 4),
                    new THREE.MeshStandardMaterial({
                        color: glowColors[Math.floor(Math.random() * glowColors.length)],
                        emissive: glowColors[Math.floor(Math.random() * glowColors.length)],
                        emissiveIntensity: 0.5
                    })
                );
                flower.position.set(pp.x + Math.cos(pa) * pp.r, 0.25, pp.z + Math.sin(pa) * pp.r);
                flower.userData.isLuminousForest = true; flower.userData.isFlower = true; flower.userData.isGlow = true; flower.userData.isDecor = true; flower.userData.isMapObject = true;
                this.scene.add(flower);
            }
        }

        // === 20 BUSHES (low cover) ===
        const bushMat = new THREE.MeshStandardMaterial({
            color: 0x228844, emissive: 0x228844, emissiveIntensity: 0.08, roughness: 0.9
        });
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 58;
            const bush = new THREE.Mesh(
                new THREE.SphereGeometry(0.5 + Math.random() * 0.8, 6, 4),
                bushMat
            );
            bush.position.set(cx + Math.cos(a) * r, 0.4, cz + Math.sin(a) * r);
            bush.castShadow = true;
            bush.userData.isLuminousForest = true; bush.userData.isBush = true; bush.userData.isCover = true; bush.userData.isMapObject = true;
            this.scene.add(bush);
        }

        await this.yieldFrame();
    }

    // ===================== ZONE 2-3: BRIDGES =====================
    buildBridges() {
        const bridgeMat = new THREE.MeshStandardMaterial({ color: COLOR.bridgeWood, roughness: 0.9, metalness: 0.1 });
        const bridgeRailMat = new THREE.MeshStandardMaterial({ color: COLOR.metalDark, roughness: 0.7, metalness: 0.5 });

        const bridgeAngles = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.75, Math.PI * 0.25];

        // Collect bridge data for InstancedMesh batching
        const decks = [];
        const sideRails = [];
        const topRails = [];

        for (const angle of bridgeAngles) {
            // 4 bridge sections per direction = 16 total
            for (let i = 0; i < 4; i++) {
                const t = (i + 0.5) / 4;
                const r = 40 + t * (this.arenaRadius - 80);
                const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
                const rotY = -angle + Math.PI / 2;

                // Deck
                decks.push({ x, y: 0.15, z, rotY, sx: 3.5, sy: 0.25, sz: 7, isBridge: true, isDeck: true });

                // Side rails (2 per bridge)
                for (const side of [-1, 1]) {
                    const railX = x + Math.cos(angle + Math.PI / 2) * side * 1.7;
                    const railZ = z + Math.sin(angle + Math.PI / 2) * side * 1.7;
                    sideRails.push({ x: railX, y: 0.75, z: railZ, isBridge: true, isRail: true });
                }

                // Top rail (1 per bridge)
                topRails.push({ x, y: 1.35, z, rotY, sx: 3.5, sy: 0.05, sz: 0.05, isBridge: true, isRail: true });
            }
        }

        // Batch bridge decks (16 meshes → 1 InstancedMesh)
        this.batchInstances(new THREE.BoxGeometry(1, 1, 1), bridgeMat, decks, { isBridge: true });

        // Batch side rails (32 meshes → 1 InstancedMesh)
        this.batchInstances(new THREE.CylinderGeometry(1, 1, 1.2, 4), bridgeRailMat, sideRails, { isBridge: true });

        // Batch top rails (16 meshes → 1 InstancedMesh)
        this.batchInstances(new THREE.CylinderGeometry(1, 1, 3.5, 4), bridgeRailMat, topRails, { isBridge: true });

        // Apply shadows via scene traversal
        this.scene.traverse(obj => {
            if (obj.isInstancedMesh && obj.userData.isBridge) {
                obj.castShadow = true;
                obj.receiveShadow = true;
            }
        });
    }

    // ===================== ZONE 3-4: OUTER OUTPOSTS =====================
    // Role: Outer ring loot zones (R=130-180). Sparse, low-tier loot.
    async buildOuterOutposts() {
        const woodMat = new THREE.MeshStandardMaterial({ color: COLOR.wood, roughness: 0.85 });
        const stoneMat = new THREE.MeshStandardMaterial({ color: COLOR.stone, roughness: 0.9 });

        // 6 small outer ring structures
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 140 + Math.random() * 35;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            const isStone = i % 2 === 0;
            const mat = isStone ? stoneMat : woodMat;

            if (isStone) {
                // Stone shelter (3 walls, open front)
                const w = 3, d = 2.5, h = 2.5;
                for (let w2 = 0; w2 < 3; w2++) {
                    const wall = new THREE.Mesh(new THREE.BoxGeometry(
                        w2 < 2 ? w : d, h, 0.6
                    ), mat);
                    wall.position.set(x, h / 2, z + (w2 < 2 ? (w2 === 0 ? -d / 2 : d / 2) : (w2 - 1) * w / 2));
                    if (w2 >= 2) wall.rotation.y = Math.PI / 2;
                    wall.castShadow = true; wall.receiveShadow = true;
                wall.userData.isOuterPost = true; wall.userData.isShelter = true; wall.userData.isWall = true; wall.userData.isCover = true; wall.userData.isMapObject = true;
                this.scene.add(wall);
                }
                // Roof
                const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.2, d + 0.5), mat);
                roof.position.set(x, h, z); roof.castShadow = true;
                roof.userData.isOuterPost = true; roof.userData.isShelter = true; roof.userData.isRoof = true; roof.userData.isMapObject = true;
                this.scene.add(roof);
            } else {
                // Wooden watch post (elevated platform)
                // 4 posts
                for (const [px, pz] of [[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]]) {
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 5), woodMat);
                    post.position.set(x + px, 3, z + pz); post.castShadow = true;
                post.userData.isOuterPost = true; post.userData.isWatchPost = true; post.userData.isSupport = true; post.userData.isMapObject = true;
                this.scene.add(post);
                }
                // Platform
                const plat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 2.5), woodMat);
                plat.position.set(x, 6.1, z); plat.castShadow = true; plat.receiveShadow = true;
                plat.userData.isOuterPost = true; plat.userData.isWatchPost = true; plat.userData.isPlatform = true; plat.userData.isMapObject = true;
                this.scene.add(plat);
                // Roof
                const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 2, 4), woodMat);
                roof.position.set(x, 8, z); roof.rotation.y = Math.PI / 4;
                roof.castShadow = true;
                roof.userData.isOuterPost = true; roof.userData.isWatchPost = true; roof.userData.isRoof = true; roof.userData.isMapObject = true;
                this.scene.add(roof);
            }
        }
    }

    // ===================== ZONE 3: HAZARD ZONES =====================
    buildHazardZones() {
        const lavaPatchMat = new THREE.MeshStandardMaterial({
            color: 0xff2200, emissive: 0xff4400, emissiveIntensity: 1, transparent: true, opacity: 0.7
        });
        // 6 lava patches in outer ring
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, r = 100 + Math.random() * 80;
            const patch = new THREE.Mesh(
                new THREE.CylinderGeometry(2.5 + Math.random() * 3, 3 + Math.random() * 2, 0.1, 8),
                lavaPatchMat
            );
            patch.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
            patch.userData.isHazard = true; patch.userData.isLava = true; patch.userData.isMapObject = true;
            this.scene.add(patch);
            this.hazards.push({
                type: 'lava',
                position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
                radius: 3 + Math.random() * 3,
                damage: 0.5
            });
        }
        // 3 shock zones
        const shockMat = new THREE.MeshStandardMaterial({
            color: 0x8844ff, emissive: 0x8844ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.3
        });
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2, r = 100 + Math.random() * 80;
            const shock = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 5, 8), shockMat);
            shock.position.set(Math.cos(a) * r, 2.5, Math.sin(a) * r);
            shock.userData.isHazard = true; shock.userData.isShock = true; shock.userData.isMapObject = true;
            this.scene.add(shock);
            this.hazards.push({
                type: 'shock',
                position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
                radius: 2.5,
                damage: 0.3
            });
        }
    }

    // ===================== LOOT CLUSTERS (mid-ring, R=60-130) =====================
    buildLootClusters() {
        const stoneMat = new THREE.MeshStandardMaterial({ color: COLOR.stone, roughness: 0.85 });
        const woodMat = new THREE.MeshStandardMaterial({ color: COLOR.wood, roughness: 0.8 });

  // 12 loot clusters scattered in mid-ring
        const lootRocks = [];
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 65 + Math.random() * 60;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            // Small rock formation around loot
            for (let j = 0; j < 3; j++) {
                const rockSize = 0.8 + Math.random() * 1.2;
                const ra = (j / 3) * Math.PI * 2;
                lootRocks.push({
                    x: x + Math.cos(ra) * 2, y: 0.4, z: z + Math.sin(ra) * 2,
                    sx: rockSize, sy: rockSize * 0.6, sz: rockSize,
                    rotX: Math.random(), rotY: Math.random(), rotZ: Math.random(),
                    isLootCluster: true, isRock: true, isCover: true
                });
            }

            // Loot markers
            const markerMat = new THREE.MeshStandardMaterial({
                color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.2,
                transparent: true, opacity: 0.5
            });
            const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), markerMat);
            marker.position.set(x, 1.5, z); marker.userData.isLootCluster = true; marker.userData.isLootMarker = true; marker.userData.isGlow = true; marker.userData.isMapObject = true;
            this.scene.add(marker);
            const light = new THREE.PointLight(0xffaa22, 1, 8);
            light.position.set(x, 1.5, z);
            this.scene.add(light);
            this.animatedObjects.push({ type: 'lanternGlow', light: light, baseIntensity: 1 });
        }
        // Batch loot rocks (36 → 1 InstancedMesh)
        this.batchInstances(new THREE.DodecahedronGeometry(1, 0), stoneMat, lootRocks, { isLootCluster: true, isRock: true });
    }

    // ===================== ANIMATIONS =====================
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
                        obj.light.intensity = obj.baseIntensity + Math.sin(t * 2) * 0.4;
                    };
                    break;
                case 'fireFlicker': {
                    const base = obj.baseIntensity;
                    obj.update = () => {
                        const t = Date.now() * 0.01;
                        // Rapid flicker using multiple sine waves
                        const flicker = base + Math.sin(t * 3.7) * 0.6 + Math.sin(t * 7.3) * 0.3 + Math.sin(t * 13.1) * 0.15;
                        obj.light.intensity = Math.max(0.3, flicker);
                        if (obj.flame) {
                            obj.flame.scale.y = 0.8 + Math.sin(t * 5) * 0.3;
                            obj.flame.scale.x = 0.9 + Math.sin(t * 4.3) * 0.15;
                            obj.flame.material.opacity = 0.6 + Math.sin(t * 6) * 0.25;
                        }
                    };
                    break;
                }
                default:
                    obj.update = () => {};
            }
        }
    }

    // ===================== GETTERS =====================
    getSpawnPads() { return this.spawnPads; }
    getColliders() { return this.colliders; }
    getHazards() { return this.hazards; }
    getTraps() { return this.traps; }
    getFogZones() { return this.fogZones; }
    getRadiationZones() { return this.radiationZones; }
    getLootData() { return this.lootData; }
    getAnimatedObjects() { return this.animatedObjects; }

    // ===================== FIRE PITS =====================
    // Atmospheric fire pits with flickering point lights
    buildFirePits() {
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a, roughness: 0.9, metalness: 0.3
        });
        const flameMat = new THREE.MeshBasicMaterial({
            color: 0xff6600, transparent: true, opacity: 0.8, depthWrite: false
        });

        const pitLocations = [
            // Around Cornucopia
            { x: 18, z: 18 }, { x: -18, z: 18 }, { x: 18, z: -18 }, { x: -18, z: -18 },
            // Shelter areas
            { x: 80, z: 80 }, { x: -80, z: 80 }, { x: 80, z: -80 }, { x: -80, z: -80 },
            // Biome transitions
            { x: 130, z: 0 }, { x: -130, z: 0 }, { x: 0, z: 130 }, { x: 0, z: -130 },
            // Inner ring
            { x: 50, z: 50 }, { x: -50, z: 50 }, { x: 50, z: -50 }, { x: -50, z: -50 },
        ];

    const firePitStones = [];
        for (const loc of pitLocations) {
            // Stone ring base
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                firePitStones.push({
                    x: loc.x + Math.cos(angle) * 0.8, y: 0.25, z: loc.z + Math.sin(angle) * 0.8,
                    sx: 0.4, sy: 0.4, sz: 0.4,
                    rotX: Math.random(), rotY: Math.random(), rotZ: Math.random(),
                    isFirePit: true
             });
        }
        // Batch fire pit stones (96 → 1 InstancedMesh)
        this.batchInstances(new THREE.DodecahedronGeometry(1, 0), fireMat, firePitStones, { isFirePit: true });

        // Flame (animated)
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 5), flameMat.clone());
            flame.position.set(loc.x, 0.8, loc.z);
            flame.userData.isFirePit = true;
            flame.userData.isFlame = true;
            this.scene.add(flame);

            // Flickering light
            const light = new THREE.PointLight(0xff6622, 2, 18);
            light.position.set(loc.x, 1.5, loc.z);
            light.userData.isFirePit = true;
            this.scene.add(light);

            // Add to animated objects for flicker
            this.animatedObjects.push({
                type: 'fireFlicker',
                light: light,
                baseIntensity: 2,
                flame: flame
            });
        }
    }

    // ===================== PARTICLE SYSTEMS =====================
    buildParticleSystems() {
        // --- Fire spark particles ---
        for (let p = 0; p < 20; p++) {
            const a = (p / 20) * Math.PI * 2;
            const r = 18;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            this.createSparkParticles(x, z);
        }

        // --- Burning wastes ash ---
        this.createAshParticles(100, 100, 30);
        this.createAshParticles(-100, -80, 20);

        // --- Luminous forest glow particles ---
        this.createGlowParticles(-60, 60, 40);
        this.createGlowParticles(-80, 80, 30);
    }

    createSparkParticles(cx, cz) {
        const count = 60;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = cx + (Math.random() - 0.5) * 2;
            positions[i * 3 + 1] = Math.random() * 3;
            positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 2;
            velocities.push({
                x: (Math.random() - 0.5) * 0.5,
                y: 0.5 + Math.random() * 1.5,
                z: (Math.random() - 0.5) * 0.5,
                life: Math.random()
            });
            sizes[i] = 0.15 + Math.random() * 0.2;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            color: 0xff8833,
            size: 0.2,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geo, mat);
        points.userData.velocities = velocities;
        points.userData.origin = { x: cx, z: cz };
        points.userData.type = 'spark';
        this.scene.add(points);
        this.particleSystems.push(points);
    }

    createAshParticles(cx, cz, count) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = cx + (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = Math.random() * 10;
            positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 80;
            velocities.push({
                x: (Math.random() - 0.5) * 0.3,
                y: 0.05 + Math.random() * 0.1,
                z: (Math.random() - 0.5) * 0.3
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0x664422,
            size: 0.3,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        });

        const points = new THREE.Points(geo, mat);
        points.userData.velocities = velocities;
        points.userData.type = 'ash';
        points.userData.radius = 40;
        points.userData.center = { x: cx, z: cz };
        this.scene.add(points);
        this.particleSystems.push(points);
    }

    createGlowParticles(cx, cz, count) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = cx + (Math.random() - 0.5) * 60;
            positions[i * 3 + 1] = 1 + Math.random() * 8;
            positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 60;
            velocities.push({
                x: (Math.random() - 0.5) * 0.15,
                y: 0.1 + Math.random() * 0.3,
                z: (Math.random() - 0.5) * 0.15,
                phase: Math.random() * Math.PI * 2
            });
            // Cyan-green glow
            colors[i * 3] = 0.2 + Math.random() * 0.3;
            colors[i * 3 + 1] = 0.6 + Math.random() * 0.4;
            colors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.25,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        const points = new THREE.Points(geo, mat);
        points.userData.velocities = velocities;
        points.userData.type = 'glow';
        points.userData.radius = 30;
        points.userData.center = { x: cx, z: cz };
        this.scene.add(points);
        this.particleSystems.push(points);
    }

    updateParticles(delta) {
        for (const ps of this.particleSystems) {
            const positions = ps.geometry.getAttribute('position').array;
            const vels = ps.userData.velocities;
            const t = performance.now() * 0.001;

            for (let i = 0; i < vels.length; i++) {
                const v = vels[i];

                if (ps.userData.type === 'spark') {
                    v.life += delta * 0.4;
                    if (v.life > 1) {
                        // Reset to origin
                        v.life = 0;
                        positions[i * 3] = ps.userData.origin.x + (Math.random() - 0.5) * 1.5;
                        positions[i * 3 + 1] = 0.5 + Math.random() * 0.5;
                        positions[i * 3 + 2] = ps.userData.origin.z + (Math.random() - 0.5) * 1.5;
                    } else {
                        positions[i * 3] += v.x * delta;
                        positions[i * 3 + 1] += v.y * delta;
                        positions[i * 3 + 2] += v.z * delta;
                        // Slight wind
                        v.x += Math.sin(t + i) * 0.01;
                    }
                } else if (ps.userData.type === 'ash') {
                    positions[i * 3] += v.x * delta;
                    positions[i * 3 + 1] += v.y * delta;
                    positions[i * 3 + 2] += v.z * delta;

                    // Wrap around
                    const dx = positions[i * 3] - ps.userData.center.x;
                    const dz = positions[i * 3 + 2] - ps.userData.center.z;
                    if (dx * dx + dz * dz > ps.userData.radius * ps.userData.radius) {
                        const angle = Math.atan2(dz, dx);
                        const r = Math.random() * 2;
                        positions[i * 3] = ps.userData.center.x + Math.cos(angle) * r;
                        positions[i * 3 + 2] = ps.userData.center.z + Math.sin(angle) * r;
                        positions[i * 3 + 1] = 0;
                    }
                    if (positions[i * 3 + 1] > 10) {
                        positions[i * 3 + 1] = 0;
                    }
                } else if (ps.userData.type === 'glow') {
                    const phase = v.phase || 0;
                    positions[i * 3] += (v.x + Math.sin(t + phase) * 0.2) * delta;
                    positions[i * 3 + 1] += v.y * delta;
                    positions[i * 3 + 2] += (v.z + Math.cos(t + phase) * 0.2) * delta;

                    // Wrap around
                    const dx = positions[i * 3] - ps.userData.center.x;
                    const dz = positions[i * 3 + 2] - ps.userData.center.z;
                    if (dx * dx + dz * dz > ps.userData.radius * ps.userData.radius) {
                        positions[i * 3] = ps.userData.center.x + (Math.random() - 0.5) * 2;
                        positions[i * 3 + 2] = ps.userData.center.z + (Math.random() - 0.5) * 2;
                        positions[i * 3 + 1] = 0;
                    }
                    if (positions[i * 3 + 1] > 12) {
                        positions[i * 3 + 1] = 0;
                    }
                }
            }

            ps.geometry.getAttribute('position').needsUpdate = true;
        }
    }

    // ===================== TRAPS =====================
    // Hunger Games traps: spike traps, bear traps, tripwires
    buildTraps() {
        // Spike traps (placed near paths and biomes)
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.5, metalness: 0.8 });
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 150;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            // Spike cluster (3-5 spikes)
            const spikeCount = 3 + Math.floor(Math.random() * 3);
            for (let s = 0; s < spikeCount; s++) {
                const sa = (s / spikeCount) * Math.PI * 2;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.2, 4), spikeMat);
                spike.position.set(x + Math.cos(sa) * 0.8, 0.6, z + Math.sin(sa) * 0.8);
                spike.rotation.x = Math.PI / 2;
                this.scene.add(spike);
            }

            // Visual trigger plate
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 8), spikeMat);
            plate.position.set(x, 0.03, z);
            this.scene.add(plate);

            this.traps.push({
                type: 'spike',
                position: new THREE.Vector3(x, 0, z),
                radius: 1.5,
                damage: 15,
                cooldown: 5000,
                triggered: false,
                triggerTime: 0
            });
        }

        // Bear traps (stronger, fewer)
        const bearMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6, metalness: 0.7 });
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * 140;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            // Bear trap jaws
            for (const jaw of [-1, 1]) {
                const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.3), bearMat);
                jawMesh.position.set(x, 0.15, z);
                jawMesh.rotation.y = (Math.random() - 0.5) * 0.5;
                jawMesh.rotation.z = jaw * 0.3;
                this.scene.add(jawMesh);
            }

            this.traps.push({
                type: 'bear',
                position: new THREE.Vector3(x, 0, z),
                radius: 1.2,
                damage: 25,
                cooldown: 8000,
                triggered: false,
                triggerTime: 0,
                snare: true // slows movement
            });
        }

        // Tripwires (at biome entrances, stealth zones)
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 50 + Math.random() * 120;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            // Tripwire visual (thin line at ankle height)
            const wireMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
            const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4, 4), wireMat);
            wire.position.set(x, 0.8, z);
            wire.rotation.z = Math.PI / 2;
            this.scene.add(wire);

            this.traps.push({
                type: 'tripwire',
                position: new THREE.Vector3(x, 0, z),
                radius: 2.5,
                damage: 8,
                cooldown: 3000,
                triggered: false,
                triggerTime: 0,
                alertRadius: 20 // alerts nearby enemies
            });
        }

        // Flash traps (near Cornucopia, explosive)
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const r = 65 + Math.random() * 15;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            // Flash charge visual
            const charge = new THREE.Mesh(
                new THREE.SphereGeometry(0.4, 6, 6),
                new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 1, transparent: true, opacity: 0.7 })
            );
            charge.position.set(x, 0.4, z);
            this.scene.add(charge);

            this.traps.push({
                type: 'flash',
                position: new THREE.Vector3(x, 0, z),
                radius: 8,
                damage: 20,
                cooldown: 15000,
                triggered: false,
                triggerTime: 0,
                knockback: true,
                blindDuration: 3000
            });
        }
    }

    // ===================== FOG ZONES =====================
    // Fog zones that close in from the edges, forcing players together
    // 4 phases, each with visual mesh + damage + trigger support
    buildFogZones() {
        // Phase 1: Outer ring fog (R=180-220)
        this.fogZones.push({
            name: 'outer_fog',
            outerRadius: 220,
            innerRadius: 180,
            damage: 0.2,
            active: false,
            phase: 0,
            shrinkSpeed: 0,
            description: 'Outer fog zone',
            mesh: null,
            light: null
        });

        // Phase 2: Mid ring fog (R=130-180)
        this.fogZones.push({
            name: 'mid_fog',
            outerRadius: 180,
            innerRadius: 130,
            damage: 0.5,
            active: false,
            phase: 1,
            shrinkSpeed: 0,
            description: 'Mid fog zone',
            mesh: null,
            light: null
        });

        // Phase 3: Inner ring fog (R=80-130)
        this.fogZones.push({
            name: 'inner_fog',
            outerRadius: 130,
            innerRadius: 80,
            damage: 1.0,
            active: false,
            phase: 2,
            shrinkSpeed: 0,
            description: 'Inner fog zone',
            mesh: null,
            light: null
        });

        // Phase 4: Center fog (R=40-80) - final phase
        this.fogZones.push({
            name: 'center_fog',
            outerRadius: 80,
            innerRadius: 40,
            damage: 2.0,
            active: false,
            phase: 3,
            shrinkSpeed: 0,
            description: 'Final fog zone',
            mesh: null,
            light: null
        });

        // Visual fog walls for each phase boundary
        const fogColors = [0x556655, 0x445544, 0x334433, 0x223322];
        const fogOpacities = [0.12, 0.18, 0.25, 0.35];
        const fogEmissive = [0x223322, 0x334433, 0x445544, 0x556655];

        for (let p = 0; p < 4; p++) {
            const zone = this.fogZones[p];
            const fogMat = new THREE.MeshStandardMaterial({
                color: fogColors[p],
                emissive: fogEmissive[p],
                emissiveIntensity: 0.3 + p * 0.15,
                transparent: true,
                opacity: fogOpacities[p],
                side: THREE.DoubleSide,
                depthWrite: false
            });

            // Fog ring (annulus mesh) — only visible where zone is active
            const ringGeo = new THREE.RingGeometry(zone.innerRadius, zone.outerRadius, 64);
            const ringMesh = new THREE.Mesh(ringGeo, fogMat);
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.y = 0.15;
            ringMesh.visible = zone.active;
            ringMesh.userData.isFogZone = true; ringMesh.userData.fogPhase = p;
            this.scene.add(ringMesh);
            zone.mesh = ringMesh;

            // Vertical fog wall at inner boundary
            const wallGeo = new THREE.CylinderGeometry(zone.innerRadius, zone.innerRadius, 12, 64, 1, true);
            const wallMat = new THREE.MeshStandardMaterial({
                color: fogColors[p],
                emissive: fogEmissive[p],
                emissiveIntensity: 0.2 + p * 0.1,
                transparent: true,
                opacity: fogOpacities[p] * 0.6,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.y = 6;
            wall.visible = zone.active;
            wall.userData.isFogZone = true; wall.userData.fogPhase = p; wall.userData.isFogWall = true;
            this.scene.add(wall);
            zone._wall = wall;
            zone._wallMat = wallMat;
            zone._ringMat = fogMat;

            // Fog light (purple-green tinted)
            const light = new THREE.PointLight(0x446644, 0.5 + p * 0.3, zone.outerRadius - zone.innerRadius + 10);
            light.position.set(0, 3, 0);
            light.visible = zone.active;
            this.scene.add(light);
            zone.light = light;
            this.animatedObjects.push({ type: 'fogGlow', light: light, baseIntensity: 0.5 + p * 0.3, fogPhase: p });
        }

        // Active danger ring — single dynamic ring showing current safe boundary
        const activeRingMat = new THREE.MeshStandardMaterial({
            color: 0x44ff88,
            emissive: 0x22cc66,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const activeRingGeo = new THREE.RingGeometry(0, 220, 64);
        this.activeFogRing = new THREE.Mesh(activeRingGeo, activeRingMat);
        this.activeFogRing.rotation.x = -Math.PI / 2;
        this.activeFogRing.position.y = 0.3;
        this.activeFogRing.userData.isActiveFogRing = true;
        this.scene.add(this.activeFogRing);

        // Vertical active wall
        const activeWallMat = new THREE.MeshStandardMaterial({
            color: 0x44ff88,
            emissive: 0x22cc66,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const activeWallGeo = new THREE.CylinderGeometry(220, 220, 14, 64, 1, true);
        const activeWall = new THREE.Mesh(activeWallGeo, activeWallMat);
        activeWall.position.y = 7;
        activeWall.userData.isActiveFogRing = true;
        this.scene.add(activeWall);
        this._activeWall = activeWall;
        this._activeWallMat = activeWallMat;

        // Initially hide the active danger ring (will be set on first phase activate)
        this.activeFogRing.visible = false;
        this._activeWall.visible = false;
    }

    // ===================== RADIATION ZONES =====================
    // Radiation at biome edges and hazardous areas
    buildRadiationZones() {
        // High radiation: Burning Wastes center
        const wasteAngle = Math.PI * 0.75, wasteR = 130;
        const wx = Math.cos(wasteAngle) * wasteR, wz = Math.sin(wasteAngle) * wasteR;

        this.radiationZones.push({
            type: 'radiation',
            position: new THREE.Vector3(wx, 0, wz),
            radius: 50,
            damage: 0.3,
            duration: 1000,
            intensity: 'high',
            visual: 'waste',
            description: 'Burning Wastes - High Radiation',
            mesh: null,
            light: null
        });

        // Medium radiation: NW edge (near ruined citadel)
        const nwAngle = Math.PI * 0.65, nwR = 100;
        const nx = Math.cos(nwAngle) * nwR, nz = Math.sin(nwAngle) * nwR;
        this.radiationZones.push({
            type: 'radiation',
            position: new THREE.Vector3(nx, 0, nz),
            radius: 35,
            damage: 0.15,
            duration: 1000,
            intensity: 'medium',
            visual: 'gas',
            description: 'Radioactive gas cloud - NW',
            mesh: null,
            light: null
        });

        // Low radiation: SE edge
        const seAngle = Math.PI * 0.35, seR = 90;
        const sx = Math.cos(seAngle) * seR, sz = Math.sin(seAngle) * seR;
        this.radiationZones.push({
            type: 'radiation',
            position: new THREE.Vector3(sx, 0, sz),
            radius: 30,
            damage: 0.1,
            duration: 1000,
            intensity: 'low',
            visual: 'gas',
            description: 'Mild radiation leak - SE',
            mesh: null,
            light: null
        });

        // Visual gas clouds and lights for each radiation zone
        const intensityConfig = {
            high: { color: 0x44ff44, emissive: 0x22aa22, opacity: 0.15, lightIntensity: 3, radius: 50 },
            medium: { color: 0x66cc66, emissive: 0x33aa33, opacity: 0.12, lightIntensity: 2, radius: 35 },
            low: { color: 0x88ee88, emissive: 0x44bb44, opacity: 0.08, lightIntensity: 1.5, radius: 30 }
        };

        for (const zone of this.radiationZones) {
            const cfg = intensityConfig[zone.intensity];

            // Gas cloud (large sphere, low opacity, green)
            const gasMat = new THREE.MeshStandardMaterial({
                color: cfg.color,
                emissive: cfg.emissive,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: cfg.opacity,
                roughness: 1,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const cloud = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius, 32, 16), gasMat);
            cloud.position.set(zone.position.x, 4, zone.position.z);
            cloud.scale.y = 0.35;
            cloud.userData.isRadiation = true;
            cloud.userData.radiationIntensity = zone.intensity;
            this.scene.add(cloud);
            zone.mesh = cloud;
            zone._gasMat = gasMat;

            // Green ground glow
            const glowMat = new THREE.MeshStandardMaterial({
                color: cfg.emissive,
                emissive: cfg.emissive,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.2,
                depthWrite: false
            });
            const glow = new THREE.Mesh(new THREE.CircleGeometry(cfg.radius, 32), glowMat);
            glow.rotation.x = -Math.PI / 2;
            glow.position.set(zone.position.x, 0.06, zone.position.z);
            glow.userData.isRadiation = true;
            glow.userData.radiationIntensity = zone.intensity;
            this.scene.add(glow);
            zone._groundGlow = glow;

            // Pulsing green light at center
            const rLight = new THREE.PointLight(cfg.color, cfg.lightIntensity, cfg.radius * 1.2);
            rLight.position.set(zone.position.x, 5, zone.position.z);
            this.scene.add(rLight);
            zone.light = rLight;
            this.animatedObjects.push({ type: 'radiationGlow', light: rLight, baseIntensity: cfg.lightIntensity, radiationZone: zone });
        }
    }

    // ===================== LOOT DATA =====================
    // Loot data tied to structures - what items are where
    buildLootData() {
        // Cornucopia chest - high tier loot
        this.lootData.push({
            type: 'chest',
            position: new THREE.Vector3(0, 5, 0),
            radius: 3,
            tier: 5,
            items: [
                { name: 'assault_rifle', type: 'weapon', rarity: 'epic' },
                { name: 'armor_vest', type: 'armor', rarity: 'rare', value: 100 },
                { name: 'medkit', type: 'health', rarity: 'rare', value: 75 },
                { name: 'ammo_556', type: 'ammo', rarity: 'common', value: 120 }
            ]
        });

        // Inner ring outposts - tier 3-4 loot
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = 40 + Math.random() * 15;
            this.lootData.push({
                type: 'outpost',
                position: new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r),
                radius: 4,
                tier: 3 + Math.floor(Math.random() * 2),
                items: this.generateLootForTier(3 + Math.floor(Math.random() * 2))
            });
        }

        // Biome-specific loot
        // Citadel loot (weapons, armor)
        const citAngle = -Math.PI * 0.75, citR = 130;
        this.lootData.push({
            type: 'biome',
            position: new THREE.Vector3(Math.cos(citAngle) * citR, 0, Math.sin(citAngle) * citR),
            radius: 50,
            tier: 3,
            items: [
                { name: 'dmr', type: 'weapon', rarity: 'epic' },
                { name: 'scoped_rifle', type: 'weapon', rarity: 'rare' },
                { name: 'armor_iii', type: 'armor', rarity: 'rare', value: 80 }
            ]
        });

        // Crystal Grotto loot (stealth items, SMGs)
        const crAngle = -Math.PI * 0.25, crR = 130;
        this.lootData.push({
            type: 'biome',
            position: new THREE.Vector3(Math.cos(crAngle) * crR, 0, Math.sin(crAngle) * crR),
            radius: 50,
            tier: 2,
            items: [
                { name: 'smg', type: 'weapon', rarity: 'rare' },
                { name: 'silencer', type: 'attachment', rarity: 'uncommon' },
                { name: 'flash_hide', type: 'consumable', rarity: 'rare' }
            ]
        });

        // Burning Wastes loot (snipers, high tier)
        const wasteAngle = Math.PI * 0.75, wasteR = 130;
        this.lootData.push({
            type: 'biome',
            position: new THREE.Vector3(Math.cos(wasteAngle) * wasteR, 0, Math.sin(wasteAngle) * wasteR),
            radius: 50,
            tier: 4,
            items: [
                { name: 'sniper_rifle', type: 'weapon', rarity: 'epic' },
                { name: '8x_scope', type: 'attachment', rarity: 'epic' },
                { name: 'armor_iii', type: 'armor', rarity: 'rare', value: 80 },
                { name: 'ammo_338', type: 'ammo', rarity: 'uncommon', value: 40 }
            ]
        });

        // Luminous Forest loot (survival items)
        const forestAngle = Math.PI * 0.25, forestR = 130;
        this.lootData.push({
            type: 'biome',
            position: new THREE.Vector3(Math.cos(forestAngle) * forestR, 0, Math.sin(forestAngle) * forestR),
            radius: 50,
            tier: 2,
            items: [
                { name: 'shotgun', type: 'weapon', rarity: 'rare' },
                { name: 'bandages', type: 'health', rarity: 'common', value: 25 },
                { name: 'energy_drink', type: 'health', rarity: 'common', value: 40 },
                { name: 'adrenaline', type: 'consumable', rarity: 'uncommon' }
            ]
        });

        // Loot cluster data (R=65-130)
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 65 + Math.random() * 60;
            this.lootData.push({
                type: 'cluster',
                position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
                radius: 5,
                tier: 1 + Math.floor(Math.random() * 3),
                items: this.generateLootForTier(1 + Math.floor(Math.random() * 3))
            });
        }
    }

   // ===================== ZONE TRIGGER SYSTEM =====================
    // Called by main.js game loop to activate fog/radiation phases

    // Activate fog phase by index (0-3). Returns the active safe radius.
    activateFogPhase(phaseIndex) {
        if (phaseIndex < 0 || phaseIndex >= this.fogZones.length) return this.getActiveSafeRadius();

        // Deactivate all higher phases
        for (let i = phaseIndex + 1; i < this.fogZones.length; i++) {
            const z = this.fogZones[i];
            z.active = false;
            z.mesh && (z.mesh.visible = false);
            z._wall && (z._wall.visible = false);
            z.light && (z.light.visible = false);
            z._ringMat && (z._ringMat.opacity = 0);
            z._wallMat && (z._wallMat.opacity = 0);
        }

        // Activate up to current phase
        for (let i = 0; i <= phaseIndex; i++) {
            const z = this.fogZones[i];
            z.active = true;
            z.mesh && (z.mesh.visible = true);
            z._wall && (z._wall.visible = true);
            z.light && (z.light.visible = true);
        }

        this.currentFogPhase = phaseIndex;
        const safeR = this.getActiveSafeRadius();

        // Update the active danger ring to show the safe boundary
        if (this.activeFogRing) {
            this.activeFogRing.visible = true;
            this.activeFogRing.geometry.dispose();
            this.activeFogRing.geometry = new THREE.RingGeometry(safeR - 2, safeR + 2, 64);
        }
        if (this._activeWall) {
            this._activeWall.visible = true;
            this._activeWall.geometry.dispose();
            this._activeWall.geometry = new THREE.CylinderGeometry(safeR, safeR, 14, 64, 1, true);
        }

        return safeR;
    }

    // Get the current safe radius (inner radius of the most restrictive active fog zone)
    getActiveSafeRadius() {
        let safeR = this.arenaRadius;
        for (const z of this.fogZones) {
            if (z.active) {
                if (z.innerRadius < safeR) safeR = z.innerRadius;
            }
        }
        return safeR;
    }

    // Check if a position (x, z) is inside the safe zone
    isPositionSafe(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        const safeR = this.getActiveSafeRadius();
        return dist <= safeR;
    }

    // Get damage per tick for a position (from fog zones)
    getFogDamageAt(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        const safeR = this.getActiveSafeRadius();
        if (dist <= safeR) return 0;

        for (const z2 of this.fogZones) {
            if (!z2.active) continue;
            if (dist >= z2.innerRadius && dist <= z2.outerRadius) {
                return z2.damage;
            }
        }
        return 0;
    }

    // Get radiation damage for a position
    getRadiationDamageAt(x, z) {
        let totalDmg = 0;
        for (const rz of this.radiationZones) {
            const dx = x - rz.position.x;
            const dz = z - rz.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist <= rz.radius) {
                totalDmg += rz.damage;
            }
        }
        return totalDmg;
    }

    // Get closest radiation zone info for a position
    getClosestRadiationZone(x, z) {
        let closest = null;
        let minDist = Infinity;
        for (const rz of this.radiationZones) {
            const dx = x - rz.position.x;
            const dz = z - rz.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                closest = rz;
            }
        }
        if (closest && minDist <= closest.radius) {
            return { zone: closest, distance: minDist };
        }
        return null;
    }

    // Calculate time until next fog phase
    getTimeUntilNextPhase(currentPhase) {
        // Phase 0→1: 60s, 1→2: 120s, 2→3: 180s
        const intervals = [60, 120, 180, Infinity];
        return currentPhase < 3 ? intervals[currentPhase] : Infinity;
    }

    // Update animated fog/radiation visuals (call from game loop)
    updateZoneAnimations(deltaTime) {
        const t = performance.now() * 0.001;

        // Animate fog walls (pulse opacity)
        for (const z of this.fogZones) {
            if (!z.active || !z._wallMat) continue;
            const pulse = 0.5 + Math.sin(t * 0.8 + z.phase) * 0.15;
            z._wallMat.opacity = (0.12 + z.phase * 0.06) * pulse;
            z._ringMat.opacity = (0.12 + z.phase * 0.05) * pulse;
            if (z.light) {
                z.light.intensity = (0.5 + z.phase * 0.3) * pulse;
            }
        }

        // Animate active danger ring
        if (this.activeFogRing && this.activeFogRing.visible) {
            const pulse = 0.35 + Math.sin(t * 2) * 0.15;
            this.activeFogRing.material.opacity = pulse;
            this.activeFogRing.material.emissiveIntensity = 0.4 + Math.sin(t * 1.5) * 0.2;
        }
        if (this._activeWall && this._activeWall.visible) {
            const pulse = 0.25 + Math.sin(t * 1.8) * 0.1;
            this._activeWallMat.opacity = pulse;
        }

        // Animate radiation clouds (float and pulse)
        for (const rz of this.radiationZones) {
            if (!rz.mesh) continue;
            const float = Math.sin(t * 0.5 + rz.position.x) * 0.5;
            rz.mesh.position.y = 4 + float;
            if (rz._gasMat) {
                const pulse = 0.8 + Math.sin(t * 1.2 + rz.position.z) * 0.2;
                rz._gasMat.opacity = (rz.intensity === 'high' ? 0.15 : rz.intensity === 'medium' ? 0.12 : 0.08) * pulse;
            }
            if (rz._groundGlow) {
                const pulse = 0.6 + Math.sin(t * 0.7 + rz.position.x * 0.5) * 0.4;
                rz._groundGlow.material.opacity = (rz.intensity === 'high' ? 0.25 : 0.15) * pulse;
            }
            if (rz.light) {
                rz.light.intensity = (rz.intensity === 'high' ? 3 : rz.intensity === 'medium' ? 2 : 1.5) * (0.7 + Math.sin(t * 1.5) * 0.3);
            }
        }

        // Animate water surfaces (vertex ripple displacement)
        for (const mesh of this.waterMeshes) {
            if (!mesh._origPositions || !mesh.geometry.getAttribute('position')) continue;
            const posArr = mesh.geometry.getAttribute('position').array;
            const origArr = mesh._origPositions;
            const radius = mesh.geometry.parameters.radiusTop || 5;
            const cx = mesh.position.x;
            const cz = mesh.position.z;
            const ry = mesh.position.y;
            for (let i = 0; i < posArr.length / 3; i++) {
                const ox = origArr[i * 3] - cx;
                const oz = origArr[i * 3 + 2] - cz;
                const dist = Math.sqrt(ox * ox + oz * oz);
                const norm = dist / (radius || 1);
                // Ripple: outward traveling wave modulated by distance from center
                const ripple = Math.sin(norm * 6 - t * 3) * (1 - norm) * 0.04
                    + Math.sin(norm * 10 - t * 5) * (1 - norm) * 0.02;
                posArr[i * 3] = origArr[i * 3];     // X unchanged
                posArr[i * 3 + 1] = ry + ripple;     // Y displaced
                posArr[i * 3 + 2] = origArr[i * 3 + 2]; // Z unchanged
            }
            mesh.geometry.getAttribute('position').needsUpdate = true;
        }

      // Animate fire pits and other dynamic objects
        for (const obj of this.animatedObjects) {
            if (obj.update) {
                obj.update();
            }
        }
    }

    // Generate loot items based on tier (1-5)
    generateLootForTier(tier) {
        const tierItems = {
            1: [
                { name: 'bandages', type: 'health', rarity: 'common', value: 25 },
                { name: 'energy_drink', type: 'health', rarity: 'common', value: 40 },
                { name: 'pistol', type: 'weapon', rarity: 'common' },
                { name: 'ammo_9mm', type: 'ammo', rarity: 'common', value: 60 }
            ],
            2: [
                { name: 'smg', type: 'weapon', rarity: 'uncommon' },
                { name: 'medkit', type: 'health', rarity: 'uncommon', value: 50 },
                { name: 'armor_ii', type: 'armor', rarity: 'uncommon', value: 50 },
                { name: 'flashbang', type: 'consumable', rarity: 'uncommon' }
            ],
            3: [
                { name: 'assault_rifle', type: 'weapon', rarity: 'rare' },
                { name: 'scoped_rifle', type: 'weapon', rarity: 'rare' },
                { name: 'armor_ii', type: 'armor', rarity: 'rare', value: 75 },
                { name: 'gunshot_sense', type: 'consumable', rarity: 'uncommon' }
            ],
            4: [
                { name: 'dmr', type: 'weapon', rarity: 'epic' },
                { name: 'sniper_rifle', type: 'weapon', rarity: 'rare' },
                { name: 'armor_iii', type: 'armor', rarity: 'rare', value: 80 },
                { name: '4x_scope', type: 'attachment', rarity: 'rare' }
            ],
            5: [
                { name: 'assault_rifle', type: 'weapon', rarity: 'epic' },
                { name: 'armor_iv', type: 'armor', rarity: 'epic', value: 100 },
                { name: 'medkit', type: 'health', rarity: 'epic', value: 75 },
                { name: 'ammo_556', type: 'ammo', rarity: 'uncommon', value: 120 }
            ]
        };
        const items = tierItems[tier] || tierItems[1];
        const count = 2 + Math.floor(Math.random() * 3);
        const selected = [];
        for (let i = 0; i < count && i < items.length; i++) {
            selected.push({ ...items[i] });
        }
        return selected;
    }

    // ===================== HEIGHT MAP =====================
    worldToGrid(x, z) {
        return {
            x: Math.round(x / this.tileSize + this.gridWidth / 2),
            y: Math.round(z / this.tileSize + this.gridHeight / 2)
        };
    }

    getHeightAt(x, z) {
        if (!this.heightMap) return 0.4;
        const grid = this.worldToGrid(x, z);
        const gx = Math.max(0, Math.min(this.gridWidth - 1, grid.x));
        const gy = Math.max(0, Math.min(this.gridHeight - 1, grid.y));
        const base = this.heightMap?.[gy]?.[gx] ?? 0;
        return base + 0.4;
    }

    getSurfaceHeightAt(x, z) {
        let top = this.getHeightAt(x, z);
        for (const box of this.colliders || []) {
            if (!box?.min || !box?.max) continue;
            if (x < box.min.x || x > box.max.x) continue;
            if (z < box.min.z || z > box.max.z) continue;
            if (box.max.y > top) top = box.max.y;
        }
        return top;
    }

    generateHeightMap() {
        const size = 512, res = 128, step = size / res;
        this.heightMap = Array.from({ length: res + 1 }, () => new Float32Array(res + 1));
        for (let i = 0; i <= res; i++)
            for (let j = 0; j <= res; j++) {
                const x = (i - res / 2) * step, z = (j - res / 2) * step;
                this.heightMap[i][j] = this.noise.fbm(x * 0.01, z * 0.01, 4, 2.0, 0.5) * 15;
            }
    }

    // ===================== CHEST SPAWNING HELPERS =====================

    // Get floor tile positions for chest placement
    getFloorTiles() {
        if (this._floorTiles) return this._floorTiles;
        const tiles = [];
        const step = 3; // spacing between potential chest positions
        const minR = this.spawnCourtyardRadius + 8; // don't place in spawn courtyard
        for (let x = -this.arenaRadius + 3; x < this.arenaRadius; x += step) {
            for (let z = -this.arenaRadius + 3; z < this.arenaRadius; z += step) {
                const dist = Math.sqrt(x * x + z * z);
                if (dist < minR || dist > this.arenaRadius - 3) continue;
                tiles.push({ x, z });
            }
        }
        this._floorTiles = tiles;
        return tiles;
    }

    // Get pre-defined chest spots from loot data and structure positions
    getChestSpots() {
        if (this._chestSpots) return this._chestSpots;
        const spots = [];

        // Add spots from loot data
        for (const loot of this.lootData) {
            if (loot.type === 'chest' || loot.type === 'outpost' || loot.type === 'biome' || loot.type === 'cluster') {
                // Place multiple chests per cluster
                const count = loot.tier >= 4 ? 3 : loot.tier >= 2 ? 2 : 1;
                for (let i = 0; i < count; i++) {
                    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
                    const r = Math.random() * Math.min(3, loot.radius * 0.5);
                    spots.push({
                        x: loot.position.x + Math.cos(a) * r,
                        z: loot.position.z + Math.sin(a) * r,
                        grade: loot.tier >= 4 ? 'military' : loot.tier >= 2 ? 'rare' : 'house'
                    });
                }
            }
        }

        // Add additional spots along biome paths (R=50-120)
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 50 + Math.random() * 70;
            spots.push({
                x: Math.cos(a) * r,
                z: Math.sin(a) * r,
                grade: Math.random() > 0.7 ? 'rare' : 'house'
            });
        }

        this._chestSpots = spots;
        return spots;
    }

    // ===================== TRAP ACTIVATION =====================
    // Check and activate traps near entities (call from game loop)
    activateTrapsNearEntity(entity) {
        if (!entity || !entity.position) return;
        const pos = entity.position;
        const now = performance.now();

        for (const trap of this.traps) {
            if (trap.triggered && (now - trap.triggerTime) < trap.cooldown) {
                continue;
            }

            const dx = pos.x - trap.position.x;
            const dz = pos.z - trap.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist <= trap.radius) {
                trap.triggered = true;
                trap.triggerTime = now;

                // Apply trap damage
                if (entity.takeDamage) {
                    entity.takeDamage(trap.damage, false, null, 0, 'trap');

                    // Handle special effects
                    if (trap.snare) {
                        entity.isSnared = true;
                        setTimeout(() => { entity.isSnared = false; }, 3000);
                    }
                    if (trap.knockback) {
                        // Knockback away from trap center
                        const angle = Math.atan2(-dz, -dx);
                        entity.physics.velocity.set(
                            Math.cos(angle) * 15,
                            3,
                            Math.sin(angle) * 15
                        );
                    }
                }
            }
        }
    }

    // Get terrain height at world position
    getHeightAt(x, z) {
        const noise = this.noise;
        const base = noise.fbm(x * 0.005, z * 0.005, 4, 2.0, 0.5) * 3;
        return Math.max(0.2, base + 0.3);
    }

    // Get surface height for chest placement
    getSurfaceHeightAt(x, z) {
        return this.getHeightAt(x, z);
    }

    // Find which structure (if any) a point is inside
    getStructureAtPoint(x, z, maxDist) {
        if (!this._allStructures) {
            this._allStructures = [];
            for (const [key, structs] of Object.entries(this.structures || {})) {
                for (const s of structs) {
                    this._allStructures.push({ type: key, ...s });
                }
            }
        }
        for (const s of this._allStructures) {
            const d = Math.sqrt((x - s.position.x) ** 2 + (z - s.position.z) ** 2);
            if (d <= (s.radius || 10) + (maxDist || 0)) return s;
        }
        return null;
    }

    // ============ PERFORMANCE: LOD SYSTEM ============
    setupLOD(isMobile) {
        const farDetail = isMobile ? 150 : 250;
        const midDetail = isMobile ? 80 : 120;
        const trees = [];

        // Collect all tree parts grouped by position
        this.scene.traverse((obj) => {
            if (obj.isMesh && obj.userData.isTree) {
                const key = `${obj.position.x.toFixed(1)},${obj.position.z.toFixed(1)}`;
                if (!trees[key]) trees[key] = { high: [], mid: [], low: [] };
                trees[key].high.push(obj);
            }
        });

        // Create LOD groups for each tree
        for (const key of Object.keys(trees)) {
            const parts = trees[key];
            if (parts.high.length === 0) continue;

            // Get the position from the first part
            const pos = parts.high[0].parent;
            if (!pos) continue;

            // Create high-detail group (full mesh)
            const highGroup = new THREE.Group();
            const midGroup = new THREE.Group();
            const lowGroup = new THREE.Group();

            for (const part of parts.high) {
                highGroup.add(part.clone());
            }

            // Mid: simplified canopy only (no trunk details)
            for (const part of parts.high) {
                if (part.userData.isCanopy) {
                    const midCanopy = part.clone();
                    midCanopy.geometry = this._simplifyGeometry(midCanopy.geometry, 0.5);
                    midGroup.add(midCanopy);
                }
            }

            // Low: single box proxy
            const lowBox = new THREE.Mesh(
                new THREE.BoxGeometry(3, 12, 3),
                new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 1 })
            );
            lowBox.position.copy(parts.high[0].position);
            if (parts.high[0].parent) {
                lowBox.position.y = parts.high[0].position.y;
            }
            lowGroup.add(lowBox);

            // Compute center height
            let minY = Infinity, maxY = -Infinity;
            for (const part of parts.high) {
                const h = part.geometry.parameters.height || part.geometry.parameters.radiusTop || 1;
                minY = Math.min(minY, part.position.y - h);
                maxY = Math.max(maxY, part.position.y + h);
            }
            const centerY = (minY + maxY) / 2;
            highGroup.position.y = centerY;
            midGroup.position.y = centerY;
            lowGroup.position.y = centerY;

            // Create LOD object
            const lod = new THREE.LOD();
            lod.addLevel(highGroup, 0);
            lod.addLevel(midGroup, midDetail);
            lod.addLevel(lowGroup, farDetail);
            lod.position.copy(parts.high[0].position);
            if (pos) {
                pos.add(lod);
            } else {
                this.scene.add(lod);
            }

            // Remove original tree parts
            for (const part of parts.high) {
                part.visible = false;
            }
        }
    }

    _simplifyGeometry(geometry, factor) {
        // Reduce vertex count by factor
        const segs = Math.max(3, Math.round((geometry.parameters.segments || 8) * factor));
        if (geometry.type === 'ConeGeometry' || geometry.type === 'CylinderGeometry') {
            return new THREE.ConeGeometry(
                geometry.parameters.radiusBottom || geometry.parameters.radiusTop || 1,
                geometry.parameters.height || 1,
                segs
            );
        }
        if (geometry.type === 'SphereGeometry' || geometry.type === 'IcosahedronGeometry') {
            return new THREE.IcosahedronGeometry(
                geometry.parameters.radius || 1,
                Math.max(0, Math.round((geometry.parameters.detail || 0) * factor))
            );
        }
        return geometry;
    }

    // ============ PERFORMANCE: MERGE STATIC PROPS ============
    // Merges small static meshes sharing the same material into a single draw call.
    // usage: this.mergeStaticProps(material, obj => obj.userData.isRock);
    mergeStaticProps(material, userDataPredicate) {
        const meshes = [];
        this.scene.traverse((obj) => {
            if (obj.isMesh && obj.material === material && userDataPredicate(obj)) {
                meshes.push(obj);
            }
        });
        if (meshes.length <= 1) { meshes.forEach(m => m.frustumCulled = true); return; }

        try {
            const geometries = meshes.map(mesh => {
                const geo = mesh.geometry.toNonIndexed();
                mesh.updateWorldMatrix(true, false);
                const m = new THREE.Matrix4().copy(mesh.matrixWorld);
                geo.applyMatrix4(m);
                return geo;
            });

            const merged = mergeBufferGeometries(geometries);
            const mergedMesh = new THREE.Mesh(merged, material);
            mergedMesh.frustumCulled = true;
            mergedMesh.visible = meshes[0].visible;
            this.scene.add(mergedMesh);

            meshes.forEach(m => {
                this.scene.remove(m);
                m.geometry.dispose();
            });

            this.scene.userData.mergedMeshes = this.scene.userData.mergedMeshes || [];
            this.scene.userData.mergedMeshes.push(mergedMesh);
        } catch (e) {
            console.warn(`[MapGenerator] Geometry merge failed, using culling fallback:`, e.message);
            meshes.forEach(m => m.frustumCulled = true);
        }
    }

    // ============ PERFORMANCE: FRUSTUM CULLING OPTIMIZATION ============
    enableOptimizedCulling() {
        this.scene.traverse((obj) => {
            if (obj.isMesh || obj.isLineSegments) {
                obj.frustumCulled = true;
            }
        });
    }

    // ============ COURTYARD GATE HELPERS ============
    isInsideCourtyard() {
        return false;
    }

    getCourtyardExitPosition() {
        if (!this.playerSpawn) return new THREE.Vector3(0, 1.2, 0);
        const world = this.toWorld(this.playerSpawn.x, this.playerSpawn.y);
        return new THREE.Vector3(world.x, 1.2, world.z);
    }

    setCourtyardGateOpen() {
        return;
    }
    // ============ PROCEDURAL TEXTURES ============
    createProceduralTexture(baseColor, variation = 25, size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const tc = new THREE.Color(baseColor);
        const r = Math.floor(tc.r * 255), g = Math.floor(tc.g * 255), b = Math.floor(tc.b * 255);
        const imgData = ctx.createImageData(size, size);
        for (let i = 0; i < imgData.data.length; i += 4) {
            const n = (Math.random() - 0.5) * variation;
            imgData.data[i] = Math.max(0, Math.min(255, r + n));
            imgData.data[i + 1] = Math.max(0, Math.min(255, g + n));
            imgData.data[i + 2] = Math.max(0, Math.min(255, b + n));
            imgData.data[i + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    createBrickTexture(size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const brickH = size / 8, brickW = size / 4;
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(0, 0, size, size);
        for (let y = 0; y < 8; y++) {
            const offset = (y % 2) * (brickW / 2);
            for (let x = -1; x < 5; x++) {
                const r = 110 + Math.random() * 40, g = 65 + Math.random() * 30, b = 45 + Math.random() * 20;
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x * brickW + offset + 1, y * brickH + 1, brickW - 2, brickH - 2);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 4);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    createWoodTexture(size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 60; i++) {
            const y = Math.random() * size;
            ctx.strokeStyle = `rgba(${80 + Math.random() * 30}, ${50 + Math.random() * 20}, ${20 + Math.random() * 15}, 0.3)`;
            ctx.lineWidth = 1 + Math.random() * 2;
            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x < size; x += 10) {
                ctx.lineTo(x, y + Math.sin(x * 0.02) * 3 + (Math.random() - 0.5) * 2);
            }
            ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 4);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    // ============ ANIMATED WATER ============
    createAnimatedWater(radius, color, height = 0.3, emissiveIntensity = 0.3) {
        const waterGeo = new THREE.CylinderGeometry(radius, radius, height, 64);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(color) },
                uEmissiveIntensity: { value: emissiveIntensity }
            },
            vertexShader: `
                uniform float uTime;
                varying vec2 vUv;
                varying float vWave;
                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    float wave1 = sin(pos.x * 0.3 + uTime * 1.5) * 0.15;
                    float wave2 = cos(pos.z * 0.4 + uTime * 1.2) * 0.1;
                    float wave3 = sin((pos.x + pos.z) * 0.2 + uTime * 0.8) * 0.08;
                    pos.y += wave1 + wave2 + wave3;
                    vWave = wave1 + wave2 + wave3;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uTime;
                uniform float uEmissiveIntensity;
                varying vec2 vUv;
                varying float vWave;
                void main() {
                    float fresnel = pow(1.0 - abs(dot(normal vec3(0,1,0), normal vec3(0,1,0))), 2.0);
                    vec3 deepColor = mix(uColor, vec3(0.1, 0.3, 0.6), vWave * 2.0);
                    vec3 shallowColor = vec3(0.4, 0.7, 0.9);
                    float alpha = 0.6 + fresnel * 0.3 + vWave * 0.5;
                    gl_FragColor = vec4(mix(deepColor, shallowColor, 0.3), alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        return new THREE.Mesh(waterGeo, mat);
    }
}
