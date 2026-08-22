import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: /_diag_instrumented\.spec\.js/,
  timeout: 240000,
  use: { headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' }, launchOptions: { args: ['--use-gl=angle', '--use-angle=d3d11'] } }],
});
