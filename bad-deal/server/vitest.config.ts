import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['server/tests/**/*.test.ts'], testTimeout: 10000 } });
