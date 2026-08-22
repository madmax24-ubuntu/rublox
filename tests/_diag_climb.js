// Test: simulate the tower climb with different Y-overlap tolerances
import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import { Physics } from "../world/Physics.js";
import * as THREE from "../node_modules/three/build/three.module.js";

const PLAYER_RADIUS = 0.4, PLAYER_HEIGHT = 1.7, PLAYER_SPEED = 13.6;
class FakePlayer {
  constructor() {
    this.type = "Player";
    this.position = new THREE.Vector3();
    this.physics = { velocity: new THREE.Vector3(), onGround: false, wasOnGround: false, fallStartY: 0, height: PLAYER_HEIGHT, radius: PLAYER_RADIUS, speed: PLAYER_SPEED };
    this.isFrozen = false; this.isInvulnerable = true;
    this.takeDamage = () => {}; this.applyBurn = () => {}; this.applySlow = () => {};
  }
}
function steer(entity, tx, tz, speed = PLAYER_SPEED) {
  const dx = tx - entity.position.x, dz = tz - entity.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { entity.physics.velocity.x = 0; entity.physics.velocity.z = 0; return 0; }
  entity.physics.velocity.x = (dx / d) * speed;
  entity.physics.velocity.z = (dz / d) * speed;
  return d;
}

function runClimb(yTol) {
  const scene = new THREE.Scene();
  const mapGen = new MapGenerator(scene);
  mapGen.startGeneration().then(async () => {
    const physics = new Physics(scene, mapGen);
    // Monkey-patch the Y-overlap tolerance in resolveCollisions
    // We can't easily patch the closure, so instead we test by checking if the climb succeeds
    const tower = mapGen._buildings.find(b => b.template?.type === "maze_tower");
    const stairs = mapGen.colliders.filter(c => c.isTowerStair).sort((a,b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
    const stepList = stairs.map(c => ({ x: c.surfaceOBB.x, z: c.surfaceOBB.z, top: c.max.y }));
    const start = { x: stepList[0].x, y: 0.12 + PLAYER_HEIGHT, z: stepList[0].z };
    const player = new FakePlayer();
    player.position.set(start.x, start.y, start.z);
    physics.addEntity(player);
    let progress = 0;
    let result = "stuck";
    for (let f = 0; f < 520; f++) {
      const bottom = player.position.y - PLAYER_HEIGHT;
      while (progress + 1 < stepList.length && bottom >= stepList[progress + 1].top - 0.05) progress++;
      const cur = stepList[progress];
      const steerStep = stepList[Math.min(progress + 1, stepList.length - 1)];
      steer(player, steerStep.x, steerStep.z);
      physics.update(1 / 60);
      const b2 = player.position.y - PLAYER_HEIGHT;
      if (b2 < cur.top - 0.3 && f > 8) { result = `fell f=${f} prog=${progress}`; break; }
      if (progress === stepList.length - 1 && player.physics.onGround) {
        const d = Math.hypot(player.position.x - cur.x, player.position.z - cur.z);
        if (d < 0.55) { result = `SUCCESS f=${f}`; break; }
      }
    }
    console.log(`yTol=${yTol}: ${result}`);
  });
}
// The default physics has tol=0.3. Run it.
runClimb(0.3);
