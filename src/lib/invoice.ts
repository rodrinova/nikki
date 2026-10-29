// Ler uma fatura (luz, gás, água, internet…) a partir do texto de um PDF ou de uma fotografia: fornecedor, total,
// período, consumo, data limite de pagamento e se é um acerto. Puro: o texto chega de lib/ocr.ts.
// Regras em docs/CALCULOS.md (secção 6c) do repositório thenikki. Valores em unidades de money.ts.

import { norm, type BillKind, type Unit } from './home';

export interface InvoiceRead {
  provider: string | null;
  kind: BillKind | null;
  total: number | null; // unidades; negativo se a fatura é a favor do cliente
  from: string | null; // período (YYYY-MM-DD)
  to: string | null;
  usage: number | null;
  unit: Unit | null;
  dueOn: string | null; // data limite de pagamento
  issuedOn: string | null;
  adjustment: boolean; // acerto (leituras reais depois de estimadas)
  estimated: boolean; // leitura estimada
  found: number; // quantos campos se leram (para dizer o quão segura está a leitura)
}

const U = 100_000;

/** Fornecedores conhecidos (o nome que fica) e o tipo de conta que costumam ser. */
const PROVIDERS: [RegExp, string, BillKind][] = [
  [/\bedp\b/, 'EDP', 'luz'], [/\be-?redes\b/, 'EDP', 'luz'], [/\bendesa\b/, 'Endesa', 'luz'], [/\biberdrola\b/, 'Iberdrola', 'luz'],
  [/\bgoldenergy\b/, 'Goldenergy', 'luz'], [/\bluzboa\b/, 'Luzboa', 'luz'], [/\bcoopernico\b/, 'Coopérnico', 'luz'], [/\bplenitude\b/, 'Plenitude', 'luz'],
  [/\brepsol\b/, 'Repsol', 'luz'], [/\bgalp\b/, 'Galp', 'luz'], [/\bsu eletricidade\b/, 'SU Eletricidade', 'luz'],
  [/\bfloene\b/, 'Floene', 'gas'], [/\blisboagas\b/, 'Lisboagás', 'gas'],
  [/\bepal\b/, 'EPAL', 'agua'], [/\bsmas\b/, 'SMAS', 'agua'], [/\bindaqua\b/, 'Indaqua', 'agua'], [/\baguas do porto\b/, 'Águas do Porto', 'agua'],
  [/\baguas de [a-z]+/, 'Águas', 'agua'], [/\bbe water\b/, 'Be Water', 'agua'],
  [/\bmeo\b/, 'MEO', 'internet'], [/\bnos comunicacoes\b|\bnos\b(?= ?[,.]? (?:sgps|comunicacoes|fatura))/, 'NOS', 'internet'], [/\bvodafone\b/, 'Vodafone', 'internet'],
  [/\bdigi\b/, 'DIGI', 'internet'], [/\bnowo\b/, 'NOWO', 'internet'],
];

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100 ? `${y}-${pad(m)}-${pad(d)}` : null);

/** Uma data escrita como 05/10/2026, 05-10-2026, 05.10.2026, 2026-10-05 ou 5 out 2026 / 5 de outubro de 2026. */
const DATE = String.raw`(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}(?:\s+de)?\s+[a-z]{3}[a-z]*\.?(?:\s+de)?\s+\d{4})`;
export function parseDateText(s: string): string | null {
  const t = norm(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})(?:\s+de)?\s+([a-z]{3})[a-z]*\.?(?:\s+de)?\s+(\d{4})$/);
  if (m && MONTHS.includes(m[2])) return iso(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  return null;
}

