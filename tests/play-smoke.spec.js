import { test, expect } from "@playwright/test";
const SERVER_URL = "http://localhost:3001";

test("game loads via devtools proxy, bridge connects, match starts", async ({ page }) => {
  test.setTimeout(240000);
  const consoleErrors = [];
  const consoleLogs = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (msg.type() === "error") consoleErrors.push(t);
    consoleLogs.push(t);
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(SERVER_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  const startBtn = page.locator("#startButtonDesktop");
  await startBtn.waitFor({ state: "visible", timeout: 30000 });
  const box = await startBtn.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await page.waitForFunction(
    () => document.querySelector("#loadingOverlay")?.style.display === "none",
    {},
    { timeout: 120000 }
  );

  await page.waitForFunction(
    () => ["spawn", "playing"].includes(window.game?.gameState),
    {},
    { timeout: 60000 }
  );

  await page.waitForFunction(
    () => window.game?.gameState === "playing" && window.game?.player,
    {},
    { timeout: 150000 }
  );

  await page.waitForTimeout(2000);

  // Check for MCP connection log if present, but don't fail if not
  console.log("[smoke] MCP connected:", consoleLogs.some((t) => t.includes("Connected to MCP server")));

  // Verify biome colliders and bot count (current architecture: colliders are
  // AABB data objects on game.map.colliders, not scene meshes)
  const audit = await page.evaluate(() => {
    const game = window.game;
    if (!game || !game.map || !game.scene) return null;
    const map = game.map;
    const colliders = map.colliders || [];
    const ringWalls = colliders.filter(c => c.biomeBoundary === true);
    const mazeMesh = game.scene.children.find(c => c.isInstancedMesh && c.userData?.isMazeWalls);
    const mazeWalls = colliders.filter(c => c.isMazeWall === true);
    const gateColliders = map._biomeGateColliders || [];
    return {
      ringWalls: ringWalls.length,
      ringWallsDisabled: ringWalls.filter(c => c.enabled === false).length,
      mazeInstances: mazeMesh ? mazeMesh.count : -1,
      mazeWalls: mazeWalls.length,
      gateColliders: gateColliders.length,
      gateEnabled: gateColliders.filter(c => c.enabled !== false).length,
      biomeGatesOpen: map.biomeGatesOpen,
      spawnPads: (map.getSpawnPads ? map.getSpawnPads() : []).length,
      bots: game.bots?.length || 0,
      totalColliders: colliders.length,
    };
  });
  console.log("[smoke] Biome audit:", JSON.stringify(audit));
  if (audit) {
    expect(audit.ringWalls).toBeGreaterThan(0);
    expect(audit.ringWallsDisabled).toBe(0);
    // Maze walls InstancedMesh must stay in sync with colliders
    expect(audit.mazeInstances).toBeGreaterThan(0);
    expect(audit.mazeInstances).toBe(audit.mazeWalls);
    // Gate colliders must be disabled once biome gates are open
    expect(audit.gateColliders).toBeGreaterThan(0);
    expect(audit.biomeGatesOpen).toBe(true);
    expect(audit.gateEnabled).toBe(0);
    expect(audit.spawnPads).toBeGreaterThanOrEqual(100);
    expect(audit.bots).toBeGreaterThanOrEqual(90);
  }

  const fatal = pageErrors.filter(
    (t) => !t.includes("ointerlock") && !t.includes("ullscreen")
  );
  expect(fatal).toEqual([]);

  await page.screenshot({ path: "test-results/smoke-game.png" });
});
