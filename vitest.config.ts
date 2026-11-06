import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@web': path.resolve(import.meta.dirname, 'apps/web/src'), '@/': path.resolve(import.meta.dirname, 'apps/web/src') + '/', 'server-only': path.resolve(import.meta.dirname, 'tests/stubs/empty.ts') },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    globalSetup: ['tests/global-setup.ts'],
  },
});
