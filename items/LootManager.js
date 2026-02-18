import * as THREE from 'three';
import { Weapon } from './Weapon.js';

export class LootManager {
    constructor(scene, mapGenerator) {
        this.scene = scene;
        this.mapGenerator = mapGenerator;
        this.chests = [];
        this.supplyDrops = [];
        this.lootDensity = 1;
        this.chestMaterials = this.createChestMaterials();
        this.generateChests();
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
                const chest = this.createChest(spot.x, y, spot.z);
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

    createChest(x, y, z) {
        const group = new THREE.Group();
        const { bodyMat, lidMat, bandMat, metalMat } = this.chestMaterials;

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.7, 0.9),
            bodyMat
        );
        body.position.y = 0.35;
        body.castShadow = true;
        group.add(body);

        const lid = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.18, 0.92),
            lidMat
        );
        lid.position.y = 0.72;
        lid.castShadow = true;
        group.add(lid);

        const band = new THREE.Mesh(
            new THREE.BoxGeometry(1.28, 0.08, 0.98),
            bandMat
        );
        band.position.y = 0.48;
        group.add(band);

        const band2 = new THREE.Mesh(
            new THREE.BoxGeometry(1.28, 0.08, 0.98),
            bandMat
        );
        band2.position.y = 0.18;
        group.add(band2);

        const rimGeo = new THREE.BoxGeometry(1.32, 0.06, 1.02);
        const rimTop = new THREE.Mesh(rimGeo, bandMat);
        rimTop.position.y = 0.76;
        group.add(rimTop);

        const latch = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 0.06),
            metalMat
        );
        latch.position.set(0, 0.46, 0.48);
        group.add(latch);

        const latchPlate = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.12, 0.04),
            metalMat
        );
        latchPlate.position.set(0, 0.32, 0.48);
        group.add(latchPlate);

        const cornerGeo = new THREE.BoxGeometry(0.12, 0.12, 0.08);
        const cornerOffsets = [
            [0.56, 0.06, 0.41], [-0.56, 0.06, 0.41],
            [0.56, 0.06, -0.41], [-0.56, 0.06, -0.41],
            [0.56, 0.62, 0.41], [-0.56, 0.62, 0.41],
            [0.56, 0.62, -0.41], [-0.56, 0.62, -0.41]
        ];
        for (const [ox, oy, oz] of cornerOffsets) {
            const corner = new THREE.Mesh(cornerGeo, metalMat);
            corner.position.set(ox, oy, oz);
            group.add(corner);
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
        group.add(glow);

        group.position.set(x, y, z);
        group.userData.isChest = true;
        group.userData.isOpen = false;
        group.userData.loot = this.generateLoot();
        group.userData.glow = glow;

        this.scene.add(group);
        return group;
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
        const rand = Math.random();

        if (rand < 0.05) {
            return { type: 'weapon', weaponType: 'laser' };
        }

        if (rand < 0.12) {
            return { type: 'weapon', weaponType: 'flamethrower' };
        }

        if (rand < 0.2) {
            return { type: 'weapon', weaponType: 'shotgun' };
        }

        if (rand < 0.3) {
            return { type: 'weapon', weaponType: 'bow' };
        }

        if (rand < 0.42) {
            return { type: 'weapon', weaponType: 'knife' };
        }

        if (rand < 0.54) {
            return { type: 'weapon', weaponType: 'axe' };
        }

        if (rand < 0.64) {
            return { type: 'weapon', weaponType: 'spear' };
        }

        if (rand < 0.72) {
            return { type: 'weapon', weaponType: 'pistol' };
        }

        if (rand < 0.78) {
            return { type: 'weapon', weaponType: 'rifle' };
        }

        return { type: 'armor', amount: 25 + Math.random() * 25 };
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

        const lid = chest.children.find(child => Math.abs(child.position.y - 0.85) < 0.1);
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
        return chest.userData.loot;
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
