import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

declare const process: { env: Record<string, string | undefined> };

// VITE_BASE: o caminho onde a app fica (no GitHub Pages, /nikki/). Por defeito, a raiz.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
