import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
// Find all walkable colliders and check: for a player at various heights, which walkable boxes would have Y-overlap with tol=0.3 vs tol=0.05?
const colliders = mapGen.colliders.filter(c => c.walkable && c.min && c.max);
// Player height 1.7. Check boxes where the "false overlap" happens: box min.y is just above player head.
// For a player standing on ground at y=0 (head=1.7), which boxes have min.y in [1.7-0.3, 1.7+something]?
let falsePos03 = 0, falsePos005 = 0;
for (const c of colliders) {
  const playerHead = 1.7, playerBottom = 0;
  // tol=0.3: overlap if !(head < min.y-0.3) && !(bottom > max.y+0.3)
  const ov03 = !(playerHead < c.min.y - 0.3) && !(playerBottom > c.max.y + 0.3);
  // tol=0.05: overlap if !(head < min.y-0.05) && !(bottom > max.y+0.05)
  const ov005 = !(playerHead < c.min.y - 0.05) && !(playerBottom > c.max.y + 0.05);
  if (ov03 && !ov005) {
    falsePos03++;
    if (falsePos03 <= 15) console.log(`false-overlap(0.3) T?${mapGen.colliders.indexOf(c)}: y[${c.min.y.toFixed(2)},${c.max.y.toFixed(2)}] x[${c.min.x.toFixed(1)},${c.max.x.toFixed(1)}] z[${c.min.z.toFixed(1)},${c.max.z.toFixed(1)}] ${c.isTowerStructure?"tower":c.isTowerStair?"stair":""}`);
  }
  if (ov005) falsePos005++;
}
console.log(`\nwalkable boxes with false-overlap at tol=0.3: ${falsePos03}`);
console.log(`walkable boxes with true-overlap at tol=0.05: ${falsePos005}`);
