// Static gap analysis for tower spiral stairs (effective OBB overlap, radius 0.6)
// Run: node tests/tower-gap.test.js
import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";

function rectOverlap(rA, rB) {
	const axes = [];
	for (const r of [rA, rB]) {
		axes.push([Math.cos(r.rot), -Math.sin(r.rot)]);
		axes.push([Math.sin(r.rot), Math.cos(r.rot)]);
	}
	const dx = rB.x - rA.x;
	const dz = rB.z - rA.z;
	let minOverlap = Infinity;
	for (const [ax, az] of axes) {
		const projA = rA.hw * Math.abs(ax * Math.cos(rA.rot) - az * Math.sin(rA.rot)) +
			rA.hd * Math.abs(ax * Math.sin(rA.rot) + az * Math.cos(rA.rot));
		const projB = rB.hw * Math.abs(ax * Math.cos(rB.rot) - az * Math.sin(rB.rot)) +
			rB.hd * Math.abs(ax * Math.sin(rB.rot) + az * Math.cos(rB.rot));
		const centerDist = dx * ax + dz * az;
		const overlap = projA + projB - Math.abs(centerDist);
		if (overlap < minOverlap) minOverlap = overlap;
		if (overlap <= 0) return 0;
	}
	return minOverlap;
}

function effectiveRect(obb, radius) {
	const clearance = radius * (0.08);
	return {
		x: obb.x, z: obb.z,
		hw: Math.max(0.02, obb.halfWidth - clearance),
		hd: Math.max(0.02, obb.halfDepth - clearance),
		rot: obb.rotation,
	};
}

const scene = new (await import("../node_modules/three/build/three.module.js")).Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();

const tower = mapGen._buildings.find((b) => b.template?.type === "maze_tower");
const stairs = mapGen.colliders
	.filter((c) => c.isTowerStair)
	.sort((a, b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));

console.log(`Tower at (${tower.x.toFixed(1)}, ${tower.z.toFixed(1)}), steps=${stairs.length}`);
let bad = 0;
for (let i = 0; i < stairs.length - 1; i++) {
	const A = stairs[i], B = stairs[i + 1];
	const ov6 = rectOverlap(effectiveRect(A.surfaceOBB, 0.6), effectiveRect(B.surfaceOBB, 0.6));
	const ov4 = rectOverlap(effectiveRect(A.surfaceOBB, 0.4), effectiveRect(B.surfaceOBB, 0.4));
	const dy = B.max.y - A.max.y;
	if (ov6 <= 0 || ov6 < 0.12 || dy > 0.65) {
		bad++;
		console.log(`  step ${i}->${i + 1}: ov6=${ov6.toFixed(3)} ov4=${ov4.toFixed(3)} dy=${dy.toFixed(2)} @(${A.surfaceOBB.x.toFixed(1)},${A.surfaceOBB.z.toFixed(1)}) top=${A.max.y.toFixed(2)}->${B.max.y.toFixed(2)}`);
	}
}
console.log(`bad pairs=${bad} of ${stairs.length - 1}`);
process.exit(0);
