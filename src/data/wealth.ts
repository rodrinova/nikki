import { useMemo } from 'react';
import { useSession } from './session';
import { useHouse, type AssetRow, type GoalRow } from './house';
import { monthKey, todayStr } from '@/lib/dates';
import { partOf, toU } from '@/lib/money';
import {
  CUSHION_MIN, EMERGENCY_MONTHS, avgMonthly, badges, freeMonths, fundCheck, healthScore, liqOf, monthPlan, monthlyIncome,
  realReturn, savings, suggestGoal, type FundRole,
} from '@/lib/wealth';

const INVEST = 'Future Me'; // investir não é gasto (o mesmo que Money.INVEST)

export type WealthView = 'casa' | 'eu';
export interface WealthAsset extends AssetRow { value: number; part: number; mine: number; liq: ReturnType<typeof liqOf>; real: number }

/**
 * Tudo o que o Património mostra, para a casa ou só para quem vê. Na vista de uma pessoa entram os ativos dela
 * e a parte dela nos dos dois (a partilha das despesas), a despesa média dela (a parte dela) e os rendimentos dela.
 */
export function useWealth(view: WealthView) {
  const { me, partner, myShare } = useSession();
  const { assets, snapshots, incomes, expenses, monthTotals } = useHouse();
  return useMemo(() => {
    const today = todayStr();
    const solo = !partner;
    const casa = view === 'casa' || solo;
    // Valor de cada ativo: o registo mais recente (desempate pela hora a que foi gravado).
    const latest = new Map<string, { on: string; at: string; v: number }>();
    for (const s of snapshots.rows) {
      const cur = latest.get(s.asset_id);
      if (!cur || s.on_date > cur.on || (s.on_date === cur.on && s.created_at > cur.at)) latest.set(s.asset_id, { on: s.on_date, at: s.created_at, v: toU(s.value) });
    }
    const partOfAsset = (a: AssetRow) => (casa ? 1 : a.owner_id === me?.id ? 1 : a.owner_id === null ? myShare : 0);
    const items: WealthAsset[] = assets.rows.filter((a) => !a.archived).map((a) => {
      const value = latest.get(a.id)?.v ?? 0, part = partOfAsset(a);
      return { ...a, value, part, mine: Math.round(value * part), liq: liqOf(a.kind), real: realReturn(Number(a.expected_return)) };
    });
    const mine = items.filter((a) => a.part > 0);

    // Despesa média: da casa (totais por mês, com as «só minhas» de cada um) ou a parte de quem vê.
    let spend;
    if (casa) spend = avgMonthly(monthTotals.rows, today);
    else {
      const by = new Map<string, number>();
      for (const e of expenses.rows) if (e.category !== INVEST && me) { const k = monthKey(e.spent_on); by.set(k, (by.get(k) ?? 0) + partOf(e, me.id)); }
      spend = avgMonthly([...by].map(([month, total]) => ({ month, total })), today);
    }

    const incomeRows = incomes.rows.filter((r) => casa || r.profile_id === me?.id);
    const income = monthlyIncome(incomeRows.map((r) => ({ amount: toU(r.amount), times_per_year: r.times_per_year })));
    const fund = (role: FundRole) => {
      const list = mine.filter((a) => a.role === role).map((a) => ({ ...a, check: fundCheck(a.kind, role) }));
      return { list, value: list.filter((a) => a.check.ok).reduce((t, a) => t + a.mine, 0) };
    };
    const emergency = fund('emergency'), cushion = fund('cushion');
    const emergencyTarget = spend ? spend.avg * EMERGENCY_MONTHS : null;
    const cushionTarget = Math.round(CUSHION_MIN * (casa ? 1 : myShare));
    const sv = income > 0 && spend ? savings(income, spend.avg) : null;
    const plan = sv ? monthPlan(sv.surplus, (emergencyTarget ?? 0) - emergency.value, cushionTarget - cushion.value) : null;
    const pools = mine.map((a) => ({ value: a.mine, real: a.real, liq: a.liq }));
    const fm = spend ? freeMonths(pools, spend.avg) : 0;
    const passiveYear = pools.filter((p) => p.liq !== 'out').reduce((t, p) => t + p.value * p.real, 0);
    const scoreIn = { emergency: emergency.value, emergencyTarget, cushion: cushion.value, cushionTarget, savingsRate: sv?.rate ?? null, freeMonths: fm };
    const score = healthScore(scoreIn);
    const goal = suggestGoal({ ...scoreIn, plan: plan ?? monthPlan(0, 0, 0) }, score.total, today);
    return {
      casa, solo, items, mine, spend, income, incomeRows, emergency, cushion, emergencyTarget, cushionTarget, sv, plan, fm, passiveYear,
      score, badges: badges(scoreIn), goal, ready: !assets.loading && !snapshots.loading && (!casa || !monthTotals.loading),
    };
  }, [view, me, partner, myShare, assets.rows, assets.loading, snapshots.rows, snapshots.loading, incomes.rows, expenses.rows, monthTotals.rows, monthTotals.loading]);
}

export type Wealth = ReturnType<typeof useWealth>;

/** Progresso de um objetivo do Património (0 a 1), ou null se a métrica não for daqui. */
export function goalProgress(g: GoalRow, w: Wealth): { value: number; pct: number; label: string } | null {
  const target = Number(g.target);
  const v = g.metric === 'fund:emergency' ? w.emergency.value / 100_000
    : g.metric === 'fund:cushion' ? w.cushion.value / 100_000
      : g.metric === 'savings_rate' ? (w.sv?.rate ?? 0) * 100
        : g.metric === 'free_months' ? w.fm
          : g.metric === 'score' ? w.score.total : null;
  if (v === null || !target) return null;
  const pct = Math.max(0, Math.min(1, v / target));
  const label = g.metric.startsWith('fund:') ? `${Math.round(pct * 100)}%` : g.metric === 'free_months' ? `${(Math.floor(v * 10 + 1e-9) / 10).toFixed(1).replace('.', ',')} de ${target}` : `${Math.round(v)} de ${target}`;
  return { value: v, pct, label };
}
