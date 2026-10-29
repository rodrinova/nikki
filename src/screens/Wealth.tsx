import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { store } from '@/lib/store';
import { useSession } from '@/data/session';
import { useHouse, type AssetRow, type GoalRow, type IncomeRow } from '@/data/house';
import { goalProgress, useWealth, type Wealth as W, type WealthView } from '@/data/wealth';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Poster } from '@/ui/Poster';
import { How, Year } from '@/ui/Year';
import { U, eur, parseAmount, toU } from '@/lib/money';
import { monthName, todayStr } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import { KINDS, LEVELS, MILESTONES, WHERE, celebrate, fundCheck, liqOf, nextBadge, vacationUntil, type AssetKind, type FundRole } from '@/lib/wealth';
import { Top } from './Home';

// Património: a saúde financeira da família e quantos meses vive do que tem. Regras em docs/CALCULOS.md, secção 6.

const money = (u: number) => `${eur(u, 0)} €`;
/** Meses livres com uma casa decimal, sempre para baixo (1,97 → 1,9): nunca prometer mais do que há. */
const fm1 = (v: number) => (Math.floor(Math.min(12, v) * 10 + 1e-9) / 10).toFixed(1).replace('.', ',');
const ROLE: Record<FundRole, string> = { emergency: 'Fundo de emergência', cushion: 'Fundo para imprevistos' };
const RETURN: Record<AssetKind, number> = { ordem: 0, remunerada: 2, prazo: 2.5, aforro: 2.5, monetario: 2.5, obrigacoes: 3, fundos: 5, etf: 6, acoes: 7, cripto: 0, ppr: 4, imovel: 4, outro: 0, casa: 0, carro: 0 };
const INCOME: Record<IncomeRow['kind'], [string, number]> = { salario: ['Salário', 14], alimentacao: ['Subsídio de alimentação', 11], complemento: ['Complemento', 12], outro: ['Outro', 12] };

function useOwner() {
  const { me, partner } = useSession();
  return (id: string | null) => (id === null ? (partner ? 'dos dois' : 'da casa') : id === me?.id ? 'teu' : id === partner?.id ? `de ${partner.name}` : '—');
}

export function Wealth() {
  const { partner, house } = useSession();
  const [view, setView] = useState<WealthView>('casa');
  const w = useWealth(view);
  const { open } = useOverlays();
  const [cheer, setCheer] = useState<{ k: string; label: string } | null>(null);
  return (
    <>
      <Top title="Património" right={partner ? (
        <div className="seg sm" role="group" aria-label="Vista">
          <button className="press" aria-pressed={view === 'casa'} onClick={() => { setView('casa'); setCheer(null); }}>Casal</button>
          <button className="press" aria-pressed={view === 'eu'} onClick={() => { setView('eu'); setCheer(null); }}>Eu</button>
        </div>
      ) : null} />
      {house && w.ready && <Celebrations w={w} k={`nikki_cheer_${house.id}_${w.casa ? 'casa' : 'eu'}`} onCheer={setCheer} />}
      <Score w={w} cheer={cheer} />
      <Free w={w} />
      <Steps w={w} />
      <Funds w={w} />
      <Plan w={w} />
      <Goals w={w} />
      <section className="stack" aria-label="Investimentos e contas">
        <div className="wbar"><span className="s">Investimentos e contas</span><button className="tb press" onClick={() => open(<AssetSheet />)}>Juntar</button></div>
        <Assets w={w} />
      </section>
      <section className="stack" aria-label="Rendimentos">
        <div className="wbar"><span className="s">Rendimentos {w.casa ? 'da casa' : 'teus'}</span><button className="tb press" onClick={() => open(<IncomeSheet />)}>Juntar</button></div>
        <Incomes w={w} />
      </section>
      <p className="s">Retornos e valores são os que a casa indica. As sugestões da NIKKI são contas simples, não aconselhamento financeiro.</p>
    </>
  );
}

// O que se diz em voz alta (o cartaz dos fechos) quando se ganha uma conquista inteira.
const WON: Record<string, { lines: [string, string]; band: string }> = {
  cushion: { lines: ['FUNDO PARA', 'IMPREVISTOS.'], band: 'Completo: os imprevistos estão pagos' },
  emergency: { lines: ['FUNDO DE', 'EMERGÊNCIA.'], band: 'Completo: 12 meses de despesa guardados' },
  save20: { lines: ['POUPAR', '20%.'], band: 'Um quinto do que entra fica' },
  free12: { lines: ['UM ANO', 'LIVRE.'], band: 'Os investimentos pagam o ano inteiro' },
};

/**
 * Celebrações desde a última visita (regras em celebrate): uma conquista ganha ou um nível acima abrem o cartaz,
 * um de cada vez; um marco a caminho dá os parabéns, sem cartaz.
 */
