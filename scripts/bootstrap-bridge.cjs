// bootstrap-bridge.cjs
// Launches headless Chromium, navigates to proxy URL, waits for bridge connection.
// Usage: node scripts/bootstrap-bridge.cjs
// Run in background: Start-Process -FilePath "node.exe" -ArgumentList "scripts/bootstrap-bridge.cjs"
// Cleanup: Get-Process -Name "playwright","chromium" | Stop-Process -Force

const { chromium } = require("playwright");

async function main() {
  const proxyUrl = process.env.BRIDGE_PROXY || "http://localhost:34526";

  console.log("Launching headless Chromium...");
  const browser = await chromium.launch({ headless: true });

  // Graceful shutdown on SIGINT/SIGTERM
  const cleanup = async () => {
    console.log("\nClosing browser...");
    await browser.close();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  const page = await browser.newPage();

  // Collect console errors for debugging
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[Page Error] ${msg.text()}`);
    }
  });

  console.log(`Navigating to ${proxyUrl}...`);
  await page.goto(proxyUrl);

  // Wait for page to fully load
  await page.waitForLoadState("networkidle");
  // Extra time for bridge WebSocket to establish
  await new Promise((r) => setTimeout(r, 2000));

  console.log("Bridge page loaded. Browser kept alive.");
  console.log("Press Ctrl+C or send SIGTERM to close.");

  // Keep alive until killed
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Failed to bootstrap bridge:", err);
  process.exit(1);
});
