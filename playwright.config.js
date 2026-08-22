import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /play-smoke\.spec\.js|stalker-geometry\.spec\.js|stalker-spawn\.spec\.js|stalker-hangar-visual\.spec\.js|weapon-fire-rate\.spec\.js|stair-climb\.spec\.js/,
  timeout: 120000,
  use: {
    headless: true,
    screenshot: 'only-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      launchOptions: { args: ['--use-gl=angle', '--use-angle=d3d11'] },
    },
  ],
});
