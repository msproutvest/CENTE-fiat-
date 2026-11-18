import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import path from 'path';

const shared = {
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
};

export default defineConfig(({ mode }) => {
  // `vite build --mode widget`: single self-contained IIFE for embedding in PHP/HTML
  // (React, Privy and CSS all bundled). Written next to the app build, without wiping it.
  if (mode === 'widget') {
    return {
      ...shared,
      plugins: [react(), cssInjectedByJsPlugin()],
      build: {
        lib: {
          entry: 'src/entry.jsx',
          name: 'CentePaymentBundle',
          formats: ['iife'],
          fileName: () => 'cente-payment.js',
        },
        outDir: 'dist',
        emptyOutDir: false,
        cssCodeSplit: false,
        rollupOptions: { output: { exports: 'named' } },
      },
    };
  }

  // Default `vite build`: standard app build -> dist/index.html + dist/assets/*.js|css
  return {
    ...shared,
    base: './',
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
