﻿import * as THREE from 'three';
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
        this.activeGlowChests = new Set();
        this.chestMaterials = this.createChestMaterials();
        this.chestReady = false;
        this.claimTTL = 2.4;
        // Defer chest generation to next frame to avoid freezing
        requestAnimationFrame(() => {
            try {
                this.generateChests();
                this.rebuildChestIndex();
                this.chestReady = true;
            } catch (e) {
                console.error('[LootManager] Chest generation failed:', e.message);
                this.chestReady = true;
            }
        });
    }

    getChestPlacementY(x, z) {
        const structure = this.mapGenerator.getStructureAtPoint?.(x, z, 0.2);
        // Inside buildings we anchor to terrain height so chests do not end up on roof/floor colliders.
        const baseY = structure
            ? (this.mapGenerator.getHeightAt?.(x, z) ?? 0)
            : (this.mapGenerator.getSurfaceHeightAt?.(x, z) ?? this.mapGenerator.getHeightAt(x, z));
        const surfaceY = baseY;
        // Keep chest bottom clearly above floor to avoid half-sunken look
        // on uneven or stepped walkable colliders.
        return surfaceY + 0.38;
    }

    async generateChestsAsync() {
        this.generateChests();
    }

    async generateChests() {
        const floorTiles = this.mapGenerator.getFloorTiles?.() || [];
        const targetByMapSize = Math.floor(Math.max(140, floorTiles.length * (this.isMobile ? 0.08 : 0.12)));
        const chestCount = Math.max(this.isMobile ? 150 : 220, Math.floor(targetByMapSize * this.lootDensity));
        const spots = this.mapGenerator.getChestSpots?.() || [];
  
        if (spots.length > 0) {
            const shuffled = [...spots].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);

            for (let i = 0; i < limit; i++) {
                const spot = shuffled[i];
                const y = this.getChestPlacementY(spot.x, spot.z);
                if (y < this.mapGenerator.waterLevel + 1) continue;
                const chest = this.createChest(spot.x, y, spot.z, spot.grade || 'house');
                this.chests.push(chest);
                this.addChestToIndex(chest);
                if (i % 2 === 0) await new Promise(r => setTimeout(r, 200));
            }
            if (this.chests.length > 0) {
                this.rebuildChestIndex();
                return;
            }
        }

        if (floorTiles.length) {
            const shuffled = [...floorTiles].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);
            for (let i = 0; i < limit; i++) {
                const tile = shuffled[i];
                const y = this.getChestPlacementY(tile.x, tile.z);
                const chest = this.createChest(tile.x, y, tile.z);
                this.chests.push(chest);
                this.addChestToIndex(chest);
                if (i % 2 === 0) await new Promise(r => setTimeout(r, 200));
            }
            this.rebuildChestIndex();
            return;
        }

        let failCount = 0;
        for (let i = 0; i < chestCount && failCount < chestCount * 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 150;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = this.getChestPlacementY(x, z);

            if (y < this.mapGenerator.waterLevel + 1) {
                failCount++;
                continue;
            }

            const chest = this.createChest(x, y, z);
            this.chests.push(chest);
            this.addChestToIndex(chest);
            if (i % 2 === 0) await new Promise(r => setTimeout(r, 200));
        }
        this.rebuildChestIndex();
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
            chestResources.geometries[key] = chestModel; // Кэшируем
        }

        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.3,
                visible: false
            })
        );
        glow.position.y = 1.2;
        chestModel.add(glow);

        chestModel.position.set(x, y, z);
        chestModel.userData.isChest = true;
        chestModel.userData.isOpen = false;
        chestModel.userData.grade = grade;
        chestModel.userData.claimedBy = null;
        chestModel.userData.claimExpireAt = 0;
        const rareChest = grade === 'hangar';
        let generatedLoot = this.generateLoot(rareChest);
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

        return new THREE.CanvasTexture(canvas);
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

        // Предыдущая логика генерации добычи была запутанной и содержала недостижимый код.
        // Эта версия использует понятную цепочку "else if", что упрощает понимание и настройку вероятностей.
        // Вероятности сохранены близкими к первоначальному замыслу.
        const rand = Math.random();
        if (rand < 0.02) { // 2% для лазера
            return { type: 'weapon', weaponType: 'laser' };
        } else if (rand < 0.12) { // 10% для огнемета
            return { type: 'weapon', weaponType: 'flamethrower' };
        } else if (rand < 0.25) { // 13% для дробовика
            return { type: 'weapon', weaponType: 'shotgun' };
        } else if (rand < 0.36) { // 11% для лука
            return { type: 'weapon', weaponType: 'bow' };
        } else if (rand < 0.6) { // 24% для пистолета
            return { type: 'weapon', weaponType: 'pistol' };
        } else if (rand < 0.74) { // 14% для винтовки
            return { type: 'weapon', weaponType: 'rifle' };
        } else if (rand < 0.84) { // 10% для пулемета
            return { type: 'weapon', weaponType: 'machinegun' };
        } else if (rand < 0.9) { // 6% для аптечки
            return { type: 'heal', amount: 40 + Math.random() * 25 };
        } else if (rand < 0.95) { // 5% для патронов
            return { type: 'ammo', amount: 10 + Math.floor(Math.random() * 9) };
        } else { // 5% для брони
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
            audioSynth.playChestOpen();
        }

        if (entity?.stats) {
            entity.stats.loot += 1;
        }
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