function Celebrations({ w, k, onCheer }: { w: W; k: string; onCheer: (s: { k: string; label: string } | null) => void }) {
  const { toast } = useOverlays();
  const [queue, setQueue] = useState<string[]>([]);
  useEffect(() => {
    let prev: { level?: number; p?: Record<string, number> } | null = null;
    try { prev = JSON.parse(store.get(k) ?? 'null'); } catch { prev = null; }
    const gap = (w.emergencyTarget ?? 0) - w.emergency.value;
    const c = celebrate(prev?.p ?? null, w.badges, { emergency: w.plan?.emergency ? gap / w.plan.emergency : null });
    const posters = [...c.won, ...(prev?.level != null && w.score.levelIndex > prev.level ? ['level'] : [])];
    if (c.milestone && !c.won.length) { onCheer(c.milestone); toast(`Parabéns: ${c.milestone.label}.`, { ok: true }); }
    store.set(k, JSON.stringify({ level: w.score.levelIndex, p: Object.fromEntries(w.badges.map((b) => [b.k, b.p])) }));
    if (posters.length) setQueue(posters);
  }, [k, w.badges, w.score.levelIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = queue[0];
  if (!now) return null;
  const next = () => setQueue((q) => q.slice(1));
  if (now === 'level') return <Poster lines={[w.score.level.toUpperCase() + '.', `${w.score.total} PONTOS`]} band="Saúde financeira: subiram de nível" foot={w.score.next ? `Faltam ${w.score.next.need} ${w.score.next.need === 1 ? 'ponto' : 'pontos'} para ${w.score.next.name}.` : 'O nível mais alto.'} share={`Saúde financeira ${w.score.level.toLowerCase()} na NIKKI: ${w.score.total} pontos.`} onClose={next} />;
  const won = WON[now];
  return <Poster key={now} lines={won.lines} band={won.band} foot={`Conquista ${w.badges.filter((b) => b.got).length} de ${w.badges.length}.`} share={`${won.lines.join(' ')} ${won.band}. Na NIKKI.`} onClose={next} />;
}

function Score({ w, cheer }: { w: W; cheer: { k: string; label: string } | null }) {
  const s = w.score;
  return (
    <section className="tile pane hs" aria-label="Saúde financeira">
      <div className="pane-top"><span className="s">Saúde financeira{w.casa ? '' : ' · tu'}</span><span className="lvl">{s.level}</span></div>
      <p className="xl">{s.total}<small>/100</small></p>
      <div className="ladder" role="img" aria-label={`${s.total} pontos de 100: ${s.level}`}>
        {LEVELS.map(([min, name], j) => {
          const max = LEVELS[j + 1]?.[0] ?? 100, f = Math.max(0, Math.min(1, (s.total - min) / (max - min)));
          return <span key={name} style={{ flexGrow: max - min }}><i style={{ width: `${f * 100}%` }} /><b className={j === s.levelIndex ? 'on' : ''}>{name}</b></span>;
        })}
      </div>
      <p className="s">{s.next ? `Faltam ${s.next.need} ${s.next.need === 1 ? 'ponto' : 'pontos'} para ${s.next.name}.` : 'O nível mais alto. Agora é manter.'}</p>
      <Awards w={w} cheer={cheer} />
      <How>
        {s.parts.map((p) => <p key={p.k} className="s">{p.label}: {p.pts} de {p.max}{p.known ? '' : ' (por indicar)'}</p>)}
        <p className="s">Emergência: o fundo face a 12 meses da despesa média. Imprevistos: face a {money(w.cushionTarget)}. Poupança: cheia a partir de 20% do que entra. Meses livres: raiz de meses livres ÷ 12, para o primeiro contar mais.</p>
        <p className="s">Níveis: Frágil até 39 · A construir 40 · Sólida 70 · Folgada 90.</p>
      </How>
    </section>
  );
}

// Conquistas em medalhas: um anel que se fecha com o caminho feito; ao centro, o símbolo ou o número.
const GLYPH: Record<string, ReactNode> = { cushion: <Icon n="coins" s={22} />, emergency: <Icon n="umbrella" s={22} />, save20: '20%', free12: '12' };
const R = 25, C = 2 * Math.PI * R;

function Awards({ w, cheer }: { w: W; cheer: { k: string; label: string } | null }) {
  const [sel, setSel] = useState<string | null>(null);
  const b = w.badges.find((x) => x.k === sel) ?? nextBadge(w.badges);
  const left = (u: number) => money(Math.max(0, u));
  const detail = (k: string, got: boolean): string => {
    const et = w.emergencyTarget;
    if (k === 'cushion') return got ? `Fundo para imprevistos completo: ${money(w.cushion.value)}.` : `Faltam ${left(w.cushionTarget - w.cushion.value)} no fundo para imprevistos.`;
    if (k === 'emergency') {
      if (!et) return 'Conta-se no fim do primeiro mês completo de despesas.';
      return got ? `Fundo de emergência completo: ${money(w.emergency.value)}.` : `${w.emergency.value >= et / 2 ? 'Já vai a meio. ' : ''}Faltam ${left(et - w.emergency.value)} para os 12 meses.`;
    }
    if (k === 'save20') return w.sv?.rate == null ? 'Indica os rendimentos para medir a poupança.' : got ? `Poupam ${Math.round(w.sv.rate * 100)}% do que entra.` : `Hoje ${Math.round(w.sv.rate * 100)}%: faltam ${left(0.2 * w.income - w.sv.surplus)} por mês.`;
    const nm = MILESTONES.free12.find((m) => w.fm / 12 < m.at);
    return got ? 'Os investimentos pagam o ano inteiro.' : `${fm1(w.fm)} de 12 meses livres.${nm ? ` A próxima etapa: ${nm.label}.` : ''}`;
  };
  const won = w.badges.filter((x) => x.got).length;
  return (
    <div className="awards-wrap">
      <div className="pane-top"><span className="s">Conquistas</span><span className="s">{won} de {w.badges.length}</span></div>
      <div className="awards" role="group" aria-label="Conquistas">
        {w.badges.map((x, j) => (
          <button key={x.k} type="button" className={`award press${x.got ? ' got' : ''}${b?.k === x.k ? ' on' : ''}`} aria-pressed={b?.k === x.k} aria-label={`${x.label}: ${x.got ? 'ganha' : `${Math.round(x.p * 100)}%`}`} onClick={() => setSel(x.k)}>
            <span className="medal">
              <svg viewBox="0 0 60 60" aria-hidden="true">
                <circle className="trk" cx="30" cy="30" r={R} />
                {x.p > 0 && <circle className="arc" cx="30" cy="30" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - x.p)} style={{ ['--c' as string]: C, ['--k' as string]: j }} />}
                {!x.got && (MILESTONES[x.k] ?? []).map((m) => <circle key={m.at} className={`mk${x.p >= m.at ? ' on' : ''}`} cx={30 + R * Math.cos(2 * Math.PI * m.at)} cy={30 + R * Math.sin(2 * Math.PI * m.at)} r={2.2} />)}
              </svg>
              <span className="glyph">{GLYPH[x.k]}</span>
              {x.got && <span className="tickm"><Icon n="check" s={10} w={2.6} /></span>}
            </span>
            <span className="al">{x.label}</span>
          </button>
        ))}
      </div>
      {cheer && !sel
        ? <p className="award-say cheer" aria-live="polite"><span>Parabéns</span>{cheer.label[0].toUpperCase() + cheer.label.slice(1)}: uma etapa a caminho de «{w.badges.find((x) => x.k === cheer.k)?.label}».</p>
        : b && <p className="award-say" aria-live="polite"><span>{b.got ? 'Ganha' : sel ? `${Math.round(b.p * 100)}% do caminho` : 'A próxima'} · {b.label}</span>{detail(b.k, b.got)}</p>}
    </div>
  );
}

