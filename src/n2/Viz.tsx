// Os instrumentos da NIKKI 2: o desenho diz o número antes de o texto o dizer. Tudo em SVG, a uma só espessura,
// com o laranja para «agora» e para o que pede atenção. O movimento só desenha (uma vez, à entrada).

/** O dia num arco: 24 horas, o que já passou a cheio, o que falta a tracejado, um ponto por compromisso e o «agora». */
export function DayArc({ now, marks }: { now: number; marks: number[] }) {
  const W = 300, H = 150, cx = 150, cy = 150, R = 124;
  const pt = (h: number, r = R) => { const a = Math.PI * (1 - Math.max(0, Math.min(24, h)) / 24); return [cx + Math.cos(a) * r, cy - Math.sin(a) * r] as const; };
  const arc = (h0: number, h1: number) => { const [x0, y0] = pt(h0), [x1, y1] = pt(h1); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const [nx, ny] = pt(now);
  return (
    <svg className="viz day-arc" viewBox={`0 -8 ${W} ${H + 18}`} role="img" aria-label="O dia, das 0 às 24 horas">
      {Array.from({ length: 25 }, (_, h) => { const [a, b] = pt(h, R + 9), [c, d] = pt(h, R + (h % 6 === 0 ? 17 : 13)); return <line key={h} className="tick" x1={a} y1={b} x2={c} y2={d} />; })}
      <path className="rest" d={arc(now, 24)} />
      <path className="done-glow" d={arc(0, now)} pathLength={1} />
      <path className="done" d={arc(0, now)} pathLength={1} />
      <path className="comet" d={arc(0, now)} pathLength={1} />
      {marks.map((h, k) => { const [x, y] = pt(h); return <circle key={k} className={`mk${h < now ? ' past' : ''}`} cx={x} cy={y} r={4.5} style={{ ['--k' as string]: k }} />; })}
      <circle className="now-halo" cx={nx} cy={ny} r={11} /><circle className="now" cx={nx} cy={ny} r={5.5} />
      {[0, 6, 12, 18, 24].map((h) => { const [x, y] = pt(h, R - 18); return <text key={h} x={x} y={y + 4} textAnchor="middle">{h}</text>; })}
    </svg>
  );
}

/** Uma contagem em pontos: cada coisa é um ponto; os primeiros «hot» acendem. */
export function Dots({ n, hot = 0, max = 24 }: { n: number; hot?: number; max?: number }) {
  const shown = Math.min(n, max), cols = 8;
  return (
    <svg className="viz dots" viewBox={`0 0 ${cols * 12} 36`} aria-hidden="true">
      {Array.from({ length: max }, (_, k) => <circle key={k} cx={6 + (k % cols) * 12} cy={6 + Math.floor(k / cols) * 12} r={3.4} className={k < hot ? 'hot' : k < shown ? 'on' : ''} style={{ ['--k' as string]: k }} />)}
    </svg>
  );
}

/** Uma régua: o normal ao meio, o ponteiro onde estamos (−50% a +50%). */
export function Ruler({ pct }: { pct: number | null }) {
  const x = 48 + Math.max(-44, Math.min(44, ((pct ?? 0) / 50) * 44));
  return (
    <svg className="viz ruler" viewBox="0 0 96 36" aria-hidden="true">
      {Array.from({ length: 23 }, (_, k) => <line key={k} className="tick" x1={4 + k * 4} x2={4 + k * 4} y1={k % 11 === 0 ? 8 : k === 11 ? 4 : 14} y2={28} />)}
      {pct !== null && <line className={`hand${pct >= 10 ? ' hot' : ''}`} x1={x} x2={x} y1={2} y2={32} />}
    </svg>
  );
}

/** Uma nota de 0 a 100, em arco. */
export function Gauge({ v }: { v: number }) {
  const R = 40, a = (t: number) => { const g = Math.PI * (1 - t); return `${(48 + Math.cos(g) * R).toFixed(1)} ${(44 - Math.sin(g) * R).toFixed(1)}`; };
  const t = Math.max(0, Math.min(1, v / 100));
  return (
    <svg className="viz gauge" viewBox="0 0 96 48" aria-hidden="true">
      <path className="rest" d={`M${a(0)}A${R} ${R} 0 0 1 ${a(1)}`} />
      <path className="done-glow" d={`M${a(0)}A${R} ${R} 0 0 1 ${a(1)}`} pathLength={1} style={{ ['--t' as string]: t }} />
      <path className="done" d={`M${a(0)}A${R} ${R} 0 0 1 ${a(1)}`} pathLength={1} style={{ ['--t' as string]: t }} />
    </svg>
  );
}

/** O fundo vivo: três luzes (laranja, azul, âmbar) a derivar devagar atrás do vidro. Só transformações: leve. */
export function Aurora() {
  return <div className="aurora" aria-hidden="true"><i className="a1" /><i className="a2" /><i className="a3" /></div>;
}
