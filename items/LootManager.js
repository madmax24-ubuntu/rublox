import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Weapon } from './Weapon.js';

// --- ОПТИМИЗАЦИЯ ---
// Кэшируем геометрии и материалы, чтобы не создавать их для каждого нового сундука.
// Это значительно снижает нагрузку на CPU и GPU, уменьшая фризы при создании объектов.
const chestResources = {
    geometries: {},
    materials: {}
};

// Хелпер для получения или создания кэшированного материала
function getCachedMaterial(name, creator) {
    if (!chestResources.materials[name]) {
        chestResources.materials[name] = creator();
    }
    return chestResources.materials[name];
}
// --- КОНЕЦ ОПТИМИЗАЦИИ ---

export class LootManager {
    constructor(scene, mapGenerator) {
        this.scene = scene;
        this.mapGenerator = mapGenerator;
        this.chests = [];
        this.supplyDrops = [];
        this.lootDensity = 1;
        this.isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        this.chestCellSize = 24;
        this.chestIndex = new Map();
        this.chestObstacleCellSize = 12;
        this.chestObstacleIndex = new Map();
        this.visibilityUpdateAt = 0;
        this.activeGlowChests = new Set();
        this.chestMaterials = this.createChestMaterials();
        this.chestReady = false;
        this.claimTTL = 2.4;
        this.lootCount = 0; // counter for test validation
        this.buildChestObstacleIndex();
        this.generateChestsAsync().then(() => {
            this.validateChestPlacements();
            this.rebuildChestIndex();
            this.chestReady = true;
            console.log(`[LootManager] Generated ${this.chests.length} chests`);
        }).catch(e => {
            console.error(`[LootManager] generateChestsAsync error:`, e);
            this.chestReady = true;
        });
    }

    buildChestObstacleIndex() {
        this.chestObstacleIndex.clear();
        this.scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        const size = new THREE.Vector3();
        const instanceMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix4();
        const addBounds = source => {
            source.getSize(size);
            if (![source.min.x, source.min.y, source.min.z, source.max.x, source.max.y, source.max.z].every(Number.isFinite)) return;
            if (size.x < 0.05 || size.y < 0.05 || size.z < 0.05) return;
            const stored = source.clone().expandByScalar(0.12);
            const minCellX = Math.floor(stored.min.x / this.chestObstacleCellSize);
            const maxCellX = Math.floor(stored.max.x / this.chestObstacleCellSize);
            const minCellZ = Math.floor(stored.min.z / this.chestObstacleCellSize);
            const maxCellZ = Math.floor(stored.max.z / this.chestObstacleCellSize);
            for (let cx = minCellX; cx <= maxCellX; cx++) {
                for (let cz = minCellZ; cz <= maxCellZ; cz++) {
                    const key = `${cx}:${cz}`;
                    let cell = this.chestObstacleIndex.get(key);
                    if (!cell) this.chestObstacleIndex.set(key, cell = []);
                    cell.push(stored);
                }
            }
        };
        this.scene.traverse(object => {
            if (!object.isMesh || !object.userData?.isWall) return;
            if (object.isInstancedMesh) {
                object.geometry.computeBoundingBox();
                const localBox = object.geometry.boundingBox;
                for (let i = 0; i < object.count; i++) {
                    object.getMatrixAt(i, instanceMatrix);
                    worldMatrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
                    box.copy(localBox).applyMatrix4(worldMatrix);
                    addBounds(box);
                }
                return;
            }
            box.setFromObject(object);
            addBounds(box);
        });
    }

    validateChestPlacements() {
        const valid = [];
        for (const chest of this.chests) {
            if (this.isChestPlacementClear(chest.position.x, chest.position.y, chest.position.z)) {
                valid.push(chest);
                continue;
            }
            const placement = this.resolveChestPlacement(chest.position.x, chest.position.z);
            if (placement) {
                chest.position.set(placement.x, placement.y, placement.z);
                valid.push(chest);
            } else {
                this.scene.remove(chest);
            }
        }
        this.chests = valid;
    }

