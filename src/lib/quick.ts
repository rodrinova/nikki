// Despesa num gesto: «45 pingo doce», «12,50 almoço ontem», «Galp 60». O valor, o dia e a nota saem do que se
// escreve; a categoria e a divisão adivinham-se pelo que a pessoa fez antes com o mesmo sítio (ou, na primeira vez,
// por palavras conhecidas). Regras em docs/CALCULOS.md, secção 10. Puro.

import { addDays, parseDate, toDateStr } from './dates';
import { norm } from './home';

export type Split = 'mine' | 'shared' | 'other';
export interface Quick { amount: string | null; note: string; day: string | null }

const WD = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

/** Lê «45 pingo doce», «pingo doce 45,30€», «12.5 almoço ontem», «30 jantar 12/10». */
export function parseQuick(text: string, today: string): Quick {
  let t = ` ${text.trim()} `;
  let day: string | null = null;
  const take = (re: RegExp) => { const m = t.match(re); if (m) t = t.replace(m[0], ' '); return m; };
  if (take(/\santeontem\s/i)) day = addDays(today, -2);
  else if (take(/\sontem\s/i)) day = addDays(today, -1);
  else if (take(/\shoje\s/i)) day = today;
  else {
    const dm = take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/);
    if (dm) {
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : Number(today.slice(0, 4));
      let d = toDateStr(new Date(y, Number(dm[2]) - 1, Number(dm[1])));
      if (!dm[3] && d > today) d = toDateStr(new Date(y - 1, Number(dm[2]) - 1, Number(dm[1])));
      day = d;
    } else {
      // «sábado» = o último sábado (até 7 dias atrás); tira também o «no»/«na» antes.
      const tk = t.trim().split(/\s+/);
      const k = tk.findIndex((w) => WD.includes(norm(w).replace(/-feira$/, '')));
      if (k >= 0) {
        const want = WD.indexOf(norm(tk[k]).replace(/-feira$/, '')), now = parseDate(today).getDay();
        day = addDays(today, -(((now - want) + 7) % 7 || 7));
        tk.splice(k > 0 && ['no', 'na'].includes(norm(tk[k - 1])) ? k - 1 : k, k > 0 && ['no', 'na'].includes(norm(tk[k - 1])) ? 2 : 1);
        t = ` ${tk.join(' ')} `;
      }
    }
  }
  const am = take(/\s(\d{1,6}(?:[.,]\d{1,2})?)\s?(?:€|eur|euros)?\s/i);
  const amount = am ? am[1].replace(',', '.') : null;
  const note = t.replace(/\s+/g, ' ').trim();
  return { amount: amount && Number(amount) > 0 ? amount : null, note: note ? note[0].toUpperCase() + note.slice(1) : '', day };
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
export function guess(note: string, past: Past[], me: string, partner: boolean, cats: string[]): Guess {
  const mine = past.filter((p) => p.created_by === me).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const ws = words(note);
  const splitFor = (cat: string): Split => {
    if (!partner) return 'mine';
    const same = mine.filter((p) => p.category === cat).slice(0, 10);
    if (same.length) {
      const n = new Map<Split, number>();
      for (const p of same) n.set(p.split, (n.get(p.split) ?? 0) + 1);
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    return ['Roupa', 'Saúde', 'Lazer'].includes(cat) ? 'mine' : 'shared';
  };
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
