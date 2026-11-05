// Salvados: carros comprados a meias com um mecânico, reparados e vendidos. Valores em unidades de money.ts.
// Regras: as horas do mecânico custam `hour_rate` (40 €/h) ao carro, para a rentabilidade ser a verdadeira; o lucro
// divide-se a meias; no acerto, cada hora soma metade do valor/hora (20 €) ao que o dono deve ao mecânico (a outra
// metade é a parte que o mecânico mete em trabalho). Cada um recupera o dinheiro que meteu.
import { toU } from './money';

export type Who = 'me' | 'partner';
export type SalvageStatus = 'repair' | 'selling' | 'sold';
export interface SalvageLog { id: string; kind: 'part' | 'hours'; on_date: string; amount: number | string | null; hours: number | string | null; note: string | null; paid_by: Who; by_link?: boolean }
export interface SalvageCar {
  id: string; name: string; bought_on: string; price: number | string; price_paid_by: Who; hour_rate: number | string;
  status: SalvageStatus; sold_on: string | null; sold_for: number | string | null; sale_to: Who; logs: SalvageLog[];
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / DAY));

export function carNumbers(c: SalvageCar, today: string) {
  const price = toU(c.price), rate = toU(c.hour_rate);
  const parts = c.logs.filter((l) => l.kind === 'part');
  const partsMe = parts.filter((l) => l.paid_by === 'me').reduce((t, l) => t + toU(l.amount ?? 0), 0);
  const partsPartner = parts.filter((l) => l.paid_by === 'partner').reduce((t, l) => t + toU(l.amount ?? 0), 0);
  const hours = c.logs.filter((l) => l.kind === 'hours').reduce((t, l) => t + Number(l.hours ?? 0), 0);
  const labor = Math.round(hours * rate);
  const moneyMe = (c.price_paid_by === 'me' ? price : 0) + partsMe;
  const moneyPartner = (c.price_paid_by === 'partner' ? price : 0) + partsPartner;
  const cost = price + partsMe + partsPartner + labor;
  const sold = c.status === 'sold' && c.sold_for !== null && c.sold_on !== null;
  const sale = sold ? toU(c.sold_for!) : null;
  const profit = sale === null ? null : sale - cost;
  const roi = profit === null || cost <= 0 ? null : profit / cost;
  const span = days(c.bought_on, sold ? c.sold_on! : today);
  const annual = roi === null ? null : Math.pow(1 + roi, 365 / span) - 1;
  // Acerto (com a venda): o mecânico fica com o dinheiro que meteu, as horas a valor inteiro (a sua metade em trabalho
  // e a metade que o dono lhe paga) e metade do lucro; o dono fica com o dinheiro que meteu e metade do lucro.
  const halfLabor = Math.round(labor / 2);
  const partnerGets = profit === null ? null : moneyPartner + labor + Math.round(profit / 2);
  const meGets = profit === null || sale === null ? null : sale - partnerGets!;
  // Quem recebeu o dinheiro da venda paga ao outro a parte dele.
  const settle = partnerGets === null || meGets === null ? null : c.sale_to === 'me' ? { from: 'me' as Who, to: 'partner' as Who, amount: partnerGets } : { from: 'partner' as Who, to: 'me' as Who, amount: meGets };
  // Antes da venda: o que o dono já meteu (conta no Património como investimento) e o que deve das horas.
  return { price, partsMe, partsPartner, hours, labor, halfLabor, moneyMe, moneyPartner, cost, sale, profit, roi, annual, days: span, partnerGets, meGets, settle };
}

export function totals(cars: SalvageCar[], today: string) {
  const n = cars.map((c) => ({ c, x: carNumbers(c, today) }));
  const sold = n.filter((v) => v.x.profit !== null);
  const profit = sold.reduce((t, v) => t + v.x.profit!, 0);
  const cost = sold.reduce((t, v) => t + v.x.cost, 0);
  const roi = cost > 0 ? profit / cost : null;
  // Anualizado do conjunto: pelo tempo médio ponderado pelo custo.
  const w = sold.reduce((t, v) => t + v.x.cost * v.x.days, 0);
  const avgDays = cost > 0 ? w / cost : 0;
  const annual = roi === null || !avgDays ? null : Math.pow(1 + roi, 365 / avgDays) - 1;
  const open = n.filter((v) => v.x.profit === null);
  const invested = open.reduce((t, v) => t + v.x.moneyMe, 0); // o meu dinheiro ainda dentro dos carros por vender
  const myProfit = sold.reduce((t, v) => t + Math.round(v.x.profit! / 2), 0);
  return { profit, myProfit, roi, annual, avgDays: Math.round(avgDays), invested, sold: sold.length, open: open.length };
}
