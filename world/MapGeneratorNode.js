import * as THREE from 'three';

// Central spawn platform — raised mosaic hub with fountain and 50 spawn pads
const PLATFORM_RADIUS = 55;
const PLATFORM_HEIGHT = 2;
const PLATFORM_TOP_Y = PLATFORM_HEIGHT; // y=2 is the walkable surface
const SPAWN_PAD_COUNT = 100;
const SPAWN_PAD_RADIUS = 46;

export class MapGeneratorNode {
    constructor(scene) {
        this.scene = scene;
        this.spawnPads = [];
    }

    getSpawnPads() {
        return [...this.spawnPads];
    }

    init() {
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x62584c, roughness: 0.94, metalness: 0.02, flatShading: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1 });
        const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS + 1.4, PLATFORM_HEIGHT, 64), baseMat);
        baseMesh.position.set(0, PLATFORM_HEIGHT / 2, 0);
        baseMesh.userData.mapGenerated = true;
        baseMesh.userData.isCornucopia = true;
        this.scene.add(baseMesh);

        const surfaceMat = new THREE.MeshStandardMaterial({
            color: 0xb7aa88, roughness: 0.88, metalness: 0.02,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
        });
        const surface = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_RADIUS - 0.8, PLATFORM_RADIUS - 0.8, 0.22, 64), surfaceMat);
        surface.position.set(0, PLATFORM_TOP_Y + 0.08, 0);
        surface.userData.mapGenerated = true;
        surface.userData.isCornucopia = true;
        this.scene.add(surface);

        this._createStoneRings();

        // === 2. Starburst pattern on platform surface ===
        this._createStarburst();

        // === 3. Fountain on platform ===
        this._createFountain();
        this._createCenterProps();

        // === 4. Spawn pads around platform edge ===
        this._createSpawnPads();
    }

    _createStarburst() {
        const rayCount = 24;
        const innerR = 9;
        const outerR = 39;

        // Vibrant colors — clearly visible against beige platform
        const redMat = new THREE.MeshStandardMaterial({
            color: 0x8f3f2e, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
        });

        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            const nextAngle = ((i + 1) / rayCount) * Math.PI * 2;
            const midAngle = (angle + nextAngle) / 2;

            // Triangle: inner point + two outer points (with gap)
            const gapHalf = (nextAngle - angle) * 0.34;
            const v0x = Math.cos(midAngle) * innerR;
            const v0z = Math.sin(midAngle) * innerR;
            const v1x = Math.cos(midAngle - gapHalf) * outerR;
            const v1z = Math.sin(midAngle - gapHalf) * outerR;
            const v2x = Math.cos(midAngle + gapHalf) * outerR;
            const v2z = Math.sin(midAngle + gapHalf) * outerR;

            // Flat triangle on platform surface (y=2)
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
                v0x, 0, v0z,
                v1x, 0, v1z,
                v2x, 0, v2z
            ]), 3));
            geo.computeVertexNormals();

            const tri = new THREE.Mesh(geo, redMat);
            tri.position.y = PLATFORM_TOP_Y + 0.27;
            tri.userData.mapGenerated = true;
            tri.userData.isCornucopia = true;
            tri.userData.isPOI = true;
            this.scene.add(tri);
        }

        // Inner ring decoration
        const innerRingGeo = new THREE.TorusGeometry(innerR - 0.45, 0.17, 5, 64);
        const innerRingMat = new THREE.MeshStandardMaterial({
            color: 0x6e6252, roughness: 0.8, metalness: 0.05, flatShading: true,
            polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        innerRing.rotation.x = Math.PI / 2;
        innerRing.position.y = PLATFORM_TOP_Y + 0.29;
        innerRing.userData.mapGenerated = true;
        innerRing.userData.isCornucopia = true;
        this.scene.add(innerRing);

        // Outer ring decoration
        const outerRingGeo = new THREE.TorusGeometry(outerR + 0.55, 0.2, 5, 96);
        const outerRingMat = new THREE.MeshStandardMaterial({
            color: 0x766957, roughness: 0.82, metalness: 0.04, flatShading: true,
            polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1
        });
        const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRing.rotation.x = Math.PI / 2;
        outerRing.position.y = PLATFORM_TOP_Y + 0.29;
        outerRing.userData.mapGenerated = true;
        outerRing.userData.isCornucopia = true;
        this.scene.add(outerRing);
    }

    _createStoneRings() {
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xd4c7a3, roughness: 0.9, metalness: 0.01 , polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1});
        const seamMat = new THREE.MeshStandardMaterial({ color: 0x756956, roughness: 0.95 , polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1});
        for (const radius of [8.6, 40.2, 53.8]) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius === 53.8 ? 0.42 : 0.2, 5, 96), radius === 53.8 ? seamMat : ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = PLATFORM_TOP_Y + 0.29;
            ring.userData.mapGenerated = true;
            ring.userData.isCornucopia = true;
            this.scene.add(ring);
        }
        const seamGeo = new THREE.BoxGeometry(0.075, 0.03, 12.6);
        for (let i = 0; i < 48; i++) {
            const angle = i / 48 * Math.PI * 2;
            const seam = new THREE.Mesh(seamGeo, seamMat);
            seam.position.set(Math.cos(angle) * 47, PLATFORM_TOP_Y + 0.275, Math.sin(angle) * 47);
            seam.rotation.y = -angle;
            seam.userData.mapGenerated = true;
            seam.userData.isCornucopia = true;
            this.scene.add(seam);
        }
    }

    _createFountain() {
        const fountain = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x555555, roughness: 0.8, flatShading: true,
            polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1
        });

        // Lower basin (wide)
        const basinGeo = new THREE.CylinderGeometry(6, 7, 1.5, 12);
        const basin = new THREE.Mesh(basinGeo, stoneMat.clone());
        basin.position.y = 0.75;
        fountain.add(basin);

        // Water in lower basin
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x4488FF, emissive: 0x2244AA, emissiveIntensity: 0.3,
            roughness: 0.1, transparent: true, opacity: 0.48, depthWrite: false
        });
        const waterGeo = new THREE.CylinderGeometry(5.8, 5.8, 0.12, 48);
        const water = new THREE.Mesh(waterGeo, waterMat.clone());
        water.position.y = 1.2;
        water.userData.isWater = true;
        fountain.add(water);

        // Central column
        const columnGeo = new THREE.CylinderGeometry(1.5, 2, 4, 8);
        const column = new THREE.Mesh(columnGeo, stoneMat.clone());
        column.position.y = 3;
        fountain.add(column);

        // Upper basin
        const upperBasinGeo = new THREE.CylinderGeometry(3, 2.5, 0.8, 8);
        const upperBasin = new THREE.Mesh(upperBasinGeo, stoneMat.clone());
        upperBasin.position.y = 5.4;
        fountain.add(upperBasin);

        // Water in upper basin
        const upperWaterGeo = new THREE.CylinderGeometry(2.8, 2.8, 0.1, 32);
        const upperWater = new THREE.Mesh(upperWaterGeo, waterMat.clone());
        upperWater.position.y = 5.6;
        upperWater.userData.isWater = true;
        fountain.add(upperWater);

        // Water streams from upper to lower basin
        const streamCount = 12;
        const streams = [];
        for (let i = 0; i < streamCount; i++) {
            const angle = (i / streamCount) * Math.PI * 2;
            const radius = 2.5;
            const streamGeo = new THREE.CylinderGeometry(0.04, 0.06, 3.8, 3);
            const stream = new THREE.Mesh(streamGeo, waterMat.clone());
            stream.position.set(
                Math.cos(angle) * radius,
                3.4,
                Math.sin(angle) * radius
            );
            stream.userData.isWaterStream = true;
            stream.userData.streamAngle = angle;
            stream.userData.streamRadius = radius;
            streams.push(stream);
            fountain.add(stream);
        }
        fountain.userData.streams = streams;

        // Falling drops
        const dropCount = 16;
        const drops = [];
        for (let i = 0; i < dropCount; i++) {
            const streamIndex = i % streamCount;
            const angle = streams[streamIndex].userData.streamAngle;
            const radius = streams[streamIndex].userData.streamRadius + (Math.random() - 0.5) * 0.2;
            const dropGeo = new THREE.SphereGeometry(0.06, 3, 3);
            const drop = new THREE.Mesh(dropGeo, waterMat.clone());
            const startY = 5.4 + Math.random() * 0.3;
            const y = startY + Math.random() * 3.5;
            drop.position.set(
                Math.cos(angle) * radius,
                y,
                Math.sin(angle) * radius
            );
            drop.userData.isWaterDrop = true;
            drop.userData.dropAngle = angle;
            drop.userData.dropRadius = radius;
            drop.userData.dropSpeed = 4 + Math.random() * 3;
            drop.userData.dropStartY = startY;
            drop.userData.dropEndY = 1.2;
            drops.push(drop);
            fountain.add(drop);
        }
        fountain.userData.drops = drops;

        // Splash particles
        const splashCount = 8;
        const splashes = [];
        for (let i = 0; i < splashCount; i++) {
            const angle = (i / splashCount) * Math.PI * 2 + Math.random() * 0.3;
            const radius = 2.3 + Math.random() * 0.5;
            const splashGeo = new THREE.SphereGeometry(0.04, 3, 3);
            const splash = new THREE.Mesh(splashGeo, waterMat.clone());
            splash.position.set(
                Math.cos(angle) * radius,
                1.4 + Math.random() * 0.2,
                Math.sin(angle) * radius
            );
            splash.userData.isSplash = true;
            splash.userData.splashAngle = angle;
            splash.userData.splashRadius = radius;
            splash.userData.splashPhase = Math.random() * Math.PI * 2;
            splashes.push(splash);
            fountain.add(splash);
        }
        fountain.userData.splashes = splashes;

        // Top sphere
        const topGeo = new THREE.SphereGeometry(0.8, 8, 8);
        const topSphere = new THREE.Mesh(topGeo, stoneMat.clone());
        topSphere.position.y = 6.5;
        fountain.add(topSphere);

        // Position fountain on platform surface
        fountain.position.set(0, PLATFORM_TOP_Y, 0);
        fountain.scale.setScalar(3.2);
        fountain.userData.isFountain = true;
        fountain.userData.isCornucopia = true;
        fountain.userData.mapGenerated = true;
        this.scene.add(fountain);
    }

    _createCenterProps() {
        const crateGeo = new THREE.BoxGeometry(1.8, 1.2, 1.5);
        const bandGeo = new THREE.BoxGeometry(1.92, 0.16, 1.62);
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x704421, roughness: 0.88, flatShading: true , polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1});
        const bandMat = new THREE.MeshStandardMaterial({ color: 0x2e2925, roughness: 0.65, metalness: 0.45 , polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1});
        const lootColors = [0x8b4513, 0x2e6f5e, 0x8b1e1e, 0x334f83, 0x76520e];
        for (let i = 0; i < 10; i++) {
            const angle = i / 10 * Math.PI * 2 + 0.18;
            const radius = 10.5 + (i % 2) * 2.2;
            const crate = new THREE.Group();
            const body = new THREE.Mesh(crateGeo, i < 5 ? new THREE.MeshStandardMaterial({ color: lootColors[i], roughness: 0.82, flatShading: true , polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1}) : crateMat);
            body.position.y = 0.6;
            crate.add(body);
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.y = 0.62;
            crate.add(band);
            crate.position.set(Math.cos(angle) * radius, PLATFORM_TOP_Y + 0.22, Math.sin(angle) * radius);
            crate.rotation.y = -angle + (i % 3 - 1) * 0.2;
            crate.userData.mapGenerated = true;
            crate.userData.isCornucopia = true;
            crate.userData.isPOI = true;
            this.scene.add(crate);
        }

        const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 2.3, 6);
        const flameGeo = new THREE.ConeGeometry(0.28, 0.7, 7);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x35251d, roughness: 0.9 , polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1});
        const flameMat = new THREE.MeshStandardMaterial({ color: 0xffbd20, emissive: 0xff5200, emissiveIntensity: 7, roughness: 0.28 });
        for (let i = 0; i < 8; i++) {
            const angle = i / 8 * Math.PI * 2 + Math.PI / 8;
            const torch = new THREE.Group();
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 1.15;
            torch.add(pole);
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.y = 2.55;
            torch.add(flame);
            torch.position.set(Math.cos(angle) * 15.3, PLATFORM_TOP_Y + 0.2, Math.sin(angle) * 15.3);
            torch.userData.mapGenerated = true;
            torch.userData.isCornucopia = true;
            torch.userData.isPOI = true;
            this.scene.add(torch);
        }
    }

    _createSpawnPads() {
        const edgeRadius = SPAWN_PAD_RADIUS;
        const padGeo = new THREE.CylinderGeometry(1.03, 1.12, 0.34, 12);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x241d1a, roughness: 0.82, metalness: 0.18, flatShading: true , polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1});
        const emberGeo = new THREE.CylinderGeometry(0.78, 0.84, 0.07, 12);
        const emberMat = new THREE.MeshStandardMaterial({ color: 0xe83b0c, emissive: 0xff2600, emissiveIntensity: 4.5, roughness: 0.38 });
        const ringGeo = new THREE.TorusGeometry(1.04, 0.12, 4, 12);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff3c00, emissiveIntensity: 5.5, roughness: 0.28 });
        const flameMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0xff5a00, emissiveIntensity: 6, roughness: 0.3, side: THREE.DoubleSide });
        const flameGeo = new THREE.BufferGeometry();
        flameGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            -0.34, 0, 0.22, 0.05, 0, -0.55, 0.38, 0, 0.25,
            -0.18, 0, 0.12, 0.03, 0, -0.28, 0.2, 0, 0.12
        ]), 3));
        flameGeo.computeVertexNormals();

        for (let i = 0; i < SPAWN_PAD_COUNT; i++) {
            const angleStep = Math.PI * 2 / SPAWN_PAD_COUNT;
            const x = Math.cos(i * angleStep) * edgeRadius;
            const z = -Math.sin(i * angleStep) * edgeRadius;

            const pad = new THREE.Group();

            const padMesh = new THREE.Mesh(padGeo, padMat);
            padMesh.position.y = 0.17;
            pad.add(padMesh);

            const ember = new THREE.Mesh(emberGeo, emberMat);
            ember.position.y = 0.36;
            pad.add(ember);

            const padRing = new THREE.Mesh(ringGeo, ringMat);
            padRing.rotation.x = Math.PI / 2;
            padRing.position.y = 0.39;
            pad.add(padRing);

            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.y = 0.405;
            flame.rotation.y = -i * angleStep;
            pad.add(flame);

            // Position pad on platform surface
            pad.position.set(x, PLATFORM_TOP_Y, z);
            pad.userData.isSpawnPlatform = true;
            pad.userData.isCornucopia = true;
            pad.userData.mapGenerated = true;
            pad.traverse(child => {
                child.userData.isSpawnPlatform = true;
                child.userData.mapGenerated = true;
            });
            this.scene.add(pad);

            this.spawnPads.push({ x, y: PLATFORM_TOP_Y, z });
            if (i < 2) console.log(`[NodePad] Pad ${i}: pos=(${x.toFixed(2)}, ${z.toFixed(2)}) data=(${this.spawnPads[i].x.toFixed(2)}, ${this.spawnPads[i].z.toFixed(2)})`);
        }
    }

    updateFountainAnimation(delta) {
        const fountain = Array.from(this.scene.children).find(
            c => c.userData && c.userData.isFountain
        );
        if (!fountain) return;

        const time = performance.now() * 0.001;

        // Stream pulse
        for (const stream of fountain.userData.streams) {
            const pulse = 0.5 + Math.sin(time * 3 + stream.userData.streamAngle) * 0.2;
            stream.material.opacity = 0.5 + pulse * 0.3;
            stream.material.emissiveIntensity = 0.2 + pulse * 0.15;
            stream.scale.x = 1 + Math.sin(time * 4 + stream.userData.streamAngle) * 0.15;
            stream.scale.z = stream.scale.x;
        }

        // Falling drops
        for (const drop of fountain.userData.drops) {
            const speed = drop.userData.dropSpeed;
            drop.position.y -= speed * delta;

            const progress = 1 - (drop.position.y - drop.userData.dropEndY) / (drop.userData.dropStartY - drop.userData.dropEndY);
            const scale = 0.4 + Math.max(0, Math.min(1, progress)) * 0.8;
            drop.scale.setScalar(scale);

            if (drop.position.y < drop.userData.dropEndY) {
                drop.position.y = drop.userData.dropStartY;
                drop.scale.setScalar(0.4);
            }
        }

        // Splash particles
        for (const splash of fountain.userData.splashes) {
            const phase = splash.userData.splashPhase;
            splash.position.y = 1.35 + Math.sin(time * 5 + phase) * 0.15;
            splash.scale.setScalar(0.5 + Math.sin(time * 7 + phase) * 0.3);
        }

        // Water pulse
        const waterMeshes = fountain.children.filter(c => c.userData.isWater);
        for (const water of waterMeshes) {
            water.material.emissiveIntensity = 0.3 + Math.sin(time * 2) * 0.1;
            water.scale.y = 1 + Math.sin(time * 3) * 0.05;
        }
    }
}
