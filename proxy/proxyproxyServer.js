// proxy/proxyServer.js
require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const target = process.env.NGROK_URL;
const PORT = process.env.PORT || 4000;

app.use('/', createProxyMiddleware({
  target,
  changeOrigin: true,
  secure: true,
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('ngrok-skip-browser-warning', 'true');
  }
}));

app.listen(PORT, () => {
  console.log(`🚀 Proxy corriendo en http://localhost:${PORT} → ${target}`);
});
