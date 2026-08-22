import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
// Check roof cells T465, T466 and the player at the stuck position
const T465 = mapGen.colliders[465], T466 = mapGen.colliders[466];
for (const [name, c] of [["T465",T465],["T466",T466]]) {
  console.log(`${name}: AABB x[${c.min.x.toFixed(2)},${c.max.x.toFixed(2)}] z[${c.min.z.toFixed(2)},${c.max.z.toFixed(2)}] y[${c.min.y.toFixed(2)},${c.max.y.toFixed(2)}] OBB=${c.surfaceOBB?"Y":"N"}`);
}
// Player at stuck position
const px=69.88, py=30.20, pz=-65.0, bottom=28.50, baseRadius=0.4;
for (const [name, c] of [["T465",T465],["T466",T466]]) {
  const yOverlap = !(py < c.min.y - 0.3) && !(bottom > c.max.y + 0.3);
  const standingOn = bottom >= c.max.y - 0.05;
  let onSurface = false;
  if (c.surfaceOBB) {
    const o = c.surfaceOBB;
    const dx = px - o.x, dz = pz - o.z;
    const cos = Math.cos(o.rotation), sin = Math.sin(o.rotation);
    const lx = dx*cos - dz*sin, lz = dx*sin + dz*cos;
    const clr = baseRadius * 0.08;
    onSurface = Math.abs(lx) <= Math.max(0.02, o.halfWidth-clr) && Math.abs(lz) <= Math.max(0.02, o.halfDepth-clr);
    console.log(`${name}: yOverlap=${yOverlap} standingOn=${standingOn} onSurface=${onSurface} (local=(${lx.toFixed(2)},${lz.toFixed(2)}))`);
  } else {
    onSurface = px >= c.min.x + baseRadius*0.08 && px <= c.max.x - baseRadius*0.08 && pz >= c.min.z + baseRadius*0.08 && pz <= c.max.z - baseRadius*0.08;
    console.log(`${name}: yOverlap=${yOverlap} standingOn=${standingOn} onSurface(AABB)=${onSurface}`);
  }
  const headBelow = py < c.min.y;
  const stepHeight = c.max.y - bottom;
  const stepReach = (c.isTowerStair || c.isBiomeEntrance) ? 0.78 : 0.65;
  const wouldStepUp = (true || false) && onSurface && stepHeight > 0.02 && stepHeight <= stepReach;
  console.log(`   headBelow=${headBelow} stepH=${stepHeight.toFixed(2)} stepReach=${stepReach} wouldStepUp=${wouldStepUp}`);
  console.log(`   => PUSH? ${yOverlap && !standingOn && onSurface && !wouldStepUp && !headBelow ? "YES":"no"}`);
}
