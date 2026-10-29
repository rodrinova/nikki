import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { shortDate } from '@/lib/admin';
import { dayLabel, todayStr } from '@/lib/dates';
import { fmt, groupOf, nextCheck, summary, trend, type Assessment } from '@/lib/gym';
import { Top } from './Home';

// Ginásio: as avaliações de cada um, com as medidas que escolheu. Só o próprio vê (nem a outra pessoa da casa).
// De cada medida: o último valor, a diferença para a anterior e para a primeira, e a linha. Regras em CALCULOS.md, 14.

const dt = (d: string) => shortDate(`${d}T12:00:00`);
// As que vêm marcadas na primeira vez: as da balança de composição (pela ordem dela).
const START = ['weight', 'muscle', 'bmi', 'water', 'fat', 'physique', 'bmr', 'bone', 'meta_age', 'visceral'];
const unitLabel = (u: string) => (u === '1–9' ? ' (1 a 9)' : u ? ` (${u})` : '');

export function Gym() {
  const { gym } = useHouse();
  const { open } = useOverlays();
  const today = todayStr();
  if (gym.loading) return null;
  const chosen = gym.prefs?.fields ?? [];
  if (!gym.prefs || !chosen.length) return <><Top title="Ginásio" /><p className="s" style={{ fontSize: 'var(--t-m)' }}>As tuas avaliações, com as medidas que escolheres. Só tu vês: nem a outra pessoa da casa.</p><FieldsForm first /></>;
  const fields = gym.fields.filter((f) => chosen.includes(f.key));
  const next = nextCheck(gym.rows, gym.prefs.every_weeks, today);
  const hist = [...gym.rows].sort((a, b) => b.measured_on.localeCompare(a.measured_on));
  return (
    <>
      <Top title="Ginásio" right={<button className="tb press" onClick={() => open(<AssessSheet />)}>Nova</button>} />
      <p className="s">{!next ? 'Ainda sem avaliações. A primeira é o ponto de partida.' : next.late > 0 ? `A próxima avaliação era ${dayLabel(next.due)}.` : `Próxima avaliação: ${dayLabel(next.due)}.`} Só tu vês.</p>
      <div className="gym-grid">{fields.map((f) => {
        const s = summary(gym.rows, f.key), t = s?.sincePrev != null ? trend(s.sincePrev, f) : null;
        return (
          <Link key={f.key} className="tile gym-mini press" to={`/ginasio/${f.key}`} aria-label={`${f.label}: ${s ? fmt(s.last, f.unit) : 'sem valor'}`}>
            <span className="s">{f.label}</span>
            <span className="gym-v">{s ? fmt(s.last, f.unit) : '—'}</span>
            <span className={`gym-d${t ? ` t-${t}` : ''}`}>{s?.sincePrev != null ? <>{s.sincePrev > 0 ? '▲' : s.sincePrev < 0 ? '▼' : '='} {fmt(Math.abs(s.sincePrev), f.unit)}{t && t !== 'same' ? ` · ${t === 'better' ? 'melhor' : 'pior'}` : ''}</> : s ? 'primeira' : 'por medir'}</span>
          </Link>
        );
      })}</div>
      <p className="s">Face à avaliação anterior. Toque numa medida para ver a evolução e comparar com outras.</p>
      <div className="actions"><button className="btn quiet press" onClick={() => open(<FieldsForm />)}>Medidas e lembrete</button></div>
      {hist.length > 0 && <section className="stack" aria-label="Avaliações">
        <span className="s">Avaliações</span>
        <div className="tile card rows">{hist.map((a) => (
          <button key={a.id} className="press" onClick={() => open(<AssessSheet a={a} />)}>
            <span>{dt(a.measured_on)}</span><span className="v s">{Object.values(a.values).filter((v) => v !== null && v !== '').length} medidas<Icon n="chev" s={16} /></span>
          </button>
        ))}</div>
      </section>}
    </>
  );
}

