import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'react-refresh'],
  },
  plugins: [
    react(),
    wasm(),
    // Midnight SDK packages use Node globals (Buffer, process, etc.) in the
    // browser; polyfill them at bundle time.
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5176',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4096,
  },
  optimizeDeps: {
    // Pre-bundle the Midnight SDK so the wasm-bindgen re-export chains
    // (midnight-js-protocol/ledger -> ledger-v8) resolve correctly.
    include: [
      'react',
      'react-dom',
      '@midnight-ntwrk/midnight-js-contracts',
      '@midnight-ntwrk/midnight-js-types',
      '@midnight-ntwrk/midnight-js-protocol',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/onchain-runtime-v3',
    ],
    esbuildOptions: { target: 'esnext', supported: { 'top-level-await': true } },
  },
});
