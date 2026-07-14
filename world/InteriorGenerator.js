import * as THREE from "../node_modules/three/build/three.module.js";

// Interior element generation for buildings
export class InteriorGenerator {

    // Generate all interior elements for a building
    static generate(buildingData, scene, addCollider) {
        const { type, position, width, depth, height, floors, template } = buildingData;
        const baseY = position.y || 0;
        const elements = { colliders: [], meshes: [], lights: [] };

        // Partition walls — only 2-story buildings
        if (template && template.floors >= 2) {
            const walls = this.generatePartitionWalls(buildingData, scene, addCollider);
            elements.colliders.push(...walls.colliders);
            elements.meshes.push(...walls.meshes);
        }

        // Furniture — reduced: only keep meaningful props (2-3 per building)
        const furniture = this.generateFurniture(buildingData, scene, addCollider);
        elements.colliders.push(...furniture.colliders);
        elements.meshes.push(...furniture.meshes);

        // Lighting
        const lights = this.generateLighting(buildingData, scene);
        elements.lights.push(...lights);

        return elements;
    }

    // Generate interior partition walls — only for large 2-story buildings
    static generatePartitionWalls(data, scene, addCollider) {
        const { width, depth } = data;
        const colliders = [];
        const meshes = [];
        const wallHeight = 2.6;
        const wallThickness = 0.2;
        const halfW = width / 2;
        const halfD = depth / 2;

        // Main divider wall (with door gap) — only for large buildings
        if (width >= 8 && depth >= 6) {
            const mainZ = 0;

            // Left section
            const lw1 = halfW - 0.6;
            if (lw1 > 0.5) {
                this._addWall(data, scene, addCollider, colliders, meshes,
                    { x: -0.5, z: mainZ },
                    lw1 * 2, wallHeight, wallThickness
                );
            }
            // Right section (gap for door)
            const lw2 = halfW - 0.6;
            if (lw2 > 0.5) {
                this._addWall(data, scene, addCollider, colliders, meshes,
                    { x: 0.5, z: mainZ },
                    lw2 * 2, wallHeight, wallThickness
                );
            }
        }

        return { colliders, meshes };
    }

    static _addWall(data, scene, addCollider, colliders, meshes,
        center, width, height, depth) {
        const geo = new THREE.BoxGeometry(width, height, depth);
        const color = data.template?.wallColor || 0xbcaaa4;
        const mat = new THREE.MeshStandardMaterial({
            color, roughness: 0.85, flatShading: true, side: THREE.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(center.x, center.y + height / 2, center.z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);

        addCollider(center, width, height, depth, false);
    }

    // Generate furniture — only keep meaningful props, filter out tiny ones
    static generateFurniture(data, scene, addCollider) {
        const { width, depth, template, position } = data;
        const colliders = [];
        const meshes = [];

        if (!template?.props) return { colliders, meshes };

        // Filter: remove tiny crates/boxes (< 0.6m), keep only meaningful furniture
        const meaningfulProps = template.props.filter(p => {
            if (p.type === 'crate' && (p.w || 0.5) < 0.6) return false;
            if (p.type === 'ammo_box' && (p.w || 0.5) < 0.6) return false;
            return true;
        });

        // Limit to max 3 furniture items per building
        const props = meaningfulProps.slice(0, 3);

        for (const prop of props) {
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
        const topMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.set(x, y + prop.h, z);
        top.userData.mapGenerated = true;
        scene.add(top);
        meshes.push(top);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.08, prop.h, 0.08);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
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
        const size = prop.w || 0.75;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9, flatShading: true , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + size / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + size / 2, z), size, size, size, false);
    }

    static _addAmmoBox(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const w = prop.w || 0.7;
        const d = prop.d || 0.9;
        const h = prop.h || 0.75;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + h / 2, z), w, h, d, false);
    }

    static _addBarrel(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const radius = prop.w || 0.6;
        const height = prop.h || 1.2;
        const geo = new THREE.CylinderGeometry(radius, radius, height, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + height / 2, z);
        mesh.userData.mapGenerated = true;
        scene.add(mesh);
        meshes.push(mesh);
        addCollider(new THREE.Vector3(x, y + height / 2, z), radius * 2, height, radius * 2, false);
    }

    static _addSandbag(data, scene, addCollider, colliders, meshes, x, y, z, prop) {
        const w = prop.w || 1.2;
        const d = prop.d || 0.6;
        const h = prop.h || 0.9;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8d7b63, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6 });
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
        const mat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
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
        const totalRise = 2.8;
        const stepCount = 10; // Reduced from 14
        const stepRise = totalRise / stepCount;
        const stepDepth = 0.28;

        // Central staircase position
        const startX = position.x;
        const startZ = position.z - depth * 0.3;

        for (let i = 0; i < stepCount; i++) {
            const stepY = baseY + stepRise * (i + 0.5);
            const stepZ = startZ + stepDepth * i - stepDepth * stepCount / 2;
            const stepGeo = new THREE.BoxGeometry(stairWidth, 0.06, stepDepth);
            const stepMat = new THREE.MeshStandardMaterial({ color: 0xbcaaa4, roughness: 0.8 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
            const step = new THREE.Mesh(stepGeo, stepMat);
            step.position.set(startX, stepY, stepZ);
            step.userData.mapGenerated = true;
            step.userData.walkableSurface = true;
            scene.add(step);
            meshes.push(step);

            addCollider(new THREE.Vector3(startX, stepY, stepZ), stairWidth, 0.06, stepDepth, true);
        }

        // Railing
        const railMat = new THREE.MeshStandardMaterial({ color: 0x757575, metalness: 0.5, roughness: 0.6 , side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 12, polygonOffsetUnits: 6});
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
