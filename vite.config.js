import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: [
      'buffer',
      'react',
      'react-dom',
      'lucide-react',
      '@privy-io/react-auth',
      '@mayanfinance/swap-sdk',
      'viem',
      'sonner',
    ],
  },
});
