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
// For each consecutive pair, find intersection region extent in A-local frame, and the "landing zone" 
// A player climbing from A to B needs to be in the intersection. Report how far the intersection is from A center.
let problems = 0;
for (let i = 0; i < byTop.length - 1; i++) {
  const A = byTop[i].surfaceOBB, B = byTop[i+1].surfaceOBB;
  const cA = Math.cos(A.rotation), sA = Math.sin(A.rotation);
  const hwA = Math.max(0.02, A.halfWidth - 0.048), hdA = Math.max(0.02, A.halfDepth - 0.048);
  const hwB = Math.max(0.02, B.halfWidth - 0.048), hdB = Math.max(0.02, B.halfDepth - 0.048);
  let minLx=Infinity, maxLx=-Infinity, minLz=Infinity, maxLz=-Infinity, count=0;
  for (let gx = -hwA; gx <= hwA; gx += 0.04) for (let gz = -hdA; gz <= hdA; gz += 0.04) {
    const wx = A.x + gx * cA + gz * sA, wz = A.z - gx * sA + gz * cA;
    const [lx, lz] = localIn(B, wx, wz);
    if (Math.abs(lx) <= hwB && Math.abs(lz) <= hdB) {
      count++;
      if (gx < minLx) minLx = gx; if (gx > maxLx) maxLx = gx;
      if (gz < minLz) minLz = gz; if (gz > maxLz) maxLz = gz;
    }
  }
  // The intersection must be reachable: it should include points near A's center or be within A's footprint
  // A player standing anywhere on A can only step up if they can walk (within A) to the intersection.
  // Measure: does the intersection touch the "inner" half of A (the side toward the spiral direction)?
  if (count === 0) { problems++; console.log(`pair ${i}->${i+1}: NO INTERSECTION`); continue; }
  // Check if intersection overlaps with the central band of A (|lx| < hwA*0.5)
  let central = 0;
  for (let gx = -hwA; gx <= hwA; gx += 0.04) for (let gz = -hdA; gz <= hdA; gz += 0.04) {
    if (Math.abs(gx) > hwA * 0.55) continue;
    const wx = A.x + gx * cA + gz * sA, wz = A.z - gx * sA + gz * cA;
    const [lx, lz] = localIn(B, wx, wz);
    if (Math.abs(lx) <= hwB && Math.abs(lz) <= hdB) central++;
  }
  if (central === 0) { problems++; console.log(`pair ${i}->${i+1}: intersection only at outer edge (lx [${minLx.toFixed(2)},${maxLx.toFixed(2)}], lz [${minLz.toFixed(2)},${maxLz.toFixed(2)}], central=0)`); }
}
console.log(`problematic pairs=${problems} of ${byTop.length-1}`);
