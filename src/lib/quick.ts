// Despesa num gesto: «45 pingo doce», «12,50 almoço ontem», «Galp 60», ou tudo de uma vez: «ontem 62,40 jantar
// restaurante partilhada pagou a Inês». O valor, o dia, a nota e o que se escrever da divisão, de quem pagou, da
// categoria, do carro e do evento saem do texto; o que não se escreve adivinha-se pelo que a pessoa fez antes com o
// mesmo sítio (ou, na primeira vez, por palavras conhecidas). Puro.

import { addDays, parseDate, toDateStr } from './dates';
import { norm } from './home';

export type Split = 'mine' | 'shared' | 'other';
/**
 * O que se percebeu do texto. Valor, nota e dia sempre; o resto só quando foi escrito: divisão («partilhada»,
 * «minha», «para a Inês»), quem pagou («pagou a Inês»), a parte de quem paga («60/40»), a categoria pelo nome, o carro
 * e o evento (pelos nomes que a casa lhes deu).
 */
export interface Quick {
  amount: string | null; note: string; day: string | null;
  split?: Split; paidBy?: 'me' | 'partner'; share?: number; category?: string; car?: string; occasion?: string;
}
export interface QuickCtx { partner?: string; cats?: string[]; cars?: { id: string; name: string }[]; occasions?: { id: string; name: string }[] }

const WD = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTH_WORDS = 'janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|' + MONTHS.join('|');
// Outros nomes das categorias (sem acentos, minúsculas).
const CAT_WORDS: Record<string, string[]> = {
  Supermercado: ['supermercado', 'super', 'mercearia', 'compras'],
  Restaurantes: ['restaurante', 'restaurantes'],
  Casa: ['casa'],
  Contas: ['contas', 'conta'],
  Carros: ['carro', 'carros'],
  Lazer: ['lazer'],
  'Saúde': ['saude'],
  Roupa: ['roupa'],
  Viagens: ['viagem', 'viagens', 'ferias'],
  'Future Me': ['investir', 'investimento', 'poupanca', 'future me'],
};
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Uma data sem ano não pode ser no futuro: passa para o ano (ou o mês) anterior. */
function past(y: number, m: number, d: number, today: string, back: 'year' | 'month') {
  let s = toDateStr(new Date(y, m, d));
  if (s > today) s = back === 'year' ? toDateStr(new Date(y - 1, m, d)) : toDateStr(new Date(y, m - 1, d));
  return s;
}

/**
 * Lê «45 pingo doce», «pingo doce 45,30€», «12.5 almoço ontem», «30 jantar 12/10», «60 jantar dia 3 partilhada
 * pagou a Inês», «20 cinema minha», «35 farmácia para a Inês», «80 continente 60/40», «25 lazer sábado».
 */
