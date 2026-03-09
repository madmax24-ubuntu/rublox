import * as THREE from 'three';

export class Zone {
    constructor(scene, mapSize) {
        this.scene = scene;
        this.mapSize = mapSize;
        this.currentRadius = mapSize / 2;
        this.targetRadius = mapSize / 2;
        this.shrinkSpeed = 1.2;
        this.damagePerSecond = 3;
        this.zoneMesh = null;
        this.ringMesh = null;
        this.createZone();
    }

    createZone() {
        const geometry = new THREE.CylinderGeometry(1, 1, 200, 32, 1, true);
        const material = new THREE.MeshBasicMaterial({
            color: 0x0000ff,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide
        });

        this.zoneMesh = new THREE.Mesh(geometry, material);
        this.zoneMesh.position.y = 50;
        this.zoneMesh.scale.set(this.currentRadius, 1, this.currentRadius);
        this.scene.add(this.zoneMesh);

        const ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x4fc3ff,
            transparent: true,
            opacity: 0.65
        });
        this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
        this.ringMesh.rotation.x = Math.PI / 2;
        this.ringMesh.position.y = 0.5;
        this.ringMesh.scale.set(this.currentRadius, this.currentRadius, this.currentRadius);
        this.scene.add(this.ringMesh);
    }

    update(delta) {
        if (this.currentRadius > this.targetRadius) {
            this.currentRadius = Math.max(
                this.targetRadius,
                this.currentRadius - this.shrinkSpeed * delta
            );

            if (this.zoneMesh) {
                this.zoneMesh.scale.set(this.currentRadius, 1, this.currentRadius);
            }
            if (this.ringMesh) {
                this.ringMesh.scale.set(this.currentRadius, this.currentRadius, this.currentRadius);
            }
        }
        if (this.ringMesh) {
            const pulse = 0.45 + Math.sin(performance.now() * 0.004) * 0.2;
            this.ringMesh.material.opacity = Math.max(0.2, pulse);
        }
    }

    shrink(newRadius) {
        this.targetRadius = Math.max(10, newRadius);
    }

    isInsideZone(position) {
        const distanceFromCenter = Math.sqrt(position.x ** 2 + position.z ** 2);
        return distanceFromCenter < this.currentRadius;
    }

    getDistanceFromZone(position) {
        const distanceFromCenter = Math.sqrt(position.x ** 2 + position.z ** 2);
        return Math.max(0, distanceFromCenter - this.currentRadius);
    }

    getDamage(delta) {
        return this.damagePerSecond * delta;
    }

    getCurrentRadius() {
        return this.currentRadius;
    }

    getTargetRadius() {
        return this.targetRadius;
    }
}
