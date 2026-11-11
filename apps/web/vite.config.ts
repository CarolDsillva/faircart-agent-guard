import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const api = { target: 'http://localhost:8787', changeOrigin: false };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': api, '/shop/api': api, '/healthz': api },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        shop: fileURLToPath(new URL('./shop.html', import.meta.url)),
      },
    },
  },
});
