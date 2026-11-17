import type React from 'react';
// Os instrumentos da NIKKI 2: o desenho diz o número antes de o texto o dizer. Tudo em SVG, a uma só espessura,
// com o laranja para «agora» e para o que pede atenção. O movimento só desenha (uma vez, à entrada).

/** O dia num arco: 24 horas, o que já passou a cheio, o que falta a tracejado, um ponto por compromisso e o «agora». */
export function DayArc({ now, marks, onScrub }: { now: number; marks: number[]; onScrub?: (h: number | null) => void }) {
  const at = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); onScrub?.(Math.max(0, Math.min(24, ((e.clientX - r.left) / r.width - 26 / 300) / (248 / 300) * 24))); };
  const W = 300, H = 150, cx = 150, cy = 150, R = 124;
  const pt = (h: number, r = R) => { const a = Math.PI * (1 - Math.max(0, Math.min(24, h)) / 24); return [cx + Math.cos(a) * r, cy - Math.sin(a) * r] as const; };
  const arc = (h0: number, h1: number) => { const [x0, y0] = pt(h0), [x1, y1] = pt(h1); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const [nx, ny] = pt(now);
  return (
    <svg className="viz day-arc" viewBox={`0 -8 ${W} ${H + 18}`} role="img" aria-label="O dia, das 0 às 24 horas. Arrasta para percorrer as horas."
      onPointerDown={onScrub ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e); } : undefined} onPointerMove={onScrub ? (e) => { if (e.buttons || e.pointerType === 'touch') at(e); } : undefined}
      onPointerUp={onScrub ? () => onScrub(null) : undefined} onPointerCancel={onScrub ? () => onScrub(null) : undefined}>
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


/**
 * O mês em duas linhas: o que já se gastou (cheia, até hoje) e onde é normal estar em cada dia (tracejada, o mês
 * inteiro). Um ponto em «hoje»; arrastar o dedo mostra o dia. Valores em unidades (U).
 */
export function MonthLines({ spent, expected, today, onPick, pick = null }: { spent: number[]; expected: number[]; today: number | null; onPick?: (d: number | null) => void; pick?: number | null }) {
  const days = expected.length - 1, W = 320, H = 150, P = 6;
  const last = today ?? days;
  const max = Math.max(1, expected[days] ?? 0, ...spent.slice(0, last + 1)) * 1.08;
  const x = (d: number) => P + (d / days) * (W - 2 * P), y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (vs: number[], n: number) => vs.slice(0, n + 1).map((v, d) => `${d ? 'L' : 'M'}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const area = `${line(spent, last)}L${x(last).toFixed(1)} ${H - P}L${x(0).toFixed(1)} ${H - P}Z`;
  const hit = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); onPick?.(Math.max(1, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * days)))); };
  const pd = pick ?? null;
  return (
    <svg className="viz mlines" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="O mês: o que já gastaste e onde é normal estar"
      onPointerDown={onPick ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); hit(e); } : undefined} onPointerMove={onPick ? (e) => { if (e.buttons || e.pointerType === 'touch') hit(e); } : undefined}
      onPointerUp={onPick ? () => onPick(null) : undefined} onPointerCancel={onPick ? () => onPick(null) : undefined}>
      <defs><linearGradient id="ml-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF6A1F" stopOpacity=".55" /><stop offset="1" stopColor="#FF6A1F" stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} className="ml-grid" x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} />)}
      <path className="ml-norm" d={line(expected, days)} />
      <path className="ml-area" d={area} fill="url(#ml-fill)" />
      <path className="ml-line" d={line(spent, last)} pathLength={1} />
      {pd !== null && <line className="ml-rule" x1={x(pd)} x2={x(pd)} y1={P} y2={H - P} />}
      <circle className="ml-dot" cx={x(pd ?? last)} cy={y(spent[pd ?? last] ?? 0)} r={5} />
    </svg>
  );
}

/**
 * Doze meses em colunas: a altura é o gasto do mês; a linha tracejada é o normal. O mês a decorrer a laranja (com a
 * previsão em contorno), o escolhido a branco e com o valor. Tocar numa coluna muda o mês.
 */
export function MonthBars({ cols, normal, onPick }: { cols: { key: string; label: string; v: number; ghost?: number; cur?: boolean; sel?: boolean; val: string }[]; normal: number | null; onPick: (key: string) => void }) {
  const max = Math.max(1, normal ?? 0, ...cols.map((c) => Math.max(c.v, c.ghost ?? 0))) * 1.12;
  return (
    <div className="mbars" role="group" aria-label="Doze meses">
      {normal ? <span className="mb-norm" style={{ bottom: `calc(26px + (100% - 52px) * ${normal / max})` }}><em>normal</em></span> : null}
      {cols.map((c, j) => (
        <button key={c.key} type="button" className={`mb press${c.sel ? ' sel' : ''}${c.cur ? ' cur' : ''}`} onClick={() => onPick(c.key)} aria-label={`${c.label}: ${c.val}`} style={{ ['--k' as string]: j }}>
          <span className="mb-v">{c.sel || c.cur ? c.val : ''}</span>
          <span className="mb-col">
            {c.ghost ? <i className="gh" style={{ height: `${(c.ghost / max) * 100}%` }} /> : null}
            <i style={{ height: `${Math.max(1.5, (c.v / max) * 100)}%` }} />
          </span>
          <span className="mb-m">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
