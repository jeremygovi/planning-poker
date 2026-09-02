import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/server/**/*.ts', 'src/shared/**/*.ts']
    }
  }
});
