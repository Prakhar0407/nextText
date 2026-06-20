import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { CLIENT_PORT, SERVER_URL } from '../shared/constants.js';

export default defineConfig({
  plugins: [react()],
  server: {
    port: CLIENT_PORT,
    host: true,
    proxy: {
      '/api': SERVER_URL,
    },
  },
});
