import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import path from 'path';
import fs from 'fs';

function generateDistHtmlPlugin() {
  return {
    name: 'generate-dist-html',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // 1. Create a complete, standalone preview index.html in dist with loading state
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>HalalVest Payment & Trading</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  </head>
  <body style="margin: 0; min-height: 100vh; background-color: #0b0e14; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: 'Red Hat Display', sans-serif;">
    <div id="halalvest-widget" data-halalvest-widget style="width: 100%; max-width: 440px; min-height: 300px;">
      <div id="widget-loader" style="color: #10b981; text-align: center; padding: 60px 20px; font-size: 14px; font-weight: 600;">
        <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(16, 185, 129, 0.2); border-top-color: #10b981; border-radius: 50%; animation: hv-spin 0.8s linear infinite; margin-bottom: 14px;"></div>
        <div>Loading HalalVest...</div>
        <style>@keyframes hv-spin { to { transform: rotate(360deg); } }</style>
      </div>
    </div>
    <script src="./cente-payment.js"></script>
    <script>
      window.addEventListener('load', function() {
        var loader = document.getElementById('widget-loader');
        if (loader && window.HalalvestWidget && window.HalalvestWidget.mount) {
          window.HalalvestWidget.mount('#halalvest-widget');
        }
      });
    </script>
  </body>
</html>`;
      fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent);

      // 2. Also provide halalvest.js as a clean HalalVest-branded alias
      const centePath = path.join(distDir, 'cente-payment.js');
      const halalvestPath = path.join(distDir, 'halalvest.js');
      if (fs.existsSync(centePath)) {
        fs.copyFileSync(centePath, halalvestPath);
      }
    },
  };
}

// Single self-contained IIFE: React, Privy, Tailwind CSS all bundled in.
export default defineConfig({
  plugins: [react(), cssInjectedByJsPlugin(), generateDistHtmlPlugin()],
  define: {
    global: 'window',
    'process.env.NODE_ENV': '"production"',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
    },
  },
  build: {
    lib: {
      entry: 'src/entry.jsx',
      name: 'CentePaymentBundle',
      formats: ['iife'],
      fileName: () => 'cente-payment.js',
    },
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
});
