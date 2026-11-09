// A primeira página que se compõe a si própria (NIKKI 2). Em vez de um molde fixo onde os dados caem sempre nos mesmos
// lugares, cada assunto da casa tem um peso neste momento (0–100) e a página fica com:
//   · a manchete: o assunto com mais peso (ou «Dia calmo.» quando nada passa de 40);
//   · até dois destaques (peso ≥ 30), com um número;
//   · até quatro breves (peso ≥ 15), numa linha cada.
// O resto não aparece: a página edita. Sem dependências da app: recebe sinais simples e devolve texto e números.
import { dayLabel } from './dates';
import { eur } from './money';

export interface Story {
  key: string; weight: number;
  head: string; // a frase da manchete ou da breve
  sub?: string; // uma linha por baixo, só na manchete
  fig?: { label: string; value: string; unit?: string; note?: string }; // o número, nos destaques
  to?: string;
}

export interface Signals {
  today: string; hhmm: string;
  month?: { pct: number | null; why: string | null; total: number; normal: number | null; name: string };
  deadlines?: { title: string; due_on: string; amount?: number | null }[];
  events?: { title: string; day: string; time: string | null; endTime: string | null; kind: string }[];
  missing?: { note: string; day: string; amount: number; kind: 'monthly' | 'yearly' }[];
  live?: { name: string; left: number } | null;
  birthdays?: { title: string; day: string }[];
  messages?: { from: string; n: number } | null;
  balance?: { lead: string; v: number; even: boolean } | null;
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Os assuntos da casa neste momento, cada um com o seu peso. */
export function stories(s: Signals): Story[] {
  const out: Story[] = [];
  const m = s.month;
  if (m) {
    const p = m.pct;
    const w = p === null ? 20 : p >= 25 ? 70 : p >= 10 ? 55 : p <= -10 ? 42 : 30;
    const head = p === null ? 'Primeiro mês com contas.' : p >= 10 ? `${p >= 25 ? 'Mês quente' : 'Mês a puxar'}: ${p}% acima do habitual${m.why ? `, sobretudo ${m.why.toLowerCase()}` : ''}.`
      : p <= -10 ? `Mês tranquilo: ${-p}% abaixo do habitual.` : 'Mês no ritmo.';
    out.push({ key: 'month', weight: w, head, sub: m.normal ? `${cap(m.name)}: ${eur(m.total, 0)} €; o teu normal é ${eur(m.normal, 0)} € por mês.` : undefined,
      fig: { label: cap(m.name), value: eur(m.total, 0), unit: '€', note: p === null ? 'primeiro mês' : p === 0 ? 'no ritmo' : `${Math.abs(p)}% ${p > 0 ? 'acima' : 'abaixo'} do habitual` }, to: '/n2/dinheiro' });
  }
  for (const d of s.deadlines ?? []) {
    const n = days(s.today, d.due_on);
    if (n > 7) continue;
    const w = n < 0 ? 90 : n === 0 ? 80 : n === 1 ? 72 : n <= 3 ? 62 : 40;
    const when = n < 0 ? `era ${dayLabel(d.due_on, s.today)}` : dayLabel(d.due_on, s.today);
    out.push({ key: `dl:${d.title}:${d.due_on}`, weight: w, head: `${d.title}: ${when}${d.amount ? `, ${eur(d.amount, 0)} €` : ''}.`, sub: n < 0 ? 'Já passou o prazo.' : 'Ainda a tempo.',
      fig: { label: d.title, value: d.amount ? eur(d.amount, 0) : '—', unit: d.amount ? '€' : undefined, note: when } });
  }
  for (const b of s.birthdays ?? []) {
    const n = days(s.today, b.day);
    if (n < 0 || n > 7) continue;
    out.push({ key: `bd:${b.title}`, weight: n === 0 ? 78 : n === 1 ? 66 : 35, head: n === 0 ? `${b.title}: é hoje.` : `${b.title}: ${dayLabel(b.day, s.today)}.`, sub: n === 0 ? 'Hoje conta a dobrar.' : 'Já há presente?' });
  }
  // A próxima coisa de hoje: pesa mais quando está perto (até 2 horas).
  const next = (s.events ?? []).filter((e) => e.day === s.today && e.kind !== 'due' && e.kind !== 'busy' && e.time && (e.endTime ?? e.time) > s.hhmm)
    .sort((a, b) => a.time!.localeCompare(b.time!))[0];
  if (next) {
    const gap = mins(next.time!) - mins(s.hhmm);
    out.push({ key: `ev:${next.title}`, weight: gap <= 0 ? 60 : gap <= 120 ? 56 : 34, head: gap <= 0 ? `Agora: ${next.title}.` : `${next.title} às ${next.time}.`, sub: gap > 0 && gap <= 120 ? `Daqui a ${gap < 60 ? `${gap} minutos` : 'pouco mais de uma hora'}.` : undefined,
      fig: { label: 'A seguir', value: next.time!, note: next.title }, to: '/n2/tempo' });
  }
  for (const x of s.missing ?? []) {
    const n = days(s.today, x.day);
    if (x.kind === 'monthly') out.push({ key: `mi:${x.note}`, weight: 45, head: `${x.note} ainda não apareceu.`, sub: `Costuma ser a ${Number(x.day.slice(8))}, ${eur(x.amount)} €.`, fig: { label: x.note, value: eur(x.amount, 0), unit: '€', note: 'ainda não apareceu' } });
    else if (n <= 21) out.push({ key: `mi:${x.note}`, weight: n <= 7 ? 55 : 32, head: `${x.note}: ${dayLabel(x.day, s.today)}, como no ano passado.`, sub: `Foram ${eur(x.amount, 0)} €. Se der para comparar preços, é agora.`, fig: { label: x.note, value: eur(x.amount, 0), unit: '€', note: dayLabel(x.day, s.today) } });
  }
  if (s.live) out.push({ key: 'live', weight: 64, head: `${s.live.name} está nas compras.`, sub: s.live.left ? `Faltam ${s.live.left}. Se te lembrares de alguma coisa, é agora.` : 'Já está tudo na lista.', fig: { label: 'Nas compras', value: String(s.live.left), note: `por comprar, com ${s.live.name}` }, to: '/compras' });
  if (s.messages?.n) out.push({ key: 'msg', weight: 58, head: s.messages.n === 1 ? `Mensagem de ${s.messages.from}.` : `${s.messages.n} mensagens de ${s.messages.from}.`, to: '/housekeeping/mensagens' });
  if (s.balance && !s.balance.even) out.push({ key: 'us', weight: Math.abs(s.balance.v) >= 50_000_000 ? 26 : 16, head: `Entre nós: ${s.balance.lead.toLowerCase()}, ${eur(Math.abs(s.balance.v), 0)} €.`, fig: { label: 'Entre nós', value: eur(Math.abs(s.balance.v), 0), unit: '€', note: s.balance.lead.toLowerCase() }, to: '/dinheiro?ver=entre-nos' });
  return out;
}

export interface Front { lead: Story; calm: boolean; features: Story[]; briefs: Story[] }

/** A composição: manchete, destaques e breves. Num dia calmo, a manchete diz isso mesmo. */
export function compose(list: Story[]): Front {
  const all = [...list].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  const top = all[0];
  const calm = !top || top.weight < 40;
  const lead: Story = calm ? { key: 'calm', weight: 0, head: 'Dia calmo.', sub: top ? top.head : 'Nada a pedir atenção. Aproveitem.' } : top;
  const rest = all.slice(1); // o de cima já está na manchete (num dia calmo, por baixo dela)
  const features = rest.filter((x) => x.weight >= 30 && x.fig).slice(0, 2);
  const briefs = rest.filter((x) => x.weight >= 15 && !features.includes(x)).slice(0, 4);
  return { lead, calm, features, briefs };
}

