import * as THREE from "three";
import { MeshPool } from "./MeshPool.js";

export class InstancedMeshSystem {
    constructor(pool) {
        this.pool = pool || new MeshPool();
        this._tmpMatrix = new THREE.Matrix4();
        this._tmpMatrix2 = new THREE.Matrix4();
        this._tmpVec = new THREE.Vector3();
        this._lastCullPos = new THREE.Vector3(0, 0, 0);
        this._grouped = new Map();
        this._instancedMeshes = [];
    }

    optimize(scene, minCount = 2) {
        this._grouped.clear();
        this._instancedMeshes = [];

        const candidates = [];
        const skipReasons = { noMapGen: 0, culled: 0, aniInt: 0, noGeoKey: 0, noMatKey: 0 };

        for (const child of scene.children) {
            if (!child.userData?.mapGenerated && !child.userData?.instancable) continue;
            this._collectMeshes(child, candidates, skipReasons, true);
        }
        console.log(`[InstancedMesh] Collected ${candidates.length} candidate meshes`);
        console.log(`[InstancedMesh] Skipped: noMapGen=${skipReasons.noMapGen}, culled=${skipReasons.culled}, aniInt=${skipReasons.aniInt}, noGeoKey=${skipReasons.noGeoKey}, matKey=${skipReasons.noMatKey}`);

        let skipped = 0;
        for (const mesh of candidates) {
            const geoKey = this.pool.geoKey(mesh.geometry);
            if (!geoKey) { skipped++; continue; }
            const matKey = this.pool.matKey(mesh.material);
            if (!matKey) { skipped++; continue; }

            const semanticKey = mesh.userData?.isWall ? 'wall' : (mesh.userData?.walkable ? 'walkable' : 'visual');
            const groupKey = `${geoKey}__${matKey}__${semanticKey}`;
            if (!this._grouped.has(groupKey)) {
                this._grouped.set(groupKey, { geoKey, matKey, entries: [] });
            }
            this._grouped.get(groupKey).entries.push(mesh);
        }

        let replaced = 0;
        const instancedMeshes = [];
        let skippedTooFew = 0;

        for (const [key, group] of this._grouped) {
            if (group.entries.length < minCount) { skippedTooFew++; continue; }

            const { geoKey, matKey, entries } = group;
            let geo = entries[0].geometry.clone();
            let mat = this._cloneMaterial(entries[0].material);

            // Check if ANY entry has isTerrain — skip instancing for terrain groups
            let hasTerrain = false;
            for (const e of entries) {
                if (e.userData?.isTerrain) { hasTerrain = true; break; }
            }
            if (hasTerrain) { skippedTooFew++; continue; }

            const instanced = new THREE.InstancedMesh(geo, mat, entries.length);
            instanced.userData.mapGenerated = true;
            instanced.userData.instanced = true;
            instanced.frustumCulled = false;
            if (entries[0].userData?.walkable) instanced.userData.walkable = true;
            if (entries[0].userData?.isWall) instanced.userData.isWall = true;

            const positions = new Float32Array(entries.length * 3);

            for (let i = 0; i < entries.length; i++) {
                const m = entries[i];
                m.updateWorldMatrix(true, false);
                this._tmpMatrix.copy(m.matrixWorld);
                instanced.setMatrixAt(i, this._tmpMatrix);
                positions[i * 3] = this._tmpMatrix.elements[12];
                positions[i * 3 + 1] = this._tmpMatrix.elements[13];
                positions[i * 3 + 2] = this._tmpMatrix.elements[14];
            }
            instanced.instanceMatrix.needsUpdate = true;

            for (const m of entries) {
                const parent = m.parent;
                if (parent) {
                    parent.remove(m);
                }
                replaced++;
            }

            scene.add(instanced);
            instancedMeshes.push(instanced);

            const grid = this._buildGrid(entries, positions);
            this._instancedMeshes.push({
                mesh: instanced,
                positions,
                count: entries.length,
                grid,
            });
        }

        console.log(`[InstancedMesh] Groups: ${this._grouped.size}, Replaced: ${replaced}, Skipped(<${minCount}): ${skippedTooFew}`);
        return { replaced, instancedMeshes };
    }

