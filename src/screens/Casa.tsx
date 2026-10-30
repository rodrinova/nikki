import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type BillRow, type DeadlineRow, type HomeRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { eur, parseAmount, toU, type Split } from '@/lib/money';
import { addDays, monthKey, monthName, prevMonth, todayStr } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import { nextYear } from '@/lib/garage';
import { BILL_CATEGORIES, KINDS, annualOf, billStats, defaultPeriod, invoiceToLink, looksLikeAdjustment, matchBill, nextDue, partOfBill, unpaidInvoice, type BillKind, type BillStats } from '@/lib/home';
import { BillInvoice } from './Invoice';

export const dt = (d: string) => shortDate(`${d}T12:00:00`);
export const EVERY: [number, string][] = [[1, 'Mensal'], [2, '2 meses'], [3, '3 meses'], [6, '6 meses'], [12, 'Anual']];
/** Renda, prestação, condomínio e seguro ficam em Casa; luz, água, internet… em Contas. */
export const categoryOf = (k: BillKind) => (k === 'renda' || k === 'credito' || k === 'condominio' || k === 'seguro' ? 'Casa' : 'Contas');
export const TENURE: [HomeRow['tenure'] & string, string][] = [['propria', 'Própria'], ['credito', 'Com crédito'], ['arrendada', 'Arrendada']];

/**
 * Tudo o que a Casa mostra, de uma casa ou de todas: contas com números, total por mês, comparação com o ano passado,
 * custo por ano de cada conta (com a parte de quem vê) e o que falta confirmar.
 */
export function useCasa(sel: string = 'all') {
  const { me, myShare } = useSession();
  const { bills, billPayments, expenses, homes, deadlines } = useHouse();
  return useMemo(() => {
    const today = todayStr();
    const places = homes.rows.filter((h) => !h.archived).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    const first = places[0]?.id ?? null;
    // Uma conta sem casa (de antes de haver várias) é da primeira. As contas de uma casa arquivada (mudámos ou
    // vendemos) ficam com o histórico, mas fora dos custos, das faturas e do reconhecimento das despesas.
    const known = new Set(homes.rows.map((h) => h.id)), gone = new Set(homes.rows.filter((h) => h.archived).map((h) => h.id));
    const homeOf = (b: BillRow) => (b.home_id && known.has(b.home_id) ? b.home_id : first);
    const every = bills.rows.filter((b) => !b.archived && !gone.has(homeOf(b) ?? ''));
    const active = sel === 'all' ? every : every.filter((b) => homeOf(b) === sel);
    const stats = new Map<string, BillStats>(active.map((b) => [b.id, billStats(b, billPayments.rows, today)]));
    // Sem faturas ainda, conta o valor normal da conta (repartido pelos meses que cobre).
    const monthly = (b: BillRow, s: BillStats) => s.perMonth ?? (s.typical ? Math.round(s.typical / b.every_months) : 0);
    const total = active.reduce((t, b) => t + monthly(b, stats.get(b.id)!), 0);
    const estimated = active.some((b) => stats.get(b.id)!.perMonth === null && stats.get(b.id)!.typical);
    // Comparação com o ano passado: só as contas que têm os dois anos, pesadas pelo valor.
    const cmp = [...stats.values()].filter((s) => s.yoy !== null && s.perMonth);
    const now = cmp.reduce((t, s) => t + s.perMonth!, 0), before = cmp.reduce((t, s) => t + s.perMonth! / (1 + s.yoy!), 0);
    const linked = new Set(billPayments.rows.map((p) => p.expense_id).filter(Boolean));
    const since = addDays(today, -90);
    const pending = expenses.rows
      .filter((e) => BILL_CATEGORIES.includes(e.category) && e.spent_on >= since && !linked.has(e.id))
      .map((e) => ({ e, m: matchBill({ note: e.note, amount: toU(e.amount), spent_on: e.spent_on, category: e.category }, every, billPayments.rows) }))
      .filter((x) => x.m.sure || x.m.ask.length)
      // Numa casa só: as que podem ser de uma conta dessa casa.
      .filter((x) => sel === 'all' || (x.m.sure ? [x.m.sure] : x.m.ask).some((b) => homeOf(b) === sel));
    // Próximo pagamento: a fatura lida por pagar (com a data limite e o valor certo) ou o dia de pagamento da conta.
    const dues = active.map((b) => {
      const s = stats.get(b.id)!, inv = unpaidInvoice(b.id, billPayments.rows);
      if (inv?.due_on && inv.due_on >= addDays(today, -7)) return { b, on: inv.due_on, amount: toU(inv.amount!), invoice: true };
      const on = nextDue(b, s.lastPaid, today);
      return on ? { b, on, amount: s.typical, invoice: false } : null;
    }).filter(Boolean) as { b: BillRow; on: string; amount: number | null; invoice: boolean }[];
    // Por ano: cada conta (estimada se ainda não há um ano de faturas) e a parte de quem vê.
    const year = active.map((b) => ({ b, home: homeOf(b), ...annualOf(b, billPayments.rows, today), part: me ? partOfBill(b.owner_id, me.id, myShare) : 1 }));
    const billHome = new Map(every.map((b) => [b.id, homeOf(b)]));
    const dl = deadlines.rows.filter((d) => !d.car_id && !d.paid_at && (sel === 'all' || (d.home_id ?? (d.bill_id ? billHome.get(d.bill_id) : null) ?? sel) === sel));
    return {
      places, archived: homes.rows.filter((h) => h.archived), first, homeOf, home: (sel === 'all' ? places[0] : places.find((h) => h.id === sel)) as HomeRow | undefined, ready: !homes.loading && !bills.loading,
      every, active, stats, total, estimated, yoy: before > 0 && cmp.length ? now / before - 1 : null, pending, dues, year,
      deadlines: dl.sort((a, b) => a.due_on.localeCompare(b.due_on)),
    };
  }, [sel, me, myShare, bills.rows, bills.loading, billPayments.rows, expenses.rows, homes.rows, homes.loading, deadlines.rows]);
}

