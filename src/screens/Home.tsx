import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { store } from '@/lib/store';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Wordmark } from '@/brand/Wordmark';
import { Whiskers } from '@/ui/Whiskers';
import { Calendar, type CalItem } from '@/ui/Calendar';
import { Poster } from '@/ui/Poster';
import { How, Year } from '@/ui/Year';
import { eur, monthClose } from '@/lib/money';
import { addDays, dayLabel, monthName, toDateStr, todayStr } from '@/lib/dates';
import { ExpenseSheet, INVEST, useLedger, useMonth } from './Money';
import { InviteForm } from './People';

export function Top({ title, right }: { title: string; right?: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <>
      <button className="back press" onClick={() => (loc.key !== 'default' ? nav(-1) : nav('/'))}><Icon n="back" s={20} /><span>Voltar</span></button>
      <div className="titlebar"><h1 className="l">{title}</h1>{right}</div>
    </>
  );
}

/** Quantas vezes este ecrã já foi visto (as linhas de ajuda só aparecem nas 3 primeiras). */
export function useSeen(k: string) {
  const key = `nikki_seen_${k}`;
  const [n] = useState(() => Number(store.get(key) ?? 0));
  useEffect(() => { store.set(key, String(n + 1)); }, [key, n]);
  return n;
}
export const Hint = ({ show, children }: { show: boolean; children: ReactNode }) => (show ? <p className="hint">{children}</p> : null);

const hello = () => { const h = new Date().getHours(); return h >= 6 && h < 12 ? 'Bom dia' : h < 20 && h >= 12 ? 'Boa tarde' : 'Boa noite'; };

function FirstSteps() {
  const { me, members, house } = useSession();
  const { expenses, shop } = useHouse();
  const { open } = useOverlays();
  const nav = useNavigate();
  const hideKey = `nikki_first_hidden_${house?.id}`;
  const [hidden, setHidden] = useState(() => store.get(hideKey) === '1');
  const done = {
    exp: expenses.rows.some((e) => e.created_by === me?.id),
    item: shop.rows.length > 0,
    invite: members.length > 1 || store.get(`nikki_invited_${house?.id}`) === '1',
  };
  const rows: [keyof typeof done, string, () => void][] = [
    ['exp', 'Registar uma despesa', () => open(<ExpenseSheet />)],
    ['item', 'Pôr algo na lista de compras', () => nav('/compras')],
    ['invite', 'Convidar quem vive contigo', () => open(<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><p className="l">Convidar</p><InviteForm householdId={house!.id} onDone={() => store.set(`nikki_invited_${house?.id}`, '1')} /></div>)],
  ];
  const n = rows.filter(([k]) => done[k]).length;
  if (hidden || n === 3 || expenses.loading) return null;
  return (
    <section className="tile card" aria-label="Primeiros passos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 }}>
        <span className="s">Primeiros passos · {n} de 3</span>
        <button className="back press" style={{ fontSize: 'var(--t-s)' }} onClick={() => { store.set(hideKey, '1'); setHidden(true); }}>Esconder</button>
      </div>
      <div className="rows">{rows.map(([k, label, go]) => (
        <button key={k} className="press" disabled={done[k]} onClick={go}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className={`tick${done[k] ? ' on' : ''}`}>{done[k] && <Icon n="check" s={14} w={2.4} />}</span><span style={done[k] ? { color: 'var(--sub)', textDecoration: 'line-through' } : undefined}>{label}</span></span>
          {!done[k] && <Icon n="arrow" s={16} />}
        </button>
      ))}</div>
    </section>
  );
}