/** Próximos passos: o que falta, com os pontos que vale. Missões, não sermões. */
function Steps({ w }: { w: W }) {
  const { open, toast } = useOverlays();
  const { house, me } = useSession();
  const { goals } = useHouse();
  const pts = (k: string) => { const p = w.score.parts.find((x) => x.k === k)!; return p.max - p.pts; };
  const items: { t: string; d: string; p: number; go?: () => void }[] = [];
  if (!w.incomeRows.length) items.push({ t: 'Indicar os rendimentos', d: 'Salário, subsídio de alimentação e complementos: para medir a poupança e fazer o plano do mês.', p: pts('savings'), go: () => open(<IncomeSheet />) });
  if (!w.spend) items.push({ t: 'Fechar o primeiro mês de despesas', d: 'A despesa média sai dos meses completos registados. É a base dos fundos e dos meses livres.', p: 0 });
  for (const role of ['emergency', 'cushion'] as FundRole[]) {
    const f = role === 'emergency' ? w.emergency : w.cushion;
    if (!f.list.length) items.push({ t: role === 'emergency' ? 'Dizer onde está o fundo de emergência' : 'Dizer onde está o fundo para imprevistos', d: `Se ainda não existe, a NIKKI sugere guardá-lo ${WHERE[role]}.`, p: pts(role), go: () => open(<ChooseFund role={role} />) });
    for (const a of f.list) if (!a.check.ok) items.push({ t: `«${a.name}» não conta como ${ROLE[role].toLowerCase()}`, d: `${KINDS[a.kind as AssetKind]?.name ?? 'Este tipo'} ${a.check.why}. Melhor ${WHERE[role]}.`, p: 0, go: () => open(<AssetSheet asset={a} />) });
  }
  if (w.emergencyTarget && w.emergency.list.length && w.emergency.value < w.emergencyTarget) items.push({ t: `Faltam ${money(w.emergencyTarget - w.emergency.value)} no fundo de emergência`, d: w.plan?.emergency ? `Com ${money(w.plan.emergency)} por mês, fica completo ${((m) => (m === 1 ? 'no próximo mês' : `daqui a ${m} meses`))(Math.ceil((w.emergencyTarget - w.emergency.value) / w.plan.emergency))}.` : 'O plano do mês diz quanto pôr.', p: pts('emergency') });
  if (w.cushion.list.length && w.cushion.value < w.cushionTarget) items.push({ t: `Faltam ${money(w.cushionTarget - w.cushion.value)} no fundo para imprevistos`, d: 'Para os imprevistos: uma avaria, um eletrodoméstico, uma multa.', p: pts('cushion') });
  if (w.sv && w.sv.rate !== null && w.sv.rate < 0.2) items.push({ t: 'Poupar 20% do que entra', d: `Hoje fica ${Math.round(w.sv.rate * 100)}%. Faltam ${money(Math.max(0, 0.2 * w.income - w.sv.surplus))} por mês.`, p: pts('savings') });
  const has = w.goal && goals.rows.some((g) => g.metric === w.goal!.metric && g.status === 'active' && (g.owner_id === null) === w.casa);
  async function makeGoal() {
    const g = w.goal!;
    const { error } = await supabase.from('goals').insert({ household_id: house!.id, owner_id: w.casa ? null : me!.id, title: g.title, metric: g.metric, target: g.metric.startsWith('fund:') ? (g.target / U).toFixed(2) : g.target, due_on: g.due, created_by: me!.id });
    if (error) toast('Não deu para criar o objetivo.'); else toast('Objetivo criado.', { ok: true });
  }
  if (!items.length && !w.goal) return null;
  return (
    <section className="tile card rows steps2" aria-label="Próximos passos">
      <div><span className="s">Próximos passos</span></div>
      {items.slice(0, 5).map((it) => {
        const body = <><span className="st2"><span>{it.t}</span><span className="s">{it.d}</span></span>{it.p > 0 && <span className="pts">+{it.p}</span>}</>;
        return it.go ? <button key={it.t} className="press" onClick={it.go}>{body}</button> : <div key={it.t}>{body}</div>;
      })}
      {w.goal && !has && <button className="press" onClick={makeGoal}><span className="st2"><span>Criar objetivo: {w.goal.title}</span><span className="s">até {shortDate(w.goal.due)}{w.casa ? ', para a casa' : ', só teu'}. Fica nos Objetivos.</span></span><Icon n="plus" s={18} /></button>}
    </section>
  );
}