/** O prazo que uma conta cria sozinha: o fim da fidelização (contrato) ou a renovação do seguro, um mês antes. */
export function useBillDeadline() {
  const { me, house } = useSession();
  const { deadlines } = useHouse();
  return async (b: { id: string; kind: BillKind; name: string; provider: string | null; contract_ends_on: string | null }) => {
    const open = deadlines.rows.find((d) => d.bill_id === b.id && !d.paid_at);
    if (!b.contract_ends_on) return;
    const insurance = b.kind === 'seguro';
    const title = insurance ? `${b.name}${b.provider ? ` (${b.provider})` : ''}` : `Fim da fidelização · ${b.name}${b.provider ? ` ${b.provider}` : ''}`;
    if (open) { if (open.due_on !== b.contract_ends_on) await supabase.from('deadlines').update({ due_on: b.contract_ends_on, title }).eq('id', open.id); }
    else await supabase.from('deadlines').insert({ household_id: house!.id, title, due_on: b.contract_ends_on, recurrence: insurance ? 'yearly' : 'none', kind: insurance ? 'insurance' : 'contract', bill_id: b.id, remind_days: 30, created_by: me!.id });
    deadlines.reload();
  };
}

// ───────────────────────── o ecrã ─────────────────────────

/** Nova conta ou editar: tipo, nome, fornecedor, palavras, de quanto em quanto tempo, dia, valor, consumo, contrato. */
export function BillSheet({ bill, home, draft }: { bill?: BillRow; home?: string | null; draft?: Partial<BillRow> }) {
  const { me, partner, house } = useSession();
  const { bills, homes } = useHouse();
  const places = homes.rows.filter((h) => !h.archived);
  const [place, setPlace] = useState<string | null>(bill?.home_id ?? home ?? places[0]?.id ?? null);
  const { close, toast } = useOverlays();
  const nav = useNavigate();
  const ensure = useBillDeadline();
  const [kind, setKind] = useState<BillKind>(bill?.kind ?? draft?.kind ?? 'luz');
  const [name, setName] = useState(bill?.name ?? '');
  const [provider, setProvider] = useState(bill?.provider ?? draft?.provider ?? '');
  const [keywords, setKeywords] = useState(bill?.keywords ?? '');
  const [every, setEvery] = useState(bill?.every_months ?? 1);
  const [day, setDay] = useState(bill?.due_day ? String(bill.due_day) : '');
  const [value, setValue] = useState(bill?.expected && Number(bill.expected) ? String(bill.expected).replace('.', ',') : '');
  const [usage, setUsage] = useState(bill ? bill.unit !== null : true);
  const [ends, setEnds] = useState(bill?.contract_ends_on ?? '');
  const [owner, setOwner] = useState<string | null>(bill ? bill.owner_id : null);
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const v = value.trim() ? parseAmount(value) : null;
    if (value.trim() && !v) return setErr('O valor escreve-se assim: 61,40.');
    const dd = day.trim() ? Number(day) : null;
    if (dd !== null && !(dd >= 1 && dd <= 31)) return setErr('O dia é de 1 a 31.');
    const row = { household_id: house!.id, kind, name: (name.trim() || KINDS[kind].label).slice(0, 40), provider: provider.trim() || null, keywords: keywords.trim() || null, every_months: every, due_day: dd, expected: v, unit: usage ? KINDS[kind].unit : null, contract_ends_on: ends || null, owner_id: owner, home_id: place };
    const res = bill ? await supabase.from('bills').update(row).eq('id', bill.id).select('*').single() : await supabase.from('bills').insert({ ...row, created_by: me!.id }).select('*').single();
    if (res.error) return setErr(res.error.message);
    await ensure(res.data as BillRow);
    bills.reload(); close();
    toast(bill ? 'Guardado.' : `${row.name} está na Casa.`, { ok: true });
  }
  async function archive() {
    await supabase.from('bills').update({ archived: true }).eq('id', bill!.id);
    bills.reload(); close(); nav('/casa'); toast('Arquivada: fica o histórico.');
  }
  const owners: [string | null, string][] = partner ? [[null, 'Dos dois'], [me!.id, 'Minha'], [partner.id, `De ${partner.name}`]] : [];
  return (
    <>
      <form className="form" onSubmit={save}>
        <p className="l">{bill ? bill.name : 'Nova conta'}</p>
        <div className="chips" role="group" aria-label="Tipo">{(Object.keys(KINDS) as BillKind[]).map((k) => <button key={k} type="button" className="press" aria-pressed={kind === k} onClick={() => setKind(k)}>{KINDS[k].label}</button>)}</div>
        <div className="two">
          <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} placeholder={KINDS[kind].label} maxLength={40} /></label>
          <label>Fornecedor<input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="ex.: EDP" maxLength={40} /></label>
        </div>
        <label>Outras palavras na nota (opcional)<input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="ex.: e-redes, luz da praia" maxLength={120} /></label>
        <div className="seg sm" role="group" aria-label="De quanto em quanto tempo">{EVERY.map(([n, l]) => <button key={n} type="button" className="press" aria-pressed={every === n} onClick={() => setEvery(n)}>{l}</button>)}</div>
        <div className="two">
          <label>Dia de pagamento<input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} placeholder="ex.: 12" /></label>
          <label>Valor normal (€)<input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></label>
        </div>
        {KINDS[kind].unit && <div className="seg" role="group" aria-label="Consumo"><button type="button" className="press" aria-pressed={usage} onClick={() => setUsage(true)}>Com consumo ({KINDS[kind].unit === 'm3' ? 'm³' : 'kWh'})</button><button type="button" className="press" aria-pressed={!usage} onClick={() => setUsage(false)}>Só o valor</button></div>}
        <label>{kind === 'seguro' ? 'Renova em' : 'Fidelização até (opcional)'}<input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></label>
        {places.length > 1 && <div className="chips" role="group" aria-label="Que casa">{places.map((h) => <button key={h.id} type="button" className="press" aria-pressed={place === h.id} onClick={() => setPlace(h.id)}>{h.name}</button>)}</div>}
        {owners.length > 0 && <div className="seg" role="group" aria-label="De quem">{owners.map(([id, l]) => <button key={l} type="button" className="press" aria-pressed={owner === id} onClick={() => setOwner(id)}>{l}</button>)}</div>}
        <p className="s">O fornecedor e as palavras servem para a NIKKI reconhecer as despesas desta conta. Com duas contas parecidas (duas luzes da EDP), põe uma palavra que as distinga; se ainda houver dúvida, a NIKKI pergunta.</p>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {bill && <button className="back press" onClick={archive}>Arquivar esta conta</button>}
    </>
  );
}

