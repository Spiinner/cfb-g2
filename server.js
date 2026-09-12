import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Handle CORS preflight for EvenHub WebView (file://, null origin, etc.)
app.options('/espn/*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// Proxy /espn requests to ESPN's API (avoids CORS)
// CORS headers are injected via onProxyRes so they survive the proxy pipe.
app.use(
  '/espn',
  createProxyMiddleware({
    target: 'https://site.web.api.espn.com',
    changeOrigin: true,
    pathRewrite: { '^/espn': '' },
    onProxyRes: (proxyRes) => {
      proxyRes.headers['access-control-allow-origin'] = '*';
      proxyRes.headers['access-control-allow-methods'] = 'GET, OPTIONS';
      proxyRes.headers['access-control-allow-headers'] = 'Content-Type';
    },
  }),
);

// Serve the built Vite static files
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CFB G2 server running on port ${PORT}`);
});
