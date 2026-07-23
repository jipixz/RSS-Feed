import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// versión visible en Ajustes: commit corto + fecha de build
function buildVersion(): string {
  let hash = '?';
  try {
    hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    /* sin git (p. ej. tarball) — se queda "?" */
  }
  const d = new Date();
  const fecha = `${d.getDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()]}`;
  return `${hash} · ${fecha}`;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(buildVersion()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
