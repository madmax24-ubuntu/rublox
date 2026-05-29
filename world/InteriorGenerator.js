import * as THREE from "three";

// Interior element generation for buildings
export class InteriorGenerator {

    // Generate all interior elements for a building
    static generate(buildingData, scene, addCollider) {
        const { type, position, width, depth, height, floors, template } = buildingData;
        const baseY = position.y || 0; // Already on ground
        const elements = { colliders: [], meshes: [], lights: [] };

        // Partition walls
        const walls = this.generatePartitionWalls(buildingData, scene, addCollider);
        elements.colliders.push(...walls.colliders);
        elements.meshes.push(...walls.meshes);

        // Furniture
        const furniture = this.generateFurniture(buildingData, scene, addCollider);
        elements.colliders.push(...furniture.colliders);
        elements.meshes.push(...furniture.meshes);

        // Stairs for 2-story buildings
        if (template && template.hasStairs) {
            const stairs = this.generateStairs(buildingData, scene, addCollider);
            elements.colliders.push(...stairs.colliders);
            elements.meshes.push(...stairs.meshes);
        }

        // Mezzanine for large buildings
        if (template && template.hasMezzanine) {
            const mezzanine = this.generateMezzanine(buildingData, scene, addCollider);
            elements.colliders.push(...mezzanine.colliders);
            elements.meshes.push(...mezzanine.meshes);
        }

        // Roof ladder
        if (template && template.hasLadder) {
            const ladder = this.generateRoofLadder(buildingData, scene, addCollider);
            elements.colliders.push(...ladder.colliders);
            elements.meshes.push(...ladder.meshes);
        }

        // Roof platform (watchtower, silo)
        if (template && template.hasRoofPlatform) {
            const platform = this.generateRoofPlatform(buildingData, scene, addCollider);
            elements.colliders.push(...platform.colliders);
            elements.meshes.push(...platform.meshes);
        }

        // Lighting
        const lights = this.generateLighting(buildingData, scene);
        elements.lights.push(...lights);

        return elements;
    }

    // Generate interior partition walls
    static generatePartitionWalls(data, scene, addCollider) {
        const { width, depth, template } = data;
        const colliders = [];
        const meshes = [];
        const wallHeight = 2.6;
        const wallThickness = 0.2;
        const halfW = width / 2;
        const halfD = depth / 2;

        // Main divider wall (with door gap)
        if (width >= 6 && depth >= 6) {
            const mainZ = 0;
            const gapWidth = 1.2;
            const halfGap = gapWidth / 2;

            // Left section
            const lw1 = halfW - halfGap;
            if (lw1 > 0.5) {
                this._addWall(data, scene, addCollider, colliders, meshes,
                    { x: 0, z: mainZ },
                    lw1 * 2, wallHeight, wallThickness
                );
            }
            // Right section
            const lw2 = halfGap;
            if (lw2 > 0.3) {
                this._addWall(data, scene, addCollider, colliders, meshes,
                    { x: halfW - halfGap - 0.5, z: mainZ },
                    0.5, wallHeight, wallThickness
                );
                this._addWall(data, scene, addCollider, colliders, meshes,
                    { x: -halfW + halfGap + 0.5, z: mainZ },
                    0.5, wallHeight, wallThickness
                );
            }
        }

        // Secondary divider for large buildings (width >= 10 or depth >= 12)
        if (width >= 10 || depth >= 12) {
            const secZ = -halfD * 0.3;
            const secW = width * 0.5;
            if (secW > 3) {
                this._addWall(data, scene, addCollider, colliders, meshes,
                    { x: width * 0.15, z: secZ },
                    secW, wallHeight, wallThickness, true
                );
            }
        }

        return { colliders, meshes };
    }

