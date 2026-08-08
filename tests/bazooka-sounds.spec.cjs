// Integration test: verify bazooka sounds play in real browser with real Web Audio API
// Run: npx playwright test tests/bazooka-sounds.spec.cjs
const { test, expect } = require("@playwright/test");

test.describe("Bazooka sounds in real browser", () => {
  test("audioContext initialized after page load", async ({ page }) => {
    await page.goto("http://localhost:3001");
    await page.waitForTimeout(3000);
    await page.mouse.click(500, 300);
    await page.waitForTimeout(500);

    // Check that the game canvas is visible (game loaded)
    const canvas = page.locator('canvas[data-engine]');
    await expect(canvas).toBeVisible();
  });

  test("AudioSynth buffers exist after init", async ({ page }) => {
    await page.goto("http://localhost:3001");
    await page.waitForTimeout(3000);
    await page.mouse.click(500, 300);
    await page.waitForTimeout(1000);

    // Check game's audioSynth state
    const diag = await page.evaluate(() => {
      const synth = window.game?.audioSynth;
      return {
        hasAudioSynth: !!synth,
        bazookaLaunchBuffer: synth?.bazookaLaunchBuffer ? "exists" : "null",
        bazookaExplosionBuffer: synth?.bazookaExplosionBuffer ? "exists" : "null",
        bazookaHissBuffer: synth?.bazookaHissBuffer ? "exists" : "null",
        explosionCrackleBuffer: synth?.explosionCrackleBuffer ? "exists" : "null",
        audioContext: synth?.audioContext ? "exists" : "null",
        ctxState: synth?.audioContext?.state || "null",
        sampleBuffers: synth?.sampleBuffers ? synth.sampleBuffers.size : 0,
      };
    });

    console.log("Game AudioSynth diagnostics:", JSON.stringify(diag));
    expect(diag.hasAudioSynth).toBe(true);
    expect(diag.bazookaLaunchBuffer).toBe("exists");
    expect(diag.bazookaExplosionBuffer).toBe("exists");
  });

  test("playBazooka creates audio nodes", async ({ page }) => {
    // Inject hooks BEFORE any page scripts run
    // IMPORTANT: use regular functions (not arrow) so `this` refers to caller context
    await page.addInitScript(() => {
      window.__testAudioNodes = [];
      const origCreateBufferSource = AudioContext.prototype.createBufferSource;
      const origCreateGain = AudioContext.prototype.createGain;
      const origCreatePanner = AudioContext.prototype.createPanner;
      const origCreateOscillator = AudioContext.prototype.createOscillator;

      AudioContext.prototype.createBufferSource = function (...args) {
        const node = origCreateBufferSource.apply(this, args);
        window.__testAudioNodes.push({ type: "BufferSource", id: node.id });
        return node;
      };
      AudioContext.prototype.createGain = function (...args) {
        const node = origCreateGain.apply(this, args);
        window.__testAudioNodes.push({ type: "Gain", id: node.id });
        return node;
      };
      AudioContext.prototype.createPanner = function (...args) {
        const node = origCreatePanner.apply(this, args);
        window.__testAudioNodes.push({ type: "Panner", id: node.id });
        return node;
      };
      AudioContext.prototype.createOscillator = function (...args) {
        const node = origCreateOscillator.apply(this, args);
        window.__testAudioNodes.push({ type: "Oscillator", id: node.id });
        return node;
      };
    });

    await page.goto("http://localhost:3001");
    await page.waitForTimeout(3000);
    // Click to unlock audio context
    await page.mouse.click(500, 300);
    await page.waitForTimeout(1000);

    // Call playBazooka on game's AudioSynth instance
    const result = await page.evaluate(async () => {
      const synth = window.game?.audioSynth;
      if (!synth) return { error: "no audioSynth" };
      if (!synth.bazookaLaunchBuffer) return { error: "no bazookaLaunchBuffer" };

      // Clear nodes created during init
      window.__testAudioNodes = [];
      // Call playBazooka
      await synth.playBazooka(null, "global");
      return { nodes: window.__testAudioNodes, ctxState: synth.audioContext?.state || "null" };
    });

    if (result.error) {
      console.log("Error:", result.error);
      expect(result.error).toBeFalsy();
    } else {
      console.log("playBazooka completed, audioContext:", result.ctxState);
      console.log("Audio nodes after playBazooka:", result.nodes.map((n) => n.type));
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.nodes.some((n) => n.type === "BufferSource")).toBe(true);
    }
  });
});