export function parseQuick(text: string, today: string, ctx: QuickCtx = {}): Quick {
  // Trabalha-se numa cópia sem acentos e em minúsculas, com a mesma posição de cada letra do original; o que se
  // reconhece sai das duas, e a nota é o que sobra do original.
  let o = ` ${text.trim().replace(/\s+/g, ' ')} `;
  let t = [...o].map((ch) => { const n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return n.length === 1 ? n : ch; }).join('');
  if (t.length !== o.length) { o = ` ${norm(text).replace(/\s+/g, ' ')} `; t = o; }
  const take = (re: RegExp) => {
    const m = re.exec(t);
    if (!m) return null;
    const a = m.index, b = m.index + m[0].length, keep = m[0].startsWith(' ') ? ' ' : '', keep2 = m[0].endsWith(' ') ? ' ' : '';
    t = t.slice(0, a) + keep + ' ' + keep2 + t.slice(b); o = o.slice(0, a) + keep + ' ' + keep2 + o.slice(b);
    return m;
  };
  const out: Quick = { amount: null, note: '', day: null };
  const y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7)) - 1;

  // A parte de quem paga («60/40», a somar 100) antes do dia, para não passar por «60 de abril».
  const rm = /\s(\d{1,2})\s?\/\s?(\d{1,2})\s/.exec(t);
  if (rm && Number(rm[1]) + Number(rm[2]) === 100 && Number(rm[1]) > 0 && Number(rm[2]) > 0) {
    take(/\s(\d{1,2})\s?\/\s?(\d{1,2})\s/); out.split = 'shared'; out.share = Number(rm[1]) / 100;
  }

  // O dia.
  let day: string | null = null, dm: RegExpExecArray | null;
  if (take(/\santeontem\s/)) day = addDays(today, -2);
  else if (take(/\sontem\s/)) day = addDays(today, -1);
  else if (take(/\shoje\s/)) day = today;
  else if ((dm = take(/\sha\s(\d{1,2})\sdias?\s/))) day = addDays(today, -Number(dm[1]));
  else if ((dm = take(/\s(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{2,4}))?\s/))) {
    const yy = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : y;
    day = dm[3] ? toDateStr(new Date(yy, Number(dm[2]) - 1, Number(dm[1]))) : past(yy, Number(dm[2]) - 1, Number(dm[1]), today, 'year');
  } else if ((dm = take(new RegExp(`\\s(?:a |em |no dia |dia )?(\\d{1,2})(?: de)? (${MONTH_WORDS})\\.?(?: de (\\d{4}))?\\s`)))) {
    const m = MONTHS.indexOf(dm[2].slice(0, 3));
    day = dm[3] ? toDateStr(new Date(Number(dm[3]), m, Number(dm[1]))) : past(y, m, Number(dm[1]), today, 'year');
  } else if ((dm = take(/\s(?:no )?dia (\d{1,2})\s/))) day = past(y, mo, Number(dm[1]), today, 'month');
  else {
    // «sábado» = o último sábado (até 7 dias atrás); tira também o «no»/«na» antes.
    const w = take(new RegExp(`\\s(?:(?:no|na|de) )?(${WD.join('|')})(?:-feira)?(?: passad[oa])?\\s`));
    if (w) { const want = WD.indexOf(w[1]), now = parseDate(today).getDay(); day = addDays(today, -(((now - want) + 7) % 7 || 7)); }
  }
  out.day = day;

  // Quem pagou e a divisão.
  const p = ctx.partner ? norm(ctx.partner).toLowerCase() : null;
  if (p) {
    if (take(new RegExp(`\\s(?:pagou (?:a |o )?${esc(p)}|(?:a |o )?${esc(p)} pagou|pag[oa] pel[ao] ${esc(p)})\\s`))) out.paidBy = 'partner';
    else if (take(/\s(?:paguei eu|paguei|pago por mim)\s/)) out.paidBy = 'me';
  }
  if (!out.split && take(/\s(?:partilhad[oa]s?|a meias|meias|dos dois|das duas|nossa|nosso|conjunta|casal)\s/)) out.split = 'shared';
  if (!out.split && p && take(new RegExp(`\\s(?:para (?:a |o )?|d[ao] |de )${esc(p)}\\s`))) out.split = 'other';
  if (!out.split && take(/\s(?:so minha|so meu|so para mim|minha|meu|pessoal|para mim)\s/)) out.split = 'mine';

  // O carro e o evento, pelos nomes da casa (o nome inteiro, sem acentos).
  for (const c of ctx.cars ?? []) { const n = norm(c.name).toLowerCase().trim(); if (n && take(new RegExp(`\\s(?:(?:do|da|no|na|o|a) )?${esc(n)}\\s`))) { out.car = c.id; out.category = 'Carros'; break; } }
  for (const v of ctx.occasions ?? []) { const n = norm(v.name).toLowerCase().trim(); if (n && new RegExp(`\\s${esc(n)}\\s`).test(t)) { take(new RegExp(`\\s(?:(?:do|da|para o|para a) )?${esc(n)}\\s`)); out.occasion = v.id; break; } }

  // O valor (depois das datas e das partes, para «12/10» e «60/40» não contarem como valor).
  const am = take(/\s(\d{1,6}(?:[.,]\d{1,2})?)\s?(?:€|eur|euros)?\s/);
  const amount = am ? am[1].replace(',', '.') : null;
  out.amount = amount && Number(amount) > 0 ? amount : null;

  // A categoria pelo nome: sai da nota só se sobrar alguma coisa (para «45 supermercado» a nota fica «Supermercado»).
  if (!out.category) {
    for (const c of ctx.cats ?? []) {
      const ws = CAT_WORDS[c] ?? [norm(c).toLowerCase()];
      const re = new RegExp(`\\s(?:#)?(${ws.map(esc).join('|')})\\s`);
      const m = re.exec(t);
      if (!m) continue;
      out.category = c;
      const rest = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
      if (rest) take(re);
      break;
    }
  }
  const note = o.replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
  out.note = note ? note[0].toUpperCase() + note.slice(1) : '';
  // Sem nada disto escrito, as chaves não aparecem (o resto da app adivinha).
  for (const k of ['split', 'paidBy', 'share', 'category', 'car', 'occasion'] as const) if (out[k] === undefined) delete out[k];
  return out;
}

/** As palavras que identificam o sítio (sem números nem palavras pequenas): «Pingo Doce Alvalade» → pingo doce alvalade. */
const words = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^\d+$/.test(w));

