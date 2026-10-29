// Casa: contas fixas (luz, gás, água, internet, renda…), faturas que cobrem um ou mais meses (acertos incluídos),
// consumos, o reconhecimento de uma despesa como conta fixa e as prestações do IMI.
// Regras em docs/CALCULOS.md (secção 6c) do repositório thenikki. Valores em unidades de money.ts.

import { addDays, daysInMonth, monthKey, nextMonth, parseDate, prevMonth } from './dates';

export type BillKind = 'luz' | 'gas' | 'agua' | 'internet' | 'telemovel' | 'renda' | 'credito' | 'condominio' | 'seguro' | 'outra';
export type Unit = 'kWh' | 'm3';

export interface Bill {
  id: string;
  kind: BillKind;
  name: string;
  provider: string | null;
  keywords: string | null;
  every_months: number;
  due_day: number | null;
  expected: number | string | null;
  unit: Unit | null;
  contract_ends_on: string | null;
  archived: boolean;
}

export interface BillPayment {
  id: string;
  bill_id: string | null;
  expense_id: string | null;
  amount: number | string | null;
  period_from: string;
  period_to: string;
  usage: number | string | null;
  adjustment: boolean;
  due_on?: string | null; // data limite de pagamento (faturas lidas de um PDF ou foto)
  source?: 'manual' | 'pdf' | 'foto';
  created_at: string;
}

const U = 100_000;
const toU = (v: number | string | null) => (v === null || v === '' ? 0 : Math.round(Number(v) * U));

/** Cada tipo de conta: nome, palavras que a denunciam numa despesa, unidade do consumo e se se paga adiantado. */
export const KINDS: Record<BillKind, { label: string; words: string[]; unit: Unit | null; ahead: boolean }> = {
  luz: { label: 'Luz', words: ['luz', 'eletricidade', 'electricidade', 'edp', 'e-redes', 'endesa', 'iberdrola', 'goldenergy', 'luzboa', 'coopernico', 'plenitude'], unit: 'kWh', ahead: false },
  gas: { label: 'Gás', words: ['gas', 'gas natural', 'floene', 'lisboagas', 'botija'], unit: 'kWh', ahead: false },
  agua: { label: 'Água', words: ['agua', 'epal', 'smas', 'indaqua', 'aguas de'], unit: 'm3', ahead: false },
  internet: { label: 'Internet e TV', words: ['internet', 'fibra', 'meo', 'nos', 'vodafone', 'digi', 'nowo'], unit: null, ahead: true },
  telemovel: { label: 'Telemóvel', words: ['telemovel', 'tarifario', 'uzo', 'woo', 'moche', 'meo', 'nos', 'vodafone', 'digi'], unit: null, ahead: true },
  renda: { label: 'Renda', words: ['renda', 'senhorio', 'arrendamento'], unit: null, ahead: true },
  credito: { label: 'Prestação da casa', words: ['prestacao', 'credito habitacao', 'emprestimo', 'hipoteca'], unit: null, ahead: true },
  condominio: { label: 'Condomínio', words: ['condominio'], unit: null, ahead: true },
  seguro: { label: 'Seguro da casa', words: ['seguro casa', 'seguro da casa', 'multirriscos', 'multiriscos'], unit: null, ahead: true },
  outra: { label: 'Outra', words: [], unit: null, ahead: true },
};

/** As categorias de despesa onde moram as contas fixas. */
export const BILL_CATEGORIES = ['Contas', 'Casa'];

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const has = (hay: string, w: string) => {
  const n = norm(w);
  if (!n) return false;
  const i = hay.indexOf(n);
  if (i < 0) return false;
  const ok = (c: string | undefined) => c === undefined || !/[a-z0-9]/.test(c);
  return ok(hay[i - 1]) && ok(hay[i + n.length]);
};

/** As palavras de uma conta: as que a casa escreveu, o fornecedor e o nome. */
export const billWords = (b: Bill) => [...(b.keywords ?? '').split(/[,;]/), b.provider ?? '', b.name].map((w) => w.trim()).filter((w) => w.length >= 2);

