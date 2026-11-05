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
export interface SalvageLog { id: string; kind: 'part' | 'hours' | 'transfer'; on_date: string; amount: number | string | null; hours: number | string | null; note: string | null; paid_by: Who; by_link?: boolean }
export interface SalvageCar {
  id: string; name: string; bought_on: string; price: number | string; price_me?: number | string | null; price_paid_by: Who; hour_rate: number | string;
  status: SalvageStatus; sold_on: string | null; sold_for: number | string | null; sale_to: Who; logs: SalvageLog[];
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / DAY));

export function carNumbers(c: SalvageCar, today: string) {
  const price = toU(c.price), rate = toU(c.hour_rate);
  const priceMe = c.price_me === null || c.price_me === undefined ? Math.round(price / 2) : toU(c.price_me);
  const sum = (k: SalvageLog['kind'], who?: Who) => c.logs.filter((l) => l.kind === k && (!who || l.paid_by === who)).reduce((t, l) => t + toU(l.amount ?? 0), 0);
  const partsMe = sum('part', 'me'), partsPartner = sum('part', 'partner');
  const sentMe = sum('transfer', 'me'), sentPartner = sum('transfer', 'partner');
  const hours = c.logs.filter((l) => l.kind === 'hours').reduce((t, l) => t + Number(l.hours ?? 0), 0);
  const labor = Math.round(hours * rate), halfLabor = Math.round(labor / 2);
  const cost = price + partsMe + partsPartner + labor;
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
  const fromHours = halfLabor;
  const fromSale = sale === null ? 0 : (c.sale_to === 'me' ? 1 : -1) * Math.round(sale / 2);
  const owe = fromPrice + fromParts + fromTransfers + fromHours + fromSale;
  // O dinheiro do dono dentro do carro (para o Património, antes da venda): a sua metade dos custos em dinheiro.
  const moneyMe = priceMe + partsMe + sentMe - sentPartner;
  return { price, priceMe, partsMe, partsPartner, sentMe, sentPartner, hours, labor, halfLabor, cost, sale, profit, roi, annual, days: span, owe, parts: { fromPrice, fromParts, fromTransfers, fromHours, fromSale }, moneyMe };
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
