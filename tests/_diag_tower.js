import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const stairs = mapGen.colliders.filter(c => c.isTowerStair);
const byTop = [...stairs].sort((a,b) => (a.max.y - b.max.y) || (a.max.y - a.min.y) - (b.max.y - b.min.y));
const idx = byTop.map(c => c.max.y).length;
const s109 = byTop[109], s110 = byTop[110], s111 = byTop[111];
for (const [n, s] of [["109", s109], ["110", s110], ["111", s111]]) {
  const o = s.surfaceOBB;
  console.log(`step${n}: center=(${o.x.toFixed(3)},${o.z.toFixed(3)}) top=${s.max.y.toFixed(3)} bottom=${s.min.y.toFixed(3)} rot=${o.rotation.toFixed(4)} hw=${o.halfWidth.toFixed(3)} hd=${o.halfDepth.toFixed(3)}`);
  console.log(`  AABB: x[${s.min.x.toFixed(3)},${s.max.x.toFixed(3)}] z[${s.min.z.toFixed(3)},${s.max.z.toFixed(3)}]`);
}
const px = 69.56, pz = -67.27, radius = 0.6;
for (const [n, s] of [["109", s109], ["110", s110], ["111", s111]]) {
  const o = s.surfaceOBB;
  const dx = px - o.x, dz = pz - o.z;
  const cos = Math.cos(o.rotation), sin = Math.sin(o.rotation);
  const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
  const clearance = radius * 0.08;
  const ew = Math.max(0.02, o.halfWidth - clearance), ed = Math.max(0.02, o.halfDepth - clearance);
  console.log(`player@(${px},${pz}) vs step${n}: local=(${lx.toFixed(3)},${lz.toFixed(3)}) limit=(${ew.toFixed(3)},${ed.toFixed(3)}) contains=${Math.abs(lx) <= ew && Math.abs(lz) <= ed}`);
}
