// O campo único do «+»: uma frase escrita ou dita, e a NIKKI percebe o que é.
//   «jantar 48 a meias»            → despesa (segue para a folha da despesa, que já lê tudo o resto)
//   «dentista quinta às 10»        → evento (dia e hora)
//   «falta leite, ovos e café»     → compras (uma linha por coisa)
//   «tenho de ligar ao canalizador amanhã» → a fazer
// Sem dependências da app: só datas em texto (AAAA-MM-DD) e o nome do outro, para «para a Inês».
import { addDays } from './dates';

export type Intent =
  | { kind: 'expense'; text: string }
  | { kind: 'event'; title: string; day: string; time: string | null; end: string | null }
  | { kind: 'shop'; items: string[] }
  | { kind: 'todo'; title: string; day: string; who: 'me' | 'other' | 'any' }
  | { kind: null; text: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const WD = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Tira de uma frase (em minúsculas, sem acentos, com o original ao lado) o que bate na expressão. */
function cutter(text: string) {
  let o = ` ${text.trim().replace(/\s+/g, ' ')} `;
  let t = [...o].map((ch) => { const n = norm(ch); return n.length === 1 ? n : ch; }).join('');
  if (t.length !== o.length) { o = ` ${norm(text).replace(/\s+/g, ' ')} `; t = o; }
  return {
    take(re: RegExp) {
      const m = re.exec(t);
      if (!m) return null;
      const a = m.index, b = a + m[0].length;
      t = `${t.slice(0, a)} ${t.slice(b)}`; o = `${o.slice(0, a)} ${o.slice(b)}`;
      return m;
    },
    has: (re: RegExp) => re.test(t),
    get rest() { return o.replace(/\s+/g, ' ').trim(); },
  };
}

/** Um dia que ainda vem: «hoje», «amanhã», «depois de amanhã», «quinta», «próxima segunda», «dia 12», «12/3». */
function futureDay(c: ReturnType<typeof cutter>, today: string): string | null {
  const y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7)), d0 = Number(today.slice(8, 10));
  let m: RegExpExecArray | null;
  if (c.take(/\sdepois de amanha\s/)) return addDays(today, 2);
  if (c.take(/\samanha\s/)) return addDays(today, 1);
  if (c.take(/\shoje\s/)) return today;
  if ((m = c.take(/\s(?:na |no |esta |este |nesta |neste )?(?:proxim[oa] )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?(?: que vem)?\s/))) {
    const want = WD.indexOf(m[1]);
    const now = new Date(`${today}T12:00:00`).getDay();
    let k = (want - now + 7) % 7; if (k === 0) k = 7;
    return addDays(today, k);
  }
  if ((m = c.take(/\s(?:no )?dia (\d{1,2})\s/))) {
    const d = Number(m[1]); if (d < 1 || d > 31) return null;
    const [yy, mm] = d >= d0 ? [y, mo] : mo === 12 ? [y + 1, 1] : [y, mo + 1];
    return `${yy}-${pad(mm)}-${pad(d)}`;
  }
  if ((m = c.take(/\s(?:a |em )?(\d{1,2})\/(\d{1,2})\s/))) {
    const d = Number(m[1]), mm = Number(m[2]); if (mm < 1 || mm > 12 || d < 1 || d > 31) return null;
    const s = `${y}-${pad(mm)}-${pad(d)}`;
    return s >= today ? s : `${y + 1}-${pad(mm)}-${pad(d)}`;
  }
  return null;
}

/** Hora (e fim): «às 10», «10h30», «às 9:15», «das 10 às 12», «às 8 da noite». */
function timeOf(c: ReturnType<typeof cutter>): { time: string | null; end: string | null } {
  const hhmm = (h: string, mi?: string, pm?: boolean) => { let n = Number(h); if (pm && n < 12) n += 12; return n > 23 ? null : `${pad(n)}:${pad(Number(mi ?? 0))}`; };
  const T = String.raw`(\d{1,2})(?:[h:](\d{2})|h)?`;
  let m = c.take(new RegExp(String.raw`\sdas? ${T} (?:as|ate as|ate|-) ${T}(?: (?:da|de) (tarde|noite))?\s`));
  if (m) { const pm = !!m[5]; return { time: hhmm(m[1], m[2], pm), end: hhmm(m[3], m[4], pm) }; }
  m = c.take(new RegExp(String.raw`\s(?:as|a) ${T}(?: (?:da|de) (manha|tarde|noite))?\s`));
  if (m) return { time: hhmm(m[1], m[2], m[3] === 'tarde' || m[3] === 'noite'), end: null };
  m = c.take(/\s(\d{1,2})(?:h(\d{2})?|:(\d{2}))\s/);
  if (m) return { time: hhmm(m[1], m[2] ?? m[3]), end: null };
  return { time: null, end: null };
}