    static _addWall(data, scene, addCollider, colliders, meshes,
        center, width, height, depth, breakable = false) {
        const geo = new THREE.BoxGeometry(width, height, depth);
        const color = data.template?.wallColor || 0xbcaaa4;
        const mat = new THREE.MeshStandardMaterial({
            color, roughness: 0.85, flatShading: true
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(center.x, center.y + height / 2, center.z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);

        addCollider(center, width, height, depth, false);

        // Mark some walls as breakable
        if (breakable) {
            mesh.userData.breakable = true;
        }
    }

    // Generate furniture from template props
    static generateFurniture(data, scene, addCollider) {
        const { width, depth, template, position } = data;
        const colliders = [];
        const meshes = [];

        if (!template?.props) return { colliders, meshes };

        for (const prop of template.props) {
            const px = position.x + prop.dx;
            const pz = position.z + prop.dz;
            const py = this._getSurfaceHeight(position, prop.dx, prop.dz) || (position.y || 0);

            switch (prop.type) {
                case "table":
                    this._addTable(data, scene, addCollider, colliders, meshes, px, py, pz, prop);
                    break;
                case "crate":
                    this._addCrate(data, scene, addCollider, colliders, meshes, px, py, pz, prop);
                    break;
                case "ammo_box":
                    this._addAmmoBox(data, scene, addCollider, colliders, meshes, px, py, pz, prop);
                    break;
                case "barrel":
                    this._addBarrel(data, scene, addCollider, colliders, meshes, px, py, pz, prop);
                    break;
                case "sandbag":
                    this._addSandbag(data, scene, addCollider, colliders, meshes, px, py, pz, prop);
                    break;
                case "concrete_barrier":
                    this._addConcreteBarrier(data, scene, addCollider, colliders, meshes, px, py, pz, prop);
                    break;
            }
        }

        return { colliders, meshes };
    }

    static _getSurfaceHeight(pos, dx, dz) {
        return pos.y || 0;
    }

    static _addTable(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        // Table top
        const topGeo = new THREE.BoxGeometry(prop.w, 0.06, prop.d);
        const topMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7 });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.set(x, y + prop.h, z);
        top.userData.mapGenerated = true;
        scene.add(top);
        meshes.push(top);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.08, prop.h, 0.08);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 });
        const legPositions = [
            [x - prop.w / 3, y + prop.h / 2, z - prop.d / 3],
            [x + prop.w / 3, y + prop.h / 2, z - prop.d / 3],
            [x - prop.w / 3, y + prop.h / 2, z + prop.d / 3],
            [x + prop.w / 3, y + prop.h / 2, z + prop.d / 3]
        ];
        for (const lp of legPositions) {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lp[0], lp[1], lp[2]);
            leg.userData.mapGenerated = true;
            scene.add(leg);
            meshes.push(leg);
        }

        addCollider(new THREE.Vector3(x, y + prop.h / 2, z), prop.w, prop.h, prop.d, false);
    }

    static _addCrate(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const size = prop.w || 0.5;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + size / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + size / 2, z), size, size, size, false);
    }

    static _addAmmoBox(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const w = prop.w || 0.5;
        const d = prop.d || 0.7;
        const h = prop.h || 0.5;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + h / 2, z), w, h, d, false);
    }

    static _addBarrel(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const radius = prop.w || 0.4;
        const height = prop.h || 0.8;
        const geo = new THREE.CylinderGeometry(radius, radius, height, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + height / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + height / 2, z), radius * 2, height, radius * 2, false);
    }

    static _addSandbag(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const w = prop.w || 0.8;
        const d = prop.d || 0.4;
        const h = prop.h || 0.6;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8d7b63, roughness: 0.95 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + h / 2, z), w, h, d, false);
    }

    static _addConcreteBarrier(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const w = prop.w || 1.2;
        const d = prop.d || 0.6;
        const h = prop.h || 0.6;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + h / 2, z), w, h, d, false);
    }

    // Generate staircase for 2-story buildings
    static generateStairs(data, scene, addCollider) {
        const { width, depth, position } = data;
        const colliders = [];
        const meshes = [];
        const baseY = position.y || 0;
        const stairWidth = 2;
        const totalRise = 2.8; // Floor height minus ceiling
        const stepCount = 14;
        const stepRise = totalRise / stepCount;
        const stepDepth = 0.25;

        // Central staircase position
        const startX = position.x;
        const startZ = position.z - depth * 0.3;

        for (let i = 0; i < stepCount; i++) {
            const stepY = baseY + stepRise * (i + 0.5);
            const stepZ = startZ + stepDepth * i - stepDepth * stepCount / 2;
            const stepGeo = new THREE.BoxGeometry(stairWidth, 0.06, stepDepth);
            const stepMat = new THREE.MeshStandardMaterial({ color: 0xbcaaa4, roughness: 0.8 });
            const step = new THREE.Mesh(stepGeo, stepMat);
            step.position.set(startX, stepY, stepZ);
            step.userData.mapGenerated = true;
            step.userData.walkableSurface = true;
            scene.add(step);
            meshes.push(step);

            addCollider(new THREE.Vector3(startX, stepY, stepZ), stairWidth, 0.06, stepDepth, true);
        }

        // Railing
        const railMat = new THREE.MeshStandardMaterial({ color: 0x757575, metalness: 0.5, roughness: 0.6 });
        const railGeo = new THREE.CylinderGeometry(0.03, 0.03, totalRise + 0.5, 6);

        for (let side = -1; side <= 1; side += 2) {
            const rail = new THREE.Mesh(railGeo, railMat);
            rail.position.set(startX + side * stairWidth / 2, totalRise / 2, startZ);
            rail.userData.mapGenerated = true;
            scene.add(rail);
            meshes.push(rail);
        }

        return { colliders, meshes };
    }

    // Generate mezzanine floor for large buildings (warehouses, hangars)
    static generateMezzanine(data, scene, addCollider) {
        const { width, depth, position } = data;
        const colliders = [];
        const meshes = [];
        const baseY = position.y || 0;
        const mezzY = 3.5; // Mezzanine height
        const pillarSize = 0.35;

        // Partial mezzanine floor (only covers half the building)
        const mezzW = width * 0.5;
        const mezzD = depth * 0.5;

        // Floor
        const floorGeo = new THREE.BoxGeometry(mezzW, 0.2, mezzD);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.8 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(position.x + width * 0.25, baseY + mezzY, position.z);
        floor.userData.mapGenerated = true;
        floor.userData.walkableSurface = true;
        scene.add(floor);
        meshes.push(floor);

        addCollider(new THREE.Vector3(position.x + width * 0.25, baseY + mezzY, position.z), mezzW + 0.3, 0.3, mezzD + 0.3, true);

        // Support pillars
        const pillarGeo = new THREE.BoxGeometry(pillarSize, mezzY, pillarSize);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.85 });
        const pillarPositions = [
            [position.x + width * 0.45, baseY + mezzY / 2, position.z - mezzD * 0.4],
            [position.x + width * 0.45, baseY + mezzY / 2, position.z + mezzD * 0.4],
            [position.x - width * 0.1, baseY + mezzY / 2, position.z - mezzD * 0.4],
            [position.x - width * 0.1, baseY + mezzY / 2, position.z + mezzD * 0.4]
        ];
        for (const pp of pillarPositions) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(pp[0], pp[1], pp[2]);
            pillar.userData.mapGenerated = true;
            scene.add(pillar);
            meshes.push(pillar);
            addCollider(new THREE.Vector3(pp[0], pp[1], pp[2]), pillarSize, mezzY, pillarSize, false);
        }

        return { colliders, meshes };
    }

    // Generate ladder for roof access
    static generateRoofLadder(data, scene, addCollider) {
        const { width, depth, position, height } = data;
        const colliders = [];
        const meshes = [];
        const baseY = position.y || 0;
        const ladderHeight = height + 0.5;
        const side = 1; // Against the side wall
        const ladderX = position.x + side * (width / 2 + 0.1);

        // Vertical rails
        const railMat = new THREE.MeshStandardMaterial({ color: 0x757575, metalness: 0.6, roughness: 0.5 });
        const railGeo = new THREE.CylinderGeometry(0.025, 0.025, ladderHeight, 6);

        for (let offset = -0.3; offset <= 0.3; offset += 0.6) {
            const rail = new THREE.Mesh(railGeo, railMat);
            rail.position.set(ladderX, baseY + ladderHeight / 2, position.z + offset);
            rail.userData.mapGenerated = true;
            scene.add(rail);
            meshes.push(rail);
        }

        // Rungs
        const rungCount = Math.floor(ladderHeight / 0.3);
        const rungGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6);
        for (let i = 0; i < rungCount; i++) {
            const rung = new THREE.Mesh(rungGeo, railMat);
            rung.rotation.x = Math.PI / 2;
            rung.position.set(ladderX, baseY + 0.3 + (ladderHeight / rungCount) * i, position.z);
            rung.userData.mapGenerated = true;
            scene.add(rung);
            meshes.push(rung);
        }

        return { colliders, meshes };
    }

    // Generate roof platform (for watchtower, silo)
    static generateRoofPlatform(data, scene, addCollider) {
        const { width, position, height } = data;
        const colliders = [];
        const meshes = [];
        const baseY = position.y || 0;
        const platformY = baseY + height;

        // Platform floor
        const platGeo = new THREE.CylinderGeometry(width / 2 + 0.5, width / 2 + 0.5, 0.15, 12);
        const platMat = new THREE.MeshStandardMaterial({ color: 0x757575, roughness: 0.8 });
        const platform = new THREE.Mesh(platGeo, platMat);
        platform.position.set(position.x, platformY, position.z);
        platform.userData.mapGenerated = true;
        platform.userData.walkableSurface = true;
        scene.add(platform);
        meshes.push(platform);

        addCollider(new THREE.Vector3(position.x, platformY, position.z), width + 1, 0.3, width + 1, true);

        return { colliders, meshes };
    }

    // Generate interior lighting
    static generateLighting(data, scene) {
        const lights = [];
        const { position, width, depth } = data;
        const baseY = position.y || 0;
        const ceilingY = baseY + (data.height || 3) - 0.3;

        // 1-2 point lights per building
        const lightCount = Math.max(1, Math.floor(Math.sqrt(width * depth) / 6));
        for (let i = 0; i < lightCount; i++) {
            const lx = position.x + (i - (lightCount - 1) / 2) * (width / (lightCount + 1));
            const lz = position.z + (i - (lightCount - 1) / 2) * (depth / (lightCount + 1));

            const light = new THREE.PointLight(0xfff9c4, 0.8, 10);
            light.position.set(lx, ceilingY + 0.5, lz);
            scene.add(light);
            lights.push(light);

            // Visible fixture
            const fixGeo = new THREE.SphereGeometry(0.15, 6, 6);
            const fixMat = new THREE.MeshBasicMaterial({ color: 0xfff9c4 });
            const fixture = new THREE.Mesh(fixGeo, fixMat);
            fixture.position.set(lx, ceilingY, lz);
            fixture.userData.mapGenerated = true;
            scene.add(fixture);
            lights.push(fixture);
        }

        return lights;
    }
}
