import { useMemo, useState } from 'react';
import { useSession } from '@/data/session';
import { eur } from '@/lib/money';
import { squarify, type Rect } from '@/lib/treemap';
import type { BillKind } from '@/lib/home';
import type { BillRow } from '@/data/house';
import type { useCasa } from './Casa';

// Custos fixos por ano, em blocos do tamanho de cada conta (a renda enorme, a água pequena), por casa quando há várias.
// Cores por grupo (habitação, energia, água, outras): três validadas para daltonismo + uma neutra; cada bloco tem o
// nome escrito, por isso a cor nunca é a única pista.

type Group = 'casa' | 'energia' | 'agua' | 'outras';
const GROUP: Record<BillKind, Group> = { renda: 'casa', credito: 'casa', condominio: 'casa', seguro: 'casa', luz: 'energia', gas: 'energia', agua: 'agua', internet: 'outras', telemovel: 'outras', outra: 'outras' };
const GROUPS: [Group, string, string][] = [['casa', 'Habitação', '1'], ['energia', 'Energia', '2'], ['agua', 'Água', '3'], ['outras', 'Comunicações e outras', 'o']];
const fill = (g: Group) => `var(--viz-${GROUPS.find((x) => x[0] === g)![2]})`;
const ink = (g: Group) => `var(--viz-${GROUPS.find((x) => x[0] === g)![2]}-t)`;
const pct = (v: number) => (Math.round(v * 100) === 0 ? 'igual' : `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`);
const W = 340, H = 236;

interface Item { b: BillRow; home: string | null; v: number; full: number; pv: number | null; estimated: boolean; part: number }

