import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: Deno.env.get('BASE_PATH') ?? '/',
  plugins: [react()],
  server: { port: 5199 },
  test: {
    environment: 'jsdom',
    include: ['src/ui/**/*.test.tsx'],
    setupFiles: ['src/ui/test-setup.ts'],
    globals: false,
  },
});