/** A escolha de uma fatura: que conta, o período (por defeito, o da conta; ou um acerto) e o consumo. */
export interface BillEntry { pick: string | 'none' | null; adj: boolean; from: string; to: string; usage: string; read: '' | 'pdf' | 'foto'; due: string; all?: boolean }
export const billEntry = (): BillEntry => ({ pick: null, adj: false, from: '', to: '', usage: '', read: '', due: '' });

/** Que conta fica: a escolhida, ou a reconhecida com certeza (ou nenhuma). */
export function useBillChoice(cat: string, note: string, amount: number, spent_on: string, f: BillEntry) {
  const { bills, billPayments, homes, on } = useHouse();
  const active = useMemo(() => {
    const gone = new Set(homes.rows.filter((h) => h.archived).map((h) => h.id)); // as contas de casas arquivadas não contam
    return on('casa') ? bills.rows.filter((b) => !b.archived && !(b.home_id && gone.has(b.home_id))) : [];
  }, [on, bills.rows, homes.rows]);
  const m = useMemo(() => matchBill({ note, amount, spent_on, category: cat }, active, billPayments.rows), [note, amount, spent_on, cat, active, billPayments.rows]);
  const show = active.length > 0 && BILL_CATEGORIES.includes(cat);
  const bill = !show || f.pick === 'none' ? null : f.pick ? active.find((b) => b.id === f.pick) ?? null : m.sure;
  // Consumos só nas casas que os acompanham (e nas contas com unidade: água, luz, gás).
  const firstHome = homes.rows.filter((h) => !h.archived).sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0];
  const track = !!bill?.unit && !!homes.rows.find((h) => h.id === (bill.home_id ?? firstHome?.id))?.track_usage;
  return { show, active, m, bill, track, payments: billPayments.rows };
}

