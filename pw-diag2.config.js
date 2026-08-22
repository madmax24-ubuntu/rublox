import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: /_diag_playing\.spec\.js/,
  timeout: 300000,
  workers: 1,
  use: { headless: true },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
      launchOptions: { args: ["--use-gl=angle", "--use-angle=d3d11"] },
    },
  ],
});
