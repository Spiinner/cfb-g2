import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Proxy /espn requests to ESPN's hidden API to avoid CORS issues
      '/espn': {
        target: 'https://site.web.api.espn.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/espn/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