/**
 * Meses livres: quantos meses por ano o rendimento passivo de um ano inteiro paga, contados como férias a partir
 * de 1 de janeiro ("podiam estar de férias de janeiro a maio").
 */
function Free({ w }: { w: W }) {
  if (!w.spend) return (
    <section className="tile pane" aria-label="Meses livres" style={{ minHeight: 0 }}>
      <span className="s">Meses do ano pagos pelos investimentos</span>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>A NIKKI conta-os quando houver um mês completo de despesas registado.</p>
    </section>
  );
  const today = todayStr(), v = vacationUntil(w.fm, Number(today.slice(0, 4)));
  const they = w.casa ? 'Podiam' : 'Podias';
  const mon = (d: string) => monthName(d.slice(0, 7));
  const head = v.whole ? `${they} estar de férias o ano inteiro.`
    : !v.until ? 'Ainda não chega para um dia de férias.'
      : v.monthEnd ? (v.until.slice(5, 7) === '01' ? `${they} estar de férias o mês de janeiro inteiro.` : `${they} estar de férias de janeiro a ${mon(v.until)}.`)
        : `${they} estar de férias de 1 de janeiro a ${Number(v.until.slice(8, 10))} de ${mon(v.until)}.`;
  return (
    <section className="tile pane free" aria-label="Meses livres" style={{ minHeight: 0 }}>
      <span className="s">Com o rendimento passivo de um ano inteiro</span>
      <p className="l">{head}</p>
      <Year free={w.fm} label={`${fm1(w.fm)} de 12 meses pagos pelos investimentos`} />
      <p className="free-key" aria-hidden="true"><span><i />de férias</span><span><i />a trabalhar</span></p>
      <p className="s"><span className="big2">{fm1(w.fm)}</span> meses livres por ano · {money(w.passiveYear)} por ano acima da inflação</p>
      <How>
        <p className="s">Os investimentos rendem {money(w.passiveYear)} por ano acima da inflação (o retorno que indicaram, menos 2%). A casa própria e os carros não entram.</p>
        <p className="s">{money(w.passiveYear)} ÷ {money(w.spend.avg)} de despesa média por mês = {fm1(w.fm)} meses. Contados a partir de 1 de janeiro, são as férias que o rendimento de um ano paga.</p>
      </How>
    </section>
  );
}

