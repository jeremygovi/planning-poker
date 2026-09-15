import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run build && node dist/backend/server/server.js',
    url: 'http://127.0.0.1:3000/health',
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3000',
      HOST: '127.0.0.1',
      DATA_DIR: '/tmp/poker-express-e2e',
      MIGRATIONS_DIR: '/app/migrations',
      PUBLIC_DIR: '/app/dist/client',
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
