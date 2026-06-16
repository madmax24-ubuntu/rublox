import fs from 'fs';

const content = fs.readFileSync('world/MapGenerator.js', 'utf8');
const lines = content.split('\n');

// ============================================================
// Part 1: Replace the sequential env blocks with biome-aware chain
// ============================================================

// Find "            // --- Trees:" inside _generateEnvironment (line ~719)
let treesStart = -1;
for (let i = 0; i < lines.length; i++) {
    if (/^\s+\/\/ --- Trees:/.test(lines[i])) {
        treesStart = i;
        break;
    }
}

// Find the closing "            }\n" of _generateEnvironment's for loop (line ~808)
let envEnd = -1;
for (let i = treesStart + 5; i < lines.length; i++) {
    if (/^\s*}\s*$/.test(lines[i]) && !lines[i-1].includes('addColliderBox')) {
        // Check: is this the end of _generateEnvironment's for loop?
        // The next non-blank line should be a method definition or comment
        let j = i + 1;
        while (j < lines.length && /^\s*$/.test(lines[j])) j++;
        if (/^\s*(\/\/|    _)/.test(lines[j])) {
            envEnd = i;
            break;
        }
    }
}

console.log(`Replacing environment block: line ${treesStart+1} to ${envEnd+1}`);

const biomeBlock = `            // === SPECIAL BIOME HANDLING ===
            const isStoneMaze = (sector.biome === 'stone_maze');
            const isMilitary = (sector.biome === 'military' || sector.id === 4);
            const isIceLake = (sector.biome === 'ice_lake');

            if (isStoneMaze) {
                // Stone maze: corridor walls instead of trees/rocks
                this._generateMazeWalls(sector, cx, cz, radius);
            } else if (isMilitary) {
                // Military zone: tanks + barbed wire fences instead of standard props
                const numTanks = 6 + Math.floor(this._rand() * 4);
                for (let i = 0; i < numTanks; i++) this._addTank(cx, cz, sector.bounds.radius || 128);
                this._placeBarbedWireFences(sector, cx, cz);
            } else if (isIceLake) {
                // Ice lake: frozen surface + ice crystals + radio tower
                const numCrystals = Math.floor(5 * sector.rockDensity);

                // Frozen water plane at center of sector
                const surfY = this.getHeightAt(cx, cz);
                const surfGeo = new THREE.CircleGeometry(radius * 0.95, 32);
                const surfMat = new THREE.MeshStandardMaterial({
                    color: sector.terrainColor || 0xb0d4e3, roughness: 0.6, metalness: 0.1, flatShading: true
                });
                const surfaceMesh = new THREE.Mesh(surfGeo, surfMat);
                surfaceMesh.rotation.x = -Math.PI / 2;
                surfaceMesh.position.set(cx, surfY + 0.05, cz);
                surfaceMesh.userData.mapGenerated = true;
                this.scene.add(surfaceMesh);

                // Walkable platform for spawn pads on ice lake
                const padGeo = new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.35, 32);
                const padMat = new THREE.MeshStandardMaterial({ color: 0xc8e6f0, roughness: 0.7, flatShading: true });
                const padMesh = new THREE.Mesh(padGeo, padMat);
                padMesh.position.set(cx, surfY + 0.18, cz);
                padMesh.userData.mapGenerated = true;
                this.scene.add(padMesh);

                for (let i = 0; i < numCrystals; i++) {
                    const cAngle = this._rand() * Math.PI * 2;
                    const cDist = 10 + this._rand() * radius * 0.85;
                    this._addIceCrystal(cx + Math.cos(cAngle) * cDist, cz + Math.sin(cAngle) * cDist);
                }

                if (!sector.bounds?.minX || cx > 100) { // Only one radio tower per ice sector
                    const angle = Math.random() * Math.PI * 2;
                    this._addRadioTower(
                        cx + Math.cos(angle) * (radius - 30),
                        cz + Math.sin(angle) * (radius - 30)
                    );
                }
            } else {
                // --- Trees: 60-120 per sector ---
                const numTrees = 60 + Math.floor(sector.treeDensity * 100);
                for (let i = 0; i < numTrees; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 10 + this._rand() * radius * 0.85;
                    const tx = cx + Math.cos(angle) * dist;
                    const tz = cz + Math.sin(angle) * dist;
                    this._addTree(tx, tz, sector);
                }

                // --- Bushes: 15-25 per sector ---
                const numBushes = 15 + Math.floor(sector.buildingDensity * 10);
                for (let i = 0; i < numBushes; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 5 + this._rand() * radius * 0.7;
                    const bx = cx + Math.cos(angle) * dist;
                    const bz = cz + Math.sin(angle) * dist;
                    this._addBush(bx, bz);
                }

                // --- Grass patches: 20-35 per sector ---
                const numGrass = 20 + Math.floor(sector.buildingDensity * 15);
                for (let i = 0; i < numGrass; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 5 + this._rand() * radius * 0.8;
                    const gx = cx + Math.cos(angle) * dist;
                    const gz = cz + Math.sin(angle) * dist;
                    this._addGrassPatch(gx, gz);
                }

                // --- Rocks: 15-30 per sector ---
                const numRocks = Math.floor(15 + sector.rockDensity * 15);
                for (let i = 0; i < numRocks; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 10 + this._rand() * radius * 0.6;
                    const rx = cx + Math.cos(angle) * dist;
                    const rz = cz + Math.sin(angle) * dist;

                    const size = 2 + this._rand() * 4;
                    const geo = new THREE.DodecahedronGeometry(size / 3, 0);
                    const mat = new THREE.MeshStandardMaterial({
                        color: 0x787878, roughness: 0.95, flatShading: true
                    });
                    const rock = new THREE.Mesh(geo, mat);
                    const baseY = this.getHeightAt(rx, rz);
                    rock.position.set(rx, baseY + size / 6, rz);
                    rock.rotation.set(
                        this._rand() * Math.PI,
                        this._rand() * Math.PI,
                        this._rand() * Math.PI
                    );
                    rock.userData.mapGenerated = true;
                    rock.userData.physicsType = 'STATIC';
                    this.scene.add(rock);
                    this.addColliderBox(
                        rock.position.clone(), size, size, size, false, true, false, 'CONVEX_HULL'
                    );
                }

                // --- Scattered props: 8-15 per sector ---
                const numProps = Math.floor(8 + sector.buildingDensity * 7);
                for (let i = 0; i < numProps; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 8 + this._rand() * radius * 0.5;
                    const px = cx + Math.cos(angle) * dist;
                    const pz = cz + Math.sin(angle) * dist;
                    const baseY = this.getHeightAt(px, pz);

                    if (this._rand() < 0.5) {
                        const bGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8);
                        const bMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
                        const barrel = new THREE.Mesh(bGeo, bMat);
                        barrel.position.set(px, baseY + 0.4, pz);
                        barrel.userData.mapGenerated = true;
                        barrel.userData.physicsType = 'STATIC';
                        this.scene.add(barrel);
                        this.addColliderBox(barrel.position.clone(), 0.8, 0.8, 0.8, false);
                    } else {
                        const s = 0.4 + this._rand() * 0.4;
                        const cGeo = new THREE.BoxGeometry(s, s, s);
                        const cMat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9, flatShading: true });
                        const crate = new THREE.Mesh(cGeo, cMat);
                        crate.position.set(px, baseY + s / 2, pz);
                        crate.userData.mapGenerated = true;
                        crate.userData.physicsType = 'STATIC';
                        this.scene.add(crate);
                        this.addColliderBox(crate.position.clone(), s, s, s, false);
                    }
                }`;

