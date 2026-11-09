import { useMemo, useRef } from 'react';
import { monthPrint } from '@/lib/thread';
import { eur, type Expense } from '@/lib/money';
import { monthName } from '@/lib/dates';

/**
 * O cartaz de um mês: cada dia é uma lâmina no ângulo dos bigodes (57,4°), tão comprida quanto se gastou, às cores
 * das categorias (as quatro maiores; o resto a cinzento). Em baixo, o nome do mês e o total. As vossas duas luzes
 * nos cantos. Gera-se dos dados; não há dois iguais.
 */
const PAL = ['#3987e5', '#d95926', '#199e70', '#C9A227'];
const TAN = Math.tan((57.4 * Math.PI) / 180); // subida por unidade de avanço

export function MonthPoster({ expenses, who, monthKey, me, other, small }: {
  expenses: Expense[]; who: string; monthKey: string; me?: string | null; other?: string | null; small?: boolean;
}) {
  const p = useMemo(() => monthPrint(expenses, who, monthKey), [expenses, who, monthKey]);
  const svg = useRef<SVGSVGElement>(null);
  const W = 300, H = 400, base = 300, x0 = 26, LEN = 210, step = (W - 2 * x0 - LEN / TAN) / Math.max(1, p.days.length - 1);
  const col = (c: string) => { const i = p.top.indexOf(c); return i >= 0 ? PAL[i] : '#4A4844'; };
  const name = monthName(monthKey);
  return (
    <figure className={`n2-poster${small ? ' small' : ''}`}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cartaz de ${name}: ${eur(p.total, 0)} €, a tua parte.`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={`pg-a-${monthKey}`} cx="0" cy="1" r="1"><stop offset="0" stopColor={me ?? '#8EA6BD'} stopOpacity=".55" /><stop offset="1" stopColor={me ?? '#8EA6BD'} stopOpacity="0" /></radialGradient>
          <radialGradient id={`pg-b-${monthKey}`} cx="1" cy="0" r="1"><stop offset="0" stopColor={other ?? '#FF7A1F'} stopOpacity=".5" /><stop offset="1" stopColor={other ?? '#FF7A1F'} stopOpacity="0" /></radialGradient>
        </defs>
        <rect width={W} height={H} fill="#0B0B0B" />
        <rect width={W} height={H} fill={`url(#pg-a-${monthKey})`} />
        <rect width={W} height={H} fill={`url(#pg-b-${monthKey})`} />
        {p.days.map((d, k) => {
          const len = p.max ? (d.total / p.max) * LEN : 0;
          if (!len) return <line key={k} x1={x0 + k * step} y1={base} x2={x0 + k * step + 4 / TAN} y2={base - 4} stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" />;
          let at = 0;
          return d.cats.map(([c, v], j) => {
            const l = (v / d.total) * len, a = at; at += l;
            const x1 = x0 + k * step + a / TAN, y1 = base - a, x2 = x1 + l / TAN, y2 = y1 - l;
            return <line key={`${k}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={col(c)} strokeWidth="3.2" strokeLinecap="round" />;
          });
        })}
        <text x={x0} y={346} fill="#F4F4F4" fontFamily="Albert Sans, sans-serif" fontSize="34" fontWeight="500" letterSpacing="-1">{name[0].toUpperCase() + name.slice(1)}</text>
        <text x={x0} y={374} fill="rgba(244,244,244,.7)" fontFamily="Albert Sans, sans-serif" fontSize="14">{monthKey.slice(0, 4)} · {eur(p.total, 0)} € · NIKKI</text>
        {!small && p.top.map((c, i) => <g key={c} transform={`translate(${W - 26} ${30 + i * 18})`}><circle r="4" fill={PAL[i]} /><text x="-10" y="4" textAnchor="end" fill="rgba(244,244,244,.75)" fontFamily="Albert Sans, sans-serif" fontSize="11">{c}</text></g>)}
      </svg>
      {!small && <button type="button" className="n2-link press" onClick={() => savePng(svg.current!, `nikki-${monthKey}.png`)}>Guardar imagem</button>}
    </figure>
  );
}

/** Guarda o cartaz como PNG (1200 × 1600), pelo próprio browser. */
function savePng(svg: SVGSVGElement, file: string) {
  const s = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
    c.getContext('2d')!.drawImage(img, 0, 0, 1200, 1600);
    c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
}
