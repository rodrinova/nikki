// Os gráficos que se explicam sozinhos (NIKKI 2): cada gráfico vem com a frase que o explica, escrita dos dados,
// como uma legenda de jornal. Diz o que é notável (o mês mais caro e porquê, a categoria que foge ao normal, onde o
// mês vai fechar) e cala o resto. Valores em unidades (1 u = 0,00001 €); o «€» fica separado por espaço normal
// (quem mostra troca-o por um espaço que não parte).
import { monthKey, monthName, prevMonth } from './dates';
import { keyOf } from './forecast';
import { eur, partOf, type Expense } from './money';

type Exp = Expense & { note: string | null };
const pc = (a: number, b: number) => Math.round((a / b - 1) * 100);
const near = (p: number) => Math.abs(p) < 5;

/**
 * Contas fixas: a mesma nota, na mesma categoria, uma só vez no mês anterior e uma só vez neste, com um valor
 * parecido (±20%), e só nas categorias das contas da casa (Casa e Contas: a renda, a luz, a água, a internet). São
 * esperadas; não explicam nada. O supermercado, os jantares e o combustível repetem-se, mas não são contas fixas.
 */
const FIXED = new Set(['Casa', 'Contas']);
function recurring(expenses: Exp[], key: string): Set<Exp> {
  const prev = prevMonth(key);
  const group = (k: string) => {
    const m = new Map<string, Exp[]>();
    for (const e of expenses) { if (monthKey(e.spent_on) !== k || !keyOf(e.note) || !FIXED.has(e.category)) continue; const g = `${e.category}|${keyOf(e.note)}`; m.set(g, [...(m.get(g) ?? []), e]); }
    return m;
  };
  const before = group(prev), now = group(key), out = new Set<Exp>();
  for (const [g, list] of now) {
    const old = before.get(g);
    if (list.length !== 1 || !old || old.length !== 1) continue;
    const a = Math.abs(Number(list[0].amount)), b = Math.abs(Number(old[0].amount));
    if (b > 0 && Math.abs(a / b - 1) <= 0.2) out.add(list[0]);
  }
  return out;
}

/** O ritmo: quanto vai o dia a dia face ao normal até hoje, e onde o mês deve fechar. */
export function explainPace(x: { everyday: number; normal: number; share: number; forecast: number; day: number }): string {
  const exp = x.normal * x.share, d = x.everyday - exp;
  const now = Math.abs(d) < 0.05 * exp ? `Até ao dia ${x.day}, o dia a dia vai em linha com um mês normal (${eur(x.everyday, 0)} €).`
    : `Até ao dia ${x.day}, o dia a dia vai ${eur(Math.abs(d), 0)} € ${d > 0 ? 'acima' : 'abaixo'} de um mês normal (${eur(x.everyday, 0)} € para ${eur(exp, 0)} €).`;
  const f = pc(x.forecast, x.normal);
  const end = near(f) ? ` A este ritmo, fecha perto do normal, em ${eur(x.forecast, 0)} €.` : ` A este ritmo, fecha em ${eur(x.forecast, 0)} €, ${Math.abs(f)}% ${f > 0 ? 'acima' : 'abaixo'} do normal.`;
  return now + end;
}

/**
 * «Onde»: a categoria que mais foge ao seu normal (no mês a decorrer, face à parte do mês que já passou: `share` é
 * dia ÷ dias, porque fora das contas fixas o gasto vai-se fazendo ao longo do mês), com o movimento que mais pesou nela. Devolve também as categorias de que fala, para o gráfico as realçar.
 */