// Replace the block between treesStart and envEnd (inclusive)
const newLines = lines.slice(0, treesStart).concat(biomeBlock.split('\n')).concat(lines.slice(envEnd + 1));

// ============================================================
// Part 2: Insert five biome-specific methods after _addGrassPatch
// ============================================================

// Find the end of _addGrassPatch method (closing brace)
let grassPatchEnd = -1;
for (let i = newLines.length - 1; i > 0; i--) {
    if (/^\s*_addGrassPatch/.test(newLines[i])) {
        // Find the closing } of this method
        for (let j = i + 5; j < Math.min(i + 20, newLines.length); j++) {
            const trimmed = newLines[j].trim();
            if (trimmed === '}' && !newLines[j-1].includes('scene.add')) {
                grassPatchEnd = j;
                break;
            }
        }
        break;
    }
}

// Find the SPAWN SYSTEM comment after _addGrassPatch
let spawnCommentStart = -1;
for (let i = grassPatchEnd + 2; i < newLines.length; i++) {
    if (/\/\/\s*====.*SPAWN/.test(newLines[i])) {
        // Go back to find the blank line before it
        for (let j = i; j >= 0 && !/\S/.test(newLines[j]); j--) spawnCommentStart = j + 1;
        break;
    }
}

console.log(`Inserting methods after _addGrassPatch: line ${grassPatchEnd+1}, before SPAWN at ${spawnCommentStart}`);

