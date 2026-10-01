import { defineConfig } from 'vitest/config';

// Unit tests for pure client logic (no DOM needed).
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
