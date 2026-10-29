// Blocos proporcionais (treemap «squarified», Bruls et al.): cada valor vira um retângulo com área proporcional,
// o mais quadrado possível, para se ler bem num telemóvel. Puro.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Tile<T> extends Rect { item: T; value: number }

const worst = (row: number[], side: number) => {
  const s = row.reduce((t, v) => t + v, 0), max = Math.max(...row), min = Math.min(...row);
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
};

/** Reparte o retângulo pelos valores (positivos), do maior para o menor. */
export function squarify<T>(items: { item: T; value: number }[], box: Rect): Tile<T>[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((t, i) => t + i.value, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  const out: Tile<T>[] = [];
  let { x, y, w, h } = box, row: typeof list = [];
  const areas = (r: typeof list) => r.map((i) => i.value * scale);
  const lay = (r: typeof list) => {
    const a = areas(r), s = a.reduce((t, v) => t + v, 0);
    if (w >= h) { // coluna à esquerda
      const cw = s / h; let cy = y;
      r.forEach((it, j) => { const ch = a[j] / cw; out.push({ item: it.item, value: it.value, x, y: cy, w: cw, h: ch }); cy += ch; });
      x += cw; w -= cw;
    } else { // linha em cima
      const rh = s / w; let cx = x;
      r.forEach((it, j) => { const rw = a[j] / rh; out.push({ item: it.item, value: it.value, x: cx, y, w: rw, h: rh }); cx += rw; });
      y += rh; h -= rh;
    }
  };
  for (const it of list) {
    const side = Math.min(w, h);
    if (!row.length || worst(areas([...row, it]), side) <= worst(areas(row), side)) row.push(it);
    else { lay(row); row = [it]; }
  }
  if (row.length) lay(row);
  return out;
}
