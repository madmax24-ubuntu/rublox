import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const stairs = mapGen.colliders.filter(c => c.isTowerStair);
const byTop = [...stairs].sort((a,b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
const s109 = byTop[109], s110 = byTop[110];
// step 109 local frame: rotation r109; player local coords (lx109, lz109) in step109 frame
// world offset of player from step109 center: P109 = R(r109) * (lx109, lz109)
// world offset of step110 center from step109 center: D
// player local in step110 frame: R(r110 - r109) * (P109 - D)
function localIn(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return [dx * c - dz * s, dx * s + dz * c];
}
function worldFrom(o, lx, lz) {
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}
const D = [s110.surfaceOBB.x - s109.surfaceOBB.x, s110.surfaceOBB.z - s109.surfaceOBB.z];
console.log("D (109->110 center offset):", D.map(v => v.toFixed(3)).join(", "));
const dr = s110.surfaceOBB.rotation - s109.surfaceOBB.rotation;
console.log("delta rotation:", dr.toFixed(4), "=", (dr*180/Math.PI).toFixed(1), "deg");
for (const [lx, lz] of [[1.6, 0.8], [1.6, 0.4], [1.6, 0.0], [1.6, -0.4], [1.6, -0.8], [1.2, 0.8], [1.2, -0.8], [0.8, 0.8], [0.8, -0.8]]) {
  const [wx, wz] = worldFrom(s109.surfaceOBB, lx, lz);
  const [l10x, l10z] = localIn(s110.surfaceOBB, wx, wz);
  const ew = Math.max(0.02, s110.surfaceOBB.halfWidth - 0.6*0.08);
  const ed = Math.max(0.02, s110.surfaceOBB.halfDepth - 0.6*0.08);
  const in110 = Math.abs(l10x) <= ew && Math.abs(l10z) <= ed;
  console.log(`player@109-local(${lx},${lz}) -> world(${wx.toFixed(2)},${wz.toFixed(2)}) -> 110-local(${l10x.toFixed(2)},${l10z.toFixed(2)}) contains=${in110}`);
}
