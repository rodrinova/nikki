// Copia para public/ocr o que o reconhecimento de texto das faturas precisa (servido pela própria app: as fotografias
// nunca saem do telemóvel). Corre antes de `dev` e de `build`.
import { copyFileSync, mkdirSync } from 'node:fs';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
for (const [from, to] of [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'por.traineddata.gz'],
]) copyFileSync(from, `${out}/${to}`);
console.log('ocr: pronto em', out);