const KNOWN: [string, RegExp][] = [
  ['Supermercado', /pingo doce|continente|lidl|auchan|mercadona|intermarche|minipreco|aldi|el corte|supermercado|mercearia|talho|padaria|frutaria/],
  ['Restaurantes', /restaurante|jantar|almoco|cafe|pequeno almoco|lanche|pastelaria|tasca|pizza|sushi|burger|glovo|uber eats|bolt food|take away/],
  ['Carros', /galp|bp|repsol|prio|cepsa|gasolina|gasoleo|combustivel|via verde|portagem|estacionamento|parque|oficina|pneus|lavagem|carregamento|mobi e/],
  ['Contas', /edp|endesa|iberdrola|goldenergy|epal|smas|meo|vodafone|nos|digi|agua|luz|gas|internet|telemovel/],
  ['Casa', /ikea|leroy|aki|bricomarche|worten|fnac|limpeza|renda|condominio|housekeeping|canalizador|eletricista/],
  ['Saude', /farmacia|medico|dentista|clinica|hospital|analises|oculista|fisioterapia|ginasio|holmes|fitness/],
  ['Roupa', /zara|h&m|hm|mango|primark|massimo|pull|bershka|uniqlo|cos|sapatos|roupa/],
  ['Lazer', /cinema|netflix|spotify|disney|hbo|teatro|concerto|livro|bilhetes|museu|bar|copos/],
  ['Viagens', /ryanair|tap|easyjet|booking|airbnb|hotel|comboio|cp |voo|viagem/],
];

export interface Past { note: string | null; category: string; split: Split; created_by: string; created_at: string }

export interface Guess { category: string; split: Split; why: 'history' | 'words' | 'default' }

/**
 * Categoria e divisão: o que a pessoa escolheu da última vez para o mesmo sítio (mesmas palavras) manda; senão,
 * palavras conhecidas; senão, a categoria que mais usa. A divisão segue a que a pessoa costuma dar a essa categoria.
 */
/** A divisão que a pessoa costuma dar a uma categoria (as últimas 10); na primeira vez, a habitual dessa categoria. */
export function splitOf(cat: string, past: Past[], me: string, partner: boolean): Split {
  if (!partner) return 'mine';
  const same = past.filter((p) => p.created_by === me && p.category === cat).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 10);
  if (same.length) {
    const n = new Map<Split, number>();
    for (const p of same) n.set(p.split, (n.get(p.split) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return ['Roupa', 'Saúde', 'Lazer'].includes(cat) ? 'mine' : 'shared';
}

export function guess(note: string, past: Past[], me: string, partner: boolean, cats: string[]): Guess {
  const mine = past.filter((p) => p.created_by === me).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const ws = words(note);
  const splitFor = (cat: string): Split => splitOf(cat, past, me, partner);
  if (ws.length) {
    // O mesmo sítio: todas as palavras significativas da primeira coincidem (ou a nota antiga começa pelas mesmas).
    const hit = mine.find((p) => { const pw = words(p.note ?? ''); return pw.length > 0 && ws.slice(0, 2).every((w) => pw.includes(w)); });
    if (hit && cats.includes(hit.category)) return { category: hit.category, split: partner ? hit.split : 'mine', why: 'history' };
    const n = ` ${ws.join(' ')} `;
    const k = KNOWN.find(([, re]) => re.test(n));
    if (k) { const c = cats.find((x) => norm(x) === norm(k[0])) ?? k[0]; if (cats.includes(c)) return { category: c, split: splitFor(c), why: 'words' }; }
  }
  const count = new Map<string, number>();
  for (const p of mine.slice(0, 60)) if (cats.includes(p.category)) count.set(p.category, (count.get(p.category) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? cats[0];
  return { category: top, split: splitFor(top), why: 'default' };
}

export type CarKind = 'fuel' | 'charge' | 'toll' | 'service' | 'other';
/** Que despesa do carro é, pela nota: «Galp» → abastecer, «Via Verde» → portagens, «oficina» → oficina. */
export function carKindOf(note: string, electric: boolean): CarKind {
  const n = ` ${words(note).join(' ')} `;
  if (/via verde|portage|ponte/.test(n)) return 'toll';
  if (/oficina|revisao|pneu|inspec|lavagem|mecanic|travoes|oleo/.test(n)) return 'service';
  if (/carreg|mobi|tesla|ionity|powerdot|kwh/.test(n)) return 'charge';
  if (/galp|repsol|prio|cepsa|bp|gasol|gasoleo|combust|abastec|intermarche|leclerc/.test(n)) return electric ? 'charge' : 'fuel';
  return electric ? 'charge' : 'fuel';
}

/** A pergunta para confirmar o que a NIKKI adivinhou: «Abastecimento do Golf?», «Supermercado, partilhada?». */
export const KIND_ASK: Record<CarKind, string> = { fuel: 'Abastecimento', charge: 'Carregamento', toll: 'Portagens', service: 'Oficina', other: 'Despesa' };
