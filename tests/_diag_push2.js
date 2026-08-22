import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
// Player stuck at step 111: (69.88, 30.20, -65.0), bot=28.50, onGround=true
const px=69.88, py=30.20, pz=-65.0, bottom=28.50, baseRadius=0.4;
// Find all walkable boxes that would push (onSurface + below top + Y-overlap)
console.log("Boxes that would push player at (69.88, 30.20, -65.0):");
for (const c of mapGen.colliders) {
  if (c.enabled === false || !c.min || !c.max) continue;
  if (py < c.min.y - 0.3) continue;
  if (bottom > c.max.y + 0.3) continue;
  if (!c.walkable) continue;
  if (bottom >= c.max.y - 0.05) continue;
  // onSurface check
  let onSurface = false;
  if (c.surfaceOBB) {
    const o = c.surfaceOBB;
    const dx = px - o.x, dz = pz - o.z;
    const cos = Math.cos(o.rotation), sin = Math.sin(o.rotation);
    const lx = dx*cos - dz*sin, lz = dx*sin + dz*cos;
    const clr = baseRadius * 0.08;
    onSurface = Math.abs(lx) <= Math.max(0.02, o.halfWidth-clr) && Math.abs(lz) <= Math.max(0.02, o.halfDepth-clr);
  } else {
    onSurface = px >= c.min.x + baseRadius*0.08 && px <= c.max.x - baseRadius*0.08 && pz >= c.min.z + baseRadius*0.08 && pz <= c.max.z - baseRadius*0.08;
  }
  if (!onSurface) continue;
  const stepHeight = c.max.y - bottom;
  const stepReach = (c.isTowerStair || c.isBiomeEntrance) ? 0.78 : 0.65;
  const canStep = true; // onGround
  const wouldStepUp = canStep && stepHeight > 0.02 && stepHeight <= stepReach;
  const headBelow = py < c.min.y;
  console.log(`  ${c.isTowerStair?"S":c.isTowerStructure?"T":"W"}${mapGen.colliders.indexOf(c)}: top=${c.max.y.toFixed(2)} min.y=${c.min.y.toFixed(2)} stepH=${stepHeight.toFixed(2)} stepUp=${wouldStepUp?"Y":"N"} headBelowRoof=${headBelow?"Y":"N"}`);
}
