import { describe, expect, it } from 'vitest';
import { squarify } from '../treemap';

describe('blocos proporcionais', () => {
  const box = { x: 0, y: 0, w: 300, h: 200 };
  it('áreas proporcionais aos valores e tudo dentro da caixa', () => {
    const t = squarify([{ item: 'renda', value: 10080 }, { item: 'luz', value: 1080 }, { item: 'agua', value: 264 }, { item: 'net', value: 503 }, { item: 'tlm', value: 288 }], box);
    const total = 10080 + 1080 + 264 + 503 + 288;
    expect(t).toHaveLength(5);
    for (const r of t) {
      expect(r.w * r.h).toBeCloseTo((r.value / total) * 300 * 200, 6);
      expect(r.x).toBeGreaterThanOrEqual(-1e-9); expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(300 + 1e-6); expect(r.y + r.h).toBeLessThanOrEqual(200 + 1e-6);
    }
    expect(t.reduce((s, r) => s + r.w * r.h, 0)).toBeCloseTo(300 * 200, 6);
    expect(t[0].item).toBe('renda');
  });
  it('blocos sem sobreposição', () => {
    const t = squarify([5, 4, 3, 2, 1, 1].map((v, j) => ({ item: j, value: v })), box);
    for (const a of t) for (const b of t) if (a !== b) {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(ox <= 1e-6 || oy <= 1e-6).toBe(true);
    }
  });
  it('valores a zero ficam de fora; nada para mostrar dá vazio', () => {
    expect(squarify([{ item: 'a', value: 0 }, { item: 'b', value: 3 }], box)).toHaveLength(1);
    expect(squarify([], box)).toEqual([]);
  });
});