/** Quanto se paga normalmente por fatura: o valor da conta, ou a mediana das últimas 6 faturas (sem acertos). */
export function typical(b: Bill, payments: BillPayment[]): number | null {
  const last = payments.filter((p) => p.bill_id === b.id && !p.adjustment && p.amount !== null).sort((x, y) => y.period_to.localeCompare(x.period_to)).slice(0, 6).map((p) => toU(p.amount)).sort((x, y) => x - y);
  if (last.length) return last.length % 2 ? last[(last.length - 1) / 2] : Math.round((last[last.length / 2 - 1] + last[last.length / 2]) / 2);
  return b.expected !== null && Number(b.expected) > 0 ? toU(b.expected) : null;
}

export interface MatchIn { note: string | null; amount: number; spent_on: string; category: string }

/**
 * De que conta fixa é esta despesa?
 * - Palavras: uma da conta (fornecedor, nome, palavras da casa) vale 3; uma do tipo (ex.: «eletricidade»), 2.
 * - Valor: perto do normal (±35%, os valores variam) +1; longe (mais de 1,6× ou menos de 0,6×) −1. Dia de pagamento
 *   perto (±5 dias) +0,5.
 * Só uma conta com palavras na nota: é essa (mesmo com o valor longe, que pode ser um acerto). Várias com palavras
 * (duas da MEO, duas luzes da EDP): é a de mais pontos se ficar 1,5 acima da seguinte; senão, pergunta. Sem palavras,
 * nunca é certa: pergunta pelas de valor parecido.
 */
export function matchBill<B extends Bill>(e: MatchIn, bills: B[], payments: BillPayment[]): { sure: B | null; ask: B[] } {
  if (!BILL_CATEGORIES.includes(e.category)) return { sure: null, ask: [] };
  const hay = norm(e.note ?? '');
  const scored = bills.filter((b) => !b.archived).map((b) => {
    const words = hay && billWords(b).some((w) => has(hay, w)) ? 3 : hay && KINDS[b.kind].words.some((w) => has(hay, w)) ? 2 : 0;
    let score = words;
    const t = typical(b, payments);
    if (t && e.amount > 0) {
      const r = e.amount / t;
      if (r >= 0.65 && r <= 1.35) score += 1;
      else if (r > 1.6 || r < 0.6) score -= 1;
    }
    if (b.due_day) {
      const d = parseDate(e.spent_on).getDate();
      if (Math.abs(d - b.due_day) <= 5 || Math.abs(d - b.due_day) >= 26) score += 0.5;
    }
    return { bill: b, words, score };
  }).sort((a, b) => b.score - a.score);
  const worded = scored.filter((m) => m.words > 0);
  if (worded.length === 1) return { sure: worded[0].bill, ask: [] };
  if (worded.length > 1) {
    const [top, second] = worded;
    return top.score - second.score >= 1.5 ? { sure: top.bill, ask: [] } : { sure: null, ask: worded.filter((m) => top.score - m.score < 1.5).slice(0, 3).map((m) => m.bill) };
  }
  return { sure: null, ask: scored.filter((m) => m.score >= 1).slice(0, 3).map((m) => m.bill) };
}

/** Uma fatura muito acima do normal (mais de 1,6×) parece um acerto: pergunta-se o período. */
export const looksLikeAdjustment = (amount: number, normal: number | null) => normal !== null && normal > 0 && amount > normal * 1.6;

const lastDay = (key: string) => `${key}-${String(daysInMonth(key)).padStart(2, '0')}`;

/**
 * O período que uma fatura cobre, por defeito. Luz, gás e água pagam-se depois: os meses anteriores ao do pagamento.
 * Renda, prestação, internet, condomínio e seguro pagam-se adiantados: a partir do mês do pagamento.
 */
export function defaultPeriod(kind: BillKind, every: number, paidOn: string): { from: string; to: string } {
  let first = monthKey(paidOn);
  if (!KINDS[kind].ahead) for (let j = 0; j < every; j++) first = prevMonth(first);
  let last = first;
  for (let j = 1; j < every; j++) last = nextMonth(last);
  return { from: `${first}-01`, to: lastDay(last) };
}

const days = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000) + 1;

