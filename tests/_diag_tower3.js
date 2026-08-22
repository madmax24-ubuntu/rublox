import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const stairs = mapGen.colliders.filter(c => c.isTowerStair);
const byTop = [...stairs].sort((a,b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));

function localIn(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return [dx * c - dz * s, dx * s + dz * c];
}
function satOverlap(A, B, radius) {
  const clr = radius * 0.08;
  const ra = { x: A.x, z: A.z, rot: A.rotation, hw: Math.max(0.02, A.halfWidth - clr), hd: Math.max(0.02, A.halfDepth - clr) };
  const rb = { x: B.x, z: B.z, rot: B.rotation, hw: Math.max(0.02, B.halfWidth - clr), hd: Math.max(0.02, B.halfDepth - clr) };
  const axes = [];
  for (const r of [ra, rb]) { axes.push([Math.cos(r.rot), -Math.sin(r.rot)]); axes.push([Math.sin(r.rot), Math.cos(r.rot)]); }
  const dx = rb.x - ra.x, dz = rb.z - ra.z;
  let minOv = Infinity, worst = null;
  for (const [ax, az] of axes) {
    const projA = ra.hw * Math.abs(ax * Math.cos(ra.rot) - az * Math.sin(ra.rot)) + ra.hd * Math.abs(ax * Math.sin(ra.rot) + az * Math.cos(ra.rot));
    const projB = rb.hw * Math.abs(ax * Math.cos(rb.rot) - az * Math.sin(rb.rot)) + rb.hd * Math.abs(ax * Math.sin(rb.rot) + az * Math.cos(rb.rot));
    const ov = projA + projB - Math.abs(dx * ax + dz * az);
    if (ov < minOv) { minOv = ov; worst = [ax, az]; }
    if (ov <= 0) return { minOv: 0, worst };
  }
  return { minOv, worst };
}
// check all consecutive pairs: SAT overlap + does an actual point exist inside both (grid sample of intersection)
let bad = 0, thin = 0;
for (let i = 0; i < byTop.length - 1; i++) {
  const A = byTop[i].surfaceOBB, B = byTop[i+1].surfaceOBB;
  const { minOv, worst } = satOverlap(A, B, 0.6);
  // sample intersection region: grid over A's AABB in world, test containment in both
  const c = Math.cos(A.rotation), s = Math.sin(A.rotation);
  const hw = Math.max(0.02, A.halfWidth - 0.048), hd = Math.max(0.02, A.halfDepth - 0.048);
  let sampleHits = 0;
  for (let gx = -hw; gx <= hw; gx += 0.05) for (let gz = -hd; gz <= hd; gz += 0.05) {
    const wx = A.x + gx * c + gz * s, wz = A.z - gx * s + gz * c;
    const [lx, lz] = localIn(B, wx, wz);
    const bw = Math.max(0.02, B.halfWidth - 0.048), bd = Math.max(0.02, B.halfDepth - 0.048);
    if (Math.abs(lx) <= bw && Math.abs(lz) <= bd) sampleHits++;
  }
  if (minOv <= 0 || sampleHits === 0) { bad++; console.log(`pair ${i}->${i+1}: SAT=${minOv.toFixed(3)} samples=${sampleHits} @(${A.x.toFixed(1)},${A.z.toFixed(1)})`); }
  else if (minOv < 0.15) { thin++; }
}
console.log(`bad=${bad} thin(<0.15)=${thin} of ${byTop.length-1}`);
