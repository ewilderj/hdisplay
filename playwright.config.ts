import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests-e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    viewport: { width: 1280, height: 400 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
