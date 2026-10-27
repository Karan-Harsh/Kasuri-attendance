import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { devSqlBridge } from './scripts/dev-sql-bridge.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), devSqlBridge()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/data/**'] },
  },
  build: {
    target: 'es2021',
  },
});
