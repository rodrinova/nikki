import { describe, expect, it } from 'vitest';
import { apply, clean, findSheet, gray, homography, otsu, outSize, warp, type Pt, type Quad } from '../scan';

/** Uma «fotografia»: fundo escuro e uma folha clara (quadrilátero inclinado), com uma linha de «texto». */
function photo(w: number, h: number, q: Quad, bg = 50, paper = 225) {
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = q[i], b = q[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = inside(x + 0.5, y + 0.5) ? paper : bg, i = (y * w + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
  return px;
}
const near = (a: Pt, b: Pt, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('scanner', () => {
  const q: Quad = [{ x: 30, y: 20 }, { x: 170, y: 35 }, { x: 160, y: 132 }, { x: 22, y: 118 }];
  it('encontra os 4 cantos da folha', () => {
    const w = 200, h = 150, g = gray(photo(w, h, q), w, h);
    const f = findSheet(g, w, h)!;
    expect(f).not.toBeNull();
    f.forEach((p, i) => expect(near(p, q[i], 4)).toBe(true));
  });
  it('sem folha clara (tudo escuro ou tudo claro), não inventa', () => {
    const w = 80, h = 60;
    expect(findSheet(gray(photo(w, h, q, 50, 50), w, h), w, h)).toBeNull();
    expect(findSheet(gray(photo(w, h, [{ x: -5, y: -5 }, { x: 90, y: -5 }, { x: 90, y: 70 }, { x: -5, y: 70 }]), w, h), w, h)).toBeNull();
  });
  it('Otsu separa os dois tons', () => {
    const t = otsu([...new Array(500).fill(40), ...new Array(500).fill(220)]);
    expect(t).toBeGreaterThanOrEqual(40); expect(t).toBeLessThan(220);
  });
  it('a homografia leva cada canto ao seu sítio', () => {
    const to: Quad = [{ x: 0, y: 0 }, { x: 99, y: 0 }, { x: 99, y: 139 }, { x: 0, y: 139 }];
    const H = homography(q, to);
    q.forEach((p, i) => expect(near(apply(H, p), to[i], 1e-6)).toBe(true));
  });
  it('endireitar dá uma folha só de papel, do tamanho certo', () => {
    const w = 200, h = 150, px = photo(w, h, q);
    const s = outSize(q);
    expect(s.w).toBeGreaterThan(135); expect(s.h).toBeGreaterThan(95);
    const out = warp(px, w, h, q, s.w, s.h);
    let bright = 0;
    for (let i = 0; i < s.w * s.h; i++) if (out[i * 4] > 180) bright++;
    expect(bright / (s.w * s.h)).toBeGreaterThan(0.95);
  });
  it('limpar: papel com sombra fica branco, o texto fica escuro', () => {
    const w = 120, h = 80, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const shade = 230 - x; // sombra da esquerda para a direita
      const ink = y >= 38 && y <= 41 && x > 20 && x < 100 && x % 6 < 3;
      const v = ink ? shade * 0.3 : shade, i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
    }
    const out = clean(px, w, h);
    expect(out[(10 * w + 10) * 4]).toBe(255);
    expect(out[(10 * w + 110) * 4]).toBe(255);
    expect(out[(39 * w + 60) * 4]).toBeLessThan(60);
  });
});
