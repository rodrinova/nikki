import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import type { Plugin } from 'vite';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

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
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
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

// O service worker leva a lista dos ficheiros desta versão (para os guardar ao instalar) e um nome de cache novo a
// cada versão. Ficam de fora o leitor de PDF e o reconhecimento de texto, que só se carregam quando se usam.
const swManifest = (): Plugin => ({
  name: 'nikki-sw',
  apply: 'build',
  writeBundle(opts, bundle) {
    if (process.env.VITE_DEMO === '1') return;
    const dir = opts.dir!, sw = `${dir}/sw.js`;
    if (!fs.existsSync(sw)) return;
    const files = Object.keys(bundle).filter((f) => !/pdf|worker|\.map$|\.html$/.test(f)).sort();
    // A versão muda quando muda um ficheiro ou a própria página (que não muda de nome).
    const page = Object.values(bundle).find((c) => c.fileName === 'index.html');
    const version = createHash('sha1').update(files.join('|') + (page && page.type === 'asset' ? String(page.source) : '')).digest('hex').slice(0, 10);
    // O essencial para abrir (a entrada, o que ela importa logo, o CSS e a letra) guarda-se ao instalar; o resto
    // (ecrãs que se abrem depois) guarda-se mais tarde, devagar, para não disputar a rede com os dados.
    const core = new Set<string>();
    const walk = (f: string) => {
      const c = bundle[f];
      if (!c || core.has(f)) return;
      core.add(f);
      if (c.type === 'chunk') { c.imports.forEach(walk); (c as any).viteMetadata?.importedCss?.forEach((x: string) => core.add(x)); }
    };
    Object.values(bundle).forEach((c) => { if (c.type === 'chunk' && c.isEntry) walk(c.fileName); });
    files.filter((f) => /\.(woff2|css)$/.test(f)).forEach((f) => core.add(f));
    const first = files.filter((f) => core.has(f)), later = files.filter((f) => !core.has(f));
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('/*VERSION*/', version).replace('/*PRECACHE*/[]', JSON.stringify(first)).replace('/*LATER*/[]', JSON.stringify(later)));
  },
});

// A letra começa a descer logo com a página (antes do CSS a pedir): o texto aparece já na letra certa.
const fontPreload = (): Plugin => ({
  name: 'nikki-font-preload',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (process.env.VITE_DEMO === '1' || !ctx.bundle) return html;
      const f = Object.keys(ctx.bundle).find((k) => /albert-sans.*\.woff2$/.test(k));
      const base = process.env.VITE_BASE || '/';
      return f ? html.replace('</title>', `</title>\n    <link rel="preload" href="${base}${f}" as="font" type="font/woff2" crossorigin />`) : html;
    },
  },
});

// VITE_BASE: o caminho onde a app fica (no GitHub Pages, /nikki/). Por defeito, a raiz.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), csp(), swManifest(), fontPreload()],
  build: {
    // A demonstração é uma página só: a letra vai lá dentro.
    assetsInlineLimit: process.env.VITE_DEMO === '1' ? 64_000 : 4096,
    rollupOptions: {
      // A demonstração é uma página só: o código vai todo junto (sem partes à parte nem ecrãs carregados depois).
      output: process.env.VITE_DEMO === '1' ? { inlineDynamicImports: true } : {
        // As bibliotecas mudam pouco: num ficheiro à parte, ficam guardadas no telemóvel de uma versão para a outra.
        manualChunks: (id) => (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@supabase)\//.test(id) ? 'vendor'
          // O reconhecimento de texto (e o que ele traz) só se carrega ao ler a primeira fotografia.
          : /node_modules\/(tesseract\.js|regenerator-runtime|is-url|bmp-js|zlibjs|wasm-feature-detect|opencollective-postinstall)\//.test(id) ? 'ocr'
          : undefined),
      },
    },
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
