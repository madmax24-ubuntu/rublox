import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import * as THREE from "../node_modules/three/build/three.module.js";
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const stairs = mapGen.colliders.filter(c => c.isTowerStair);
const byTop = [...stairs].sort((a,b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
const A = byTop[109], B = byTop[110];
function worldFrom(o, lx, lz) { const c=Math.cos(o.rotation), s=Math.sin(o.rotation); return [o.x + lx*c + lz*s, o.z - lx*s + lz*c]; }
function localIn(o, x, z) { const dx=x-o.x, dz=z-o.z; const c=Math.cos(o.rotation), s=Math.sin(o.rotation); return [dx*c - dz*s, dx*s + dz*c]; }
const oa = A.surfaceOBB, ob = B.surfaceOBB;
const hwA = Math.max(0.02, oa.halfWidth-0.048), hdA = Math.max(0.02, oa.halfDepth-0.048);
const hwB = Math.max(0.02, ob.halfWidth-0.048), hdB = Math.max(0.02, ob.halfDepth-0.048);
const baseRadius = 0.4;
function contains(o, x, z, r) {
  const [lx, lz] = localIn(o, x, z);
  const clr = r * 0.08;
  return Math.abs(lx) <= Math.max(0.02, o.halfWidth-clr) && Math.abs(lz) <= Math.max(0.02, o.halfDepth-clr);
}
// Simulate resolveCollisions push logic correctly for walkable boxes
function pushCheck(wx, wz, bottom) {
  const pushes = [];
  for (const c of mapGen.colliders) {
    if (c.enabled === false) continue;
    if (!c.min || !c.max) continue;
    if (29.70 < c.min.y - 0.3) continue;
    if (bottom > c.max.y + 0.3) continue;
    if (c.walkable) {
      if (bottom >= c.max.y - 0.05) continue;  // standing on it -> skip
      const onSurface = c.surfaceOBB ? contains(c.surfaceOBB, wx, wz, baseRadius) :
        (wx >= c.min.x + baseRadius*0.08 && wx <= c.max.x - baseRadius*0.08 && wz >= c.min.z + baseRadius*0.08 && wz <= c.max.z - baseRadius*0.08);
      if (!onSurface) continue;  // not on surface -> no push
      // onSurface and below top -> would step-up (pos.y set), not AABB push. 
      // In real code, step-up does pos.y=max.y+height then continue (no AABB push).
      // So a walkable box that is onSurface and below top causes STEP-UP, not push.
      pushes.push(`${c.isTowerStair?"S":c.isTowerStructure?"T":"W"}${mapGen.colliders.indexOf(c)}(STEP-UP top=${c.max.y.toFixed(2)})`);
    } else {
      const clx = Math.max(c.min.x, Math.min(wx, c.max.x));
      const clz = Math.max(c.min.z, Math.min(wz, c.max.z));
      const dx = wx-clx, dz = wz-clz;
      const distSq = dx*dx+dz*dz;
      if (distSq <= (baseRadius+0.5)*(baseRadius+0.5)) {
        const dist = Math.sqrt(distSq);
        const pen = baseRadius - dist;
        if (pen > 0.005) pushes.push(`${c.isTowerStructure?"T":"N"}${mapGen.colliders.indexOf(c)}(pen=${pen.toFixed(2)})`);
      }
    }
  }
  return pushes;
}
let [lx, lz] = [1.24, 0.10];
for (let i = 0; i < 20; i++) {
  const [wx, wz] = worldFrom(oa, lx, lz);
  const inA = contains(oa, wx, wz, baseRadius);
  const inB = contains(ob, wx, wz, baseRadius);
  const pushes = pushCheck(wx, wz, 28.00);
  console.log(`s${i} | (${lx.toFixed(2)},${lz.toFixed(2)}) | (${wx.toFixed(2)},${wz.toFixed(2)}) | inA=${inA?"Y":"N"} inB=${inB?"Y":"N"} | ${pushes.join(", ")||"-"}`);
  if (inB && inA) { console.log(`>>> INTERSECTION at s${i} <<<`); break; }
  lx -= 0.1;
}