/** Reparte o valor e o consumo de cada fatura pelos meses que cobre, à proporção dos dias. */
export function spread(payments: BillPayment[]): Map<string, { amount: number; usage: number; hasUsage: boolean; metered: number }> {
  // metered: só o valor das faturas com consumo (o preço por unidade não conta acertos sem consumo).
  const out = new Map<string, { amount: number; usage: number; hasUsage: boolean; metered: number }>();
  for (const p of payments) {
    if (p.amount === null) continue;
    const total = days(p.period_from, p.period_to), a = toU(p.amount), u = p.usage === null || p.usage === '' ? null : Number(p.usage);
    for (let k = monthKey(p.period_from); k <= monthKey(p.period_to); k = nextMonth(k)) {
      const from = [`${k}-01`, p.period_from].sort()[1], to = [lastDay(k), p.period_to].sort()[0];
      const share = days(from, to) / total;
      const cur = out.get(k) ?? { amount: 0, usage: 0, hasUsage: false, metered: 0 };
      cur.amount += a * share;
      if (u !== null) { cur.usage += u * share; cur.metered += a * share; cur.hasUsage = true; }
      out.set(k, cur);
    }
  }
  return out;
}

/** Os 12 meses completos antes do mês corrente (o mês a decorrer fica de fora, como nas outras médias). */
export function lastMonths(today: string, n = 12, back = 0): string[] {
  let k = prevMonth(monthKey(today));
  for (let j = 0; j < back; j++) k = prevMonth(k);
  const out: string[] = [];
  for (let j = 0; j < n; j++) { out.unshift(k); k = prevMonth(k); }
  return out;
}

export interface BillStats {
  perMonth: number | null; // € por mês, média dos meses com faturas nos últimos 12
  usageMonth: number | null; // consumo por mês
  unitPrice: number | null; // € por kWh ou m³, nos últimos 12 meses
  priceChange: number | null; // variação do preço por unidade face aos 12 meses anteriores
  yoy: number | null; // variação do € por mês face aos mesmos meses do ano anterior
  months: number; // meses com faturas, nos últimos 12
  series: { month: string; amount: number | null }[];
  typical: number | null;
  lastPaid: string | null;
}

export function billStats(b: Bill, all: BillPayment[], today: string): BillStats {
  const ps = all.filter((p) => p.bill_id === b.id && p.amount !== null);
  const map = spread(ps);
  const win = lastMonths(today), prev = lastMonths(today, 12, 12);
  const avg = (ks: string[]) => {
    const got = ks.filter((k) => map.has(k));
    return got.length ? { v: got.reduce((t, k) => t + map.get(k)!.amount, 0) / got.length, n: got.length } : null;
  };
  const cur = avg(win);
  const usage = win.filter((k) => map.get(k)?.hasUsage);
  const price = (ks: string[]) => {
    const got = ks.filter((k) => map.get(k)?.hasUsage), u = got.reduce((t, k) => t + map.get(k)!.usage, 0);
    return u > 0 ? got.reduce((t, k) => t + map.get(k)!.metered, 0) / u : null;
  };
  const p1 = b.unit ? price(win) : null, p0 = b.unit ? price(prev) : null;
  // Só se compara com o ano anterior com meses suficientes dos dois lados (3 ou mais), e nos mesmos meses.
  const pairs = win.map((k, j) => [k, prev[j]]).filter(([a, z]) => map.has(a) && map.has(z));
  const before = pairs.reduce((t, [, z]) => t + map.get(z)!.amount, 0);
  const yoy = pairs.length >= 3 && before > 0 ? pairs.reduce((t, [a]) => t + map.get(a)!.amount, 0) / before - 1 : null;
  const lastPaid = ps.reduce<string | null>((m, p) => (m === null || p.created_at.slice(0, 10) > m ? p.created_at.slice(0, 10) : m), null);
  return {
    perMonth: cur ? Math.round(cur.v) : null,
    usageMonth: usage.length ? usage.reduce((t, k) => t + map.get(k)!.usage, 0) / usage.length : null,
    unitPrice: p1,
    priceChange: p1 !== null && p0 !== null && p0 > 0 ? p1 / p0 - 1 : null,
    yoy,
    months: cur?.n ?? 0,
    series: win.map((k) => ({ month: k, amount: map.has(k) ? Math.round(map.get(k)!.amount) : null })),
    typical: typical(b, all),
    lastPaid,
  };
}

/** O próximo pagamento: no dia de pagamento, a cada «every» meses desde o último (ou já este mês, se ainda vier). */
export function nextDue(b: Bill, lastPaid: string | null, today: string): string | null {
  if (!b.due_day) return null;
  const at = (key: string) => `${key}-${String(Math.min(b.due_day!, daysInMonth(key))).padStart(2, '0')}`;
  let k = monthKey(today);
  if (lastPaid && b.every_months > 1) {
    k = monthKey(lastPaid);
    for (let j = 0; j < b.every_months; j++) k = nextMonth(k);
    while (at(k) < today) for (let j = 0; j < b.every_months; j++) k = nextMonth(k);
    return at(k);
  }
  if (lastPaid && monthKey(lastPaid) === k) k = nextMonth(k);
  return at(k) >= today ? at(k) : at(nextMonth(k));
}

