import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const stairs = mapGen.colliders.filter(c => c.isTowerStair);
const byTop = [...stairs].sort((a,b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
const A = byTop[109];
const B = byTop[110];
// Player at A-local (1.246, 0.100), world approx (69.4, -67.1), bottom=28.00, onGround=true
// Simulate: move in -x (A-local) direction toward B center. At each sub-step, check:
//  1. Is position still inside A's OBB (to stay on ground)?
//  2. Is position inside B's OBB (to trigger step-up)?
//  3. Does AABB push-out from any non-walkable or walkable box block the movement?
function worldFrom(o, lx, lz) {
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}
function localIn(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return [dx * c - dz * s, dx * s + dz * c];
}
const oa = A.surfaceOBB, ob = B.surfaceOBB;
const hwA = Math.max(0.02, oa.halfWidth - 0.048), hdA = Math.max(0.02, oa.halfDepth - 0.048);
const hwB = Math.max(0.02, ob.halfWidth - 0.048), hdB = Math.max(0.02, ob.halfDepth - 0.048);
// Start at A-local (1.24, 0.10), move in -x direction in small steps
let [lx, lz] = [1.24, 0.10];
console.log("step | A-local(x,z) | world(x,z) | inA | inB | AABB-push-from");
for (let i = 0; i < 20; i++) {
  const [wx, wz] = worldFrom(oa, lx, lz);
  const [alx, alz] = localIn(oa, wx, wz);
  const [blx, blz] = localIn(ob, wx, wz);
  const inA = Math.abs(alx) <= hwA && Math.abs(alz) <= hdA;
  const inB = Math.abs(blx) <= hwB && Math.abs(blz) <= hdB;
  // Check AABB push: for each nearby walkable box, does the player's new position penetrate its AABB?
  let pushFrom = [];
  for (const c of mapGen.colliders) {
    if (!c.walkable || !c.min || !c.max) continue;
    // Y overlap: player bottom=28.00, top=29.70
    if (29.70 < c.min.y - 0.3) continue;
    if (28.00 > c.max.y + 0.3) continue;
    // XZ: is player inside or near the AABB?
    const clx = Math.max(c.min.x, Math.min(wx, c.max.x));
    const clz = Math.max(c.min.z, Math.min(wz, c.max.z));
    const dx = wx - clx, dz = wz - clz;
    const distSq = dx*dx + dz*dz;
    const pushDistSq = (0.4 + 0.5) * (0.4 + 0.5);
    if (distSq <= pushDistSq) {
      const dist = Math.sqrt(distSq);
      const pen = 0.4 - dist;
      if (pen > 0.005) pushFrom.push(`${c.isTowerStair?"S":c.isTowerStructure?"T":"?"}${mapGen.colliders.indexOf(c)}(pen=${pen.toFixed(2)})`);
    }
  }
  console.log(`${i} | (${lx.toFixed(2)},${lz.toFixed(2)}) | (${wx.toFixed(2)},${wz.toFixed(2)}) | ${inA?"Y":"N"} | ${inB?"Y":"N"} | ${pushFrom.join(", ")||"-"}`);
  if (inB && inA) { console.log(`  >>> ENTERED INTERSECTION at step ${i} <<<`); break; }
  lx -= 0.1;  // move in -x (A-local) direction
}
