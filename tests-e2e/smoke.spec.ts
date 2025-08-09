import { test, expect } from '@playwright/test';
import http from 'http';

// Helper to start the server on a custom port within the test worker
async function startServer(port: number): Promise<http.Server> {
  process.env.PORT = String(port);
  const mod = require('../server');
  const app = mod.app as import('express').Express;
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(port, () => resolve(server));
  });
}

async function stopServer(server: http.Server) {
  await new Promise((res) => server.close(() => res(undefined)));
}

test.describe('smoke', () => {
  let server: http.Server;
  const port = 3100;

  test.beforeAll(async () => {
    server = await startServer(port);
  });

  test.afterAll(async () => {
    await stopServer(server);
  });

  test('default page renders and updates after applying a template', async ({ page, request, baseURL }) => {
    // Open the display page
    await page.goto(baseURL!);
    await expect(page.locator('#root')).toBeVisible();

    // Apply a template via HTTP API
    const res = await request.post(baseURL + '/api/template/animated-text', {
      data: { data: { text: 'pw-smoke', velocity: 100 } },
    });
    expect(res.ok()).toBeTruthy();

    // The display should update to include the new text
    await expect(page.locator('#root')).toContainText('pw-smoke');
  });
});