function FundCard({ w, role }: { w: W; role: FundRole }) {
  const { open } = useOverlays();
  const owner = useOwner();
  const f = role === 'emergency' ? w.emergency : w.cushion;
  const target = role === 'emergency' ? w.emergencyTarget : w.cushionTarget;
  const pct = target ? Math.min(1, f.value / target) : 0;
  return (
    <section className="tile fund" aria-label={ROLE[role]}>
      <div className="pane-top"><span className="s">{ROLE[role]}</span>{target ? <span className="s">{Math.round(pct * 100)}%</span> : null}</div>
      <p className="l">{money(f.value)}{target ? <span className="s"> de {money(target)}</span> : null}</p>
      {target ? <div className="gbar" aria-hidden="true"><i className={pct >= 1 ? 'ok' : ''} style={{ width: `${pct * 100}%` }} /></div> : null}
      <p className="s">{role === 'emergency'
        ? (w.spend ? `12 meses × ${money(w.spend.avg)} de despesa média.` : 'A meta são 12 meses da despesa média, que a NIKKI calcula no fim do primeiro mês completo.')
        : `Para imprevistos: pelo menos ${money(w.cushionTarget)}, disponível no próprio dia.`}</p>
      {f.list.map((a) => (
        <button key={a.id} type="button" className="fund-acc press" onClick={() => open(<AssetSheet asset={a} />)}>
          <span><span>{a.name}</span><span className="s">{KINDS[a.kind as AssetKind]?.name} · {owner(a.owner_id)}</span></span>
          <span className={a.check.ok ? 'v' : 'v warn'}>{a.check.ok ? money(a.mine) : 'não conta'}</span>
        </button>
      ))}
      {!f.list.length && <button className="btn quiet press" style={{ alignSelf: 'flex-start' }} onClick={() => open(<ChooseFund role={role} />)}>Onde está? <Icon n="arrow" s={18} /></button>}
      <p className="s">Onde guardar: {WHERE[role]}.</p>
    </section>
  );
}

function Funds({ w }: { w: W }) {
  return <div className="stack"><FundCard w={w} role="emergency" /><FundCard w={w} role="cushion" /></div>;
}

/** Plano do mês: o que sobra vai para a emergência, depois para os imprevistos, depois para investir. */
function Plan({ w }: { w: W }) {
  const { open } = useOverlays();
  const name = monthName(todayStr().slice(0, 7));
  if (!w.incomeRows.length || !w.spend) return null;
  const p = w.plan, sv = w.sv!;
  const rows: [string, number, FundRole | null][] = [['Fundo de emergência', p?.emergency ?? 0, 'emergency'], ['Fundo para imprevistos', p?.cushion ?? 0, 'cushion'], ['Investir', p?.invest ?? 0, null]];
  return (
    <section className="tile card rows plan" aria-label={`Plano de ${name}`}>
      <div><span className="s">Plano de {name}</span><span className="s">{sv.rate !== null ? `poupam ${Math.round(sv.rate * 100)}%` : ''}</span></div>
      <div><span className="k">Entra, em média</span><span className="v">{money(w.income)}</span></div>
      <div><span className="k">Sai, em média</span><span className="v">− {money(w.spend.avg)}</span></div>
      <div><span>Sobra</span><span className="v">{money(Math.max(0, sv.surplus))}</span></div>
      {sv.surplus <= 0
        ? <div><span className="s">Este mês não sobra: a despesa média passa o que entra. O primeiro passo é a despesa.</span></div>
        : rows.map(([l, v, role]) => (
          <div key={l} className={v > 0 ? 'go' : 'idle'}>
            <span className="k">{l}</span>
            <span className="v">{v > 0 ? money(v) : !role ? '—' : (role === 'emergency' ? (w.emergencyTarget ?? 0) > w.emergency.value : w.cushionTarget > w.cushion.value) ? 'a seguir' : 'completo'}{v > 0 && role && <button className="tb press" onClick={() => open(<PutSheet role={role} amount={v} w={w} />)}>Já pus</button>}</span>
          </div>
        ))}
      <div><How><p className="s">Entra: cada rendimento × as vezes que se recebe por ano ÷ 12 (o salário paga-se 14 vezes). Sai: a despesa média dos meses completos.</p><p className="s">O que sobra vai primeiro para o fundo de emergência até ficar completo, o excedente para o fundo para imprevistos e, com os dois completos, para investir.</p></How></div>
    </section>
  );
}

