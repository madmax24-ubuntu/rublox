import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const stairs = mapGen.colliders.filter(c => c.isTowerStair);
const byTop = [...stairs].sort((a,b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
const A = byTop[109].surfaceOBB, B = byTop[110].surfaceOBB;
function localIn(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return [dx * c - dz * s, dx * s + dz * c];
}
// Find intersection region of A and B: sample grid over A's world AABB, test in both
const cA = Math.cos(A.rotation), sA = Math.sin(A.rotation);
const hwA = Math.max(0.02, A.halfWidth - 0.048), hdA = Math.max(0.02, A.halfDepth - 0.048);
const hwB = Math.max(0.02, B.halfWidth - 0.048), hdB = Math.max(0.02, B.halfDepth - 0.048);
let hits = [];
for (let gx = -hwA; gx <= hwA; gx += 0.02) for (let gz = -hdA; gz <= hdA; gz += 0.02) {
  const wx = A.x + gx * cA + gz * sA, wz = A.z - gx * sA + gz * cA;
  const [lx, lz] = localIn(B, wx, wz);
  if (Math.abs(lx) <= hwB && Math.abs(lz) <= hdB) hits.push([wx, wz, gx, gz]);
}
console.log(`intersection points: ${hits.length}`);
if (hits.length) {
  const xs = hits.map(h=>h[0]), zs = hits.map(h=>h[1]);
  console.log(`world x range: [${Math.min(...xs).toFixed(2)}, ${Math.max(...xs).toFixed(2)}]`);
  console.log(`world z range: [${Math.min(...zs).toFixed(2)}, ${Math.max(...zs).toFixed(2)}]`);
  console.log(`A-local x range: [${Math.min(...hits.map(h=>h[2])).toFixed(2)}, ${Math.max(...hits.map(h=>h[2])).toFixed(2)}]`);
  console.log(`A-local z range: [${Math.min(...hits.map(h=>h[3])).toFixed(2)}, ${Math.max(...hits.map(h=>h[3])).toFixed(2)}]`);
  const cx = (Math.min(...xs)+Math.max(...xs))/2, cz=(Math.min(...zs)+Math.max(...zs))/2;
  console.log(`intersection center world: (${cx.toFixed(2)}, ${cz.toFixed(2)})`);
  console.log(`A center: (${A.x.toFixed(2)}, ${A.z.toFixed(2)})  B center: (${B.x.toFixed(2)}, ${B.z.toFixed(2)})`);
  // where is the intersection relative to A center (in A-local frame)?
  const [icx, icz] = localIn(A, cx, cz);
  console.log(`intersection center in A-local: (${icx.toFixed(2)}, ${icz.toFixed(2)})  [A hw=${hwA.toFixed(2)} hd=${hdA.toFixed(2)}]`);
}
