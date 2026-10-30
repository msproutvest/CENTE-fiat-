import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import path from 'path';

// Single self-contained IIFE: React, Privy, Tailwind CSS all bundled in.
export default defineConfig({
  plugins: [react(), cssInjectedByJsPlugin()],
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
