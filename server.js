import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Proxy /espn requests to ESPN's API (avoids CORS)
app.use(
  '/espn',
  createProxyMiddleware({
    target: 'https://site.web.api.espn.com',
    changeOrigin: true,
    pathRewrite: { '^/espn': '' },
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