/** Que medidas acompanhar e de quanto em quanto tempo lembrar. */
function FieldsForm({ first }: { first?: boolean }) {
  const { me } = useSession();
  const { gym } = useHouse();
  const { close, toast } = useOverlays();
  const [pick, setPick] = useState<string[]>(gym.prefs?.fields.length ? gym.prefs.fields : START);
  const [weeks, setWeeks] = useState(gym.prefs?.every_weeks ?? 4);
  async function save() {
    if (!pick.length) return toast('Escolhe pelo menos uma medida.');
    const { error } = await supabase.from('gym_prefs').upsert({ profile_id: me!.id, fields: pick, every_weeks: weeks, updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    await gym.reload();
    if (!first) close();
    toast('Guardado.', { ok: true });
  }
  return (
    <div className="form">
      {!first && <p className="l">Medidas e lembrete</p>}
      <span className="s">Que medidas acompanhas</span>
      {[...new Set(gym.fields.map((f) => groupOf(f.sort)))].map((g) => {
        const fs = gym.fields.filter((f) => groupOf(f.sort) === g), all = fs.every((f) => pick.includes(f.key));
        return (
          <div key={g} className="stack">
            <div className="wbar"><span className="s">{g}</span><button type="button" className="tb quiet press" onClick={() => setPick(all ? pick.filter((k) => !fs.some((f) => f.key === k)) : [...new Set([...pick, ...fs.map((f) => f.key)])])}>{all ? 'Nenhuma' : 'Todas'}</button></div>
            <div className="chips wrap" role="group" aria-label={g}>{fs.map((f) => (
              <button key={f.key} type="button" className="press" aria-pressed={pick.includes(f.key)} onClick={() => setPick(pick.includes(f.key) ? pick.filter((k) => k !== f.key) : [...pick, f.key])}>{f.label}</button>
            ))}</div>
          </div>
        );
      })}
      <span className="s">Lembrar a próxima avaliação</span>
      <div className="seg" role="group" aria-label="De quanto em quanto tempo">{[2, 4, 6, 8].map((w) => <button key={w} type="button" className="press" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{w} semanas</button>)}</div>
      <button className="btn wide press" onClick={save}>{first ? 'Começar' : 'Guardar'} <Icon n={first ? 'arrow' : 'check'} s={20} /></button>
    </div>
  );
}

/** Nova avaliação (ou corrigir): o dia e as medidas escolhidas; o valor anterior aparece como pista. */
function AssessSheet({ a }: { a?: Assessment }) {
  const { me } = useSession();
  const { gym } = useHouse();
  const { close, toast } = useOverlays();
  const chosen = gym.prefs?.fields ?? START;
  const extra = a ? Object.keys(a.values).filter((k) => !chosen.includes(k)) : [];
  const fields = gym.fields.filter((f) => chosen.includes(f.key) || extra.includes(f.key));
  const [day, setDay] = useState(a?.measured_on ?? todayStr());
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, a?.values[f.key] != null ? String(a.values[f.key]).replace('.', ',') : ''])));
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const values: Record<string, number> = {};
    for (const f of fields) {
      const t = (v[f.key] ?? '').trim();
      if (!t) continue;
      const n = Number(t.replace(',', '.'));
      if (!(n >= 0) || n > 10_000) return setErr(`${f.label}: escreve um número, por exemplo 78,4.`);
      values[f.key] = n;
    }
    if (!Object.keys(values).length) return setErr('Escreve pelo menos uma medida.');
    const { error } = a ? await supabase.from('gym_assessments').update({ measured_on: day, values }).eq('id', a.id) : await supabase.from('gym_assessments').insert({ profile_id: me!.id, measured_on: day, values });
    if (error) return setErr(error.message);
    await gym.reload(); close();
    toast(a ? 'Avaliação corrigida.' : 'Avaliação guardada. Só tu a vês.', { ok: true });
  }
  async function remove() {
    await supabase.from('gym_assessments').delete().eq('id', a!.id);
    await gym.reload(); close(); toast('Avaliação apagada.');
  }
  return (
    <>
      <form className="form" onSubmit={save} autoComplete="off">
        <p className="l">{a ? `Avaliação de ${dt(a.measured_on)}` : 'Nova avaliação'}</p>
        <label>Dia<input type="date" value={day} max={todayStr()} onChange={(e) => setDay(e.target.value)} /></label>
        <div className="gym-inputs">{fields.map((f) => {
          const s = summary(gym.rows.filter((x) => x.id !== a?.id), f.key);
          return <label key={f.key}>{f.label}{unitLabel(f.unit)}<input inputMode="decimal" value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} placeholder={s ? `antes ${fmt(s.last)}` : ''} /></label>;
        })}</div>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {a && <button className="back press" onClick={remove}>Apagar esta avaliação</button>}
    </>
  );
}

const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)'];

/**
 * Uma medida ao longo do tempo. Sozinha: os valores, com o eixo na unidade da medida. Com outras sobrepostas (até 2):
 * todas em «% de mudança desde a primeira avaliação», num só eixo (unidades diferentes não partilham escala).
 * Tocar no gráfico mostra os valores desse dia; por baixo, a tabela.
 */
