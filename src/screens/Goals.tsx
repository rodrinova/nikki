import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type GoalRow } from '@/data/house';
import { goalProgress, useWealth, type Wealth } from '@/data/wealth';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { shortDate } from '@/lib/admin';
import { todayStr } from '@/lib/dates';
import { parseAmount, toU } from '@/lib/money';
import { monthsAhead } from '@/lib/wealth';
import { bodyProgress, fmt, summary } from '@/lib/gym';
import { capProgress, capSpent, capStreak, carProgress, carRecent, goalKind, mainGoal, metricRef, suggestCaps, suggestCar, suggestUsage, usageProgress, type Progress, type Suggestion } from '@/lib/goals';
import { CATEGORIES, INVEST, catLabel } from './Money';
import { Top } from './Home';

// Objetivos: limites por categoria, saúde financeira e hábitos da casa (consumos e carro). Criam-se aqui, com
// sugestões da NIKKI tiradas dos vossos números; o principal fica sempre no início. Regras em docs/CALCULOS.md, 13.

const U = 100_000;
const STATE: Record<Progress['state'], string> = { ok: 'no caminho', risk: 'em risco', over: 'passou', done: 'cumprido', wait: 'à espera de dados' };

/** O progresso de um objetivo, medido com os números da casa. */
export function useGoalProgress() {
  const { me } = useSession();
  const { expenses, billPayments, carLogs, gym } = useHouse();
  const casa = useWealth('casa'), eu = useWealth('eu');
  const today = todayStr();
  return (g: GoalRow): Progress => {
    const k = goalKind(g.metric), ref = metricRef(g.metric), target = Number(g.target);
    if (k === 'cap') {
      const p = capProgress(capSpent(expenses.rows, ref, g.owner_id, me!.id, today.slice(0, 7)), toU(target), today);
      const streak = capStreak(expenses.rows, ref, g.owner_id, me!.id, toU(target), today, g.created_at.slice(0, 10));
      return streak ? { ...p, detail: `${p.detail} ${streak} ${streak === 1 ? 'mês' : 'meses'} seguidos dentro do limite.` } : p;
    }
    if (k === 'usage') return usageProgress(billPayments.rows.filter((p) => p.bill_id === ref), target, today);
    if (k === 'body') {
      const f = gym.fields.find((x) => x.key === ref);
      if (!f) return { pct: 0, state: 'wait', label: '—', detail: '' };
      const b = bodyProgress(gym.rows, f, target, g.start_value !== null && g.start_value !== undefined ? Number(g.start_value) : null);
      if (b.last === null) return { pct: 0, state: 'wait', label: '—', detail: 'Ainda sem avaliações com esta medida.' };
      return { pct: b.pct, state: b.done ? 'done' : 'ok', label: `${fmt(b.last, f.unit)} de ${fmt(target, f.unit)}`, detail: g.start_value != null ? `Começou em ${fmt(Number(g.start_value), f.unit)}.` : '' };
    }
    if (k === 'car') return carProgress(carLogs.rows.filter((l) => l.car_id === ref), target, g.start_value !== null && g.start_value !== undefined ? Number(g.start_value) : null, today);
    const w: Wealth = g.owner_id === null ? casa : eu;
    const p = goalProgress(g, w);
    return p ? { pct: p.pct, state: p.pct >= 1 ? 'done' : 'ok', label: p.label, detail: '' } : { pct: 0, state: 'wait', label: '—', detail: 'Ainda sem dados no Património.' };
  };
}

function Bar({ p }: { p: Progress }) {
  return <span className={`gbar st-${p.state}`} aria-hidden="true"><i style={{ width: `${Math.max(2, p.pct * 100)}%` }} /></span>;
}

