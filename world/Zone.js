import * as THREE from "../node_modules/three/build/three.module.js";

export class Zone {
    constructor(scene, mapSize) {
        this.scene = scene;
        this.mapSize = mapSize;
        this.currentRadius = mapSize / 2;
        this.targetRadius = mapSize / 2;
        this.shrinkSpeed = 1.2;
        this.damagePerSecond = 22;
        this.zoneMesh = null;
        this.ringMesh = null;
        this.createZone();
    }

    syncVisuals() {
        if (this.zoneMesh) {
            this.zoneMesh.scale.set(this.currentRadius, 1, this.currentRadius);
        }
        if (this.ringMesh) {
            this.ringMesh.scale.set(this.currentRadius, 1, this.currentRadius);
        }
    }

    createZone() {
        const geometry = new THREE.CylinderGeometry(1, 1, 200, 48, 1, true);
        const material = new THREE.MeshBasicMaterial({
            color: 0x4fc3ff,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.zoneMesh = new THREE.Mesh(geometry, material);
        this.zoneMesh.position.y = 50;
        this.zoneMesh.scale.set(this.currentRadius, 1, this.currentRadius);
        this.zoneMesh.visible = true;
        this.scene.add(this.zoneMesh);

        const ringPoints = [];
        const ringSegments = 128;
        for (let i = 0; i < ringSegments; i++) {
            const angle = (i / ringSegments) * Math.PI * 2;
            ringPoints.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
        }
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
            this.zoneMesh.material.opacity = Math.max(0.14, pulse);
        }
    }

    shrink(newRadius) {
        this.targetRadius = Math.max(10, newRadius);
    }

    setCurrentRadius(radius) {
        this.currentRadius = Math.max(10, radius);
        if (this.targetRadius > this.currentRadius) {
            this.targetRadius = this.currentRadius;
        }
        this.syncVisuals();
    }

    isInsideZone(position) {
        const distanceFromCenter = Math.sqrt(position.x ** 2 + position.z ** 2);
        return distanceFromCenter < this.currentRadius;
    }

    getDistanceFromZone(position) {
        const distanceFromCenter = Math.sqrt(position.x ** 2 + position.z ** 2);
        return Math.max(0, distanceFromCenter - this.currentRadius);
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
