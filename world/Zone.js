import * as THREE from "../node_modules/three/build/three.module.js";

export class Zone {
    constructor(scene, mapSize) {
        this.scene = scene;
        this.mapSize = mapSize;
        this.currentRadius = mapSize / 2 + 1;
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
            this.ringMesh.scale.set(this.currentRadius, 1, this.currentRadius);
        }
    }

    createZone() {
        const material = new THREE.MeshBasicMaterial({
            color: 0x4fc3ff,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
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
        this.scene.add(this.zoneMesh);
        this.syncVisuals();

        const ringPoints = [
            new THREE.Vector3(-1, 0, -1),
            new THREE.Vector3(1, 0, -1),
            new THREE.Vector3(1, 0, 1),
            new THREE.Vector3(-1, 0, 1)
        ];
        const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
        const ringMat = new THREE.LineBasicMaterial({
            color: 0x4fc3ff,
            transparent: true,
            opacity: 1.0
        });
        this.ringMesh = new THREE.LineLoop(ringGeo, ringMat);
        this.ringMesh.position.y = 0.5;
        this.ringMesh.scale.set(this.currentRadius, 1, this.currentRadius);
        this.scene.add(this.ringMesh);
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
            const pulse = 0.9 + Math.sin(performance.now() * 0.004) * 0.08;
            this.ringMesh.material.opacity = Math.max(0.75, pulse);
        }
        if (this.zoneMesh) {
            const pulse = 0.2 + Math.sin(performance.now() * 0.003) * 0.04;
            for (const wall of this.zoneMesh.children) wall.material.opacity = Math.max(0.14, pulse);
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
