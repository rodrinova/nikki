import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import type { Plugin } from 'vite';

declare const process: { env: Record<string, string | undefined> };

// Política de conteúdo da app publicada (o GitHub Pages não deixa pôr cabeçalhos, por isso vai numa meta): só corre
// código da própria app; só fala com o Supabase da NIKKI e com o jsDelivr (leitor de faturas, versões fixas).
// Fica de fora da demonstração, que é uma página única com o código lá dentro.
const SUPABASE = 'imbflvhufvvjcfetljsd.supabase.co';
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  `connect-src 'self' https://${SUPABASE} wss://${SUPABASE} https://cdn.jsdelivr.net`,
  `img-src 'self' data: blob: https://${SUPABASE}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const csp = (): Plugin => ({
  name: 'nikki-csp',
  apply: 'build',
  transformIndexHtml: (html) => (process.env.VITE_DEMO === '1' ? html : html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`)),
});

// VITE_BASE: o caminho onde a app fica (no GitHub Pages, /nikki/). Por defeito, a raiz.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), csp()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