/**
 * Prestações do IMI de um ano: até 100 € numa só (maio); até 500 € em duas (maio e novembro); acima, em três (maio,
 * agosto e novembro). Cada uma até ao fim do mês.
 */
export function imiPlan(amount: number, year: number): { due_on: string; amount: number }[] {
  const months = amount <= 100 * U ? ['05'] : amount <= 500 * U ? ['05', '11'] : ['05', '08', '11'];
  const part = Math.floor(amount / months.length / 1000) * 1000; // ao cêntimo
  return months.map((m, j) => ({ due_on: lastDay(`${year}-${m}`), amount: j === 0 ? amount - part * (months.length - 1) : part }));
}

/** Os próximos prazos do IMI, um por prestação: a deste ano se ainda vier, senão a do ano seguinte (repetem-se todos os anos). */
export function imiNext(amount: number, today: string) {
  const y = Number(today.slice(0, 4));
  return imiPlan(amount, y).map((p, j) => (p.due_on >= today ? p : imiPlan(amount, y + 1)[j])).sort((a, b) => a.due_on.localeCompare(b.due_on));
}

/** Formato de um consumo: 248 kWh, 7,5 m³. */
export const usageLabel = (v: number, unit: Unit) => `${v >= 100 ? Math.round(v) : (Math.round(v * 10) / 10).toString().replace('.', ',')} ${unit === 'm3' ? 'm³' : 'kWh'}`;

/** Uma fatura lida (PDF ou foto) ainda por pagar: sem despesa, a pagar, não é um acerto a favor. */
export const isUnpaid = (p: BillPayment) => (p.source === 'pdf' || p.source === 'foto') && !p.expense_id && p.bill_id !== null && Number(p.amount) > 0;

/** A fatura por pagar de uma conta (a mais recente), se houver. */
export function unpaidInvoice(billId: string, payments: BillPayment[]): BillPayment | null {
  return payments.filter((p) => p.bill_id === billId && isUnpaid(p)).sort((a, b) => b.period_to.localeCompare(a.period_to))[0] ?? null;
}

/**
 * A despesa de um pagamento chega depois da fatura (débito direto): liga-se à fatura lida da mesma conta com o mesmo
 * valor (ao cêntimo), lida até 120 dias antes, em vez de criar outra fatura.
 */
export function invoiceToLink(billId: string, amount: number, spent_on: string, payments: BillPayment[]): BillPayment | null {
  const from = addDays(spent_on, -120);
  return payments.filter((p) => p.bill_id === billId && isUnpaid(p) && Math.abs(toU(p.amount) - amount) <= 1000 && p.created_at.slice(0, 10) >= from)
    .sort((a, b) => a.period_to.localeCompare(b.period_to))[0] ?? null;
}

/**
 * Custo de uma conta num ano: a soma dos 12 meses completos (faturas repartidas pelos meses); com menos meses, a média
 * por mês × 12; sem faturas, o valor normal × as vezes por ano. Os dois últimos casos ficam marcados como estimados.
 */
export function annualOf(b: Bill, payments: BillPayment[], today: string): { year: number; prev: number | null; estimated: boolean } {
  const map = spread(payments.filter((p) => p.bill_id === b.id && p.amount !== null));
  const sum = (ks: string[]) => (ks.every((k) => map.has(k)) ? Math.round(ks.reduce((t, k) => t + map.get(k)!.amount, 0)) : null);
  const win = lastMonths(today), prev = sum(lastMonths(today, 12, 12)), full = sum(win);
  if (full !== null) return { year: full, prev, estimated: false };
  const got = win.filter((k) => map.has(k));
  if (got.length) return { year: Math.round((got.reduce((t, k) => t + map.get(k)!.amount, 0) / got.length) * 12), prev, estimated: true };
  const t = typical(b, payments);
  return { year: t ? Math.round((t * 12) / b.every_months) : 0, prev, estimated: true };
}

/** A parte de uma pessoa numa conta: dos dois → a parte combinada; só dela → tudo; do outro → nada. */
export const partOfBill = (owner: string | null, me: string, myShare: number) => (owner === null ? myShare : owner === me ? 1 : 0);
