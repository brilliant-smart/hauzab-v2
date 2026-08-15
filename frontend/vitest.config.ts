import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.tsx',
    exclude: ['node_modules', 'dist', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Thresholds are enforced over the unit-tested utility/hook/component
      // layer only. Page components and the shadcn/ui primitives are exercised
      // by the manual smoke checklist in DEPLOY.md, not the unit suite.
      include: [
        'src/app/lib/format.ts',
        'src/app/lib/errorHandler.ts',
        'src/app/auth/guards.ts',
        'src/app/pos/useCart.ts',
        'src/components/DataTable.tsx',
        'src/app/pos/ReceiptDialog.tsx',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/components/ui/**',
        'src/app/routes/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
      ],
      thresholds: {
        branches: 40,
        functions: 40,
        lines: 40,
        statements: 40,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});