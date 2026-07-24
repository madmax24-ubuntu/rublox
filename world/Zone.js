import * as THREE from "../node_modules/three/build/three.module.js";

export class Zone {
    constructor(scene, mapSize) {
        this.scene = scene;
        this.mapSize = mapSize;
        this.currentRadius = mapSize / 2 - 0.6;
        this.targetRadius = this.currentRadius;
        this.shrinkSpeed = 0;
        this.damagePerSecond = 22;
        this.zoneMesh = null;
        this.ringMesh = null;
        this.createZone();
    }

    syncVisuals() {
        if (this.zoneMesh) {
            const walls = this.zoneMesh.children;
            walls[0]?.position.set(0, 50, -this.currentRadius);
            walls[1]?.position.set(0, 50, this.currentRadius);
            walls[2]?.position.set(-this.currentRadius, 50, 0);
            walls[3]?.position.set(this.currentRadius, 50, 0);
        }
        if (this.ringMesh) {
            const walls = this.ringMesh.children;
            walls[0]?.position.set(0, 0.08, -this.currentRadius);
            walls[1]?.position.set(0, 0.08, this.currentRadius);
            walls[2]?.position.set(-this.currentRadius, 0.08, 0);
            walls[3]?.position.set(this.currentRadius, 0.08, 0);
        }
    }

    createZone() {
        const material = new THREE.MeshStandardMaterial({
            color: 0xb32612,
            emissive: 0xff2400,
            emissiveIntensity: 1.7,
            roughness: 0.58,
            metalness: 0.04,
            side: THREE.DoubleSide
        });
        this.zoneMesh = new THREE.Group();
        const horizontal = new THREE.BoxGeometry(this.mapSize + 4, 100, 0.8);
        const vertical = new THREE.BoxGeometry(0.8, 100, this.mapSize + 4);
        this.zoneMesh.add(
            new THREE.Mesh(horizontal, material),
            new THREE.Mesh(horizontal, material),
            new THREE.Mesh(vertical, material),
            new THREE.Mesh(vertical, material)
        );
        this.zoneMesh.userData.gameplayBoundary = true;
        this.scene.add(this.zoneMesh);
        this.syncVisuals();

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff5a16,
            transparent: false
        });
        this.ringMesh = new THREE.Group();
        const ringHorizontal = new THREE.BoxGeometry(this.mapSize, 0.12, 0.3);
        const ringVertical = new THREE.BoxGeometry(0.3, 0.12, this.mapSize);
        this.ringMesh.add(
            new THREE.Mesh(ringHorizontal, ringMat),
            new THREE.Mesh(ringHorizontal, ringMat),
            new THREE.Mesh(ringVertical, ringMat),
            new THREE.Mesh(ringVertical, ringMat)
        );
        this.ringMesh.userData.gameplayBoundary = true;
        this.scene.add(this.ringMesh);
        this.syncVisuals();
    }

    update(delta) {
        if (this.currentRadius > this.targetRadius) {
            this.currentRadius = Math.max(
                this.targetRadius,
                this.currentRadius - this.shrinkSpeed * delta
            );
            this.syncVisuals();
        }
        if (this.ringMesh) {
            const pulse = 0.42 + Math.sin(performance.now() * 0.004) * 0.12;
            for (const wall of this.ringMesh.children) wall.material.color.setRGB(1, pulse, 0.035);
        }
        if (this.zoneMesh) {
            const pulse = 1.45 + Math.sin(performance.now() * 0.006) * 0.45;
            for (const wall of this.zoneMesh.children) wall.material.emissiveIntensity = pulse;
        }
    }

    shrink(newRadius) {
        // Zone is static — does not shrink
    }

    setCurrentRadius(radius) {
        this.currentRadius = Math.max(10, radius);
        if (this.targetRadius > this.currentRadius) {
            this.targetRadius = this.currentRadius;
        }
        this.syncVisuals();
    }

    isInsideZone(position) {
        return Math.max(Math.abs(position.x), Math.abs(position.z)) < this.currentRadius;
    }

    getDistanceFromZone(position) {
        return Math.max(0, Math.max(Math.abs(position.x), Math.abs(position.z)) - this.currentRadius);
    }

    getDamage(delta, position = null) {
        if (!position) return this.damagePerSecond * delta;
        const outside = this.getDistanceFromZone(position);
        if (outside <= 0) return 0;
        const scale = 1 + Math.min(7, outside / 12);
        return this.damagePerSecond * scale * delta;
    }

    getCurrentRadius() {
        return this.currentRadius;
    }

    getTargetRadius() {
        return this.targetRadius;
    }
}
