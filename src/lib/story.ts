// As histórias da casa: «A semana da casa» (ao domingo e à segunda) e «O vosso ano» (em dezembro). Cada uma é uma
// mão-cheia de cartões com um número grande e uma frase. Sem dependências da app: recebe as linhas já carregadas
// (a agenda já expandida, com as repetições) e devolve os cartões; o ecrã é o src/ui/Stories.tsx.
import { addDays, monthKey, monthName, parseDate, weekdayName } from './dates';
import { eur, partOf, toU, type Expense, type Transfer } from './money';

export interface Card { k: string; eyebrow: string; big: string; unit?: string; line: string; foot?: string }
export interface StoryItem { day: string; title: string; kind: string }
type Exp = Expense & { note: string | null; occasion_id?: string | null };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pct = (a: number, b: number) => Math.round((a / b - 1) * 100);

/** A semana: de segunda a domingo. Ao domingo, a que está a acabar; nos outros dias, a anterior. */
export function weekRange(today: string): { from: string; to: string } {
  const wd = (parseDate(today).getDay() + 6) % 7; // segunda = 0
  const to = wd === 6 ? today : addDays(today, -wd - 1);
  return { from: addDays(to, -6), to };
}

const dm = (d: string) => `${Number(d.slice(8, 10))}`;
export const rangeLabel = (from: string, to: string) =>
  monthKey(from) === monthKey(to) ? `${dm(from)} a ${dm(to)} de ${monthName(monthKey(to))}` : `${dm(from)} de ${monthName(monthKey(from))} a ${dm(to)} de ${monthName(monthKey(to))}`;

export function weekStory(x: {
  today: string; me: string; meName: string; partner?: { id: string; name: string } | null;
  expenses: Exp[]; items: StoryItem[]; next: StoryItem[]; todosDone: { done_at: string | null; done_by: string | null }[]; normalMonth: number | null;
}): { from: string; to: string; cards: Card[] } {
  const { from, to } = weekRange(x.today);
  const inWeek = (d: string) => d >= from && d <= to;
  const cards: Card[] = [{ k: 'open', eyebrow: 'A semana da casa', big: rangeLabel(from, to), line: 'Sete dias em meio minuto.' }];

  // Dinheiro: a tua parte do dia a dia (sem eventos), face a uma semana normal (o mês normal × 7 / 30,4).
  const ex = x.expenses.filter((e) => inWeek(e.spent_on) && !e.occasion_id);
  const total = ex.reduce((t, e) => t + partOf(e, x.me), 0);
  if (total > 0) {
    const byCat = new Map<string, number>();
    for (const e of ex) byCat.set(e.category, (byCat.get(e.category) ?? 0) + partOf(e, x.me));
    const [cat, v] = [...byCat].sort((a, b) => b[1] - a[1])[0];
    const week = x.normalMonth ? (x.normalMonth * 7) / 30.4 : null;
    const p = week ? pct(total, week) : null;
    cards.push({
      k: 'money', eyebrow: x.partner ? 'Dinheiro · a tua parte' : 'Dinheiro', big: eur(total, 0), unit: '€',
      line: p === null ? 'A primeira semana com contas. A partir daqui, compara-se.' : Math.abs(p) < 5 ? 'Uma semana normal. Nada a apontar.' : p < 0 ? `${-p}% abaixo de uma semana normal. Bem jogado.` : `${p}% acima de uma semana normal.`,
      foot: `Onde mais: ${cat} (${eur(v, 0)} €)`,
    });
  }

  // Agenda: quantas coisas e o dia mais cheio.
  const its = x.items.filter((i) => inWeek(i.day) && i.kind !== 'due');
  if (its.length) {
    const per = new Map<string, number>();
    for (const i of its) per.set(i.day, (per.get(i.day) ?? 0) + 1);
    const [d, n] = [...per].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    cards.push({ k: 'agenda', eyebrow: 'Agenda', big: String(its.length), unit: its.length === 1 ? 'coisa' : 'coisas', line: n > 1 ? `${cap(weekdayName(d))} foi o dia mais cheio (${n}).` : 'Uma por dia, no máximo. Semana calma.' });
  }

  // Feito: as coisas «a fazer» riscadas, por quem.
  const done = x.todosDone.filter((t) => t.done_at && inWeek(t.done_at.slice(0, 10)));
  if (done.length) {
    const mine = done.filter((t) => t.done_by === x.me).length, theirs = x.partner ? done.filter((t) => t.done_by === x.partner!.id).length : 0;
    cards.push({ k: 'done', eyebrow: 'Feito', big: String(done.length), unit: done.length === 1 ? 'coisa riscada' : 'coisas riscadas', line: x.partner && theirs ? `Tu ${mine}, ${x.partner.name} ${theirs}. Equipa.` : 'Riscar sabe bem.' });
  }

  // A seguir: os próximos 7 dias.
  const nx = x.next.filter((i) => i.day > to && i.day <= addDays(to, 7) && i.kind !== 'busy');
  cards.push(nx.length
    ? { k: 'next', eyebrow: 'A seguir', big: String(nx.length), unit: nx.length === 1 ? 'coisa marcada' : 'coisas marcadas', line: nx.slice(0, 2).map((i) => `${i.title} (${weekdayName(i.day)})`).join(', ') + (nx.length > 2 ? ` e mais ${nx.length - 2}.` : '.') }
    : { k: 'next', eyebrow: 'A seguir', big: '0', unit: 'coisas marcadas', line: 'Semana livre pela frente. Raro e bom.' });
  cards.push({ k: 'close', eyebrow: 'Fim', big: 'Boa semana.', line: 'A NIKKI fica de olho no resto.' });
  return { from, to, cards };
}

