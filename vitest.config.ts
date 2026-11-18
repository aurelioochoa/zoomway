import { defineConfig } from 'vitest/config';

// src/sim/ and src/data/ import no rendering library, so the tests need no DOM (design §12).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 180_000,
  },
});
