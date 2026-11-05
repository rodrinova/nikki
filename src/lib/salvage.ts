// Salvados: carros comprados a meias com um mecânico, reparados e vendidos. Valores em unidades de money.ts.
// Regras (tudo a meias):
// - a compra divide-se pelos dois (price_me = quanto pagou o dono; por omissão, metade);
// - as peças compra-as normalmente o mecânico; o dono deve-lhe metade de cada uma e vai transferindo;
// - as horas custam `hour_rate` (40 €/h) ao carro, para a rentabilidade ser a verdadeira: metade é o trabalho que o
//   mecânico mete, a outra metade (20 €/h) entra na conta corrente como o que o dono lhe deve;
// - na venda, quem recebe o dinheiro deve metade ao outro.
// A conta corrente (o que o dono deve ao mecânico, + deve, − a haver) soma tudo isto; no fim, cada um fica com metade
// do lucro.
import { toU } from './money';

export type Who = 'me' | 'partner';
export type SalvageStatus = 'repair' | 'selling' | 'sold';
export interface SalvageLog { id: string; kind: 'part' | 'hours' | 'transfer'; on_date: string; amount: number | string | null; hours: number | string | null; note: string | null; paid_by: Who; by_link?: boolean; removed_at?: string | null }
export type RegWho = Who | 'half';
export interface SalvageCar {
  id: string; name: string; brand?: string | null; plate?: string | null; bought_on: string; price: number | string; price_me?: number | string | null; price_paid_by: Who; hour_rate: number | string;
  status: SalvageStatus; sold_on: string | null; sold_for: number | string | null; sale_to: Who; logs: SalvageLog[];
  reg_cost?: number | string | null; reg_paid_by?: RegWho;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / DAY));

export function carNumbers(c: SalvageCar, today: string) {
  const price = toU(c.price), rate = toU(c.hour_rate);
  const priceMe = c.price_me === null || c.price_me === undefined ? Math.round(price / 2) : toU(c.price_me);
  const sum = (k: SalvageLog['kind'], who?: Who) => c.logs.filter((l) => l.kind === k && (!who || l.paid_by === who)).reduce((t, l) => t + toU(l.amount ?? 0), 0);
  const partsMe = sum('part', 'me'), partsPartner = sum('part', 'partner');
  const sentMe = sum('transfer', 'me'), sentPartner = sum('transfer', 'partner');
  const hrs = (who: Who) => c.logs.filter((l) => l.kind === 'hours' && l.paid_by === who).reduce((t, l) => t + Number(l.hours ?? 0), 0);
  // As horas são de quem trabalhou (paid_by): do mecânico, na vista do dono; do próprio, na vista do mecânico.
  const hoursPartner = hrs('partner'), hoursMe = hrs('me'), hours = hoursPartner + hoursMe;
  const labor = Math.round(hours * rate), halfLabor = Math.round(labor / 2);
  // O registo do carro (na compra): a meias por omissão, ou todo de um.
  const reg = toU(c.reg_cost ?? 0), regWho = c.reg_paid_by ?? 'half';
  const regMe = regWho === 'half' ? Math.round(reg / 2) : regWho === 'me' ? reg : 0;
  const cost = price + reg + partsMe + partsPartner + labor;
  const sold = c.status === 'sold' && c.sold_for !== null && c.sold_on !== null;
  const sale = sold ? toU(c.sold_for!) : null;
  const profit = sale === null ? null : sale - cost;
  const roi = profit === null || cost <= 0 ? null : profit / cost;
  const span = days(c.bought_on, sold ? c.sold_on! : today);
  const annual = roi === null ? null : Math.pow(1 + roi, 365 / span) - 1;
  // A conta corrente deste carro: o que o dono deve ao mecânico (+) ou tem a haver (−), por partes.
  const fromPrice = Math.round(price / 2) - priceMe;
  const fromParts = Math.round((partsPartner - partsMe) / 2);
  const fromTransfers = sentPartner - sentMe;
  const fromHours = Math.round((hoursPartner - hoursMe) * rate / 2);
  const fromReg = Math.round(reg / 2) - regMe;
  const fromSale = sale === null ? 0 : (c.sale_to === 'me' ? 1 : -1) * Math.round(sale / 2);
  const owe = fromPrice + fromReg + fromParts + fromTransfers + fromHours + fromSale;
  // O dinheiro do dono dentro do carro (para o Património, antes da venda): a sua metade dos custos em dinheiro.
  const moneyMe = priceMe + regMe + partsMe + sentMe - sentPartner;
  return { price, priceMe, reg, regMe, partsMe, partsPartner, sentMe, sentPartner, hours, labor, halfLabor, cost, sale, profit, roi, annual, days: span, owe, parts: { fromPrice, fromReg, fromParts, fromTransfers, fromHours, fromSale }, moneyMe };
}

export function totals(cars: SalvageCar[], today: string) {
  const n = cars.map((c) => ({ c, x: carNumbers(c, today) }));
  const sold = n.filter((v) => v.x.profit !== null);
  const profit = sold.reduce((t, v) => t + v.x.profit!, 0);
  const cost = sold.reduce((t, v) => t + v.x.cost, 0);
  const roi = cost > 0 ? profit / cost : null;
  const w = sold.reduce((t, v) => t + v.x.cost * v.x.days, 0);
  const avgDays = cost > 0 ? w / cost : 0;
  const annual = roi === null || !avgDays ? null : Math.pow(1 + roi, 365 / avgDays) - 1;
  const open = n.filter((v) => v.x.profit === null);
  const invested = open.reduce((t, v) => t + v.x.moneyMe, 0);
  const myProfit = sold.reduce((t, v) => t + Math.round(v.x.profit! / 2), 0);
  const owe = n.reduce((t, v) => t + v.x.owe, 0); // a conta corrente de todos os carros
  return { profit, myProfit, roi, annual, avgDays: Math.round(avgDays), invested, sold: sold.length, open: open.length, owe };
}

const other = (w: Who): Who => (w === 'me' ? 'partner' : 'me');
/**
 * O mesmo carro visto pelo sócio: os dados guardam-se do lado do dono («me» = o dono); na página do mecânico
 * troca-se quem pagou, quem recebeu e quanto pagou cada um da compra, e as contas saem certas para ele.
 */
export function flipCar(c: SalvageCar): SalvageCar {
  return {
    ...c,
    price_me: c.price_me === null || c.price_me === undefined ? c.price_me : String(Math.round((Number(c.price) - Number(c.price_me)) * 100) / 100),
    price_paid_by: other(c.price_paid_by), sale_to: other(c.sale_to),
    reg_paid_by: !c.reg_paid_by || c.reg_paid_by === 'half' ? c.reg_paid_by : other(c.reg_paid_by),
    logs: c.logs.map((l) => ({ ...l, paid_by: other(l.paid_by) })),
  };
}
/** Troca o lado de um pedaço de carro ou de registo (o que se grava a partir da página do sócio). */
export function flipPatch<T extends Record<string, unknown>>(p: T, price?: number | string): T {
  const o: Record<string, unknown> = { ...p };
  for (const k of ['paid_by', 'price_paid_by', 'sale_to'] as const) if (o[k] === 'me' || o[k] === 'partner') o[k] = other(o[k] as Who);
  if (o.reg_paid_by === 'me' || o.reg_paid_by === 'partner') o.reg_paid_by = other(o.reg_paid_by as Who);
  if ('price_me' in o && o.price_me !== null && o.price_me !== undefined) {
    const total = Number(o.price ?? price ?? 0);
    o.price_me = String(Math.round((total - Number(o.price_me)) * 100) / 100);
  }
  return o as T;
}