const newMethods = `

    // ========================================================================
    // BIOME ENVIRONMENT GENERATION (Phase 5b)
    // ========================================================================

    /** Stone maze corridor walls for stone_maze biome */
    _generateMazeWalls(sector, cx, cz, radius) {
        const wallMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x7a7a6e, roughness: 0.95, flatShading: true });

        // Maze grid walls with corridor gaps
        const spacing = cellSize;
        for (let gx = -halfCols; gx < halfCols; gx++) {
            for (let gz = -halfCols; gz < halfCols; gz++) {
                const wx = cx + gx * spacing;
                const wz = cz + gz * spacing;

                if ((gx + 1) ** 2 + (gz + 1) ** 2 > cols * cols / 4) continue;

                let placeWall = false;
                const isIntersection = ((gx % 3 === 0 || gx === -halfCols) && (gz % 3 === 0 || gz === -halfCols));
                if (isIntersection) {
                    placeWall = this._rand() < 0.65;
                } else {
                    const distFromCenter = Math.abs(gx) + Math.abs(gz);
                    const threshold = 0.12 + (distFromCenter / cols) * 0.35;
                    placeWall = this._rand() < threshold;
                }

                if (!placeWall) continue;

                // Horizontal wall segment
                if (gx > -halfCols && ((this._rand() < 0.1 || gx % 2 === 0))) {
                    const segGeo = new THREE.BoxGeometry(cellSize * 0.9, 4.5, 0.6);
                    const seg = new THREE.Mesh(segGeo, wallMat.clone());
                    seg.position.set(wx + cellSize / 2, this.getHeightAt(wx, wz) + 2.3, wz);
                    seg.userData.mapGenerated = true;
                    seg.castShadow = false;
                    seg.receiveShadow = true;
                    this.scene.add(seg);
                }

                // Vertical wall segment
                if (gz > -halfCols && ((this._rand() < 0.1 || gz % 2 === 0))) {
                    const vSegGeo = new THREE.BoxGeometry(0.6, 4.5, cellSize * 0.9);
                    const vSeg = new THREE.Mesh(vSegGeo, wallMat.clone());
                    vSeg.position.set(wx, this.getHeightAt(wx, wz) + 2.3, wz + cellSize / 2);
                    vSeg.userData.mapGenerated = true;
                    vSeg.castShadow = false;
                    vSeg.receiveShadow = true;
                    this.scene.add(vSeg);

                    // Collider for vertical segments
                    const segH = 4.5;
                    this.addColliderBox(
                        new THREE.Vector3(wx, this.getHeightAt(wx, wz) + segH / 2, wz),
                        0.6, segH, cellSize * 0.9, true
                    );
                }

                // Corner tower every few cells
                if (isIntersection && gx % 4 === -1 && gz % 4 === -1) {
                    const tGeo = new THREE.BoxGeometry(3, 7, 3);
                    const towerMat = new THREE.MeshStandardMaterial({ color: 0x6d6d60, roughness: 0.9 });
                    const tower = new THREE.Mesh(tGeo, towerMat);
                    const baseY = this.getHeightAt(wx, wz);
                    tower.position.set(wx, baseY + 3.5, wz);
                    tower.userData.mapGenerated = true;
                    tower.userData.physicsType = 'STATIC';
                    this.scene.add(tower);

                    // Tower platform on top
                    const platGeo = new THREE.BoxGeometry(2.8, 0.3, 2.8);
                    const platMat = new THREE.MeshStandardMaterial({ color: 0x5e5e52, roughness: 1.0 });
                    const plat = new THREE.Mesh(platGeo, platMat);
                    plat.position.set(wx, baseY + 7.15, wz);
                    plat.userData.mapGenerated = true;
                    this.scene.add(plat);

                    // Wall segments connecting to nearby maze walls
                    for (let w = 0; w < 3; w++) {
                        const segAngle = Math.atan2(gz, gx) + ((w - 1) * 0.5);
                        if (this._rand() > 0.4) continue; // gaps in connections

                        const conGeo = new THREE.BoxGeometry(0.5, 3.5, spacing);
                        const conMat = wallMat.clone();
                        const connector = new THREE.Mesh(conGeo, conMat);
                        connector.position.set(wx + Math.cos(segAngle) * (radius - w * 12), baseY + 1.75, wz + Math.sin(segAngle) * (radius - w * 12));
                        connector.rotation.y = segAngle;
                        connector.userData.mapGenerated = true;
                        this.scene.add(connector);

                        const cH = 3.5;
                        this.addColliderBox(
                            new THREE.Vector3(wx + Math.cos(segAngle) * (radius - w * 12), baseY + cH / 2, wz + Math.sin(segAngle) * (radius - w * 12)),
                            spacing, cH, 0.5, true
                        );
                    }
                }

                // Scattered maze wall segments inside the area
                const numSegments = Math.floor(sector.buildingDensity * radius / cellSize);
                for (let s = 0; s < numSegments; s++) {
                    const segAngle = this._rand() * Math.PI * 2;
                    const segDist = 15 + this._rand() * radius * 0.7;
                    const sx3 = cx + Math.cos(segAngle) * segDist;
                    const sz3 = cz + Math.sin(segAngle) * segDist;

                    if (Math.abs(sx3 - cx) < 6 && Math.abs(sz3 - cz) < 6) continue;

                    const sH = 1.5 + this._rand() * 2;
                    const segGeo = new THREE.BoxGeometry(0.4, sH, spacing);
                    const segMat = wallMat.clone();
                    const segment = new THREE.Mesh(segGeo, segMat);

                    if (this._rand() > 0.5) {
                        segment.rotation.y = segAngle + Math.PI / 2;
                    } else {
                        segment.rotation.y = this._rand() * Math.PI;
                    }

                    const sBaseY = this.getHeightAt(sx3, sz3);
                    segment.position.set(sx3, sBaseY + sH / 2, sz3);
                    segment.userData.mapGenerated = true;
                    segment.userData.physicsType = 'STATIC';
                    this.scene.add(segment);

                    this.addColliderBox(
                        new THREE.Vector3(sx3, sBaseY + sH / 2, sz3), spacing - 0.6, sH, 0.4, true
                    );
                }
            }
        }
    }

    /** Ice crystal shard cluster for ice_lake biome */
    _addIceCrystal(x, z) {
        const baseY = this.getHeightAt(x, z);
        const count = 3 + Math.floor(this._rand() * 4); // 3-6 shards per cluster

        for (let i = 0; i < count; i++) {
            const h = 1.5 + this._rand() * 2.5;
            const r = 0.3 + this._rand() * 0.4;
            const geo = new THREE.ConeGeometry(r, h, Math.floor(4 + this._rand() * 4)); // Irregular shards

            // Ice-blue material with transparency for sparkle effect
            const crystalColor = 0x89cfef + Math.floor(this._rand() * 0x20 - 0x10);
            const mat = new THREE.MeshStandardMaterial({
                color: crystalColor, roughness: 0.3, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.85
            });

            const shard = new THREE.Mesh(geo, mat);
            // Offset each shard slightly from cluster center for natural look
            shard.position.set(x + (this._rand() - 0.5) * r * 2, baseY + h / 2 - 0.1, z + (this._rand() - 0.5) * r * 2);
            shard.rotation.y = this._rand() * Math.PI;
            shard.rotation.z = ((Math.random() > 0.5 ? 1 : -1)) * (Math.PI / 8 + this._rand() * Math.PI / 4);

            // Scale variation per shard for organic look
            const scaleX = 0.7 + this._rand() * 0.6;
            const scaleZ = 0.7 + this._rand() * 0.6;
            shard.scale.set(scaleX, 1, scaleZ);

            shard.userData.mapGenerated = true;
            shard.userData.physicsType = 'STATIC';
            this.scene.add(shard);

            // Small collider for larger crystals (not all shards need colliders)
            if (scaleX > 0.8 && h > 2) {
                this.addColliderBox(
                    new THREE.Vector3(x + (this._rand() - 0.5) * r, baseY + h * 0.4, z + (this._rand() - 0.5) * r),
                    r * scaleX * 2, h * 0.8, r * scaleZ * 2, false
                );
            }
        }
    }

    /** Barbed wire fence posts for military zone perimeter */
    _placeBarbedWireFences(sector, cx, cz) {
        const postMat = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.9 });
        const barbedMat = new THREE.LineBasicMaterial({ color: 0x666666 });

        // Place fence posts along sector edges
        for (let side = 0; side < 4; side++) {
            let startX, startZ, endX, endZ;
            switch (side) {
                case 0: // north edge
                    startX = cx - radius; startZ = cz - radius;
                    endX = cx + radius;   endZ = cz - radius; break;
                case 1: // east edge
                    startX = cx + radius; startZ = cz - radius;
                    endX = cx + radius;   endZ = cz + radius; break;
                case 2: // south edge
                    startX = cx + radius; startZ = cz + radius;
                    endX = cx - radius;   endZ = cz + radius; break;
                default: // west edge
                    startX = cx - radius; startZ = cz + radius;
                    endX = cx - radius;   endZ = cz - radius; break;
            }

            const numPosts = Math.floor(radius * 2 / 8);
            for (let p = 0; p < numPosts; p++) {
                const t = p / Math.max(numPosts, 1);
                const px = startX + (endX - startX) * t;
                const pz = startZ + (endZ - startZ) * t;

                // Post height varies slightly for natural look
                const postH = 2.0 + this._rand() * 1.5;
                const baseY = this.getHeightAt(px, pz);
                if (baseY < 0) continue; // Skip posts below terrain surface

                // Fence post
                const postGeo = new THREE.BoxGeometry(0.15, postH, 0.15);
                const postMat2 = postMat.clone();
                const post = new THREE.Mesh(postGeo, postMat2);
                post.position.set(px, baseY + postH / 2, pz);
                post.userData.mapGenerated = true;
                this.scene.add(post);

                // Barbed wire strands connecting posts (drawn as thin lines)
                if (p > 0 && p % Math.floor(numPosts / 8) === 0) {
                    const prevT = (p - 1) / numPosts;
                    const ppX = startX + (endX - startX) * prevT;
                    const ppZ = startZ + (endZ - startZ) * prevT;

                    // Wire strands at different heights along the post
                    for (let wireH = 0.3; wireH < postH; wireH += 0.5) {
                        const lineGeo = new THREE.BufferGeometry();
                        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([
                            ppX, baseY + wireH, ppZ, px, baseY + wireH, pz
                        ], 3));

                        const wireLine = new THREE.Line(lineGeo, barbedMat);
                        wireLine.userData.mapGenerated = true;
                        this.scene.add(wireLine);
                    }
                }
            }
        }

        // Inner perimeter fence - smaller box inside the sector boundary
        for (let innerSide = 0; innerSide < 4; innerSide++) {
            const isHorizontal = innerSide % 2 === 0;
            const numInnerPosts = Math.floor(radius * 1.5 / 6);

            for (let ip = 0; ip < numInnerPosts; ip++) {
                // Place along the perimeter edges
                let ix, iz;
                switch (innerSide) {
                    case 0: ix = cx - radius + ip * (radius * 2 / numInnerPosts); iz = cz - radius + sector.bounds?.minZ || 0; break;
                    case 1: ix = cx + radius; iz = cz - radius + ip * ((sector.bounds?.maxZ || cz + radius) - cz + radius) / numInnerPosts; break;
                    case 2: ix = cx + radius - ip * (radius * 2 / numInnerPosts); iz = cz + radius; break;
                    default: ix = cx - radius; iz = cz + radius - ip * ((sector.bounds?.maxZ || cz + radius) - cz + radius) / numInnerPosts; break;
                }

                const iBaseY = this.getHeightAt(ix, iz);
                if (iBaseY < 0) continue; // Skip posts below terrain surface

                const iPostGeo = new THREE.BoxGeometry(0.12, postH || 2.5, 0.12);
                const iPostMat = postMat.clone();
                const iPole = new THREE.Mesh(iPostGeo, iPostMat);
                iPole.position.set(ix, iBaseY + (postH || 1.25), iz);
                iPole.userData.mapGenerated = true;
                this.scene.add(iPole);

                // Wire strands between inner perimeter posts
                if (ip > 0) {
                    const prevT = (ip - 1) / numInnerPosts;
                    let ppx, ppz;
                    switch (innerSide) {
                        case 0: ppx = ix - radius * 2 / numInnerPosts; ppz = iz; break;
                        case 1: ppx = ix; ppz = iz + radius * 2 / numInnerPosts; break;
                        case 2: ppx = ix + radius * 2 / numInnerPosts; ppz = iz; break;
                        default: ppx = ix; ppz = iz - radius * 2 / numInnerPosts; break;
                    }

                    for (let wireH = 0.3; wireH < postH || 1; wireH += 0.5) {
                        const lineGeo = new THREE.BufferGeometry();
                        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([ppx, iBaseY + wireH, ppz, ix, iBaseY + wireH, iz], 3));

                        const wireLine = new THREE.Line(lineGeo, barbedMat);
                        wireLine.userData.mapGenerated = true;
                        this.scene.add(wireLine);
                    }
                }
            }
        }
    }

    /** Detailed military tank mesh for military biome */
    _addTank(cx, cz, radius) {
        const tx = cx + (this._rand() - 0.5) * radius;
        const tz = cz + (this._rand() - 0.5) * radius;
        const baseY = this.getHeightAt(tx, tz);

        // Tank group for easier positioning/rotation
        const tankGroup = new THREE.Group();

        // Main body (hull) - flat rectangular shape with sloped front
        const hullGeo = new THREE.BoxGeometry(2.4, 0.8, 4.5);
        const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.7 });
        const hull = new THREE.Mesh(hullGeo, hullMat.clone());
        hull.position.set(0, 1, 0); // Hull sits on tracks
        tankGroup.add(hull);

        // Front sloped armor plate (angled forward)
        const frontPlateGeo = new THREE.BoxGeometry(2.4, 0.6, 1.2);
        const frontPlateMat = hullMat.clone();
        const frontPlate = new THREE.Mesh(frontPlateGeo, frontPlateMat);
        frontPlate.position.set(0, 1.3, -2.5); // Front of tank (negative Z)
        frontPlate.rotation.x = Math.PI / 8; // Slight forward slope angle
        tankGroup.add(frontPlate);

        // Turret - cylindrical shape on top of hull with slight taper
        const turretGeo = new THREE.CylinderGeometry(1.1, 1.3, 0.7, 8);
        const turretMat = new THREE.MeshStandardMaterial({ color: 0x54624a, roughness: 0.6 });
        const turret = new THREE.Mesh(turretGeo, turretMat.clone());
        turret.position.set(0, 1.8, -0.3); // Turret sits above hull center
        tankGroup.add(turret);

        // Turret top flat cap (smaller disc on top of turret)
        const turretTopGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.15, 8);
        const turretTopMat = hullMat.clone();
        const turretTop = new THREE.Mesh(turretTopGeo, turretTopMat);
        turretTop.position.set(0, 2.25, -0.3); // On top of turret cylinder
        tankGroup.add(turretTop);

        // Main gun barrel pointing forward (along negative Z axis when rotated)
        const barrelGeo = new THREE.CylinderGeometry(0.15, 0.18, 4, 6);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2f, roughness: 0.5 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat.clone());
        barrel.rotation.x = Math.PI / 2; // Barrel is horizontal (pointing forward)
        barrel.position.set(0, 1.8, -3.2); // Extends from turret toward front of tank
        tankGroup.add(barrel);

        // Muzzle brake at end of gun barrel (wider tip)
        const muzzleGeo = new THREE.CylinderGeometry(0.25, 0.18, 0.4, 6);
        const muzzleMat = barrelMat.clone();
        const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
        muzzle.rotation.x = Math.PI / 2; // Same orientation as main barrel
        muzzle.position.set(0, 1.8, -5.2); // At the very tip of the gun
        tankGroup.add(muzzle);

        // Tracks on left and right sides (heavy-duty rubber/metal tracks)
        for (let trackSide = -1; trackSide <= 1; trackSide += 2) {
            const trackGeo = new THREE.BoxGeometry(0.6, 0.5, 4.8);
            const trackMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 1 });
            const track = new THREE.Mesh(trackGeo, trackMat.clone());
            track.position.set(trackSide * 1.5, 0.4, 0); // Tracks sit on bottom sides of hull
            tankGroup.add(track);

            // Track wheels (small cylinders along the length of each track)
            for (let wi = -2; wi <= 2; wi++) {
                const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 8);
                const wheelMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
                const wheel = new THREE.Mesh(wheelGeo, wheelMat.clone());
                wheel.rotation.z = Math.PI / 2; // Roll along track direction (perpendicular to tank)
                wheel.position.set(trackSide * 1.5 + trackSide * -0.3, 0.4, wi * 0.8);
                tankGroup.add(wheel);
            }

            // Track guard rail above the wheels on each side
            const guardGeo = new THREE.BoxGeometry(0.1, 0.2, 5);
            const guardMat = trackMat.clone();
            const guard = new THREE.Mesh(guardGeo, guardMat);
            guard.position.set(trackSide * (1.5 + trackSide * 0.3), 0.8, 0); // Just above and outside the tracks
            tankGroup.add(guard);
        }

        // Exhaust pipes on rear of hull (two small cylinders sticking up)
        for (let ep = -1; ep <= 1; ep += 2) {
            const exhaustGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6);
            const exhaustMat = postMat || new THREE.MeshStandardMaterial({ color: 0x3d3d3d });
            const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat.clone());
            exhaust.rotation.x = Math.PI / 2; // Point backward (along positive Z)
            exhaust.position.set(ep * 0.5, 1.6, 2.3); // Rear of tank on top of hull
            tankGroup.add(exhaust);

            const exhaustTipGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.2);
            const exhaustTipMat = exhaustMat.clone();
            const exhaustTip = new THREE.Mesh(exhaustTipGeo, exhaustTipMat);
            exhaustTip.rotation.x = Math.PI / 2; // Point backward (along positive Z)
            exhaustTip.position.set(ep * 0.5, 1.6 + 0.3, 2.6); // Tip of the pipe pointing up and slightly back
            tankGroup.add(exhaustTip);
        }

        // Radio antenna on turret rear-left side (thin tall pole)
        const radioAntennaGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8);
        const radioAntennaMat = hullMat.clone();
        const radioAntenna = new THREE.Mesh(radioAntennaGeo, radioAntennaMat); // Thin tall cylinder pointing up from turret rear-left corner
        radioAntenna.position.set(-0.6, 2.85, -1.0); // Extends upward and backward from turret surface (tall thin pole)
        tankGroup.add(radioAntenna);

        // Antenna tip / ball on top of the tall mast (small sphere at very top of antenna)
        const antennaTipGeo = new THREE.SphereGeometry(0.04, 6, 6);
        const antennaTipMat = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red blinking tip to indicate it's active
        const antennaTip = new THREE.Mesh(antennaTipGeo, antennaTipMat);
        antennaTip.position.set(-0.6, 3.75, -1.0); // Small sphere at top of tall mast (tip of the radio antenna)
        tankGroup.add(antennaTip);

        // Position/rotate entire tank in world space and add to scene
        tankGroup.rotation.y = this._rand() * Math.PI * 2; // Face random direction
        tankGroup.position.set(tx, baseY, tz); // Place on terrain surface at computed height
        tankGroup.userData.mapGenerated = true;
        tankGroup.userData.physicsType = 'STATIC';

        this.scene.add(tankGroup);

        // Collider for the whole tank body (simplified box matching hull dimensions)
        const tankSizeX = 4.5, tankSizeY = 2.5, tankSizeZ = 6;
        const tankCenter = new THREE.Vector3(tx, baseY + tankSizeY / 2 - 0.1, tz); // Center of bounding box (adjust Y slightly below hull midpoint)
        this.addColliderBox(tankCenter, tankSizeX, tankSizeY, tankSizeZ, true);

        // Secondary collider for the turret (smaller box matching turret dimensions)
        const turretBase = new THREE.Vector3(tx, baseY + 2.85 - 0.1, tz - 0.3); // Center of bounding box (adjust Y slightly below hull midpoint)
        this.addColliderBox(turretBase, 3, 1.4, 3, false);
    }

    /** Radio tower with antenna dishes for ice_lake biome */
    _addRadioTower(x, z) {
        const baseY = this.getHeightAt(x, z);

        // Tower group for easier positioning/rotation of all sub-parts
        const towerGroup = new THREE.Group();

        // Main mast/tower pole (tall thin cylinder with slight taper toward top - main structural element)
        const poleGeo = new THREE.CylinderGeometry(0.35, 0.6, 18); // Tapered from wider base to narrower top section
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.7 });
        const pole = new THREE.Mesh(poleGeo, poleMat.clone());
        pole.position.y = 9; // Half height of tower (position from bottom center)
        towerGroup.add(pole);

        // Cross-bracing horizontal support beams at intervals along the mast for structural reinforcement
        for (let br = 3; br < 18; br += 4.5) {
            const braceGeo = new THREE.BoxGeometry(2, 0.15, 2);
            const braceMat = poleMat.clone();
            const brace = new THREE.Mesh(braceGeo, braceMat); // Horizontal support beam connecting all four sides of mast at this height
            brace.position.y = br; // Position along the vertical axis at regular intervals (every ~4.5m)
            towerGroup.add(brace);

            // Diagonal cross-brace wires between adjacent horizontal supports for lateral stability
            for (let d = -1; d <= 1; d += 2) {
                const diagGeo = new THREE.CylinderGeometry(0.03, 0.03, Math.sqrt(8)); // Thin diagonal wire spanning ~4m from corner to opposite corner on each face of the mast
                const diagMat = poleMat.clone();
                const diagonal = new THREE.Mesh(diagGeo, diagMat);
                diagonal.position.set(d * 0.95, br + 2.25, d * 0.95); // Offset from center diagonally at midpoint between braces (tilted outward and upward for cross-brace effect)
                diagonal.rotation.z = Math.PI / 4; // Angle for cross-brace (diagonal wire running up-and-across the mast face)
                towerGroup.add(diagonal);

                const diagonal2Geo = new THREE.CylinderGeometry(0.03, 0.03, Math.sqrt(8));
                const diagonal2Mat = poleMat.clone();
                const diagonal2 = new THREE.Mesh(diagonal2Geo, diagonal2Mat); // Opposite cross-brace wire running the other diagonal direction for stability
                diagonal2.position.set(-d * 0.95, br + 2.25, d * 0.95); // Symmetric opposite position (tilted outward and upward on the other side)
                diagonal2.rotation.z = -Math.PI / 4; // Opposite angle for cross-brace (diagonal wire running up-and-across in reverse direction)
                towerGroup.add(diagonal2);

                const diag3Geo = new THREE.CylinderGeometry(0.03, 0.03, Math.sqrt(8));
                const diag3Mat = poleMat.clone();
                const diagonal3 = new THREE.Mesh(diag3Geo, diag3Mat); // Third cross-brace wire for opposite corner stability (completing X pattern on mast face)
                diagonal3.position.set(d * 0.95, br + 2.25, -d * 0.95); // Offset from center diagonally at midpoint between braces (tilted outward and upward for cross-brace effect)
                diagonal3.rotation.z = Math.PI / 4; // Angle for cross-brace (diagonal wire running up-and-across the mast face in opposite direction to second brace)
                towerGroup.add(diagonal3);

                const diag4Geo = new THREE.CylinderGeometry(0.03, 0.03, Math.sqrt(8));
                const diag4Mat = poleMat.clone();
                const diagonal4 = new THREE.Mesh(diag4Geo, diag4Mat); // Fourth cross-brace wire for opposite corner stability (completing X pattern on mast face)
                diagonal4.position.set(-d * 0.95, br + 2.25, -d * 0.95); // Symmetric opposite position (tilted outward and upward on the other side)
                diagonal4.rotation.z = -Math.PI / 4; // Opposite angle for cross-brace (diagonal wire running up-and-across in reverse direction to third brace)
                towerGroup.add(diagonal4);
            }
        }

        // Top platform/deck near the mast peak (small square observation deck above highest horizontal support beam - provides maintenance access point at upper section of tower structure)
        const platGeo = new THREE.BoxGeometry(1.8, 0.2, 1.8);
        const platMat = poleMat.clone(); // Material matching main structural steel color and finish for consistency across platform surfaces
        const platform = new THREE.Mesh(platGeo, platMat); // Square deck section providing standing area at upper tower level with guard rail attachment points around perimeter edge boundaries
        platform.position.y = 17; // Near top of the mast structure (positioned just below highest antenna mounting zone)