export function GymMetric() {
  const { key = '' } = useParams();
  const { gym } = useHouse();
  const [extra, setExtra] = useState<string[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const f = gym.fields.find((x) => x.key === key);
  const chosen = gym.prefs?.fields ?? [];
  const series = useMemo(() => [key, ...extra].map((k) => ({ f: gym.fields.find((x) => x.key === k)!, s: summary(gym.rows, k) })).filter((x) => x.f && x.s), [key, extra, gym.fields, gym.rows]);
  if (gym.loading) return null;
  if (!f) return <Navigate to="/ginasio" replace />;
  const base = series[0]?.s;
  const multi = series.length > 1;
  const dates = [...new Set(series.flatMap((x) => x.s!.points.map((p) => p.on)))].sort();
  const val = (x: (typeof series)[number], d: string) => { const p = x.s!.points.find((q) => q.on === d); return p ? (multi ? (p.v / x.s!.first - 1) * 100 : p.v) : null; };
  const all = series.flatMap((x) => dates.map((d) => val(x, d)).filter((v): v is number => v !== null));
  const W = 340, H = 200, L = 40, R = 46, T = 12, B = 26;
  let lo = Math.min(...all, multi ? 0 : Infinity), hi = Math.max(...all, multi ? 0 : -Infinity);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const x = (i: number) => L + (dates.length > 1 ? (i * (W - L - R)) / (dates.length - 1) : (W - L - R) / 2);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const lab = (v: number) => (multi ? `${v > 0.5 ? '+' : v < -0.5 ? '−' : ''}${Math.abs(Math.round(v))}%` : fmt(v, ''));
  const k = sel ?? dates.length - 1;
  const others = gym.fields.filter((o) => chosen.includes(o.key) && o.key !== key && summary(gym.rows, o.key));
  return (
    <>
      <Top title={f.label} />
      {base ? <>
        <div className="gym-head">
          <span className="gym-v">{fmt(base.last, f.unit)}</span>
          <span className="s">{[base.sincePrev != null ? `${fmt(base.sincePrev, f.unit, true)} desde a anterior` : '', base.points.length > 1 ? `${fmt(base.sinceFirst, f.unit, true)} desde ${dt(base.points[0].on)}` : ''].filter(Boolean).join(' · ')}</span>
        </div>
        {multi && <div className="gym-legend">{series.map((x, j) => <span key={x.f.key}><i style={{ background: VIZ[j] }} />{x.f.label}</span>)}</div>}
        <figure className="gym-chart" aria-label={`${series.map((x) => x.f.label).join(', ')} ao longo do tempo`}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img"
            onPointerMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; let best = 0; dates.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; }); setSel(best); }}
            onPointerLeave={() => setSel(null)}>
            {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="gc-grid" /><text x={L - 6} y={y(t) + 4} className="gc-ax" textAnchor="end">{lab(t)}</text></g>)}
            {multi && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="gc-zero" />}
            {dates.length > 0 && <><text x={x(0)} y={H - 6} className="gc-ax" textAnchor="start">{dt(dates[0])}</text><text x={x(dates.length - 1)} y={H - 6} className="gc-ax" textAnchor="end">{dt(dates[dates.length - 1])}</text></>}
            <line x1={x(k)} x2={x(k)} y1={T} y2={H - B} className="gc-cross" />
            {series.map((ser, j) => {
              const pts = dates.map((d, i) => [i, val(ser, d)] as const).filter((p): p is readonly [number, number] => p[1] !== null);
              const last = pts[pts.length - 1];
              return (
                <g key={ser.f.key}>
                  <path d={pts.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} style={{ stroke: VIZ[j] }} className="gc-line" />
                  {pts.map(([i, v]) => <circle key={i} cx={x(i)} cy={y(v)} r={i === k ? 5 : 3} style={{ fill: VIZ[j] }} className="gc-dot" />)}
                  {multi && last && <text x={x(last[0]) + 6} y={y(last[1]) + 4} className="gc-end">{ser.f.label.split(' ')[0]}</text>}
                </g>
              );
            })}
          </svg>
          <figcaption className="s">{dt(dates[k])}: {series.map((ser) => { const p = ser.s!.points.find((q) => q.on === dates[k]); return p ? `${ser.f.label} ${fmt(p.v, ser.f.unit)}${multi ? ` (${lab((p.v / ser.s!.first - 1) * 100)})` : ''}` : null; }).filter(Boolean).join(' · ')}</figcaption>
        </figure>
        {multi && <p className="s">Com várias medidas, cada linha mostra a mudança desde a primeira avaliação (em %), para se poderem comparar.</p>}
        {others.length > 0 && <section className="stack" aria-label="Sobrepor">
          <span className="s">Sobrepor (até 2)</span>
          <div className="chips wrap" role="group" aria-label="Sobrepor">{others.map((o) => (
            <button key={o.key} type="button" className="press" aria-pressed={extra.includes(o.key)} disabled={!extra.includes(o.key) && extra.length >= 2}
              onClick={() => setExtra(extra.includes(o.key) ? extra.filter((z) => z !== o.key) : [...extra, o.key])}>{o.label}</button>
          ))}</div>
        </section>}
        <details className="gym-table"><summary className="s">Ver os valores</summary>
          <table><thead><tr><th>Dia</th>{series.map((ser) => <th key={ser.f.key}>{ser.f.label}</th>)}</tr></thead>
            <tbody>{[...dates].reverse().map((d) => <tr key={d}><td>{dt(d)}</td>{series.map((ser) => { const p = ser.s!.points.find((q) => q.on === d); return <td key={ser.f.key}>{p ? fmt(p.v, ser.f.unit) : '—'}</td>; })}</tr>)}</tbody></table>
        </details>
      </> : <p className="s">Ainda sem valores desta medida.</p>}
    </>
  );
}