    _buildGrid(entries, positions) {
        const cellSize = 64;
        const grid = new Map();

        for (let i = 0; i < entries.length; i++) {
            const px = positions[i * 3];
            const pz = positions[i * 3 + 2];
            const cx = Math.floor(px / cellSize);
            const cz = Math.floor(pz / cellSize);
            const key = `${cx},${cz}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i);
        }
        return grid;
    }

    updateCulling(playerPos, cullDist) {
        const distSq = this._lastCullPos.distanceToSquared(playerPos);
        if (distSq < 0.01) return;
        this._lastCullPos.copy(playerPos);

        const cellSize = 64;
        const cullDistSq = cullDist * cullDist;
        const pCellX = Math.floor(playerPos.x / cellSize);
        const pCellZ = Math.floor(playerPos.z / cellSize);
        const radius = Math.ceil(cullDist / cellSize) + 1;

        for (const entry of this._instancedMeshes) {
            const { mesh, positions, count, grid } = entry;

            if (!this._visibleIndices) {
                this._visibleIndices = new Uint32Array(4096);
                this._seenSet = new Set();
            }
            const visibleIndices = this._visibleIndices;
            const seen = this._seenSet;
            let visCount = 0;
            seen.clear();

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const key = `${pCellX + dx},${pCellZ + dz}`;
                    const cell = grid.get(key);
                    if (!cell) continue;
                    for (const i of cell) {
                        const px = positions[i * 3];
                        const pz = positions[i * 3 + 2];
                        const ddx = px - playerPos.x;
                        const ddz = pz - playerPos.z;
                        if (ddx * ddx + ddz * ddz <= cullDistSq && !seen.has(i)) {
                            seen.add(i);
                            visibleIndices[visCount++] = i;
                        }
                    }
                }
            }

            let target = 0;
            for (let v = 0; v < visCount; v++) {
                const i = visibleIndices[v];
                if (i !== target) this._swapInstance(entry, i, target);
                target++;
            }

            // Hide mesh when count=0 — avoids wasted draw call
            if (target === 0) {
                mesh.visible = false;
            } else {
                if (!mesh.visible) mesh.visible = true;
                mesh.count = target;
            }
        }
    }

    _swapInstance(entry, a, b) {
        const { mesh, positions } = entry;
        mesh.getMatrixAt(a, this._tmpMatrix);
        mesh.getMatrixAt(b, this._tmpMatrix2);
        mesh.setMatrixAt(a, this._tmpMatrix2);
        mesh.setMatrixAt(b, this._tmpMatrix);

        for (let c = 0; c < 3; c++) {
            const tmp = positions[a * 3 + c];
            positions[a * 3 + c] = positions[b * 3 + c];
            positions[b * 3 + c] = tmp;
        }
    }

    _collectMeshes(obj, out, skipReasons, parentMapGen) {
        if (!obj.isMesh) {
            const hasMapGen = obj.userData?.mapGenerated || obj.userData?.instancable || parentMapGen;
            if (obj.children?.length) {
                for (const child of obj.children) {
                    this._collectMeshes(child, out, skipReasons, hasMapGen);
                }
            }
            return;
        }
        if (!parentMapGen && !obj.userData?.mapGenerated && !obj.userData?.instancable) { skipReasons.noMapGen++; return; }
        if (obj.userData.isFirefly || obj.userData.isCrystal || obj.userData.isTorch ||
            obj.userData.isGlow || obj.userData.isFountain || obj.userData.isWindTurbine ||
            obj.userData.isSnowParticles || obj.userData.isPOI || obj.userData.isSpawnPlatform ||
            obj.userData.isFirstPersonArm || obj.userData.isViewWeapon ||
            obj.userData.isTerrain || obj.userData.biomeGate || obj.userData.biomeBoundary ||
            obj.userData.dynamic) { skipReasons.aniInt++; return; }
        const geoKey = this.pool.geoKey(obj.geometry);
        if (!geoKey) { skipReasons.noGeoKey++; return; }
        const matKey = this.pool.matKey(obj.material);
        if (!matKey) { skipReasons.noMatKey++; return; }
        out.push(obj);
    }

    _cloneMaterial(mat) {
        const clone = mat.clone();
        clone.uuid = THREE.MathUtils.generateUUID();
        return clone;
    }

    dispose() {
        this._grouped.clear();
        this._instancedMeshes = [];
    }
}
