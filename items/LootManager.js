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
        this.chestMaterials = this.createChestMaterials();
        this.chestReady = false;
        this.generateChestsAsync().then(() => {
            this.chestReady = true;
        }).catch(() => {
            this.chestReady = true;
        });
    }
    
    generateChests() {
        const chestCount = Math.max(80, Math.floor(1400 * this.lootDensity));
        const spots = this.mapGenerator.getChestSpots?.() || [];

        if (spots.length > 0) {
            const shuffled = [...spots].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);

            for (let i = 0; i < limit; i++) {
                const spot = shuffled[i];
                const y = this.mapGenerator.getHeightAt(spot.x, spot.z) + 0.06;
                if (y < this.mapGenerator.waterLevel + 1) continue;
                const chest = this.createChest(spot.x, y, spot.z, spot.grade || 'house');
                this.chests.push(chest);
            }
            if (this.chests.length > 0) return;
        }

        const floorTiles = this.mapGenerator.getFloorTiles?.() || [];
        if (floorTiles.length) {
            const shuffled = [...floorTiles].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);
            for (let i = 0; i < limit; i++) {
                const tile = shuffled[i];
                const y = this.mapGenerator.getHeightAt(tile.x, tile.z) + 0.06;
                const chest = this.createChest(tile.x, y, tile.z);
                this.chests.push(chest);
            }
            return;
        }

        for (let i = 0; i < chestCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 150;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = this.mapGenerator.getHeightAt(x, z) + 0.06;

            if (y < this.mapGenerator.waterLevel + 1) {
                i--;
                continue;
            }

            const chest = this.createChest(x, y, z);
            this.chests.push(chest);
        }
    }

    // Асинхронная версия generateChests для устранения фризов при старте
    async generateChestsAsync() {
        const chestCount = Math.max(80, Math.floor(1400 * this.lootDensity));
        const spots = this.mapGenerator.getChestSpots?.() || [];

        if (spots.length > 0) {
            const shuffled = [...spots].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);

            for (let i = 0; i < limit; i++) {
                const spot = shuffled[i];
                const y = this.mapGenerator.getHeightAt(spot.x, spot.z) + 0.06;
                if (y < this.mapGenerator.waterLevel + 1) continue;
                
                const chest = this.createChest(spot.x, y, spot.z, spot.grade || 'house');
                this.chests.push(chest);

                // Даем браузеру "продохнуть" каждые 25 сундуков
                if (i > 0 && i % 25 === 0) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
            }
            if (this.chests.length > 0) return;
        }

        const floorTiles = this.mapGenerator.getFloorTiles?.() || [];
        if (floorTiles.length) {
            const shuffled = [...floorTiles].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);
            for (let i = 0; i < limit; i++) {
                const tile = shuffled[i];
                const y = this.mapGenerator.getHeightAt(tile.x, tile.z) + 0.06;
                const chest = this.createChest(tile.x, y, tile.z);
                this.chests.push(chest);
                if (i > 0 && i % 25 === 0) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
            }
            return;
        }

        for (let i = 0; i < chestCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 150;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = this.mapGenerator.getHeightAt(x, z) + 0.06;

            if (y < this.mapGenerator.waterLevel + 1) {
                i--;
                continue;
            }

            const chest = this.createChest(x, y, z);
            this.chests.push(chest);
            if (i > 0 && i % 25 === 0) {
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }
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
            const mergedBandGeom = BufferGeometryUtils.mergeBufferGeometries([bandGeom1, bandGeom2, rimGeom]);

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
            const mergedMetalGeom = BufferGeometryUtils.mergeBufferGeometries([latchGeom, latchPlateGeom, ...cornerGeometries]);

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
        chestModel.userData.loot = this.generateLoot(grade === 'hangar');
        chestModel.userData.glow = glow;
        chestModel.userData.lid = lidMesh; // Сохраняем ссылку на крышку

        this.scene.add(chestModel);
        return chestModel;
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
            if (rareRoll < 0.95) return { type: 'weapon', weaponType: 'shotgun' };
            return { type: 'armor', amount: 60 + Math.random() * 40 };
        }

        // Предыдущая логика генерации добычи была запутанной и содержала недостижимый код.
        // Эта версия использует понятную цепочку "else if", что упрощает понимание и настройку вероятностей.
        // Вероятности сохранены близкими к первоначальному замыслу.
        const rand = Math.random();
        if (rand < 0.02) { // 2% для лазера (ранее был недостижим)
            return { type: 'weapon', weaponType: 'laser' };
        } else if (rand < 0.12) { // 10% для огнемета
            return { type: 'weapon', weaponType: 'flamethrower' };
        } else if (rand < 0.25) { // 13% для дробовика
            return { type: 'weapon', weaponType: 'shotgun' };
        } else if (rand < 0.40) { // 15% для лука
            return { type: 'weapon', weaponType: 'bow' };
        } else if (rand < 0.55) { // 15% для топора
            return { type: 'weapon', weaponType: 'axe' };
        } else if (rand < 0.68) { // 13% для пистолета
            return { type: 'weapon', weaponType: 'pistol' };
        } else if (rand < 0.78) { // 10% для винтовки
            return { type: 'weapon', weaponType: 'rifle' };
        } else if (rand < 0.90) { // 12% для патронов
            return { type: 'ammo', amount: 10 + Math.floor(Math.random() * 9) };
        } else { // 10% для брони
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

        for (const chest of this.chests) {
            if (chest.userData.isOpen) continue;

            const chestPos = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
            const distance = position.distanceTo(chestPos);

            if (distance < checkDistance) {
                if (chest.userData.glow) {
                    chest.userData.glow.visible = true;
                }

                if (audioSynth && !chest.userData.soundPlayed) {
                    audioSynth.playChestNearby();
                    chest.userData.soundPlayed = true;
                    setTimeout(() => {
                        chest.userData.soundPlayed = false;
                    }, 2000);
                }
            } else {
                if (chest.userData.glow) {
                    chest.userData.glow.visible = false;
                }
            }
        }
    }

    tryOpenChest(chest, entity, audioSynth) {
        if (chest.userData.isOpen) return null;

        const chestPos = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
        const distance = entity.position.distanceTo(chestPos);
        if (distance > 3.8) return null;

        chest.userData.isOpen = true;
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
        }
    }

    spawnSupplyDrop(position) {
        const drop = this.createChest(position.x, position.y, position.z);
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

