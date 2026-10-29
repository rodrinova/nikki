// Digitalizar um documento (fatura, talão) com a câmara, no telemóvel: encontrar a folha na imagem, endireitá-la
// (perspetiva) e limpá-la (fundo branco, texto escuro), como o scanner do iPhone. Puro: trabalha sobre píxeis RGBA.
//
// Encontrar a folha: em cinzento, desfocado, o limiar de Otsu separa o papel (claro) do fundo; a maior mancha clara
// ligada é a folha; os 4 cantos são os pontos dessa mancha mais afastados em cada diagonal (x+y, x−y). Os cantos
// ajustam-se à mão se for preciso.

export interface Pt { x: number; y: number }
export type Quad = [Pt, Pt, Pt, Pt]; // cima-esquerda, cima-direita, baixo-direita, baixo-esquerda

/** Cinzento (0–255) a partir de RGBA. */
export function gray(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < w * h; i += 4, j++) g[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return g;
}

/** Desfocar com uma caixa de raio r (soma em área, com imagem integral). */
export function boxBlur(src: Uint8Array | Float32Array, w: number, h: number, r: number): Float32Array {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Limiar de Otsu: o que melhor separa claros de escuros. */
export function otsu(g: ArrayLike<number>): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, Math.round(g[i])))]++;
  const total = g.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, at = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; at = t; }
  }
  return at;
}

/**
 * A folha numa imagem pequena (cinzento): a maior mancha clara ligada e os seus 4 cantos. Devolve null se não houver
 * uma folha clara (menos de 12% da imagem) ou se a mancha ocupa a imagem quase toda (fundo claro: não se distingue).
 */
export function findSheet(g: Uint8Array, w: number, h: number): Quad | null {
  const b = boxBlur(g, w, h, 1), t = otsu(b);
  const seen = new Uint8Array(w * h);
  let best: { n: number; c: Quad; border: number } | null = null;
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || b[start] <= t) continue;
    let top = 0, n = 0, border = 0;
    stack[top++] = start; seen[start] = 1;
    let sMax = -Infinity, sMin = Infinity, dMax = -Infinity, dMin = Infinity;
    const c: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    while (top) {
      const p = stack[--top], x = p % w, y = (p - x) / w;
      n++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++;
      const s = x + y, d = x - y;
      if (s < sMin) { sMin = s; c[0] = { x, y }; }
      if (d > dMax) { dMax = d; c[1] = { x, y }; }
      if (s > sMax) { sMax = s; c[2] = { x, y }; }
      if (d < dMin) { dMin = d; c[3] = { x, y }; }
      if (x > 0 && !seen[p - 1] && b[p - 1] > t) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && !seen[p + 1] && b[p + 1] > t) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && !seen[p - w] && b[p - w] > t) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && !seen[p + w] && b[p + w] > t) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    if (!best || n > best.n) best = { n, c: c as Quad, border };
  }
  if (!best || best.n < w * h * 0.12 || best.n > w * h * 0.97 || best.border > (w + h) * 1.2) return null;
  return best.c;
}

/** A folha inteira (sem deteção): a imagem toda, com uma pequena margem. */
export const fullQuad = (w: number, h: number, m = 0.04): Quad => [
  { x: w * m, y: h * m }, { x: w * (1 - m), y: h * m }, { x: w * (1 - m), y: h * (1 - m) }, { x: w * m, y: h * (1 - m) },
];

export const scaleQuad = (q: Quad, k: number): Quad => q.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** O tamanho da folha endireitada: a maior largura e a maior altura do quadrilátero, até `max` px no lado maior. */
export function outSize(q: Quad, max = 2000): { w: number; h: number } {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Homografia que leva os 4 pontos `from` aos 4 pontos `to` (sistema 8×8 por eliminação de Gauss). */
export function homography(from: Quad, to: Quad): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function apply(H: number[], p: Pt): Pt {
  const d = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / d, y: (H[3] * p.x + H[4] * p.y + H[5]) / d };
}

/** Endireitar: cada píxel da folha de saída vai buscar a cor ao sítio certo da fotografia (bilinear). */
export function warp(src: Uint8ClampedArray, sw: number, sh: number, q: Quad, ow: number, oh: number): Uint8ClampedArray {
  const H = homography([{ x: 0, y: 0 }, { x: ow - 1, y: 0 }, { x: ow - 1, y: oh - 1 }, { x: 0, y: oh - 1 }], q);
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const d = H[6] * x + H[7] * y + H[8];
      let sx = (H[0] * x + H[1] * y + H[2]) / d, sy = (H[3] * x + H[4] * y + H[5]) / d;
      sx = Math.max(0, Math.min(sw - 1.001, sx)); sy = Math.max(0, Math.min(sh - 1.001, sy));
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, o = (y * ow + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Limpar como um documento: divide cada píxel pelo fundo à volta (sombras e luz desigual somem), em cinzento, e
 * estica o contraste (papel branco, texto escuro). Mantém-se legível para a leitura de texto.
 */
export function clean(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const g = gray(rgba, w, h);
  const bg = boxBlur(g, w, h, Math.max(8, Math.round(Math.max(w, h) / 40)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = Math.min(1, g[i] / Math.max(1, bg[i])); // 1 = papel
    const v = r > 0.92 ? 255 : Math.max(0, Math.round(255 * Math.pow(r, 2.2) - 20)); // texto mais escuro, papel branco
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}
