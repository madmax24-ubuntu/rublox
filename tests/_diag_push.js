import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
// Reproduce the exact AABB push for the roof T465 on the player at the stuck position
const roofs = mapGen.colliders.filter(c => c.isTowerStructure && c.max.y > 29 && c.max.y < 31 && !c.isTowerStair);
const T465 = mapGen.colliders.find((c,i) => i === 465);
console.log("T465:", JSON.stringify({min:[T465.min.x,T465.min.y,T465.min.z], max:[T465.max.x,T465.max.y,T465.max.z]}));
// Player at stuck position (69.56, 29.70, -67.0), baseRadius=0.4
const px=69.56, py=29.70, pz=-67.0, baseRadius=0.4;
const c = T465;
const clx = Math.max(c.min.x, Math.min(px, c.max.x));
const clz = Math.max(c.min.z, Math.min(pz, c.max.z));
const dx = px - clx, dz = pz - clz;
const distSq = dx*dx+dz*dz;
const dist = Math.sqrt(distSq);
const pen = baseRadius - dist;
console.log(`clamped=(${clx.toFixed(2)},${clz.toFixed(2)}) dx=${dx.toFixed(3)} dz=${dz.toFixed(3)} dist=${dist.toFixed(3)} pen=${pen.toFixed(3)}`);
console.log(`pushDistSq=${(baseRadius+0.5)**2} distSq=${distSq.toFixed(3)} -> push? ${distSq <= (baseRadius+0.5)**2}`);
if (pen > 0.005) {
  const push = Math.min(pen * 1.5, 0.5);
  const invDist = 1/dist;
  console.log(`push dir=(${(dx*invDist).toFixed(3)},${(dz*invDist).toFixed(3)}) pushAmt=${push.toFixed(3)}`);
  console.log(`  -> moves player x by ${(dx*invDist*push).toFixed(3)}, z by ${(dz*invDist*push).toFixed(3)}`);
}
