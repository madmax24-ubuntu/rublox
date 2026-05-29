import * as THREE from "three";

// Optimized spatial hash grid for O(1) nearby collision queries
export class AABBGrid {
    constructor(cellSize = 2.0) {
        this.cellSize = cellSize;
        this.grid = new Map(); // key: "x,y,z" → Collider[]
        this.totalColliders = 0;
    }

    // Hash coordinates to grid key
    _key(cx, cy, cz) {
        return cx * 100003 + cy * 31 + cz;
    }

    // Add a collider to the grid
    addCollider(box) {
        const { min, max } = box;
        const cx0 = Math.floor(min.x / this.cellSize);
        const cy0 = Math.floor(min.y / this.cellSize);
        const cz0 = Math.floor(min.z / this.cellSize);
        const cx1 = Math.floor(max.x / this.cellSize);
        const cy1 = Math.floor(max.y / this.cellSize);
        const cz1 = Math.floor(max.z / this.cellSize);

        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cy = cy0; cy <= cy1; cy++) {
                for (let cz = cz0; cz <= cz1; cz++) {
                    const key = this._key(cx, cy, cz);
                    if (!this.grid.has(key)) {
                        this.grid.set(key, []);
                    }
                    this.grid.get(key).push(box);
                }
            }
        }
        this.totalColliders++;
    }

    // Remove a collider from the grid
    removeCollider(box) {
        const { min, max } = box;
        const cx0 = Math.floor(min.x / this.cellSize);
        const cy0 = Math.floor(min.y / this.cellSize);
        const cz0 = Math.floor(min.z / this.cellSize);
        const cx1 = Math.floor(max.x / this.cellSize);
        const cy1 = Math.floor(max.y / this.cellSize);
        const cz1 = Math.floor(max.z / this.cellSize);

        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cy = cy0; cy <= cy1; cy++) {
                for (let cz = cz0; cz <= cz1; cz++) {
                    const key = this._key(cx, cy, cz);
                    const cells = this.grid.get(key);
                    if (cells) {
                        const idx = cells.indexOf(box);
                        if (idx !== -1) cells.splice(idx, 1);
                    }
                }
            }
        }
        this.totalColliders--;
    }

    // Query all colliders in a sphere
    querySphere(center, radius) {
        const results = [];
        const cx0 = Math.floor((center.x - radius) / this.cellSize);
        const cy0 = Math.floor((center.y - radius) / this.cellSize);
        const cz0 = Math.floor((center.z - radius) / this.cellSize);
        const cx1 = Math.floor((center.x + radius) / this.cellSize);
        const cy1 = Math.floor((center.y + radius) / this.cellSize);
        const cz1 = Math.floor((center.z + radius) / this.cellSize);
        const r2 = radius * radius;

        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cy = cy0; cy <= cy1; cy++) {
                for (let cz = cz0; cz <= cz1; cz++) {
                    const key = this._key(cx, cy, cz);
                    const cells = this.grid.get(key);
                    if (!cells) continue;
                    for (const box of cells) {
                        // Sphere-AABB test
                        const dx = Math.max(0, center.x - box.max.x);
                        const dy = Math.max(0, center.y - box.max.y);
                        const dz = Math.max(0, center.z - box.min.z);
                        if (dx * dx + dy * dy + dz * dz < r2) {
                            results.push(box);
                        }
                    }
                }
            }
        }
        return results;
    }

    // Query all colliders in a box
    queryBox(queryBox) {
        const results = [];
        const cx0 = Math.floor(queryBox.min.x / this.cellSize);
        const cy0 = Math.floor(queryBox.min.y / this.cellSize);
        const cz0 = Math.floor(queryBox.min.z / this.cellSize);
        const cx1 = Math.floor(queryBox.max.x / this.cellSize);
        const cy1 = Math.floor(queryBox.max.y / this.cellSize);
        const cz1 = Math.floor(queryBox.max.z / this.cellSize);

        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cy = cy0; cy <= cy1; cy++) {
                for (let cz = cz0; cz <= cz1; cz++) {
                    const key = this._key(cx, cy, cz);
                    const cells = this.grid.get(key);
                    if (!cells) continue;
                    for (const box of cells) {
                        // AABB-AABB overlap test
                        if (queryBox.max.x >= box.min.x && queryBox.min.x <= box.max.x &&
                            queryBox.max.y >= box.min.y && queryBox.min.y <= box.max.y &&
                            queryBox.max.z >= box.min.z && queryBox.min.z <= box.max.z) {
                            results.push(box);
                        }
                    }
                }
            }
        }
        return results;
    }

    // Get nearby colliders (wrapper for sphere query)
    getNearby(center, radius, maxCount = 50) {
        const results = this.querySphere(center, radius);
        if (maxCount && results.length > maxCount) {
            // Sort by distance and return closest
            const dists = results.map(b => {
                const dx = (b.min.x + b.max.x) / 2 - center.x;
                const dz = (b.min.z + b.max.z) / 2 - center.z;
                return { box: b, dist: dx * dx + dz * dz };
            });
            dists.sort((a, b) => a.dist - b.dist);
            return dists.slice(0, maxCount).map(d => d.box);
        }
        return results;
    }

    // Build grid from a list of colliders
    buildFromColliders(colliders) {
        this.clear();
        for (const box of colliders) {
            this.addCollider(box);
        }
    }

    // Clear the grid
    clear() {
        this.grid.clear();
        this.totalColliders = 0;
    }

    // Get grid statistics
    getStats() {
        let maxCells = 0;
        for (const cells of this.grid.values()) {
            if (cells.length > maxCells) maxCells = cells.length;
        }
        return {
            totalCells: this.grid.size,
            totalColliders: this.totalColliders,
            avgDensity: this.grid.size > 0 ? this.totalColliders / this.grid.size : 0,
            maxCellDensity: maxCells
        };
    }
}

// Simple AABB overlap helper
export function aabbOverlap(a, b) {
    return a.max.x >= b.min.x && a.min.x <= b.max.x &&
           a.max.y >= b.min.y && a.min.y <= b.max.y &&
           a.max.z >= b.min.z && a.min.z <= b.max.z;
}

// Sphere-AABB overlap helper
export function sphereAABBOverlap(center, radius, box) {
    const dx = Math.max(0, center.x - box.max.x);
    const dy = Math.max(0, center.y - box.max.y);
    const dz = Math.max(0, center.z - box.min.z);
    const closest = new THREE.Vector3(
        center.x - dx,
        center.y - dy,
        center.z - dz
    );
    const distSq = center.distanceToSquared(closest);
    return distSq < radius * radius;
}