/** Objetivos do Património, com o progresso de hoje. */
export function GoalsList({ casa, eu }: { casa: W; eu: W }) {
  const { goals } = useHouse();
  const list = goals.rows.filter((g) => g.status === 'active');
  if (!list.length) return null;
  return (
    <div className="tile card rows">{list.map((g: GoalRow) => {
      const pr = goalProgress(g, g.owner_id === null ? casa : eu);
      return (
        <div key={g.id} className="goal2">
          <span className="st2"><span>{g.title}</span><span className="s">até {shortDate(g.due_on)}{g.owner_id ? ' · só teu' : ''}</span></span>
          {pr ? <span className="v"><span className="gbar sm" aria-hidden="true"><i className={pr.pct >= 1 ? 'ok' : ''} style={{ width: `${pr.pct * 100}%` }} /></span>{pr.label}</span> : <span className="v s">em breve</span>}
        </div>
      );
    })}</div>
  );
}

function Goals({ w }: { w: W }) {
  const other = useWealth(w.casa ? 'eu' : 'casa');
  const { goals } = useHouse();
  if (!goals.rows.some((g) => g.status === 'active' && /^(fund:|savings_rate|free_months|score)/.test(g.metric))) return null;
  return <section className="stack" aria-label="Objetivos"><span className="s">Objetivos</span><GoalsList casa={w.casa ? w : other} eu={w.casa ? other : w} /></section>;
}

function Assets({ w }: { w: W }) {
  const { open } = useOverlays();
  const owner = useOwner();
  if (!w.items.length) return <p className="s">Ainda nada. Junta as contas, depósitos e investimentos da casa (e a casa própria, que fica fora das contas).</p>;
  return (
    <div className="tile card rows">{w.items.map((a) => (
      <button key={a.id} className="press" onClick={() => open(<AssetSheet asset={a} />)} style={a.part === 0 ? { opacity: 0.5 } : undefined}>
        <span className="st2"><span>{a.name}</span><span className="s">{KINDS[a.kind as AssetKind]?.name ?? a.kind} · {owner(a.owner_id)}{a.liq !== 'out' ? ` · ${String(a.expected_return).replace('.', ',')}%/ano` : ' · fora das contas'}{a.role ? ` · ${ROLE[a.role].toLowerCase()}` : ''}</span></span>
        <span className="v">{money(a.value)}{a.part > 0 && a.part < 1 ? <span className="s"> · tua parte {money(a.mine)}</span> : null}</span>
      </button>
    ))}</div>
  );
}

function Incomes({ w }: { w: W }) {
  const { open } = useOverlays();
  const { members } = useSession();
  if (!w.incomeRows.length) return <p className="s">Os valores líquidos que entram: salário, subsídio de alimentação e complementos. Servem a poupança e o plano do mês; os fundos medem-se pela despesa.</p>;
  return (
    <div className="tile card rows">{w.incomeRows.map((r) => (
      <button key={r.id} className="press" onClick={() => open(<IncomeSheet income={r} />)}>
        <span className="st2"><span>{r.label || INCOME[r.kind][0]}</span><span className="s">{members.find((m) => m.id === r.profile_id)?.name} · {eur(toU(r.amount), 0)} € × {r.times_per_year}</span></span>
        <span className="v">{money(Math.round((toU(r.amount) * r.times_per_year) / 12))}<span className="s">/mês</span></span>
      </button>
    ))}</div>
  );
}

// ───────────── folhas ─────────────

function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><p className="l">{title}</p>{children}</div>;
}