    getChestPlacementY(x, z) {
        const structure = this.mapGenerator.getStructureAtPoint?.(x, z, 0.2);
        let baseY = 0;
        if (structure) {
            baseY = this.mapGenerator.getHeightAt?.(x, z) ?? 0;
        } else {
            baseY = this.mapGenerator.getSurfaceHeightAt?.(x, z) ?? this.mapGenerator.getHeightAt?.(x, z) ?? 0;
        }
        return baseY + 0.02;
    }

    isChestPlacementClear(x, y, z) {
        if (![x, y, z].every(Number.isFinite)) return false;
        if (x * x + z * z < 78 * 78) return false;
        const half = Number(this.mapGenerator?.halfSize) || 128;
        if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) return false;
        if (this.mapGenerator.isWalkableAt && !this.mapGenerator.isWalkableAt(x, z)) return false;
        const colliders = this.mapGenerator.getNearbyCollidersForSpawn?.({ x, y, z }, 2)
            || this.mapGenerator.getColliders?.()
            || [];
        const minX = x - 0.72;
        const maxX = x + 0.72;
        const minZ = z - 0.57;
        const maxZ = z + 0.57;
        const minY = y + 0.04;
        const maxY = y + 1.04;
        const chestBounds = new THREE.Box3(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ)
        );
        const minCellX = Math.floor(minX / this.chestObstacleCellSize);
        const maxCellX = Math.floor(maxX / this.chestObstacleCellSize);
        const minCellZ = Math.floor(minZ / this.chestObstacleCellSize);
        const maxCellZ = Math.floor(maxZ / this.chestObstacleCellSize);
        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cz = minCellZ; cz <= maxCellZ; cz++) {
                const cell = this.chestObstacleIndex.get(`${cx}:${cz}`);
                if (cell?.some(box => box.intersectsBox(chestBounds))) return false;
            }
        }
        for (const box of colliders) {
            if (!box || box.walkable || !box.min || !box.max) continue;
            if (maxX <= box.min.x || minX >= box.max.x || maxZ <= box.min.z || minZ >= box.max.z) continue;
            if (maxY <= box.min.y || minY >= box.max.y) continue;
            return false;
        }
        return true;
    }

    resolveChestPlacement(x, z) {
        const offsets = [
            [0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6],
            [2.8, 0], [-2.8, 0], [0, 2.8], [0, -2.8],
            [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]
        ];
        for (const [ox, oz] of offsets) {
            const px = x + ox;
            const pz = z + oz;
            const py = this.getChestPlacementY(px, pz);
            if (py < this.mapGenerator.waterLevel + 1) continue;
            if (this.isChestPlacementClear(px, py, pz)) return { x: px, y: py, z: pz };
        }
        return null;
    }
    
    generateChests() {
        const floorTiles = this.mapGenerator.getFloorTiles?.() || [];
        const targetByMapSize = Math.floor(Math.max(120, floorTiles.length * (this.isMobile ? 0.08 : 0.1)));
        const chestCount = Math.max(this.isMobile ? 80 : 110, Math.floor(targetByMapSize * this.lootDensity));
        const spots = this.mapGenerator.getChestSpots?.() || [];
        const occupied = new Set();
        const keyFor = (x, z) => `${Math.round(x / 3)}:${Math.round(z / 3)}`;

        if (spots.length > 0) {
            const shuffled = [...spots].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);

            for (let i = 0; i < limit; i++) {
                const spot = shuffled[i];
                const placement = this.resolveChestPlacement(spot.x, spot.z);
                if (!placement) continue;
                const chest = this.createChest(placement.x, placement.y, placement.z, spot.grade || 'house');
                this.chests.push(chest);
                occupied.add(keyFor(placement.x, placement.z));
                this.addChestToIndex(chest);
            }
        }

        if (floorTiles.length && this.chests.length < chestCount) {
            const shuffled = [...floorTiles].sort(() => Math.random() - 0.5);
            const limit = shuffled.length;
            for (let i = 0; i < limit; i++) {
                if (this.chests.length >= chestCount) break;
                const tile = shuffled[i];
                const key = keyFor(tile.x, tile.z);
                if (occupied.has(key)) continue;
                const y = this.getChestPlacementY(tile.x, tile.z);
                if (y < this.mapGenerator.waterLevel + 1) continue;
                if (this.mapGenerator.getStructureAtPoint?.(tile.x, tile.z, 3)) continue;
                if (!this.isHiddenSpawn(tile.x, y, tile.z)) continue;
                if (!this.isChestPlacementClear(tile.x, y, tile.z)) continue;
                const chest = this.createChest(tile.x, y, tile.z);
                this.chests.push(chest);
                occupied.add(key);
                this.addChestToIndex(chest);
            }
            if (this.chests.length >= chestCount) {
                this.rebuildChestIndex();
                return;
            }
        }

        for (let i = this.chests.length, attempts = 0; i < chestCount && attempts < chestCount * 20; attempts++) {
            const angle = Math.random() * Math.PI * 2;
            const maxRadius = Math.max(42, (Number(this.mapGenerator.halfSize) || 128) - 6);
            const distance = 80 + Math.random() * Math.max(2, maxRadius - 80);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = this.getChestPlacementY(x, z);

            if (y < this.mapGenerator.waterLevel + 1) {
                continue;
            }
            if (this.mapGenerator.getStructureAtPoint?.(x, z, 1)) continue;
            if (!this.isHiddenSpawn(x, y, z)) {
                continue;
            }
            if (!this.isChestPlacementClear(x, y, z)) continue;
            const key = keyFor(x, z);
            if (occupied.has(key)) continue;

            const chest = this.createChest(x, y, z);
            this.chests.push(chest);
            occupied.add(key);
            this.addChestToIndex(chest);
            i++;
        }
        this.rebuildChestIndex();
    }

    // Асинхронная версия generateChests для устранения фризов при старте
    async generateChestsAsync() {
        const floorTiles = this.mapGenerator.getFloorTiles?.() || [];
        const targetByMapSize = Math.floor(Math.max(120, floorTiles.length * (this.isMobile ? 0.08 : 0.1)));
        const chestCount = Math.max(this.isMobile ? 80 : 110, Math.floor(targetByMapSize * this.lootDensity));
        const spots = this.mapGenerator.getChestSpots?.() || [];
        const occupied = new Set();
        const keyFor = (x, z) => `${Math.round(x / 3)}:${Math.round(z / 3)}`;
        console.log(`[LootManager] generateChestsAsync: floorTiles=${floorTiles.length}, spots=${spots.length}, chestCount=${chestCount}`);

        if (spots.length > 0) {
            const shuffled = [...spots].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);

            for (let i = 0; i < limit; i++) {
                const spot = shuffled[i];
                const placement = this.resolveChestPlacement(spot.x, spot.z);
                if (!placement) continue;

                const chest = this.createChest(placement.x, placement.y, placement.z, spot.grade || 'house');
                this.chests.push(chest);
                occupied.add(keyFor(placement.x, placement.z));

                // Даем браузеру "прододхнуть" каждые 25 сундуков
                if (i > 0 && i % 25 === 0) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
            }
        }

        if (floorTiles.length && this.chests.length < chestCount) {
            const shuffled = [...floorTiles].sort(() => Math.random() - 0.5);
            const limit = shuffled.length;
            for (let i = 0; i < limit; i++) {
                if (this.chests.length >= chestCount) break;
                const tile = shuffled[i];
                const key = keyFor(tile.x, tile.z);
                if (occupied.has(key)) continue;
                const y = this.getChestPlacementY(tile.x, tile.z);
                if (y < this.mapGenerator.waterLevel + 1) continue;
                if (this.mapGenerator.getStructureAtPoint?.(tile.x, tile.z, 3)) continue;
                if (!this.isHiddenSpawn(tile.x, y, tile.z)) continue;
                if (!this.isChestPlacementClear(tile.x, y, tile.z)) continue;
                const chest = this.createChest(tile.x, y, tile.z);
                this.chests.push(chest);
                occupied.add(key);
                if (i > 0 && i % 25 === 0) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
            }
            console.log(`[LootManager] floorTiles path: created ${this.chests.length} chests`);
            if (this.chests.length === 0) {
                console.log(`[LootManager] floorTiles created 0 chests, falling through to random fallback`);
            } else if (this.chests.length >= chestCount) {
                return;
            }
        }

        console.log(`[LootManager] random fallback path, chestCount=${chestCount}`);
        for (let i = this.chests.length, attempts = 0; i < chestCount && attempts < chestCount * 20; attempts++) {
            const angle = Math.random() * Math.PI * 2;
            const maxRadius = Math.max(42, (Number(this.mapGenerator.halfSize) || 128) - 6);
            const distance = 80 + Math.random() * Math.max(2, maxRadius - 80);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = this.getChestPlacementY(x, z);

            if (y < this.mapGenerator.waterLevel + 1) {
                continue;
            }
            if (this.mapGenerator.getStructureAtPoint?.(x, z, 1)) continue;
            if (!this.isHiddenSpawn(x, y, z)) {
                continue;
            }
            if (!this.isChestPlacementClear(x, y, z)) continue;
            const key = keyFor(x, z);
            if (occupied.has(key)) continue;

            const chest = this.createChest(x, y, z);
            this.chests.push(chest);
            occupied.add(key);
            i++;
            if (i > 0 && i % 25 === 0) {
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }
        console.log(`[LootManager] random fallback: created ${this.chests.length} chests`);
    }

    isHiddenSpawn(x, y, z) {
        const structure = this.mapGenerator.getStructureAtPoint?.(x, z, 0.3);
        if (structure) {
            return true;
        }
        const distFromCenter = Math.sqrt(x * x + z * z);
        if (distFromCenter > 160) {
            return Math.random() < 0.8;
        }
        if (this.mapGenerator.isBiomeAt?.(x, z, 'lava')) {
            return Math.random() < 0.7;
        }
        if (this.mapGenerator.isBiomeAt?.(x, z, 'water')) {
            return Math.random() < 0.5;
        }
        const nearbyStructures = this.mapGenerator.getNearbyStructures?.(x, z, 6) || [];
        if (nearbyStructures.length > 0) return true;
        // Fallback: allow some chests far from center even without nearby structures
        if (distFromCenter > 50) {
            return Math.random() < 0.4;
        }
        return false;
    }

    createChest(x, y, z, grade = 'house') {
        const group = new THREE.Group();
        const { bodyMat, lidMat, bandMat, metalMat } = this.chestMaterials;

        // --- ОПТИМИЗАЦИЯ ---
        const key = 'chest_model';
        let chestModel;
        let lidMesh; // Нужно сохранить ссылку на крышку для анимации

        if (chestResources.geometries[key]) {
            chestModel = chestResources.geometries[key].clone();
            for (const child of [...chestModel.children]) {
                if (child.userData?.isGlow) chestModel.remove(child);
            }
            // Находим крышку в клонированной модели
            lidMesh = chestModel.children.find(child => child.name === 'chest_lid');
        } else {
            // Создаем геометрии
            const bodyGeom = new THREE.BoxGeometry(1.2, 0.7, 0.9);
            bodyGeom.translate(0, 0.35, 0);

            const lidGeom = new THREE.BoxGeometry(1.2, 0.18, 0.92);
            lidGeom.translate(0, 0.72, 0);

            const bandGeom1 = new THREE.BoxGeometry(1.28, 0.08, 0.98);
            bandGeom1.translate(0, 0.48, 0);
            const bandGeom2 = new THREE.BoxGeometry(1.28, 0.08, 0.98);
            bandGeom2.translate(0, 0.18, 0);
            const rimGeom = new THREE.BoxGeometry(1.32, 0.06, 1.02);
            rimGeom.translate(0, 0.76, 0);
            const mergedBandGeom = BufferGeometryUtils.mergeGeometries([bandGeom1, bandGeom2, rimGeom]);

            const latchGeom = new THREE.BoxGeometry(0.18, 0.18, 0.06);
            latchGeom.translate(0, 0.46, 0.48);
            const latchPlateGeom = new THREE.BoxGeometry(0.28, 0.12, 0.04);
            latchPlateGeom.translate(0, 0.32, 0.48);
            const cornerOffsets = [
                [0.56, 0.06, 0.41], [-0.56, 0.06, 0.41],
                [0.56, 0.06, -0.41], [-0.56, 0.06, -0.41],
                [0.56, 0.62, 0.41], [-0.56, 0.62, 0.41],
                [0.56, 0.62, -0.41], [-0.56, 0.62, -0.41]
            ];
            const cornerGeom = new THREE.BoxGeometry(0.12, 0.12, 0.08);
            const cornerGeometries = cornerOffsets.map(([ox, oy, oz]) => {
                const g = cornerGeom.clone();
                g.translate(ox, oy, oz);
                return g;
            });
            const mergedMetalGeom = BufferGeometryUtils.mergeGeometries([latchGeom, latchPlateGeom, ...cornerGeometries]);

            // Создаем меши
            const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
            bodyMesh.castShadow = true;
            lidMesh = new THREE.Mesh(lidGeom, lidMat);
            lidMesh.name = 'chest_lid'; // Присваиваем имя для легкого поиска
            lidMesh.castShadow = true;
            const bandMesh = new THREE.Mesh(mergedBandGeom, bandMat);
            const metalMesh = new THREE.Mesh(mergedMetalGeom, metalMat);

            chestModel = new THREE.Group();
            chestModel.add(bodyMesh, lidMesh, bandMesh, metalMesh);
            chestResources.geometries[key] = chestModel.clone(); // Кэшируем
        }

        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 4, 4),
            new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.3,
                depthWrite: false
            })
        );
        glow.userData.isGlow = true;
        glow.visible = false;
        glow.position.y = 1.2;
        chestModel.add(glow);

        chestModel.position.set(x, y, z);
        chestModel.userData.isChest = true;
        chestModel.userData.mapGenerated = true;
        chestModel.userData.isOpen = false;
        chestModel.userData.grade = grade;
        chestModel.userData.claimedBy = null;
        chestModel.userData.claimExpireAt = 0;
        // Disable frustum culling to prevent flickering during camera movement
        chestModel.traverse(child => {
            if (child.isMesh) child.frustumCulled = false;
        });
        const rareChest = grade === 'hangar' || grade === 'train';
        let generatedLoot = this.generateLoot(rareChest);
        if (grade === 'train') {
            const trainRoll = Math.random();
            if (trainRoll < 0.42) generatedLoot = { type: 'weapon', weaponType: 'laser' };
            else if (trainRoll < 0.72) generatedLoot = { type: 'weapon', weaponType: 'flamethrower' };
            else if (trainRoll < 0.9) generatedLoot = { type: 'weapon', weaponType: 'machinegun' };
            else if (trainRoll < 0.98) generatedLoot = { type: 'weapon', weaponType: 'rifle' };
            else generatedLoot = { type: 'ammo', amount: 24 + Math.floor(Math.random() * 18) };
        }
        chestModel.userData.loot = generatedLoot;
        chestModel.userData.glow = glow;
        chestModel.userData.lid = lidMesh; // Сохраняем ссылку на крышку

        this.scene.add(chestModel);
        return chestModel;
    }

    nowSeconds() {
        return performance.now() / 1000;
    }

    clearExpiredClaim(chest) {
        const ud = chest?.userData;
        if (!ud) return;
        if (!ud.claimedBy) return;
        if ((ud.claimExpireAt || 0) > this.nowSeconds()) return;
        ud.claimedBy = null;
        ud.claimExpireAt = 0;
    }

    isChestClaimedByOther(chest, actorId) {
        const ud = chest?.userData;
        if (!ud || ud.isOpen) return false;
        this.clearExpiredClaim(chest);
        return !!ud.claimedBy && ud.claimedBy !== actorId;
    }

    claimChest(chest, actorId, ttl = this.claimTTL) {
        if (!chest?.userData || !actorId || chest.userData.isOpen) return false;
        this.clearExpiredClaim(chest);
        if (chest.userData.claimedBy && chest.userData.claimedBy !== actorId) return false;
        chest.userData.claimedBy = actorId;
        chest.userData.claimExpireAt = this.nowSeconds() + Math.max(0.5, ttl || this.claimTTL);
        return true;
    }

    rebuildChestIndex() {
        this.chestIndex.clear();
        for (const chest of this.chests) {
            this.addChestToIndex(chest);
        }
    }

    addChestToIndex(chest) {
        if (!chest?.position) return;
        const size = this.chestCellSize;
        const cx = Math.floor(chest.position.x / size);
        const cz = Math.floor(chest.position.z / size);
        const key = `${cx},${cz}`;
        let bucket = this.chestIndex.get(key);
        if (!bucket) {
            bucket = [];
            this.chestIndex.set(key, bucket);
        }
        bucket.push(chest);
    }

    getNearbyChests(position, radius = 12, onlyClosed = false) {
        if (!position) return [];
        const result = [];
        const r2 = radius * radius;
        const size = this.chestCellSize;
        const minCx = Math.floor((position.x - radius) / size);
        const maxCx = Math.floor((position.x + radius) / size);
        const minCz = Math.floor((position.z - radius) / size);
        const maxCz = Math.floor((position.z + radius) / size);

        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cz = minCz; cz <= maxCz; cz++) {
                const bucket = this.chestIndex.get(`${cx},${cz}`);
                if (!bucket) continue;
                for (const chest of bucket) {
                    if (!chest?.position) continue;
                    this.clearExpiredClaim(chest);
                    if (onlyClosed && chest.userData?.isOpen) continue;
                    const dx = chest.position.x - position.x;
                    const dz = chest.position.z - position.z;
                    if (dx * dx + dz * dz <= r2) {
                        result.push(chest);
                    }
                }
            }
        }
        return result;
    }

    getNearestClosedChest(position, radius = 4.2) {
        const nearby = this.getNearbyChests(position, radius, true);
        let nearest = null;
        let bestDistSq = radius * radius;
        for (const chest of nearby) {
            const dx = chest.position.x - position.x;
            const dz = chest.position.z - position.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                nearest = chest;
            }
        }
        return nearest;
    }

    createChestMaterials() {
        const bodyTex = this.createChestTexture('#8b5a2b', '#6f3f1c', '#3a1f0c');
        const lidTex = this.createChestTexture('#7b4a24', '#5a3216', '#2a160a');
        bodyTex.wrapS = bodyTex.wrapT = THREE.RepeatWrapping;
        lidTex.wrapS = lidTex.wrapT = THREE.RepeatWrapping;
        bodyTex.repeat.set(2, 2);
        lidTex.repeat.set(2, 2);

        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: bodyTex,
            roughness: 0.85,
            metalness: 0.05
        });
        const lidMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: lidTex,
            roughness: 0.9,
            metalness: 0.05
        });
        const bandMat = new THREE.MeshStandardMaterial({
            color: 0x8e9aa2,
            roughness: 0.35,
            metalness: 0.6
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0xcfd8dc,
            metalness: 0.9,
            roughness: 0.15
        });

        return { bodyMat, lidMat, bandMat, metalMat };
    }

    createChestTexture(primary, secondary, dark) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = primary;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = secondary;
        for (let x = 0; x < canvas.width; x += 12) {
            ctx.fillRect(x, 0, 7, canvas.height);
        }

        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(10, 10, 10, 0.45)';
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

        ctx.strokeStyle = 'rgba(20, 20, 20, 0.5)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(canvas.width, 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 52);
        ctx.lineTo(canvas.width, 52);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    generateLoot(rare = false) {
        if (rare) {
            const rareRoll = Math.random();
            if (rareRoll < 0.4) return { type: 'weapon', weaponType: 'laser' };
            if (rareRoll < 0.7) return { type: 'weapon', weaponType: 'flamethrower' };
            if (rareRoll < 0.87) return { type: 'weapon', weaponType: 'machinegun' };
            if (rareRoll < 0.95) return { type: 'weapon', weaponType: 'shotgun' };
            if (rareRoll < 0.985) return { type: 'armor', amount: 60 + Math.random() * 40 };
            return { type: 'heal', amount: 55 };
        }

        // Улучшенные шансы: больше хорошего оружия, меньше хлама
        const rand = Math.random();
        if (rand < 0.06) { // 6% для лазера (было 2%)
            return { type: 'weapon', weaponType: 'laser' };
        } else if (rand < 0.16) { // 10% для огнемета
            return { type: 'weapon', weaponType: 'flamethrower' };
        } else if (rand < 0.30) { // 14% для дробовика (было 13%)
            return { type: 'weapon', weaponType: 'shotgun' };
        } else if (rand < 0.42) { // 12% для лука (было 11%)
            return { type: 'weapon', weaponType: 'bow' };
        } else if (rand < 0.56) { // 14% для пистолета (было 24%)
            return { type: 'weapon', weaponType: 'pistol' };
        } else if (rand < 0.74) { // 18% для винтовки (было 14%)
            return { type: 'weapon', weaponType: 'rifle' };
        } else if (rand < 0.88) { // 14% для пулемета (было 8%)
            return { type: 'weapon', weaponType: 'machinegun' };
        } else if (rand < 0.93) { // 5% для аптечки
            return { type: 'heal', amount: 40 + Math.random() * 25 };
        } else if (rand < 0.97) { // 4% для патронов
            return { type: 'ammo', amount: 10 + Math.floor(Math.random() * 9) };
        } else { // 3% для брони
            return { type: 'armor', amount: 25 + Math.random() * 25 };
        }
    }

    getPreferredAmmoWeapon(entity) {
        if (!entity?.inventory?.getItems) return null;
        const selected = entity.currentWeapon;
        if (selected?.ammo !== null && selected?.ammo !== undefined) {
            return selected;
        }
        const ranged = entity.inventory.getItems().find(item => item && item.ammo !== null && item.ammo !== undefined);
        return ranged || null;
    }

    createBonusAmmo(entity, rare = false) {
        const preferred = this.getPreferredAmmoWeapon(entity);
        if (!preferred) return null;
        const amount = rare
            ? 8 + Math.floor(Math.random() * 8)
            : 4 + Math.floor(Math.random() * 6);
        return {
            weaponType: preferred.type,
            amount
        };
    }

    adaptLootForEntity(baseLoot, entity, rare = false) {
        if (!baseLoot) return null;
        const loot = { ...baseLoot };
        const bonusAmmo = this.createBonusAmmo(entity, rare);
        if (bonusAmmo && (loot.type === 'weapon' || loot.type === 'armor' || loot.type === 'ammo')) {
            loot.bonusAmmo = bonusAmmo;
        }
        if (loot.type === 'ammo' && bonusAmmo) {
            loot.weaponType = bonusAmmo.weaponType;
            loot.amount = Math.max(loot.amount || 0, bonusAmmo.amount + 2);
        }
        return loot;
    }

    checkNearbyChests(position, audioSynth) {
        const checkDistance = 15;
        const nearby = this.getNearbyChests(position, checkDistance, true);
        const nextActive = new Set();

        for (const chest of nearby) {
            nextActive.add(chest);
            if (chest.userData.glow) {
                chest.userData.glow.visible = true;
            }
            if (audioSynth && !chest.userData.nearHintPlayed) {
                audioSynth.playChestNearby();
                chest.userData.nearHintPlayed = true;
            }
        }

        for (const chest of this.activeGlowChests) {
            if (nextActive.has(chest)) continue;
            if (chest?.userData?.glow) {
                chest.userData.glow.visible = false;
            }
            if (chest?.userData) {
                chest.userData.nearHintPlayed = false;
            }
        }

        this.activeGlowChests = nextActive;
    }

    tryOpenChest(chest, entity, audioSynth) {
        if (chest.userData.isOpen) return null;
        const dx = entity.position.x - chest.position.x;
        const dz = entity.position.z - chest.position.z;
        if ((dx * dx + dz * dz) > (3.8 * 3.8)) return null;

        chest.userData.isOpen = true;
        chest.userData.claimedBy = null;
        chest.userData.claimExpireAt = 0;
        this.activeGlowChests.delete(chest);
        const lid = chest.userData.lid;
        if (lid) {
            lid.rotation.x = -Math.PI / 3;
        }

        if (chest.userData.glow) {
            chest.userData.glow.visible = false;
        }

        if (audioSynth) {
            audioSynth.playChestOpen(chest.position);
        }

        if (entity?.stats) {
            entity.stats.loot += 1;
        }
        this.lootCount += 1;
        if (chest.userData.isSupplyDrop) {
            const drop = this.supplyDrops.find(d => d.chest === chest);
            if (drop?.beam) {
                this.scene.remove(drop.beam);
            }
        }
        return this.adaptLootForEntity(chest.userData.loot, entity, chest.userData.isSupplyDrop);
    }

    resetChest(chest, loot = null) {
        if (!chest?.userData?.isChest) return false;
        chest.userData.isOpen = false;
        chest.userData.claimedBy = null;
        chest.userData.claimExpireAt = 0;
        chest.userData.loot = loot || this.generateLoot(!!chest.userData.isSupplyDrop);
        chest.userData.soundPlayed = false;
        if (chest.userData.lid) {
            chest.userData.lid.rotation.x = 0;
        }
        if (chest.userData.glow) {
            chest.userData.glow.visible = false;
        }
        return true;
    }

    refillOpenedChests(count = 8) {
        const candidates = this.chests.filter(chest => chest?.userData?.isOpen && !chest.userData.isSupplyDrop);
        if (!candidates.length) return 0;
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        const limit = Math.min(count, shuffled.length);
        for (let i = 0; i < limit; i++) {
            this.resetChest(shuffled[i]);
        }
        return limit;
    }

    getChests() {
        return this.chests;
    }

    setLootDensity(multiplier = 1) {
        this.lootDensity = Math.max(0.3, Math.min(1, multiplier));
        if (this.chests.length) {
            const keep = Math.floor(this.chests.length * this.lootDensity);
            const toRemove = this.chests.slice(keep);
            for (const chest of toRemove) {
                this.scene.remove(chest);
            }
            this.chests = this.chests.slice(0, keep);
            this.rebuildChestIndex();
        }
    }

    spawnSupplyDrop(position) {
        const drop = this.createChest(position.x, position.y, position.z);
        this.addChestToIndex(drop);
        drop.userData.isSupplyDrop = true;
        drop.userData.loot = this.generateLoot(true);

        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.8, 12, 8, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.45 })
        );
        beam.position.set(position.x, position.y + 6.5, position.z);
        beam.userData.isSupplyDropBeam = true;
        this.scene.add(beam);
        this.supplyDrops.push({ chest: drop, beam });
        return drop;
    }
}

