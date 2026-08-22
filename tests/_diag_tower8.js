import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const stairs = mapGen.colliders.filter(c => c.isTowerStair);
const byTop = [...stairs].sort((a,b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
const A = byTop[109];
// Roof cells
const roofs = mapGen.colliders.filter(c => c.isTowerStructure && c.max.y > 29 && c.max.y < 31 && !c.isTowerStair);
console.log(`roof cells: ${roofs.length}`);
for (const r of roofs) {
  console.log(`  T${mapGen.colliders.indexOf(r)}: AABB x[${r.min.x.toFixed(2)},${r.max.x.toFixed(2)}] z[${r.min.z.toFixed(2)},${r.max.z.toFixed(2)}] y[${r.min.y.toFixed(2)},${r.max.y.toFixed(2)}] OBB=${r.surfaceOBB?"Y":"N"}`);
}
// The player at (69.56, 29.70, -67.0) bottom=28.00. Which roof cells have Y-overlap and contain the player in XZ?
const px = 69.56, py = 29.70, pz = -67.0, bottom = 28.00;
console.log(`\nPlayer at (${px}, ${py}, ${pz}) bottom=${bottom}`);
for (const r of roofs) {
  const yOverlap = !(py < r.min.y - 0.3) && !(bottom > r.max.y + 0.3);
  if (!yOverlap) continue;
  const inXZ = px >= r.min.x && px <= r.max.x && pz >= r.min.z && pz <= r.max.z;
  const nearXZ = (px >= r.min.x - 0.9 && px <= r.max.x + 0.9) && (pz >= r.min.z - 0.9 && pz <= r.max.z + 0.9);
  console.log(`  T${mapGen.colliders.indexOf(r)}: yOverlap=Y inXZ=${inXZ?"Y":"N"} nearXZ(0.9)=${nearXZ?"Y":"N"}`);
}