export function yearStory(x: {
  year: number; today?: string; me: string; meName: string; partner?: { id: string; name: string } | null;
  expenses: Exp[]; items: StoryItem[]; products: { product: string; bought_on: string }[]; transfers: Transfer[];
  occasions: { name: string; on_date: string | null; purchase?: boolean }[]; lead?: string | null;
}): Card[] {
  const y = String(x.year), inY = (d: string | null) => !!d && d.slice(0, 4) === y;
  const who = x.partner ? `${x.meName} e ${x.partner.name}` : x.meName;
  const cards: Card[] = [{ k: 'open', eyebrow: 'O vosso ano', big: y, line: `${who}, em números.` }];
  const ex = x.expenses.filter((e) => inY(e.spent_on) && !e.occasion_id && e.category !== 'Future Me');
  const total = ex.reduce((t, e) => t + partOf(e, x.me), 0);
  if (total > 0) {
    const byM = new Map<string, number>();
    for (const e of ex) byM.set(monthKey(e.spent_on), (byM.get(monthKey(e.spent_on)) ?? 0) + partOf(e, x.me));
    // O mais leve e o mais pesado só entre os meses que já acabaram (o mês a decorrer ainda vai a meio).
    const ms = [...byM].filter(([k, v]) => v > 0 && (!x.today || k < monthKey(x.today))).sort((a, b) => a[1] - b[1]);
    const lo = ms[0], hi = ms[ms.length - 1];
    cards.push({ k: 'money', eyebrow: x.partner ? 'Dinheiro · a tua parte' : 'Dinheiro', big: eur(total, 0), unit: '€', line: ms.length > 1 ? `O mês mais leve foi ${monthName(lo[0])} (${eur(lo[1], 0)} €). O mais pesado, ${monthName(hi[0])} (${eur(hi[1], 0)} €).` : 'O primeiro ano com contas.' });
    const byC = new Map<string, number>();
    for (const e of ex) byC.set(e.category, (byC.get(e.category) ?? 0) + partOf(e, x.me));
    const [c, v] = [...byC].sort((a, b) => b[1] - a[1])[0];
    cards.push({ k: 'cat', eyebrow: 'A categoria do ano', big: c, line: `${eur(v, 0)} €, ${Math.round((v / total) * 100)}% do ano.` });
  }
  const out = ex.filter((e) => e.category === 'Restaurantes');
  if (out.length >= 3) {
    const top = [...out].sort((a, b) => toU(b.amount) - toU(a.amount))[0];
    cards.push({ k: 'out', eyebrow: 'Fora de casa', big: String(out.length), unit: 'refeições fora', line: `A mais cara: ${top.note?.trim() || 'sem nome'} (${eur(toU(top.amount), 0)} €).` });
  }
  const sup = ex.filter((e) => e.category === 'Supermercado');
  if (sup.length >= 3) {
    const byP = new Map<string, number>();
    for (const p of x.products.filter((p) => inY(p.bought_on))) byP.set(p.product, (byP.get(p.product) ?? 0) + 1);
    const fav = [...byP].sort((a, b) => b[1] - a[1])[0];
    cards.push({ k: 'shop', eyebrow: 'Supermercado', big: String(sup.length), unit: 'idas', line: fav ? `O que mais vezes foi para o carrinho: ${fav[0].toLowerCase()}.` : 'Juntem as faturas e para o ano há mais para contar.' });
  }
  const its = x.items.filter((i) => inY(i.day) && i.kind !== 'due' && i.kind !== 'busy');
  if (its.length) {
    const byT = new Map<string, number>();
    for (const i of its) byT.set(i.title, (byT.get(i.title) ?? 0) + 1);
    const [t, n] = [...byT].sort((a, b) => b[1] - a[1])[0];
    cards.push({ k: 'agenda', eyebrow: 'Agenda', big: String(its.length), unit: 'coisas na agenda', line: n > 2 ? `O que mais se repetiu: ${t} (${n} vezes).` : 'Muita coisa, pouca repetição. Ano variado.' });
  }
  const occ = x.occasions.filter((o) => !o.purchase && inY(o.on_date));
  if (occ.length) cards.push({ k: 'occ', eyebrow: 'Momentos', big: String(occ.length), unit: occ.length === 1 ? 'evento' : 'eventos', line: occ.slice(0, 3).map((o) => o.name).join(', ') + (occ.length > 3 ? ` e mais ${occ.length - 3}.` : '.') });
  if (x.partner) {
    const tr = x.transfers.filter((t) => inY(t.made_on));
    const sum = tr.reduce((s, t) => s + toU(t.amount), 0);
    cards.push({ k: 'us', eyebrow: 'Entre nós', big: tr.length ? eur(sum, 0) : 'Zero', unit: tr.length ? '€ em acertos' : 'acertos', line: `${tr.length ? `${tr.length} ${tr.length === 1 ? 'transferência' : 'transferências'}. ` : 'Nem uma transferência. '}${x.lead ? `A balança acaba o ano assim: ${x.lead.toLowerCase()}.` : ''}`.trim() });
  }
  cards.push({ k: 'close', eyebrow: 'Fim', big: `Venha ${x.year + 1}.`, line: 'Para o ano, a NIKKI faz as contas outra vez.' });
  return cards;
}
