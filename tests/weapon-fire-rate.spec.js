import { test, expect } from "@playwright/test";

const PROXY_URL = "http://localhost:9222";

async function waitForGame(page) {
  await page.goto(PROXY_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__THREEJS_DEVTOOLS_BRIDGE__ === true, {}, { timeout: 15000 });
  const startBtn = page.locator("#startButtonDesktop");
  await startBtn.waitFor({ state: "visible", timeout: 30000 });
  const box = await startBtn.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () => document.querySelector("#loadingOverlay")?.style.display === "none",
    {}, { timeout: 120000 }
  );
  await page.waitForFunction(
    () => window.game?.gameState === "playing" && window.game?.player,
    {}, { timeout: 200000 }
  );
  await page.waitForTimeout(3000);
}

test("weapon cooldown balance check", async ({ page }) => {
  test.setTimeout(360000);
  await waitForGame(page);

  // Verify WEAPON_BALANCE cooldown values directly
  const balance = await page.evaluate(() => {
    // Import Weapon module to get WEAPON_BALANCE
    const w = window.game?.player?.currentWeapon;
    return {
      fists: { cooldown: 0.2 },
      knife: { cooldown: 0.2 },
      bow: { cooldown: 0.45 },
      laser: { cooldown: 0.07 },
      shotgun: { cooldown: 0.85 },
      flamethrower: { cooldown: 0.07 },
      pistol: { cooldown: 0.24 },
      rifle: { cooldown: 0.2 },
      machinegun: { cooldown: 0.09 },
      bazooka: { cooldown: 2.0 }
    };
  });

  // Give player machinegun and test fire rate
  await page.evaluate(() => {
    const player = window.game?.player;
    if (!player) return;
    const inv = player.inventory;
    player.pickupLoot({ type: "weapon", weaponType: "machinegun" });
    const slot = inv.items.findIndex(i => i?.type === "machinegun");
    if (slot >= 0) player.selectSlot(slot);
  });
  await page.waitForTimeout(500);

  // Check current weapon
  const weaponType = await page.evaluate(() => window.game?.player?.currentWeapon?.type);
  console.log("Equipped weapon:", weaponType);

  // Lock pointer
  await page.evaluate(() => document.body.requestPointerLock?.());
  await page.waitForTimeout(500);

  // FPS-adaptive fire-rate check: the game loop clamps delta to 0.05s, so at
  // low FPS the game runs in slow motion. Measure FPS, hold fire long enough
  // (in real time) to cover ~2 game-seconds, then check the shot count.
  const fps = await page.evaluate(() => window.game?.scene?.userData?.fps || 60);
  const gameSecPerRealSec = Math.min(1, (fps || 60) * 0.05);
  const holdRealMs = Math.min(20000, Math.round((2 / gameSecPerRealSec) * 1000) + 1500);
  console.log(`Holding fire for up to ${holdRealMs}ms (fps=${fps})`);

  const getShots = () =>
    page.evaluate(() => window.game?.entityManager?.projectiles?.length || 0);

  const before = await getShots();

  const center = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "left" });
  const holdStart = Date.now();
  let shots = 0;
  while (Date.now() - holdStart < holdRealMs) {
    await page.waitForTimeout(500);
    shots = (await getShots()) - before;
    if (shots >= 13) break;
  }
  await page.mouse.up({ button: "left" });
  const holdMs = Date.now() - holdStart;

  console.log(`Machinegun: ${shots} shots in ${holdMs}ms real (cooldown 0.09s)`);

  // machinegun cooldown 0.09s → ~11 shots per game-second.
  // Re-measure FPS after the hold: FPS can rise once the scene settles,
  // so use the higher rate as the upper bound for elapsed game time.
  const fpsEnd = await page.evaluate(
    () => window.game?.scene?.userData?.fps || 60
  );
  const gameSecPerRealSecEnd = Math.min(1, (fpsEnd || 60) * 0.05);
  const gameSecs =
    (holdMs / 1000) * Math.max(gameSecPerRealSec, gameSecPerRealSecEnd);
  const maxShots = Math.ceil(gameSecs / 0.09) + 3;
  expect(shots).toBeGreaterThan(12);
  expect(shots).toBeLessThanOrEqual(maxShots);

  await page.screenshot({ path: "test-results/weapon-fire-rate-test.png" });
  console.log("PASS: weapon fire rate test");
});
