import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: 'localhost',
    port: 4173
  }
});