function AssetSheet({ asset, role: presetRole }: { asset?: AssetRow & { value?: number }; role?: FundRole }) {
  const { me, partner, house } = useSession();
  const { assets, snapshots } = useHouse();
  const { close, toast } = useOverlays();
  const [name, setName] = useState(asset?.name ?? '');
  const [kind, setKind] = useState<AssetKind>((asset?.kind as AssetKind) ?? (presetRole ? 'remunerada' : 'etf'));
  const [owner, setOwner] = useState<string | null>(asset ? asset.owner_id : partner ? null : me!.id);
  const [value, setValue] = useState(asset?.value ? eur(asset.value).replace(/\s/g, '') : '');
  const [ret, setRet] = useState(asset ? String(asset.expected_return).replace('.', ',') : String(RETURN[(presetRole ? 'remunerada' : 'etf')]).replace('.', ','));
  const [role, setRole] = useState<FundRole | null>(asset?.role ?? presetRole ?? null);
  const [err, setErr] = useState('');
  const liq = liqOf(kind);
  const check = role ? fundCheck(kind, role) : null;
  const pickKind = (k: AssetKind) => { setKind(k); if (!asset) setRet(String(RETURN[k]).replace('.', ',')); };

  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const v = parseAmount(value), r = Number(ret.replace(',', '.'));
    if (!name.trim()) return setErr('Dá um nome (ex.: Conta poupança, ETF World).');
    if (!v) return setErr('Indica o valor de hoje.');
    if (!Number.isFinite(r) || r < -20 || r > 30) return setErr('O retorno estimado vai de −20% a 30% por ano.');
    const row = { household_id: house!.id, owner_id: owner, name: name.trim(), kind, expected_return: r, role: liq === 'out' ? null : role, invested: liq !== 'out' };
    let id = asset?.id;
    if (id) { const { error } = await supabase.from('assets').update(row).eq('id', id); if (error) return setErr(error.message); }
    else { const { data, error } = await supabase.from('assets').insert(row).select('id').single(); if (error) return setErr(error.message); id = (data as { id: string }).id; }
    if (!asset || toU(v) !== asset.value) {
      const { error } = await supabase.from('asset_snapshots').upsert({ asset_id: id, household_id: house!.id, on_date: todayStr(), value: v }, { onConflict: 'asset_id,on_date' });
      if (error) return setErr(error.message);
    }
    assets.reload(); snapshots.reload(); close(); toast(asset ? 'Guardado.' : `${name.trim()} juntou-se ao património.`, { ok: true });
  }
  async function archive() {
    const { error } = await supabase.from('assets').update({ archived: true }).eq('id', asset!.id);
    if (error) { toast(error.message); return; }
    assets.reload(); close(); toast('Retirado do património.');
  }
  const owners: [string | null, string][] = [[me!.id, 'Meu'], ...(partner ? [[partner.id, `De ${partner.name}`], [null, 'Dos dois']] as [string | null, string][] : [])];
  return (
    <Sheet title={asset ? asset.name : presetRole ? ROLE[presetRole] : 'Juntar ao património'}>
      <form className="form" onSubmit={save}>
        <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta poupança, ETF World" maxLength={60} /></label>
        <div className="chips" role="group" aria-label="Tipo">{(Object.keys(KINDS) as AssetKind[]).map((k) => <button key={k} type="button" className="press" aria-pressed={kind === k} onClick={() => pickKind(k)}>{KINDS[k].name}</button>)}</div>
        {owners.length > 1 && <div className="seg" role="group" aria-label="De quem">{owners.map(([id, l]) => <button key={l} type="button" className="press" aria-pressed={owner === id} onClick={() => setOwner(id)}>{l}</button>)}</div>}
        <div className="two">
          <label>Valor hoje (€)<input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></label>
          {liq !== 'out' && <label>Retorno estimado (%/ano)<input inputMode="decimal" value={ret} onChange={(e) => setRet(e.target.value)} /></label>}
        </div>
        {liq === 'out' ? <p className="s">Fica registado, mas fora das contas: não rende para pagar a despesa.</p> : <>
          <div className="seg" role="group" aria-label="Papel">
            <button type="button" className="press" aria-pressed={role === null} onClick={() => setRole(null)}>Investimento</button>
            <button type="button" className="press" aria-pressed={role === 'emergency'} onClick={() => setRole('emergency')}>Emergência</button>
            <button type="button" className="press" aria-pressed={role === 'cushion'} onClick={() => setRole('cushion')}>Imprevistos</button>
          </div>
          {check && <p className={check.ok ? 's' : 'err'}>{check.ok ? `Conta como ${ROLE[role!].toLowerCase()}.` : `Não conta como ${ROLE[role!].toLowerCase()}: ${check.why}. Melhor ${WHERE[role!]}.`}</p>}
        </>}
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {asset && <button className="back press" onClick={archive}>Retirar do património</button>}
    </Sheet>
  );
}

function ChooseFund({ role }: { role: FundRole }) {
  const { assets } = useHouse();
  const { open, close, toast } = useOverlays();
  const list = assets.rows.filter((a) => !a.archived && liqOf(a.kind) !== 'out' && !a.role);
  async function pick(a: AssetRow) {
    const { error } = await supabase.from('assets').update({ role }).eq('id', a.id);
    if (error) { toast(error.message); return; }
    assets.reload(); close();
    const c = fundCheck(a.kind, role);
    toast(c.ok ? `${a.name}: ${ROLE[role].toLowerCase()}.` : `${a.name} não conta: ${c.why}.`, { ok: c.ok });
  }
  return (
    <Sheet title={role === 'emergency' ? 'Onde está o fundo de emergência?' : 'Onde está o fundo para imprevistos?'}>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>{role === 'emergency' ? 'Doze meses da despesa média, para um desemprego ou uma doença.' : 'Pelo menos 2 000 € para imprevistos: uma avaria, uma multa, um eletrodoméstico.'} A NIKKI vê pelo tipo se pode contar.</p>
      {list.length > 0 && <div className="tile card rows" style={{ background: 'var(--tile-2)' }}>{list.map((a) => {
        const c = fundCheck(a.kind, role);
        return <button key={a.id} className="press" onClick={() => pick(a)}><span className="st2"><span>{a.name}</span><span className="s">{KINDS[a.kind as AssetKind]?.name} · {c.ok ? 'pode ser' : 'não conta'}</span></span><Icon n="arrow" s={16} /></button>;
      })}</div>}
      <button className="btn wide press" onClick={() => open(<AssetSheet role={role} />)}>Registar a conta do fundo <Icon n="arrow" s={20} /></button>
      <p className="s">Ainda não existe? Guarda-se {WHERE[role]}.</p>
    </Sheet>
  );
}