export function BillFields({ c, f, set, amount, spent_on }: { c: ReturnType<typeof useBillChoice>; f: BillEntry; set: (f: BillEntry) => void; amount: number; spent_on: string }) {
  if (!c.show) return null;
  const b = c.bill, p = b ? defaultPeriod(b.kind, b.every_months, spent_on) : null;
  const normal = b ? billStats(b, c.payments, todayStr()).typical : null;
  const order = [...(c.m.sure ? [c.m.sure] : c.m.ask), ...c.active.filter((x) => x !== c.m.sure && !c.m.ask.includes(x))];
  // Só as prováveis à vista (a escolhida, ou as que pode ser); as outras a um toque.
  const few = b ? [b] : c.m.ask.length ? c.m.ask : order.slice(0, 3);
  return (
    <div className="form">
      <div className="chips" role="group" aria-label="Conta fixa">
        {(f.all ? order : few).map((x) => <button key={x.id} type="button" className="press" aria-pressed={b?.id === x.id} onClick={() => set({ ...f, pick: x.id })}>{x.name}</button>)}
        {!f.all && order.length > few.length && <button type="button" className="press" onClick={() => set({ ...f, all: true })}>Outra conta</button>}
        <button type="button" className="press" aria-pressed={f.pick === 'none'} onClick={() => set({ ...f, pick: 'none' })}>Não é fixa</button>
      </div>
      {b && p && <>
        {!f.read && <div className="seg sm" role="group" aria-label="Período">
          <button type="button" className="press" aria-pressed={!f.adj} onClick={() => set({ ...f, adj: false })}>{p.from.slice(0, 7) === p.to.slice(0, 7) ? monthName(p.from.slice(0, 7)) : `${monthName(p.from.slice(0, 7)).slice(0, 3)}–${monthName(p.to.slice(0, 7)).slice(0, 3)}`}</button>
          <button type="button" className="press" aria-pressed={f.adj} onClick={() => set({ ...f, adj: true, from: f.from || `${monthKey(addDays(spent_on, -180))}-01`, to: f.to || `${prevMonth(monthKey(spent_on))}-${String(new Date(Number(spent_on.slice(0, 4)), Number(spent_on.slice(5, 7)) - 1, 0).getDate()).padStart(2, '0')}` })}>Acerto</button>
        </div>}
        {(f.adj || f.read) && <div className="two">
          <label>De<input type="date" value={f.from} onChange={(e) => set({ ...f, from: e.target.value })} /></label>
          <label>A<input type="date" value={f.to} onChange={(e) => set({ ...f, to: e.target.value })} /></label>
        </div>}
        {c.track && !f.read && <BillInvoice name={b.name} onRead={(r, source) => set({ ...f, read: source, usage: r.usage !== null ? String(r.usage).replace('.', ',') : f.usage, from: r.from ?? p.from, to: r.to ?? p.to, adj: r.adjustment || f.adj, due: r.dueOn ?? '' })} />}
        {c.track && f.read && <p className="s why"><span className="dot" aria-hidden="true" /><span>Li a fatura{f.from && f.to ? `: ${dt(f.from)} a ${dt(f.to)}` : ''}{f.usage ? `, ${f.usage} ${b.unit === 'm3' ? 'm³' : 'kWh'}` : ''}. Confirma ou corrige.</span></p>}
        {c.track && <label>Consumo ({b.unit === 'm3' ? 'm³' : 'kWh'}){f.read ? '' : ', se não tiveres a fatura à mão'}<input inputMode="decimal" value={f.usage} onChange={(e) => set({ ...f, usage: e.target.value })} placeholder="da fatura" /></label>}
      </>}
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{b
        ? (!f.adj && looksLikeAdjustment(amount, normal) ? `Muito acima do normal (${eur(normal!, 0)} €). Se for um acerto, toca em «Acerto» e escolhe os meses que corrige.` : `Fica na conta ${b.name}${f.adj ? ', repartida pelos meses do acerto' : ''}.`)
        : f.pick === 'none' ? 'Não é uma conta fixa: a NIKKI não volta a perguntar.' : c.m.ask.length ? `É ${c.m.ask.map((x) => x.name).join(' ou ')}? Toca para confirmar.` : 'Se for uma conta fixa, toca nela.'}</span></p>
    </div>
  );
}

