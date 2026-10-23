import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Em desenvolvimento, o Vite repassa /api (inclusive o WebSocket) para o servidor da Shack.
// A porta vem do mesmo .env da raiz que o servidor usa (SHACK_PORT).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), 'SHACK_');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: { '/api': { target: `http://127.0.0.1:${env.SHACK_PORT || 4321}`, ws: true } },
    },
  };
});