/** No início: o objetivo principal (o que está pior, ou o de prazo mais perto), sempre à vista. */
export function GoalLine() {
  const { goals, on } = useHouse();
  const prog = useGoalProgress();
  if (!on('objetivos')) return null;
  const list = goals.rows.filter((g) => g.status === 'active').map((g) => ({ g, p: prog(g) }));
  const m = mainGoal(list);
  if (!m) return <Link className="tile goal-line press" to="/objetivos"><span className="st2"><span className="s">Objetivos</span><span>Ainda nenhum. A NIKKI tem umas ideias.</span></span><Icon n="chev" s={16} /></Link>;
  return (
    <Link className="tile goal-line press" to="/objetivos" aria-label={`Objetivo: ${m.g.title}, ${m.p.label}, ${STATE[m.p.state]}`}>
      <span className="st2"><span className="s">Objetivo{list.length > 1 ? ` · mais ${list.length - 1}` : ''}</span><span>{m.g.title}</span>
        <span className="goal-row"><Bar p={m.p} /><span className="s">{m.p.label} · <span className={`st-t st-${m.p.state}`}>{STATE[m.p.state]}</span></span></span></span>
      <Icon n="chev" s={16} />
    </Link>
  );
}

/** As sugestões: categorias que subiram, consumos a subir, carro a gastar mais, e o passo que falta na saúde financeira. */
function useSuggestions(): Suggestion[] {
  const { me } = useSession();
  const { expenses, goals, bills, billPayments, homes, cars, carLogs, on } = useHouse();
  const casa = useWealth('casa');
  const today = todayStr();
  if (!me) return [];
  const have = new Set(goals.rows.filter((g) => g.status === 'active').map((g) => g.metric));
  const out: Suggestion[] = [...suggestCaps(expenses.rows, me.id, today, [INVEST])];
  if (on('casa')) for (const b of bills.rows.filter((x) => !x.archived && x.unit && homes.rows.find((h) => h.id === x.home_id)?.track_usage)) {
    const s = suggestUsage(b, billPayments.rows.filter((p) => p.bill_id === b.id), today); if (s) out.push(s);
  }
  if (on('garagem')) for (const c of cars.rows.filter((x) => !x.archived)) { const s = suggestCar(c, carLogs.rows.filter((l) => l.car_id === c.id), today); if (s) out.push(s); }
  if (on('patrimonio') && casa.goal) out.push({ title: casa.goal.title, metric: casa.goal.metric, target: casa.goal.metric.startsWith('fund:') ? Math.round(casa.goal.target / U) : casa.goal.target, why: 'O passo que falta na saúde financeira da casa.' });
  return out.filter((s) => !have.has(s.metric)).slice(0, 3);
}

export function Goals() {
  const { goals } = useHouse();
  const { open } = useOverlays();
  const prog = useGoalProgress();
  const sug = useSuggestions();
  const add = useAddGoal();
  const active = goals.rows.filter((g) => g.status === 'active');
  const done = goals.rows.filter((g) => g.status === 'done');
  return (
    <>
      <Top title="Objetivos" right={<button className="tb press" onClick={() => open(<GoalSheet />)}>Novo</button>} />
      {active.length ? <div className="stack">{active.map((g) => { const p = prog(g); return (
        <button key={g.id} type="button" className="tile goal-card press" onClick={() => open(<GoalSheet g={g} />)}>
          <span className="goal-top"><span>{g.title}</span><span className={`st-t st-${p.state}`}>{STATE[p.state]}</span></span>
          <span className="goal-row"><Bar p={p} /><span className="s">{p.label}</span></span>
          <span className="s">{[p.detail, `até ${shortDate(g.due_on)}`, g.owner_id ? 'só teu' : 'da casa'].filter(Boolean).join(' · ')}</span>
        </button>
      ); })}</div> : <p className="s" style={{ fontSize: 'var(--t-m)' }}>Poucos de cada vez, com prazo, medidos com os vossos números. Comecem por uma sugestão: é meio caminho andado.</p>}
      {sug.length > 0 && <section className="stack" aria-label="A NIKKI sugere">
        <span className="s">A NIKKI sugere</span>
        <div className="tile card rows">{sug.map((s) => (
          <div key={s.metric}><span className="st2"><span>{s.title}</span><span className="s">{s.why}</span></span><button className="tb press" onClick={() => add(s, goalKind(s.metric) === 'cap' ? 'me' : 'casa')}>Juntar</button></div>
        ))}</div>
      </section>}
      {done.length > 0 && <section className="stack" aria-label="Cumpridos"><span className="s">Cumpridos</span>
        <div className="tile card rows">{done.map((g) => <div key={g.id}><span>{g.title}</span><span className="v s">{shortDate(g.due_on)}</span></div>)}</div></section>}
    </>
  );
}

