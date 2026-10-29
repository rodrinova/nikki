// Tirar o texto de uma fatura no próprio telemóvel: PDF com texto (pdf.js) e fotografia ou PDF digitalizado
// (reconhecimento de texto em português, tesseract.js). Nada sai do aparelho. As bibliotecas só se carregam ao ler a
// primeira fatura. Na demonstração (uma página só) vêm do jsDelivr, nas mesmas versões.
// Mais tarde, com uma chave de IA, as fotografias difíceis podem passar a ser lidas por IA (ver docs/DECISOES.md).

// Escrito por extenso (e não importado) para o Vite cortar o ramo que não se usa em cada versão.
const DEMO = import.meta.env.VITE_DEMO === '1';

const CDN = 'https://cdn.jsdelivr.net/npm/';
type Pdf = typeof import('pdfjs-dist');

async function pdfLib(): Promise<Pdf> {
  if (DEMO) {
    const lib = (await import(/* @vite-ignore */ `${CDN}pdfjs-dist@4.10.38/build/pdf.min.mjs`)) as Pdf;
    lib.GlobalWorkerOptions.workerSrc = `${CDN}pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;
    return lib;
  } else {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  }
}

async function ocrWorker(progress: (p: number) => void) {
  const { createWorker } = (DEMO ? await import(/* @vite-ignore */ `${CDN}tesseract.js@5.1.1/dist/tesseract.esm.min.js`) : await import('tesseract.js')) as typeof import('tesseract.js');
  // O motor e o português vêm sempre do jsDelivr, em versões fixas (a app publicada não leva estes ficheiros grandes).
  const paths = { workerPath: `${CDN}tesseract.js@5.1.1/dist/worker.min.js`, corePath: `${CDN}tesseract.js-core@5.1.1`, langPath: `${CDN}@tesseract.js-data/por@1.0.0/4.0.0_best_int` };
  return createWorker('por', 1, { ...paths, logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') progress(m.progress); } });
}

/** Uma imagem (ficheiro ou página desenhada) → texto, em português. */
async function ocr(images: (Blob | HTMLCanvasElement)[], progress: (p: number) => void): Promise<string> {
  const w = await ocrWorker((p) => progress(p));
  try {
    const out: string[] = [];
    for (const img of images) out.push((await w.recognize(img)).data.text);
    return out.join('\n');
  } finally { await w.terminate(); }
}

export type ReadStep = 'abrir' | 'ler' | 'reconhecer';

/** As páginas digitalizadas (já endireitadas e limpas) → texto. */
export async function imagesText(pages: Blob[], step: (s: ReadStep, p?: number) => void): Promise<string> {
  step('reconhecer', 0);
  return ocr(pages, (p) => step('reconhecer', p));
}

/**
 * O texto de uma fatura. PDF: o texto das páginas (as primeiras 3), linha a linha; se não tiver texto (digitalizado),
 * desenha as páginas e reconhece. Fotografia: reconhece. Devolve também como foi lido (pdf ou foto).
 */
export async function invoiceText(file: File, step: (s: ReadStep, p?: number) => void): Promise<{ text: string; source: 'pdf' | 'foto' }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) { step('reconhecer', 0); return { text: await ocr([file], (p) => step('reconhecer', p)), source: 'foto' }; }
  step('abrir');
  const lib = await pdfLib();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  step('ler');
  const pages = Math.min(doc.numPages, 3), lines: string[] = [];
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    // Junta os pedaços pela linha em que estão (a posição vertical), da esquerda para a direita.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str }]);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) lines.push(rows.get(y)!.sort((a, b) => a.x - b.x).map((r) => r.s).join(' '));
  }
  const text = lines.join('\n');
  if (text.replace(/\s/g, '').length > 40) return { text, source: 'pdf' };
  // PDF digitalizado (só imagem): desenha as páginas e reconhece.
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n), vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
    canvases.push(c);
  }
  step('reconhecer', 0);
  return { text: await ocr(canvases, (p) => step('reconhecer', p)), source: 'foto' };
}
