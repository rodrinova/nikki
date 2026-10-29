// Movimentos a dois: cada despesa partilhada (ou paga por um para o outro) e cada transferência entre o par,
// com quem pagou, quanto, quando e o efeito nas contas a dois. Pesquisável, filtrável e ordenável.
import { eur, owedTo, toU, type Expense, type Transfer } from './money';
import { monthKey } from './dates';

export interface PairEntry {
  id: string;
  kind: 'expense' | 'transfer';
  date: string; // YYYY-MM-DD
  at: string; // para desempatar no mesmo dia
  title: string;
  category: string | null;
  payer: string; // quem pagou ou transferiu
  amount: number; // unidades
  effect: number; // nas contas a dois de quem vê: + adiantou, − o outro adiantou
}

export function pairEntries(
  expenses: (Expense & { note?: string | null; created_at?: string })[],
  transfers: (Transfer & { id?: string; created_at?: string })[],
  me: string, other: string,
): PairEntry[] {
  const out: PairEntry[] = [];
  for (const e of expenses) {
    if (e.split === 'mine' || ![e.paid_by, e.other_id].includes(me) || ![e.paid_by, e.other_id].includes(other)) continue;
    out.push({ id: e.id, kind: 'expense', date: e.spent_on, at: e.created_at ?? '', title: e.note?.trim() || e.category, category: e.category, payer: e.paid_by, amount: toU(e.amount), effect: owedTo(e, me) });
  }
  transfers.forEach((t, j) => {
    const mine = t.from_id === me && t.to_id === other, theirs = t.from_id === other && t.to_id === me;
    if (!mine && !theirs) return;
    out.push({ id: t.id ?? `t${j}`, kind: 'transfer', date: t.made_on, at: t.created_at ?? '', title: 'Transferência', category: null, payer: t.from_id, amount: toU(t.amount), effect: mine ? toU(t.amount) : -toU(t.amount) });
  });
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type PairWho = 'all' | 'me' | 'other' | 'transfers';
export type PairPeriod = 'all' | 'month' | '12m' | 'year';
export type PairSort = 'new' | 'old' | 'big';

/**
 * Filtra e ordena. A pesquisa procura no título, na categoria, no nome de quem pagou e no valor ("46,80" ou "46.8").
 * Por defeito, do mais recente para o mais antigo (no mesmo dia, o último registado primeiro).
 */
export function pairFilter(list: PairEntry[], o: { q?: string; who?: PairWho; period?: PairPeriod; sort?: PairSort; me: string; names: Record<string, string>; today: string }): PairEntry[] {
  const q = fold((o.q ?? '').trim());
  const qNum = q.replace(/\s/g, '').replace('.', ',');
  const ym = monthKey(o.today), y = o.today.slice(0, 4);
  const from12 = `${Number(y) - 1}-${o.today.slice(5, 7)}-01`;
  const out = list.filter((e) => {
    if (o.who === 'me' && (e.kind !== 'expense' || e.payer !== o.me)) return false;
    if (o.who === 'other' && (e.kind !== 'expense' || e.payer === o.me)) return false;
    if (o.who === 'transfers' && e.kind !== 'transfer') return false;
    if (o.period === 'month' && monthKey(e.date) !== ym) return false;
    if (o.period === 'year' && e.date.slice(0, 4) !== y) return false;
    if (o.period === '12m' && e.date < from12) return false;
    if (!q) return true;
    const hay = fold(`${e.title} ${e.category ?? ''} ${o.names[e.payer] ?? ''}`);
    return hay.includes(q) || (/\d/.test(qNum) && eur(e.amount).replace(/\s/g, '').includes(qNum.replace(/,0+$/, '')));
  });
  const byDate = (a: PairEntry, b: PairEntry) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at);
  return out.sort(o.sort === 'old' ? byDate : o.sort === 'big' ? (a, b) => b.amount - a.amount || byDate(b, a) : (a, b) => byDate(b, a));
}
