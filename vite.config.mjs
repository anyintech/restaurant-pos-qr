import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Must match the port server.js listens on
const API_TARGET = `http://localhost:${process.env.PORT || 3001}`;

// Silence harmless ws proxy noise when the browser drops a socket mid-handshake
// (React StrictMode double-mount, page reloads, HMR). Real errors still log.
const BENIGN_SOCKET_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'EPIPE']);
const logger = createLogger();
const logError = logger.error;
logger.error = (msg, options) => {
  if (msg.includes('ws proxy') && BENIGN_SOCKET_CODES.has(options?.error?.code)) return;
  logError(msg, options);
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  customLogger: logger,
  server: {
    port: 5173,
    // server.js rewrites data/*.json on every order/settle; watching it would reload every open page
    watch: {
      ignored: ['**/data/**']
    },
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true
      },
      '/socket.io': {
        target: API_TARGET,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});
