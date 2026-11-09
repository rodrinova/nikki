// Gera uma página HTML única com a app em modo de demonstração (para ver no telemóvel ou num artefacto).
// Uso: VITE_DEMO=1 npx vite build --outDir dist-demo && node scripts/demo-html.mjs dist-demo nikki-demo.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out] = process.argv.slice(2);
const assets = join(dir, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
// As letras vão dentro da página (numa página única não há ficheiros ao lado).
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')
  .replace(/url\(["']?(?:\.?\/)?(?:assets\/)?([\w.-]+\.woff2)["']?\)/g, (m, f) => (files.includes(f) ? `url(data:font/woff2;base64,${readFileSync(join(assets, f)).toString('base64')})` : m));
const icon = readFileSync(join(dir, 'icons/icon.svg'), 'utf8');
const page = `<!DOCTYPE html>
<meta charset="utf-8">
<title>NIKKI app</title>
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script>/g, '<\\/script>')}</script>
`;
writeFileSync(out, page);
console.log(out, Math.round(page.length / 1024) + ' KB');