/** Um valor escrito à portuguesa (1.234,56) ou com ponto decimal (1234.56), em unidades. */
export function parseMoneyText(s: string): number | null {
  let t = s.replace(/[€\s]/g, '').replace(/eur$/i, '');
  if (!/\d/.test(t)) return null;
  const neg = /^-|-$/.test(t);
  t = t.replace(/^-|-$/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  else t = t.replace(/,/g, '');
  const v = Number(t);
  return Number.isFinite(v) ? Math.round(v * U) * (neg ? -1 : 1) : null;
}

const AMOUNT = String.raw`(-?\s?€?\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|-?\s?€?\s?\d+(?:[.,]\d{2}))\s?(?:€|eur)?`;
const near = (label: string) => new RegExp(`(?:${label})[^\\n\\d-]{0,40}${AMOUNT}`, 'i');

/** Lê os campos de uma fatura a partir do texto (de um PDF ou de uma fotografia). */
export function readInvoice(text: string): InvoiceRead {
  const raw = text.replace(/\r/g, '');
  const t = norm(raw).replace(/[ \t]+/g, ' ');
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);

  // Fornecedor: o primeiro conhecido que aparece.
  let provider: string | null = null, kind: BillKind | null = null, at = Infinity;
  for (const [re, name, k] of PROVIDERS) {
    const m = t.match(re);
    if (m && m.index! < at) { at = m.index!; provider = name; kind = k; }
  }

  // Total: o valor ao pé de «total a pagar» (e afins); a favor do cliente fica negativo.
  let total: number | null = null;
  for (const label of ['total a pagar', 'valor a pagar', 'montante a pagar', 'a pagar', 'total da fatura', 'total fatura', 'valor total', 'total a receber', 'a seu favor', 'valor a devolver']) {
    const m = t.match(near(label));
    if (m) {
      total = parseMoneyText(m[1]);
      if (total !== null && /receber|favor|devolver/.test(label) && total > 0) total = -total;
      if (total !== null) break;
    }
  }
  if (total === null) {
    const all = [...t.matchAll(new RegExp(AMOUNT, 'gi'))].filter((m) => /€|eur/.test(m[0])).map((m) => parseMoneyText(m[1])).filter((v): v is number => v !== null);
    if (all.length) total = Math.max(...all);
  }
  if (total !== null && total > 0 && /(?:a seu favor|valor a devolver|credito a seu favor)/.test(t) && !/a pagar[^\n\d]{0,40}\d/.test(t)) total = -total;

  // Período: «período de faturação 01/09/2026 a 30/09/2026» (ou «de … a …», «… - …»).
  let from: string | null = null, to: string | null = null;
  const pm = t.match(new RegExp(String.raw`(?:periodo(?: de faturacao| de consumo| faturado)?|consumos? de|faturacao de)\s*:?\s*(?:de\s+)?${DATE}\s*(?:a|ate|-|–|\/)\s*${DATE}`))
    ?? t.match(new RegExp(String.raw`${DATE}\s+(?:a|ate)\s+${DATE}`));
  if (pm) { from = parseDateText(pm[1]); to = parseDateText(pm[2]); if (from && to && to < from) [from, to] = [to, from]; }

  // Consumo: kWh (luz, gás) ou m³ (água), na linha do consumo; com várias (bi-horário), a do total ou a maior.
  let usage: number | null = null, unit: Unit | null = null;
  const pick = (re: RegExp, u: Unit) => {
    const cands = lines.map((l) => ({ l, m: [...l.matchAll(re)] })).filter((x) => x.m.length && /consumo|total|energia|agua|gas/.test(x.l));
    if (!cands.length) return false;
    const tot = cands.find((x) => /total/.test(x.l)) ?? null;
    const vals = (tot ? [tot] : cands).flatMap((x) => x.m.map((m) => Number(m[1].replace(/[.\s](?=\d{3}\b)/g, '').replace(',', '.'))));
    const v = Math.max(...vals.filter((n) => Number.isFinite(n) && n > 0));
    if (!Number.isFinite(v)) return false;
    usage = v; unit = u;
    return true;
  };
  if (kind === 'agua' || (/m3|m³/.test(t) && !/kwh/.test(t))) pick(/(\d+(?:[.,]\d+)?)\s?(?:m3|m³)\b/g, 'm3');
  if (usage === null) pick(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s?kwh\b/g, 'kWh');
  if (usage === null) pick(/(\d+(?:[.,]\d+)?)\s?(?:m3|m³)\b/g, 'm3');
  if (!kind && unit) kind = unit === 'm3' ? 'agua' : 'luz';
  if (kind === 'luz' && /gas natural/.test(t) && !/eletricidade/.test(t)) kind = 'gas';

  // Data limite e data de emissão.
  const dm = t.match(new RegExp(String.raw`(?:data limite(?: de pagamento)?|pagar ate|pagamento ate|data de vencimento|vencimento|debito (?:direto )?(?:em|a partir de))\s*:?\s*${DATE}`));
  const im = t.match(new RegExp(String.raw`(?:data de emissao|emitida em|data da fatura|data)\s*:?\s*${DATE}`));

  const adjustment = /\bacerto\b|regulariza/.test(t);
  const estimated = /estimad/.test(t) && !/leitura real/.test(t);
  const out: InvoiceRead = { provider, kind, total, from, to, usage, unit, dueOn: dm ? parseDateText(dm[1]) : null, issuedOn: im ? parseDateText(im[1]) : null, adjustment, estimated, found: 0 };
  out.found = [out.provider, out.total, out.from, out.usage, out.dueOn].filter((v) => v !== null).length;
  return out;
}
