import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import { Physics } from "../world/Physics.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const physics = new Physics(scene, mapGen);
const idOf = new Map();
mapGen.colliders.forEach((c, i) => idOf.set(c, i));
const nameOf = (c) => {
  const i = idOf.get(c);
  if (c.isTowerStair) return `S${i}`;
  if (c.isTowerStructure) return `T${i}`;
  return `${c.walkable ? "W" : "N"}${i}`;
};
const px = 69.89, pz = -65.20, py = 30.20, bottom = 28.50;
for (const c of mapGen.colliders) {
  if (!c.min || !c.max) continue;
  if (c.max.y < bottom - 0.5 || c.min.y > py + 0.5) continue;
  const contains = physics._containsWalkableSurface(c, px, pz, 0.4);
  const contains6 = c.walkable ? physics._containsWalkableSurface(c, px, pz, 0.6) : null;
  console.log(`${nameOf(c)} walk=${c.walkable} min=(${c.min.x.toFixed(2)},${c.min.y.toFixed(2)},${c.min.z.toFixed(2)}) max=(${c.max.x.toFixed(2)},${c.max.y.toFixed(2)},${c.max.z.toFixed(2)}) obs=${c.surfaceOBB ? JSON.stringify(c.surfaceOBB) : "-"} circ=${c.surfaceCircle ? JSON.stringify(c.surfaceCircle) : "-"} contain04=${contains} contain06=${contains6}`);
}
process.exit(0);