export function YearBlocks({ c, all }: { c: ReturnType<typeof useCasa>; all: boolean }) {
  const { partner } = useSession();
  const [mine, setMine] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const items: Item[] = useMemo(() => c.year
    .map((y) => ({ b: y.b, home: y.home, estimated: y.estimated, part: y.part, full: y.year, v: Math.round(y.year * (mine ? y.part : 1)), pv: y.prev === null ? null : Math.round(y.prev * (mine ? y.part : 1)) }))
    .filter((x) => x.v > 0), [c.year, mine]);
  const nested = all && c.places.length > 1;
  const tiles = useMemo(() => {
    const box: Rect = { x: 0, y: 0, w: W, h: H };
    if (!nested) return { homes: [] as { name: string; r: Rect; v: number }[], bills: squarify(items.map((i) => ({ item: i, value: i.v })), box) };
    const byHome = c.places.map((h) => ({ h, list: items.filter((i) => i.home === h.id) })).filter((x) => x.list.length);
    const outer = squarify(byHome.map((x) => ({ item: x, value: x.list.reduce((t, i) => t + i.v, 0) })), box);
    const bills = outer.flatMap((o) => {
      const head = o.h > 46 && o.w > 70 ? 16 : 0; // faixa com o nome da casa
      return squarify(o.item.list.map((i) => ({ item: i, value: i.v })), { x: o.x + 2, y: o.y + head + 2, w: o.w - 4, h: o.h - head - 4 });
    });
    return { homes: outer.map((o) => ({ name: o.item.h.name, r: o as Rect, v: o.value })), bills };
  }, [items, nested, c.places]);
  if (!items.length) return null;
  const total = items.reduce((t, i) => t + i.v, 0);
  const prev = items.every((i) => i.pv !== null) ? items.reduce((t, i) => t + i.pv!, 0) : null;
  const est = items.some((i) => i.estimated);
  const top = [...items].sort((a, b) => b.v - a.v)[0];
  const picked = items.find((i) => i.b.id === sel) ?? null;
  const shareText = (i: Item) => {
    if (!partner) return '';
    if (i.b.owner_id === null) return ` · partilhada: a tua parte ${eur(Math.round(i.full * i.part), 0)} €, ${partner.name} ${eur(Math.round(i.full * (1 - i.part)), 0)} €`;
    return i.part === 1 ? ' · só tua' : ` · de ${partner.name}`;
  };
  const present = GROUPS.filter(([g]) => items.some((i) => GROUP[i.b.kind] === g));
  return (
    <section className="tile pane yb-wrap" aria-label="Custos fixos por ano" style={{ minHeight: 0 }}>
      <div className="pane-top"><span className="s">Custos fixos por ano{nested ? ' · todas as casas' : ''}</span>
        {partner && <div className="seg sm" role="group" aria-label="De quem"><button className="press" aria-pressed={!mine} onClick={() => setMine(false)}>Casal</button><button className="press" aria-pressed={mine} onClick={() => setMine(true)}>A tua parte</button></div>}
      </div>
      <div className="yb-top">
        <span className="yb-total"><b>{eur(total, 0)} €</b><span className="s"> por ano{est ? '*' : ''}{prev ? ` · ${pct(total / prev - 1)} que no ano anterior` : ''}</span></span>
      </div>
      <div className={`yb${picked ? ' picked' : ''}`}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Custos fixos por ano: ${eur(total, 0)} €. ${items.map((i) => `${i.b.name} ${eur(i.v, 0)} €`).join(', ')}.`}>
          <defs><pattern id="yb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" style={{ fill: 'var(--tile)' }} opacity=".4" /></pattern></defs>
          {tiles.homes.map((h) => h.r.h > 46 && h.r.w > 70 && <text key={h.name} className="hh" x={h.r.x + 4} y={h.r.y + 12}>{h.name} · {eur(h.v, 0)} €</text>)}
          {tiles.bills.map((t) => {
            const i = t.item, g = GROUP[i.b.kind], big = t.w >= 70 && t.h >= 38, mid = !big && t.w >= 44 && t.h >= 30, tiny = !big && !mid && t.w >= 34 && t.h >= 18;
            const cut = (n: string, px: number) => (n.length * px > t.w - 12 ? `${n.slice(0, Math.max(2, Math.floor((t.w - 12) / px) - 1))}…` : n);
            return (
              <g key={i.b.id} className={`tl${sel === i.b.id ? ' on' : ''}`} onClick={() => setSel(sel === i.b.id ? null : i.b.id)}>
                <rect className="f" x={t.x + 1} y={t.y + 1} width={Math.max(0, t.w - 2)} height={Math.max(0, t.h - 2)} rx={4} style={{ fill: fill(g) }} />
                {i.estimated && <rect x={t.x + 1} y={t.y + 1} width={Math.max(0, t.w - 2)} height={Math.max(0, t.h - 2)} rx={4} fill="url(#yb-hatch)" />}
                <rect className="ring" x={t.x + 2} y={t.y + 2} width={Math.max(0, t.w - 4)} height={Math.max(0, t.h - 4)} rx={3} />
                {big && <text x={t.x + 8} y={t.y + 18} fontSize="12" style={{ fill: ink(g) }}>{cut(i.b.name, 6.6)}</text>}
                {big && <text x={t.x + 8} y={t.y + 34} fontSize="13" style={{ fill: ink(g) }}>{eur(i.v, 0)} €{i.estimated ? '*' : ''}</text>}
                {mid && <text x={t.x + 6} y={t.y + 14} fontSize="10" style={{ fill: ink(g) }}>{cut(i.b.name, 5.6)}</text>}
                {mid && <text x={t.x + 6} y={t.y + 26} fontSize="10" style={{ fill: ink(g) }}>{eur(i.v, 0)}</text>}
                {tiny && <text x={t.x + 5} y={t.y + 13} fontSize="9" style={{ fill: ink(g) }}>{eur(i.v, 0)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="s yb-detail">{picked
        ? <>{picked.b.name}{nested ? ` · ${c.places.find((h) => h.id === picked.home)?.name ?? ''}` : ''}: {eur(picked.v, 0)} € por ano ({eur(Math.round(picked.v / 12), 0)} € por mês){picked.estimated ? ', estimado' : ''}{picked.pv ? ` · ${pct(picked.v / picked.pv - 1)} que no ano anterior` : ''}{shareText(picked)}.</>
        : <>{top.b.name} {Math.round((top.v / total) * 100) >= 1 ? `é ${Math.round((top.v / total) * 100)}% do total` : 'é a maior'}. Toca num bloco para ver a conta{partner ? ' e a parte de cada um' : ''}.</>}</p>
      {nested && <div className="chips" role="list" aria-label="Por casa">{tiles.homes.map((h) => <span key={h.name} role="listitem" className="s">{h.name} · {eur(h.v, 0)} €</span>)}</div>}
      <div className="yb-legend s" aria-hidden="true">{present.map(([g, l]) => <span key={g}><i style={{ background: fill(g) }} />{l}</span>)}</div>
      {est && <p className="s">* Estimado onde ainda não há um ano de faturas (a média por mês × 12, ou o valor normal da conta). Às riscas no gráfico.</p>}
      <ul className="sr">{items.map((i) => <li key={i.b.id}>{i.b.name}: {eur(i.v, 0)} € por ano{i.estimated ? ', estimado' : ''}</li>)}</ul>
    </section>
  );
}