/** Juntar um objetivo (de uma sugestão ou da folha): o limite sugerido é teu; os outros, da casa. Prazo de 6 meses. */
function useAddGoal() {
  const { me, house } = useSession();
  const { goals } = useHouse();
  const { toast } = useOverlays();
  return async (s: Suggestion, who: 'me' | 'casa', due = monthsAhead(todayStr(), 6)) => {
    const { error } = await supabase.from('goals').insert({ household_id: house!.id, owner_id: who === 'me' ? me!.id : null, title: s.title.slice(0, 80), metric: s.metric, target: s.target, start_value: s.start ?? null, due_on: due, reason: s.why ?? null, created_by: me!.id });
    if (error) return toast(error.message);
    goals.reload(); toast(`${s.title}: a contar a partir de hoje.`, { ok: true });
  };
}

type Kind = 'cap' | 'health' | 'home' | 'body';

/** Novo objetivo ou editar: limite por categoria, saúde financeira ou hábitos da casa (consumo de uma conta, carro). */
function GoalSheet({ g }: { g?: GoalRow }) {
  const { me, partner } = useSession();
  const { goals, bills, homes, cars, carLogs, gym, on } = useHouse();
  const { close, toast } = useOverlays();
  const add = useAddGoal();
  const body = on('ginasio') ? gym.fields.filter((f) => gym.prefs?.fields.includes(f.key)) : [];
  const casa = useWealth('casa');
  const today = todayStr();
  const [kind, setKind] = useState<Kind>(g ? (goalKind(g.metric) === 'cap' ? 'cap' : goalKind(g.metric) === 'health' ? 'health' : goalKind(g.metric) === 'body' ? 'body' : 'home') : 'cap');
  const [cat, setCat] = useState(g && goalKind(g.metric) === 'cap' ? metricRef(g.metric) : 'Restaurantes');
  const [val, setVal] = useState(g ? String(g.target).replace('.', ',') : '');
  const [who, setWho] = useState<'me' | 'casa'>(g ? (g.owner_id ? 'me' : 'casa') : partner ? 'casa' : 'me');
  const [due, setDue] = useState(g?.due_on ?? monthsAhead(today, 6));
  const [pick, setPick] = useState<string>(g?.metric ?? '');
  const [err, setErr] = useState('');
  // Saúde financeira: os quatro passos, com o alvo que o Património calcula.
  const health: Suggestion[] = [
    ...(casa.emergencyTarget ? [{ title: 'Fundo de emergência completo', metric: 'fund:emergency', target: Math.round(casa.emergencyTarget / U), why: '12 meses da despesa média.' }] : []),
    { title: 'Fundo para imprevistos completo', metric: 'fund:cushion', target: Math.round(casa.cushionTarget / U), why: 'Para o que avaria sem avisar.' },
    { title: 'Poupar 20% do que entra', metric: 'savings_rate', target: 20, why: 'Pela média dos meses completos.' },
    { title: `Chegar a ${Math.floor(casa.fm) + 1} meses livres`, metric: 'free_months', target: Math.floor(casa.fm) + 1, why: 'Meses do ano que os investimentos pagam sozinhos.' },
  ];
  // Hábitos: as contas com consumo (nas casas que os acompanham) e os carros com abastecimentos.
  const meters = on('casa') ? bills.rows.filter((b) => !b.archived && b.unit && homes.rows.find((h) => h.id === b.home_id)?.track_usage) : [];
  const fleet = on('garagem') ? cars.rows.filter((c) => !c.archived && carLogs.rows.some((l) => l.car_id === c.id && l.kind === 'fuel')) : [];
  const pickedCar = pick.startsWith('car_l100:') ? fleet.find((c) => c.id === metricRef(pick)) : undefined;
  const recent = pickedCar ? carRecent(carLogs.rows.filter((l) => l.car_id === pickedCar.id), today) : null;
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    let s: Suggestion | undefined;
    if (kind === 'cap') {
      const v = parseAmount(val);
      if (!v) return setErr('Até quanto por mês? (ex.: 200)');
      s = { title: `${catLabel(cat)}: até ${Number(v).toLocaleString('pt-PT')} € por mês`, metric: `category_cap:${cat}`, target: Number(v), why: '' };
    } else if (kind === 'health') {
      s = health.find((h) => h.metric === pick);
      if (!s) return setErr('Qual dos passos?');
    } else if (kind === 'body') {
      const f = body.find((x) => `gym:${x.key}` === pick), t = Number(val.replace(',', '.'));
      if (!f) return setErr('Que medida?');
      if (!(t > 0)) return setErr(`O alvo em ${f.unit || 'valor'}, por exemplo 18.`);
      const now = summary(gym.rows, f.key)?.last ?? null;
      s = { title: `${f.label}: ${fmt(t, f.unit)}`, metric: pick, target: t, start: now, why: '' };
    } else {
      if (pick.startsWith('usage:')) {
        const b = meters.find((x) => x.id === metricRef(pick)), pct = Number(val || '10');
        if (!b || !(pct > 0 && pct < 80)) return setErr('Quanto menos? (ex.: 10%)');
        s = { title: `${b.name}: gastar ${pct}% menos`, metric: pick, target: pct, why: '' };
      } else if (pickedCar) {
        const t = Number(val.replace(',', '.'));
        if (!(t > 2 && t < 30)) return setErr('O alvo em L/100 km, por exemplo 6,5.');
        s = { title: `${pickedCar.name}: ${String(t).replace('.', ',')} L/100 km`, metric: pick, target: t, start: recent !== null ? Math.round(recent * 10) / 10 : null, why: '' };
      } else return setErr('Escolhe a conta ou o carro.');
    }
    if (g) {
      const { error } = await supabase.from('goals').update({ title: s.title.slice(0, 80), metric: s.metric, target: s.target, due_on: due, owner_id: kind === 'cap' && who === 'me' ? me!.id : null }).eq('id', g.id);
      if (error) return setErr(error.message);
      goals.reload(); close(); return toast('Guardado.', { ok: true });
    }
    await add(s, kind === 'cap' ? who : kind === 'body' ? 'me' : 'casa', due); // o corpo é sempre só teu
    close();
  }
  async function status(st: 'done' | 'archived') {
    await supabase.from('goals').update({ status: st }).eq('id', g!.id);
    goals.reload(); close(); toast(st === 'done' ? 'Cumprido. Isto merece um brinde.' : 'Arquivado. Fica para outra altura.', { ok: st === 'done' });
  }
  return (
    <>
      <form className="form" onSubmit={save} autoComplete="off">
        <p className="l">{g ? g.title : 'Novo objetivo'}</p>
        <div className="seg" role="group" aria-label="Tipo">
          <button type="button" className="press" aria-pressed={kind === 'cap'} onClick={() => setKind('cap')}>Limite</button>
          <button type="button" className="press" aria-pressed={kind === 'health'} onClick={() => setKind('health')}>Saúde</button>
          <button type="button" className="press" aria-pressed={kind === 'home'} onClick={() => setKind('home')}>Casa e carro</button>
          {body.length > 0 && <button type="button" className="press" aria-pressed={kind === 'body'} onClick={() => setKind('body')}>Corpo</button>}
        </div>
        {kind === 'cap' && <>
          <div className="chips wrap" role="group" aria-label="Categoria">{CATEGORIES.filter((c) => c !== INVEST).map((c) => <button key={c} type="button" className="press" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
          <label>No máximo, por mês (€)<input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder="ex.: 200" /></label>
          {partner && <div className="seg sm" role="group" aria-label="De quem">
            <button type="button" className="press" aria-pressed={who === 'casa'} onClick={() => setWho('casa')}>Da casa</button>
            <button type="button" className="press" aria-pressed={who === 'me'} onClick={() => setWho('me')}>Só meu</button>
          </div>}
          <p className="s">{who === 'casa' && partner ? 'Conta o valor inteiro das despesas partilhadas nesta categoria.' : 'Conta a tua parte nesta categoria.'} A NIKKI avisa a meio do mês, quando ainda dá para travar.</p>
        </>}
        {kind === 'health' && <div className="tile card rows">{health.map((h) => (
          <button key={h.metric} type="button" className="press" aria-pressed={pick === h.metric} onClick={() => setPick(h.metric)}>
            <span className="st2"><span>{h.title}</span><span className="s">{h.why}</span></span>{pick === h.metric && <Icon n="check" s={18} />}
          </button>
        ))}</div>}
        {kind === 'home' && <>
          {!meters.length && !fleet.length && <p className="s">Ainda não há com que medir: liga os consumos de água, luz e gás numa casa, ou regista abastecimentos com km na Garagem.</p>}
          {(meters.length > 0 || fleet.length > 0) && <div className="chips wrap" role="group" aria-label="O quê">
            {meters.map((b) => <button key={b.id} type="button" className="press" aria-pressed={pick === `usage:${b.id}`} onClick={() => { setPick(`usage:${b.id}`); setVal('10'); }}>{b.name}</button>)}
            {fleet.map((c) => <button key={c.id} type="button" className="press" aria-pressed={pick === `car_l100:${c.id}`} onClick={() => { setPick(`car_l100:${c.id}`); setVal(''); }}>{c.name}</button>)}
          </div>}
          {pick.startsWith('usage:') && <label>Gastar menos (%), face ao mesmo período do ano passado<input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder="10" /></label>}
          {pickedCar && <label>Chegar a (L/100 km){recent !== null ? `; agora ${recent.toFixed(1).replace('.', ',')}` : ''}<input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={recent !== null ? (recent - 0.5).toFixed(1).replace('.', ',') : 'ex.: 6,5'} /></label>}
        </>}
        {kind === 'body' && <>
          <div className="chips wrap" role="group" aria-label="Medida">{body.map((f) => <button key={f.key} type="button" className="press" aria-pressed={pick === `gym:${f.key}`} onClick={() => { setPick(`gym:${f.key}`); setVal(''); }}>{f.label}</button>)}</div>
          {pick.startsWith('gym:') && (() => { const f = body.find((x) => `gym:${x.key}` === pick)!; const now = summary(gym.rows, f.key); return <label>Chegar a{f.unit ? ` (${f.unit})` : ''}{now ? `; agora ${fmt(now.last, f.unit)}` : ''}<input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={f.lower_is_better ? 'ex.: 18' : 'ex.: 35'} /></label>; })()}
          <p className="s">Só tu vês este objetivo. Fica entre ti e a balança.</p>
        </>}
        <label>Até<input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {g && <div className="two-btn"><button className="btn quiet press" onClick={() => status('done')}>Cumprido</button><button className="btn quiet press" onClick={() => status('archived')}>Arquivar</button></div>}
    </>
  );
}