/** Grava a fatura ligada à despesa (ou a dispensa, se não é conta fixa). Devolve o erro, se houver. */
export function useSaveBill() {
  const { house } = useSession();
  const { billPayments } = useHouse();
  return async (c: ReturnType<typeof useBillChoice>, f: BillEntry, expense_id: string | null, amount: string, spent_on: string, sign = 1): Promise<string | null> => {
    if (!c.show) return null;
    if (f.pick === 'none' && expense_id) {
      const { error } = await supabase.from('bill_payments').insert({ household_id: house!.id, bill_id: null, expense_id, amount: null, period_from: spent_on, period_to: spent_on });
      billPayments.reload();
      return error?.message ?? null;
    }
    const b = c.bill;
    if (!b) return null;
    const p = f.adj || f.read ? { from: f.from, to: f.to } : defaultPeriod(b.kind, b.every_months, spent_on);
    if (!p.from || !p.to || p.to < p.from) return 'O acerto precisa de um período (de … a …).';
    const usage = f.usage.trim() ? Number(f.usage.replace(/\s/g, '').replace(',', '.')) : null;
    if (usage !== null && !(usage >= 0)) return 'O consumo é um número, por exemplo 248.';
    // O pagamento de uma fatura já lida (débito direto): liga-se a ela, sem criar outra.
    const inv = expense_id && !f.adj ? invoiceToLink(b.id, Math.round(Number(amount) * 100_000), spent_on, c.payments) : null;
    if (inv) {
      const { error } = await supabase.from('bill_payments').update({ expense_id }).eq('id', inv.id);
      billPayments.reload();
      return error?.message ?? null;
    }
    const { error } = await supabase.from('bill_payments').insert({ household_id: house!.id, bill_id: b.id, expense_id, amount: (Number(amount) * sign).toFixed(2), period_from: p.from, period_to: p.to, usage: c.track ? usage : null, adjustment: f.adj, due_on: f.due || null, source: f.read || 'manual' });
    billPayments.reload();
    return error?.message ?? null;
  };
}