function PutSheet({ role, amount, w }: { role: FundRole; amount: number; w: W }) {
  const { house } = useSession();
  const { snapshots } = useHouse();
  const { open, close, toast } = useOverlays();
  const [v, setV] = useState(eur(amount).replace(/\s/g, ''));
  const target = (role === 'emergency' ? w.emergency : w.cushion).list.find((a) => a.check.ok);
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = parseAmount(v);
    if (!a || !target) return;
    const { error } = await supabase.from('asset_snapshots').upsert({ asset_id: target.id, household_id: house!.id, on_date: todayStr(), value: ((target.value + toU(a)) / U).toFixed(2) }, { onConflict: 'asset_id,on_date' });
    if (error) { toast(error.message); return; }
    snapshots.reload(); close(); toast(`${ROLE[role]}: mais ${eur(toU(a), 0)} €.`, { ok: true });
  }
  if (!target) return (
    <Sheet title={ROLE[role]}>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Primeiro, diz em que conta está o fundo (uma que conte como {ROLE[role].toLowerCase()}).</p>
      <button className="btn wide press" onClick={() => open(<ChooseFund role={role} />)}>Escolher a conta <Icon n="arrow" s={20} /></button>
    </Sheet>
  );
  return (
    <Sheet title={`Já pus no ${ROLE[role].toLowerCase()}`}>
      <form className="form" onSubmit={save}>
        <label>Quanto (€)<input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></label>
        <p className="s">Soma ao valor de hoje de «{target.name}» ({money(target.value)}).</p>
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
    </Sheet>
  );
}

function IncomeSheet({ income }: { income?: IncomeRow }) {
  const { me, partner, house } = useSession();
  const { incomes } = useHouse();
  const { close, toast } = useOverlays();
  const [who, setWho] = useState(income?.profile_id ?? me!.id);
  const [kind, setKind] = useState<IncomeRow['kind']>(income?.kind ?? 'salario');
  const [amount, setAmount] = useState(income ? String(income.amount).replace('.', ',') : '');
  const [times, setTimes] = useState(income?.times_per_year ?? 14);
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const a = parseAmount(amount);
    if (!a) return setErr('Indica o valor líquido de cada pagamento.');
    const row = { household_id: house!.id, profile_id: who, kind, amount: a, times_per_year: times, updated_at: new Date().toISOString() };
    const { error } = income ? await supabase.from('incomes').update(row).eq('id', income.id) : await supabase.from('incomes').insert(row);
    if (error) return setErr(error.message);
    incomes.reload(); close(); toast('Rendimento guardado.', { ok: true });
  }
  async function remove() {
    const { error } = await supabase.from('incomes').delete().eq('id', income!.id);
    if (error) { toast(error.message); return; }
    incomes.reload(); close(); toast('Rendimento retirado.');
  }
  return (
    <Sheet title={income ? INCOME[income.kind][0] : 'Juntar rendimento'}>
      <form className="form" onSubmit={save}>
        {partner && <div className="seg" role="group" aria-label="De quem"><button type="button" className="press" aria-pressed={who === me!.id} onClick={() => setWho(me!.id)}>Meu</button><button type="button" className="press" aria-pressed={who === partner.id} onClick={() => setWho(partner.id)}>De {partner.name}</button></div>}
        <div className="chips" role="group" aria-label="Tipo">{(Object.keys(INCOME) as IncomeRow['kind'][]).map((k) => <button key={k} type="button" className="press" aria-pressed={kind === k} onClick={() => { setKind(k); if (!income) setTimes(INCOME[k][1]); }}>{INCOME[k][0]}</button>)}</div>
        <label>Valor líquido de cada pagamento (€)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
        <div className="chips" role="group" aria-label="Vezes por ano">{[14, 13, 12, 11].map((n) => <button key={n} type="button" className="press" aria-pressed={times === n} onClick={() => setTimes(n)}>{n}× por ano</button>)}</div>
        <p className="s">{kind === 'salario' ? 'Em Portugal o salário paga-se 14 vezes (com os subsídios de férias e de Natal).' : kind === 'alimentacao' ? 'O subsídio de alimentação costuma vir 11 vezes (não há no mês de férias).' : 'Quantas vezes por ano entra.'}</p>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {income && <button className="back press" onClick={remove}>Retirar este rendimento</button>}
    </Sheet>
  );
}