/** Um valor em dinheiro (não uma hora nem um dia): «48», «12,50», «30€», «20 euros». */
const AMOUNT = /(?:^|\s)(\d+(?:[.,]\d{1,2})?)\s?(?:€|euros?\b|eur\b)?(?=\s|$)/;
function hasAmount(text: string): boolean {
  let t = ` ${norm(text)} `;
  // Primeiro tira-se o que é hora ou dia, para «dentista às 10» não ser uma despesa de 10 €.
  t = t.replace(/\sdas? \d{1,2}(?:[h:]\d{2}|h)? (?:as|ate as|ate|-) \d{1,2}(?:[h:]\d{2}|h)?/g, ' ')
    .replace(/\s(?:as|a) \d{1,2}(?:[h:]\d{2}|h)?(?=\s)/g, ' ')
    .replace(/\s\d{1,2}(?:h\d{0,2}|:\d{2})(?=\s)/g, ' ')
    .replace(/\sdia \d{1,2}(?=\s)/g, ' ')
    .replace(/\s\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?=\s)/g, ' ')
    .replace(/\sha \d{1,2} dias?(?=\s)/g, ' ');
  return AMOUNT.test(t) || /€|\beuros?\b/.test(t);
}

/** Tira as palavras soltas que sobram nas pontas («no», «às», «de»…). */
const tidy = (s: string) => s.replace(/^(?:(?:no|na|nos|nas|em|de|do|da|as|às|a|o|e|para|pra|com)\s)+/i, '').replace(/(?:\s(?:no|na|nos|nas|em|de|do|da|as|às|a|o|e|para|pra|com|dia))+$/i, '').replace(/[.,;:!]+$/, '').trim();

/** As coisas de uma lista: «leite, ovos e café» → Leite · Ovos · Café. */
function items(rest: string): string[] {
  return rest.split(/\s*,\s*|\s+e\s+|\s*\+\s*/i).map((x) => cap(tidy(x.trim()))).filter(Boolean).slice(0, 20);
}

export function readIntent(text: string, today: string, ctx: { partner?: string } = {}): Intent {
  const raw = text.trim();
  if (!raw) return { kind: null, text: '' };
  const n = ` ${norm(raw)} `;

  // Compras: «falta leite», «acabou o café», «comprar pão», «para a lista: …».
  const shop = /^\s(?:falta(?:m)?|acabou|acabaram|comprar|compra|lista|na lista|para a lista)\b[:\s]/.exec(n);
  if (shop && !hasAmount(raw)) {
    const rest = raw.slice(shop[0].trim().length).replace(/^\s*[:\-]?\s*(?:(?:o|a|os|as|de|do|da|mais)\s)*/i, '');
    const list = items(rest);
    if (list.length) return { kind: 'shop', items: list };
  }

  // Dinheiro: um valor que não é hora nem dia. A folha da despesa lê o resto (dia, divisão, quem pagou, categoria).
  if (hasAmount(raw)) return { kind: 'expense', text: raw };

  // A fazer: «tenho de…», «temos de…», «lembrar de…», «ligar…».
  const todo = /^\s(?:lembra(?:r|-me)?(?: de| que)?|tenho (?:de|que)|temos (?:de|que)|tens (?:de|que)|preciso de|precisamos de|a fazer:?|nao esquecer(?: de)?)\s/.exec(n);
  if (todo) {
    const c = cutter(raw.slice(todo[0].trim().length));
    const day = futureDay(c, today) ?? today;
    let who: 'me' | 'other' | 'any' = /^\s(?:temos|precisamos)/.test(n) ? 'any' : /^\s(?:tens)/.test(n) ? 'other' : 'me';
    if (ctx.partner && c.take(new RegExp(String.raw`\s(?:para |pra )(?:a |o )?${norm(ctx.partner)}\s`))) who = 'other';
    const title = cap(tidy(c.rest));
    if (title) return { kind: 'todo', title: title.slice(0, 80), day, who };
  }

  // Evento: com hora ou com um dia que vem.
  const c = cutter(raw);
  const day = futureDay(c, today);
  const { time, end } = timeOf(c);
  if (day || time) {
    const title = cap(tidy(c.rest));
    if (title) return { kind: 'event', title: title.slice(0, 80), day: day ?? today, time, end };
  }
  return { kind: null, text: raw };
}

/** Uma frase curta do que se vai gravar, para mostrar antes. */
export function describe(i: Intent, today: string, partner?: string): string {
  const when = (d: string) => (d === today ? 'hoje' : d === addDays(today, 1) ? 'amanhã' : (() => {
    const x = new Date(`${d}T12:00:00`);
    const wd = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][x.getDay()];
    return `${wd}, ${x.getDate()}`;
  })());
  switch (i.kind) {
    case 'event': return `${cap(when(i.day))}${i.time ? ` às ${i.time}${i.end ? ` até às ${i.end}` : ''}` : ', o dia inteiro'}`;
    case 'todo': return `${cap(when(i.day))} · ${i.who === 'me' ? 'para ti' : i.who === 'other' ? `para ${partner ?? 'o outro'}` : 'de quem puder'}`;
    case 'shop': return i.items.length === 1 ? 'Uma coisa para a lista' : `${i.items.length} coisas para a lista`;
    default: return '';
  }
}