export function explainCats(x: { byCat: [string, number][]; normals: Record<string, number>; share: number; current: boolean; expenses: Exp[]; who: string; key: string; label?: (c: string) => string }): { text: string; marks: string[]; fixed?: string } {
  const L = x.label ?? ((c: string) => c);
  // No mês a decorrer, o que se repete (a renda no dia 1) sai das duas contas: senão, a Casa estaria sempre «à frente».
  const rec = x.current ? recurring(x.expenses, x.key) : new Set<Exp>();
  const recBy = new Map<string, number>();
  for (const e of rec) recBy.set(e.category, (recBy.get(e.category) ?? 0) + partOf(e, x.who));
  const rows = x.byCat.filter(([c, v]) => v > 0 && (x.normals[c] ?? 0) > 0).map(([c, v0]) => {
    const r = recBy.get(c) ?? 0, v = v0 - r, base = x.normals[c] - r;
    const ref = base * (x.current ? x.share : 1);
    return { c, v, ref, d: v - ref, p: ref > 0 ? pc(v, ref) : 0, min: Math.max(2_000_000, x.normals[c] * 0.1) }; // diferenças pequenas (menos de 20 € ou de 10% do normal) não são notícia
  }).filter((r) => r.ref > 0);
  if (!rows.length) return { text: x.byCat.length ? 'Ainda sem normal para comparar: é preciso um mês completo.' : '', marks: [] };
  const up = rows.filter((r) => r.p >= 15 && r.d >= r.min).sort((a, b) => b.d - a.d)[0];
  // «Abaixo» só depois de meio mês (antes, é só o mês a começar) e só com gastos (sem gastos fora do que se repete, não há nada a dizer).
  const down = (x.current && x.share < 0.5 ? [] : rows).filter((r) => r.v > 0 && r.p <= -25 && -r.d >= r.min).sort((a, b) => a.d - b.d)[0];
  const once = recurring(x.expenses, x.key);
  const biggest = (c: string) => {
    let best: Exp | null = null, bv = 0;
    for (const e of x.expenses) { if (e.category !== c || monthKey(e.spent_on) !== x.key || once.has(e)) continue; const v = partOf(e, x.who); if (v > bv) { bv = v; best = e; } }
    return best?.note?.trim() ? `${best.note.trim()}, ${eur(bv, 0)} €` : null;
  };
  const parts: string[] = [];
  if (up) {
    const why = biggest(up.c);
    parts.push(x.current
      ? `${L(up.c)} vai à frente: ${eur(up.v, 0)} € até hoje, quando num mês normal por esta altura são ${eur(up.ref, 0)} €${why ? ` (pesou ${why})` : ''}.`
      : `${L(up.c)} ficou ${up.p}% acima do normal${why ? `, sobretudo ${why}` : ''}.`);
  }
  if (down) parts.push(`${L(down.c)} ${x.current ? 'vai' : 'ficou'} ${Math.abs(down.p)}% abaixo.`);
  if (!parts.length) parts.push(x.current ? 'Todas as categorias vão dentro do habitual para esta altura do mês.' : 'Todas as categorias ficaram perto do normal.');
  else if (!down && rows.length > 1) parts.push('O resto está dentro do habitual.');
  // Onde a maior parte já é o que se repete (a renda no dia 1), a percentagem da tabela parece alta: diz-se porquê.
  const fixedCats = [...recBy].filter(([c, r]) => { const v = x.byCat.find(([k]) => k === c)?.[1] ?? 0; return v > 0 && r / v >= 0.5; });
  const fixed = fixedCats.length ? `${fixedCats.map(([c]) => {
    const notes = [...new Set([...rec].filter((e) => e.category === c).map((e) => e.note!.trim()))].slice(0, 2).join(' e ');
    return `${L(c)} (${notes})`;
  }).join(', ')}: a maior parte é o que se paga todos os meses, logo no início.` : undefined;
  return { text: parts.join(' '), marks: [up?.c, down?.c].filter(Boolean) as string[], fixed };
}

/** Doze meses: o mais caro (e o que o pesou), o mais leve, e para onde vai o mês a decorrer. */
export function explainYear(x: { months: { key: string; total: number; current: boolean }[]; normal: number | null; forecast: number | null; expenses: Exp[]; who: string }): { text: string; marks: string[] } {
  const done = x.months.filter((m) => !m.current && m.total > 0);
  if (!done.length) return { text: 'Ainda não há meses completos para comparar.', marks: [] };
  const hi = [...done].sort((a, b) => b.total - a.total)[0], lo = [...done].sort((a, b) => a.total - b.total)[0];
  // O que pesou: a maior despesa que não se repete todos os meses (a renda não explica um mês caro).
  const rep = recurring(x.expenses, hi.key);
  let big: Exp | null = null, bv = 0;
  for (const e of x.expenses) { if (monthKey(e.spent_on) !== hi.key || rep.has(e)) continue; const v = partOf(e, x.who); if (v > bv) { bv = v; big = e; } }
  const share = bv && hi.total ? bv / hi.total : 0;
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const parts = [`${cap(monthName(hi.key))} foi o mês mais caro (${eur(hi.total, 0)} €${x.normal ? `, ${pc(hi.total, x.normal)}% acima do normal` : ''})${big?.note && share >= 0.25 ? `, sobretudo por ${big.note.trim()} (${eur(bv, 0)} €)` : ''}.`];
  if (lo.key !== hi.key && done.length > 2) parts.push(`O mais leve foi ${monthName(lo.key)} (${eur(lo.total, 0)} €).`);
  const cur = x.months.find((m) => m.current);
  if (cur && x.forecast && x.normal) {
    const f = pc(x.forecast, x.normal);
    parts.push(near(f) ? `${cap(monthName(cur.key))} vai a caminho do normal (${eur(x.forecast, 0)} €).` : `${cap(monthName(cur.key))} vai a caminho de ${eur(x.forecast, 0)} €, ${Math.abs(f)}% ${f > 0 ? 'acima' : 'abaixo'} do normal.`);
  }
  return { text: parts.join(' '), marks: [hi.key, ...(done.length > 2 && lo.key !== hi.key ? [lo.key] : [])] };
}

