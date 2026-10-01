import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // expose on the LAN so phones can open the dev server
    port: 5173,
    // API_PORT lets a second dev stack run beside the default one (server PORT must match).
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
});
