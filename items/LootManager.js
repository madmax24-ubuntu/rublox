import * as THREE from 'three';
import { Weapon } from './Weapon.js';

export class LootManager {
    constructor(scene, mapGenerator) {
        this.scene = scene;
        this.mapGenerator = mapGenerator;
        this.chests = [];
        this.chestMaterials = this.createChestMaterials();
        this.generateChests();
    }

    generateChests() {
        const chestCount = 900;
        const spots = this.mapGenerator.getChestSpots?.() || [];

        if (spots.length > 0) {
            const shuffled = [...spots].sort(() => Math.random() - 0.5);
            const limit = Math.min(chestCount, shuffled.length);

            for (let i = 0; i < limit; i++) {
                const spot = shuffled[i];
                const y = this.mapGenerator.getHeightAt(spot.x, spot.z) + 0.5;
                if (y < this.mapGenerator.waterLevel + 1) continue;
                if (this.mapGenerator.isChestClear && !this.mapGenerator.isChestClear(spot.x, spot.z, 3)) {
                    continue;
                }
                const chest = this.createChest(spot.x, y, spot.z);
                this.chests.push(chest);
            }
            return;
        }

        for (let i = 0; i < chestCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 150;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const y = this.mapGenerator.getHeightAt(x, z) + 0.5;

            if (y < this.mapGenerator.waterLevel + 1) {
                i--;
                continue;
            }
            if (this.mapGenerator.isChestClear && !this.mapGenerator.isChestClear(x, z, 3)) {
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
            new THREE.BoxGeometry(1, 0.8, 1),
            bodyMat
        );
        body.position.y = 0.4;
        body.castShadow = true;
        group.add(body);

        const lid = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.1, 1),
            lidMat
        );
        lid.position.y = 0.85;
        lid.castShadow = true;
        group.add(lid);

        const ring1 = new THREE.Mesh(
            new THREE.TorusGeometry(0.6, 0.05, 8, 16),
            metalMat
        );
        ring1.rotation.x = Math.PI / 2;
        ring1.position.y = 0.4;
        group.add(ring1);

        const ring2 = new THREE.Mesh(
            new THREE.TorusGeometry(0.6, 0.05, 8, 16),
            metalMat
        );
        ring2.rotation.x = Math.PI / 2;
        ring2.position.y = 0.8;
        group.add(ring2);

        const band = new THREE.Mesh(
            new THREE.BoxGeometry(1.02, 0.08, 1.02),
            bandMat
        );
        band.position.y = 0.56;
        group.add(band);

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
        const bodyTex = this.createChestTexture('#8a5a2b', '#6b3f1f');
        const lidTex = this.createChestTexture('#7b4a24', '#5e3518');
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
            color: 0x2a2a2a,
            roughness: 0.6,
            metalness: 0.2
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,
            metalness: 0.9,
            roughness: 0.2
        });

        return { bodyMat, lidMat, bandMat, metalMat };
    }

    createChestTexture(primary, secondary) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = primary;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = secondary;
        for (let y = 0; y < canvas.height; y += 8) {
            ctx.fillRect(0, y, canvas.width, 4);
        }

        ctx.strokeStyle = 'rgba(20, 12, 6, 0.35)';
        for (let x = 0; x < canvas.width; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        return new THREE.CanvasTexture(canvas);
    }

    generateLoot() {
        const rand = Math.random();

        if (rand < 0.05) {
            return { type: 'weapon', weaponType: 'laser' };
        }

        if (rand < 0.20) {
            return { type: 'weapon', weaponType: 'bow' };
        }

        if (rand < 0.60) {
            return { type: 'weapon', weaponType: 'knife' };
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
        if (distance > 3) return null;

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

        return chest.userData.loot;
    }

    getChests() {
        return this.chests;
    }
}