/** «Agora»: o que importa já. Não muda sozinho; desliza-se com o dedo. */
function Now() {
  const { partner } = useSession();
  const { shop, deadlines } = useHouse();
  const L = useLedger();
  const track = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const items: { t: string; s: string; a?: ReactNode }[] = [];
  const soon = deadlines.rows.filter((d) => !d.paid_at && d.due_on <= addDays(todayStr(), 7));
  for (const d of soon) items.push({ t: d.title, s: `${dayLabel(d.due_on)}${d.amount ? ` · ${eur(Number(d.amount) * 100_000)} €` : ''}` });
  const left = shop.rows.filter((i) => !i.done).length;
  if (left) items.push({ t: `${left} por comprar`, s: partner ? `Lista partilhada com ${partner.name}.` : 'A tua lista de compras.', a: <Link className="btn quiet press" to="/compras">Abrir <Icon n="arrow" s={18} /></Link> });
  if (L && !L.even) items.push({ t: 'Contas a dois', s: `${L.lead}: ${eur(Math.abs(L.v))} €.`, a: <Link className="btn quiet press" to="/contas">Ver <Icon n="arrow" s={18} /></Link> });
  if (!items.length) items.push({ t: 'Tudo em ordem.', s: 'Nada urgente por agora. A NIKKI avisa quando houver.' });
  return (
    <section className="tile pane" aria-label="Agora">
      <div className="pane-top"><span className="s">Agora</span>{items.length > 1 && <div className="pager" aria-hidden="true">{items.map((_, j) => <i key={j} className={j === k ? 'on' : ''} />)}</div>}</div>
      <div className="track" ref={track} onScroll={(e) => setK(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {items.map((it, j) => (
          <div className="slide" key={j}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><p className="l">{it.t}</p><p className="s" style={{ fontSize: 'var(--t-m)' }}>{it.s}</p></div>
            {it.a && <div className="actions">{it.a}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A agenda no início: eventos da casa, os teus e os do outro (os privados dele só como «ocupado») e os prazos. */
function HomeCalendar() {
  const { me, members } = useSession();
  const { events, busy, deadlines } = useHouse();
  const items = useMemo(() => {
    const who = (id: string) => members.find((m) => m.id === id);
    const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    const out: CalItem[] = [];
    for (const e of events.rows) {
      const o = e.owner_id ? who(e.owner_id) : undefined;
      out.push({ day: toDateStr(new Date(e.starts_at)), time: e.all_day ? null : hm(e.starts_at), title: e.title, kind: !e.owner_id ? 'house' : e.owner_id === me?.id ? 'mine' : 'other', color: o?.color, note: !e.owner_id ? 'Casa' : e.owner_id === me?.id ? 'Tu' : o?.name ?? '' });
    }
    for (const b of busy.rows) {
      const o = who(b.owner_id);
      out.push({ day: toDateStr(new Date(b.starts_at)), time: b.all_day ? null : hm(b.starts_at), title: 'Ocupado', kind: 'busy', color: o?.color, note: o?.name ?? '' });
    }
    for (const d of deadlines.rows) if (!d.paid_at) out.push({ day: d.due_on, time: null, title: d.title, kind: 'due', note: d.amount ? `Prazo · ${eur(Number(d.amount) * 100_000)} €` : 'Prazo' });
    return out;
  }, [events.rows, busy.rows, deadlines.rows, members, me?.id]);
  return <Calendar items={items} to="/em-breve/agenda" />;
}

function Widget({ to, ic, v, l, d, wide }: { to: string; ic: string | ReactNode; v: string; l: string; d: string; wide?: boolean }) {
  return <Link className={`tile w press${wide ? ' wide' : ''}`} to={to} aria-label={l}><span className="ic">{typeof ic === 'string' ? <Icon n={ic} /> : ic}</span><span><span className="l">{v}</span><span className="s det">{l} · {d}</span></span></Link>;
}

export function Hub() {
  const { me, partner } = useSession();
  const { deadlines } = useHouse();
  const m = useMonth(), L = useLedger();
  const open = deadlines.rows.filter((d) => !d.paid_at);
  return (
    <>
      <p className="l" style={{ paddingTop: 8 }}>{hello()}, {me?.name}.</p>
      <MonthClose />
      <FirstSteps />
      <Now />
      <HomeCalendar />
      <div className="widgets">
        <Widget to="/em-breve/casa" ic="bell" v={String(open.length)} l="Avisos" d={open[0] ? `${open[0].title}, ${dayLabel(open[0].due_on)}` : 'tudo em dia'} />
        {partner && L
          ? <Widget to="/contas" ic={<Whiskers h={22} lean={L.lean} even={L.even} />} v={`${eur(Math.abs(L.v))} €`} l="Contas a dois" d={L.even ? 'em equilíbrio' : L.v > 0 ? 'adiantaste mais' : `${partner.name} adiantou mais`} />
          : <Widget to="/dinheiro" ic="coins" v={`${eur(m.total, 0)} €`} l={monthName(m.key)[0].toUpperCase() + monthName(m.key).slice(1)} d={m.pace.fresh ? 'primeiro mês' : `${Math.abs(m.pace.pct)}% ${m.pace.pct >= 0 ? 'acima' : 'abaixo'} do habitual`} />}
        <Widget to="/em-breve/objetivos" ic="target" v="—" l="Objetivos" d="propostos no fim do 1.º mês" wide />
      </div>
    </>
  );
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/**
 * Fecho do mês em voz alta: na primeira visita ao início depois de um mês acabar, um cartaz com a tua parte
 * desse mês comparada com o teu normal. Aparece uma vez por mês e por pessoa.
 */
function MonthClose() {
  const { me, partner, house } = useSession();
  const { expenses } = useHouse();
  const key = `nikki_closed_${house?.id}_${me?.id}`;
  const [seen, setSeen] = useState(() => store.get(key));
  const c = useMemo(() => (expenses.loading || !me ? null : monthClose(expenses.rows.filter((e) => e.category !== INVEST), me.id, todayStr())), [expenses.rows, expenses.loading, me]);
  const done = useCallback(() => { if (c) { store.set(key, c.key); setSeen(c.key); } }, [c, key]);
  if (!c || seen === c.key) return null;
  const name = monthName(c.key);
  const band = c.pct === null ? 'Primeiro mês completo' : c.pct === 0 ? 'Igual ao teu normal' : `${Math.abs(c.pct)}% ${c.pct < 0 ? 'abaixo' : 'acima'} do teu normal`;
  return (
    <Poster
      lines={[name.toUpperCase(), 'FECHOU.']}
      band={band}
      foot={`${partner ? 'A tua parte' : 'Total'} em ${name} · ${eur(c.total, 0)} €`}
      how={c.normal
        ? <How><p className="s">{eur(c.total)} € em {name} ÷ {eur(c.normal)} € do teu normal = {(c.total / c.normal).toFixed(2).replace('.', ',')}.</p><p className="s">O normal é a média dos meses completos antes de {name}, até 6.</p></How>
        : <p className="s">A partir de agora, cada mês compara-se com o teu normal.</p>}
      share={`${cap(name)} fechou: ${band.toLowerCase()}. Contas feitas na NIKKI.`}
      onClose={done}
    />
  );
}

const SPACES: [string, string, string][] = [['/dinheiro', 'coins', 'Dinheiro'], ['/em-breve/objetivos', 'target', 'Objetivos'], ['/em-breve/patrimonio', 'bars', 'Património'], ['/compras', 'basket', 'Compras'], ['/em-breve/garagem', 'car', 'Garagem'], ['/em-breve/agenda', 'cal', 'Agenda'], ['/em-breve/ginasio', 'pulse', 'Ginásio'], ['/em-breve/casa', 'house', 'Casa'], ['/pessoas', 'people', 'Pessoas']];
export function Spaces() {
  return (
    <>
      <Top title="Espaços" />
      <div className="lib">{SPACES.map(([to, ic, n]) => <Link key={to + n} className="tile press" to={to}><span className="ic"><Icon n={ic} s={24} /></span><span>{n}</span></Link>)}</div>
    </>
  );
}

const SOON: Record<string, [string, string]> = {
  objetivos: ['Objetivos', 'Poucos de cada vez, medidos com os vossos números e com prazo. A NIKKI propõe os primeiros no fim do primeiro mês.'],
  patrimonio: ['Património', 'O capital investido e o retorno que estimam para cada investimento. A independência mostra quantos meses do ano já estão pagos.'],
  garagem: ['Garagem', 'Carros da casa ou de cada um, consumo de depósito cheio a depósito cheio e quanto custa cada quilómetro.'],
  agenda: ['Agenda', 'A agenda da casa, ligada à do iPhone, com eventos e listas de convidados.'],
  ginasio: ['Ginásio', 'As tuas avaliações, com as medidas que escolheres. Só tu vês.'],
  casa: ['Casa', 'Prazos e manutenção: IUC, seguros, revisões. A NIKKI avisa a tempo.'],
};
export function Soon({ k }: { k: string }) {
  const [t, d] = SOON[k] ?? ['Em breve', ''];
  return (
    <>
      <Top title={t} />
      <p className="l">Chega na próxima fase.</p>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>{d}</p>
      {k === 'patrimonio' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Year free={0} label="Meses livres: 0 de 12" />
        <span className="s">Meses livres · 0 de 12. Cada mês do ano pinta-se quando o rendimento dos investimentos já o paga.</span>
      </div>}
    </>
  );
}

const STORY = [
  'A Nikki é uma chinchila. Cinzenta, macia e com aquela autoridade natural de quem nunca precisou de levantar a voz. As chinchilas, de resto, não levantam a voz. Levantam a taça. E depois atiram-na ao chão.',
  'Partilha a gaiola com o Balki. Partilha da mesma forma que um casal partilha o comando da televisão: é dos dois, mas há sempre um que o tem na mão.',
  'Quando o Balki está a comer, a Nikki chega, encosta-o com o focinho e fica com a taça. Não é egoísmo. É gestão de prioridades. Quando acaba, empurra a taça para o chão, que é a maneira que ela tem de dizer «assunto encerrado». Quem a vai buscar é o Balki. Ninguém lhe pede. Ninguém precisa.',
  'À hora do banho passa-se o mesmo. As chinchilas tomam banho em pó, o que revela uma espécie que olhou para a água e pensou: isto pode ser simplificado. A Nikki entra na banheira, o Balki sai. Sem drama, com a elegância de quem segura a porta. Há quem chame a isto ceder. O Balki chama-lhe paz.',
  'Ao fim do dia, depois de horas a mandar e a ser mandado, dormem os dois encostadinhos na casinha de madeira que foram roendo juntos. Já é mais janela do que parede. Não faz mal. Ninguém fica numa casa por causa das paredes.',
  'É assim que funciona uma boa equipa: há quem saiba onde está cada coisa, há quem vá buscar a taça, e à noite ninguém se lembra de quem empurrou quem.',
  'A NIKKI faz isso por nós. Sabe quanto gastámos, o que falta comprar, quem adiantou mais e quando é a revisão do carro. Põe ordem nas coisas pequenas, para sobrar espaço para as grandes. E, de vez em quando, dá-nos um empurrãozinho. Com o focinho, claro.',
];
export function Story() {
  return (
    <>
      <Top title="A história" />
      <div style={{ color: 'var(--ink)', padding: '16px 0 8px' }}><Wordmark h={48} draw alive /></div>
      <h1 className="l">Quem é a NIKKI</h1>
      <div className="story">{STORY.map((p) => <p key={p.slice(0, 12)}>{p}</p>)}<p className="sign">A NIKKI manda. Nós agradecemos.</p></div>
      <div className="tile" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--ink)' }}>
        <Wordmark h={20} />
        <p className="s">O nome é o logótipo. O primeiro K está espelhado e os dois K são mais pequenos: as hastes são os olhos e as pernas finas são os bigodes. No resto da app fica só a cara.</p>
        <button className="btn quiet press" style={{ alignSelf: 'flex-start' }} onClick={() => dispatchEvent(new Event('nikki:intro'))}>Ver a abertura outra vez</button>
      </div>
    </>
  );
}