/** Paguei (IMI, seguro, outro): fica a despesa em Casa e, se é anual, o prazo do ano seguinte. */
export function PaidSheet({ d }: { d: DeadlineRow }) {
  const { me, partner, house, myShare } = useSession();
  const { deadlines, expenses } = useHouse();
  const { close, toast } = useOverlays();
  const [amt, setAmt] = useState(d.amount ? String(d.amount).replace('.', ',') : '');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const v = parseAmount(amt);
    if (!v) return setErr('Quanto pagaste?');
    const split: Split = partner ? 'shared' : 'mine';
    const { data, error } = await supabase.from('expenses').insert({ household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v, category: 'Casa', spent_on: todayStr(), source: 'deadline', note: d.title.slice(0, 120), split, other_id: partner?.id ?? null, payer_share: partner ? myShare : null }).select('id').single();
    if (error) return setErr(error.message);
    await supabase.from('deadlines').update({ paid_at: new Date().toISOString(), paid_by: me!.id, expense_id: (data as { id: string }).id }).eq('id', d.id);
    if (d.recurrence === 'yearly') await supabase.from('deadlines').insert({ household_id: house!.id, title: d.title, due_on: nextYear(d.due_on), amount: v, recurrence: 'yearly', kind: d.kind, bill_id: d.bill_id, remind_days: d.remind_days ?? 7, created_by: me!.id });
    deadlines.reload(); expenses.reload(); close();
    toast(d.recurrence === 'yearly' ? `${d.title} pago. O próximo fica para ${dt(nextYear(d.due_on))}.` : `${d.title} pago.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{d.title}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor pago" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} /><span className="l">€</span></div>
      {d.kind === 'insurance' && <p className="s">Antes de renovar: pede 2 ou 3 propostas com as mesmas coberturas e leva a melhor à tua seguradora. Se tens crédito, o banco não pode obrigar a que o seguro seja o dele.</p>}
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || `Fica nas despesas de hoje, em Casa${partner ? ', partilhada' : ''}${d.recurrence === 'yearly' ? `, e o prazo passa para ${dt(nextYear(d.due_on))}` : ''}.`}</span></p>
      <button className="btn wide press">Paguei <Icon n="check" s={20} /></button>
    </form>
  );
}

/** Fim de uma fidelização: renegociar, mudar ou deixar seguir. Fica tratado; a nova data, se houver, passa para a conta. */
export function ContractSheet({ d }: { d: DeadlineRow }) {
  const { me } = useSession();
  const { deadlines, bills } = useHouse();
  const { close, toast } = useOverlays();
  const ensure = useBillDeadline();
  const [ends, setEnds] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    await supabase.from('deadlines').update({ paid_at: new Date().toISOString(), paid_by: me!.id }).eq('id', d.id);
    const b = bills.rows.find((x) => x.id === d.bill_id);
    if (b) {
      await supabase.from('bills').update({ contract_ends_on: ends || null }).eq('id', b.id);
      if (ends) await ensure({ ...b, contract_ends_on: ends });
    }
    deadlines.reload(); bills.reload(); close();
    toast(ends ? `Nova fidelização até ${dt(ends)}. A NIKKI avisa um mês antes.` : 'Tratado.', { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{d.title}</p>
      <p className="s">No fim da fidelização podes mudar de operador sem penalização, ou pedir ao atual uma proposta melhor para ficar. Compara pelo preço total, não pelo da promoção.</p>
      <label className="form"><span className="s">Nova fidelização até (se renovaste)</span><input className="field" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></label>
      <button className="btn wide press">Tratado <Icon n="check" s={20} /></button>
    </form>
  );
}
