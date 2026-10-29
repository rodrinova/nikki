import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { monthKey, nextMonth, parseDate, prevMonth, todayStr } from '@/lib/dates';
import { store } from '@/lib/store';
import { DEFAULT_MODULES, type ModuleKey } from '@/lib/modules';
import { useLive } from './live';
import { useSession } from './session';
import { toU, type Expense, type Transfer } from '@/lib/money';
import type { CarLog } from '@/lib/garage';
import type { Bill, BillPayment } from '@/lib/home';
import type { Chore, Todo } from '@/lib/chores';
import type { Repeat } from '@/lib/agenda';
import type { HkLog, HkTask } from '@/lib/hk';
import type { Assessment, GymField } from '@/lib/gym';

export interface ExpenseRow extends Expense { created_by: string; note: string | null; created_at: string; car_id?: string | null; source?: string }
export interface TransferRow extends Transfer { id: string; created_by: string }
/** Saldo de abertura do par (vindo da app antiga): amount_a > 0 = profile_a adiantou mais até ao corte. */
export interface OpeningRow { profile_a: string; profile_b: string; cutover: string; amount_a: number | string }
export interface ShopItem { id: string; name: string; aisle: string; done: boolean; done_by: string | null; created_by: string; created_at: string }
export interface InviteRow { id: string; email: string; role: 'admin' | 'member' | 'staff'; token: string; code: string; expires_at: string; accepted_at: string | null }
export interface DeadlineRow { id: string; title: string; due_on: string; amount: string | null; paid_at: string | null; recurrence: 'none' | 'monthly' | 'yearly'; car_id: string | null; bill_id: string | null; home_id?: string | null; kind: 'iuc' | 'insurance' | 'inspection' | 'service' | 'imi' | 'contract' | 'other' | null; remind_days: number }
export interface ChoreRow extends Chore { note: string | null; created_at: string }
export interface ChoreLogRow { id: string; chore_id: string; done_on: string; done_by: string | null; expense_id: string | null; note: string | null; created_at: string }
export interface TodoRow extends Todo { done_by: string | null; created_by: string }
export interface WarrantyRow { id: string; home_id: string | null; item: string; store: string | null; bought_on: string; years: number | string; price: string | null; receipt_path: string | null; archived: boolean; created_at: string }
export interface HomeRow { id: string; household_id: string; name: string; tenure: 'propria' | 'credito' | 'arrendada' | null; imi: string | null; archived: boolean; updated_at: string; track_usage?: boolean }
export interface BillRow extends Bill { owner_id: string | null; home_id: string | null; created_at: string }
export interface CarRow { id: string; owner_id: string | null; name: string; plate: string | null; annual_insurance: number | string; annual_tax: number | string; annual_other: number | string; archived: boolean; created_at: string; registered_on: string | null; insurer: string | null; insurance_renews_on: string | null; tank_litres: number | string | null; energy: 'combustao' | 'eletrico' }
export interface EventRow { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; owner_id: string | null; private: boolean; created_by: string; location: string | null; kind: 'event' | 'birthday'; repeat: Repeat; weekdays: number[] | null; month_mode: 'day' | 'nth'; until_on: string | null; skip_dates: string[] | null; remind_days: number | null }
export interface AssetRow { id: string; owner_id: string | null; name: string; kind: string; expected_return: number | string; role: 'emergency' | 'cushion' | null; archived: boolean; created_at: string }
export interface SnapshotRow { asset_id: string; on_date: string; value: number | string; created_at: string }
export interface IncomeRow { id: string; profile_id: string; kind: 'salario' | 'alimentacao' | 'complemento' | 'outro'; label: string | null; amount: number | string | null; times_per_year: number; mode: 'fixed' | 'log' }
export interface IncomeEntryRow { id: string; income_id: string; received_on: string; amount: number | string; note: string | null; created_at: string }
export interface GoalRow { id: string; owner_id: string | null; title: string; metric: string; target: number | string; start_value: number | string | null; due_on: string; status: string; created_by: string; created_at: string }
export interface ModuleRow { module: ModuleKey; enabled_at: string; enabled_by: string | null }
export interface HkRow { id: string; profile_id: string | null; name: string; weekdays: number[]; start_time: string | null; monthly_pay: number | string | null; pay_day: number | null; pay_nth: number | null; pay_weekday: number | null; pay_remind: number | null; bill_id: string | null; archived: boolean; created_at: string }
export interface HkTaskRow extends HkTask { created_at: string; chore_id?: string | null }
export interface HkLogRow extends HkLog { id: string; done_by: string; created_at: string }
export interface HkMessageRow { id: string; author_id: string; body: string; photo_path?: string | null; created_at: string }
export interface HkPaidRow { hk_id: string; month: string; expense_id: string | null; paid_by: string; created_at: string }
export interface BusyRow { id: string; starts_at: string; ends_at: string | null; all_day: boolean; owner_id: string; repeat?: Repeat; weekdays?: number[] | null; month_mode?: 'day' | 'nth'; until_on?: string | null; skip_dates?: string[] | null }

/**
 * Eventos «só para mim» dos outros, só com a hora (a base nunca devolve o título; a app mostra «Inês tem planos»).
 * Lê de dois meses atrás a seis à frente e volta a ler quando os eventos mudam.
 */
function useBusy(h: string | undefined, events: unknown) {
  const [rows, setRows] = useState<BusyRow[]>([]);
  const load = useCallback(async () => {
    if (!h) { setRows([]); return; }
    const mk = monthKey(todayStr());
    let end = mk;
    for (let k = 0; k < 6; k++) end = nextMonth(end);
    const { data, error } = await supabase.rpc('busy_slots', { h, from_ts: parseDate(`${prevMonth(prevMonth(mk))}-01`).toISOString(), to_ts: parseDate(`${end}-01`).toISOString() });
    if (!error) setRows((data ?? []) as BusyRow[]);
  }, [h]);
  useEffect(() => { load(); }, [load, events]);
  return { rows, reload: load };
}

export interface GymPrefs { fields: string[]; every_weeks: number }

/** O ginásio é de cada pessoa (não da casa): as medidas que existem, as escolhidas e as avaliações, em tempo real. */
function useGym(me: string | undefined) {
  const [fields, setFields] = useState<GymField[]>([]);
  const [prefs, setPrefs] = useState<GymPrefs | null>(null);
  const [rows, setRows] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!me) { setRows([]); setPrefs(null); setLoading(false); return; }
    const [f, p, a] = await Promise.all([
      supabase.from('gym_fields').select('key, label, unit, lower_is_better, sort').order('sort'),
      supabase.from('gym_prefs').select('fields, every_weeks').eq('profile_id', me).maybeSingle(),
      supabase.from('gym_assessments').select('id, measured_on, values').eq('profile_id', me).order('measured_on'),
    ]);
    setFields((f.data ?? []) as GymField[]); setPrefs((p.data ?? null) as GymPrefs | null); setRows((a.data ?? []) as Assessment[]); setLoading(false);
  }, [me]);
  useEffect(() => {
    load();
    if (!me) return;
    const ch = supabase.channel(`nikki-gym-${me}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'nikki', table: 'gym_assessments', filter: `profile_id=eq.${me}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, me]);
  return { fields, prefs, rows, loading, reload: load };
}

/** Despesa da casa por mês (só totais, sem o investimento), dos últimos 13 meses: o Património do casal. */
function useMonthTotals(h: string | null, expenses: unknown) {
  const [rows, setRows] = useState<{ month: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!h) { setRows([]); setLoading(false); return; }
    let k = monthKey(todayStr());
    for (let j = 0; j < 13; j++) k = prevMonth(k);
    const { data, error } = await supabase.rpc('house_month_totals', { h, since: `${k}-01` });
    if (!error) setRows(((data ?? []) as { month: string; total: number | string }[]).map((r) => ({ month: r.month, total: toU(r.total) })));
    setLoading(false);
  }, [h]);
  useEffect(() => { load(); }, [load, expenses]);
  return { rows, loading, reload: load };
}

// Dados da casa atual, partilhados por todos os ecrãs (um só canal de tempo real por tabela).
function useHouseData() {
  const { house, me } = useSession();
  const h = house?.id;
  const modules = useLive<ModuleRow>('household_modules', h, 'module, enabled_at, enabled_by', { column: 'enabled_at' });
  // Módulos ligados. Enquanto carregam, usa os da última vez (guardados no aparelho) ou, na primeira vez, os de origem.
  const cacheKey = `nikki_modules_${h}`;
  useEffect(() => { if (!modules.loading) store.set(cacheKey, modules.rows.map((r) => r.module).join(',')); }, [modules.loading, modules.rows, cacheKey]);
  const cached = store.get(cacheKey);
  const on = useCallback((k: ModuleKey) => (modules.loading
    ? (cached === null ? DEFAULT_MODULES : cached.split(',')).includes(k)
    : modules.rows.some((r) => r.module === k)), [modules.loading, modules.rows, cached]);
  const ph = on('patrimonio') ? h : null; // o Património só se lê com o módulo ligado
  const gh = on('garagem') ? h : null;
  const ch = on('casa') ? h : null;
  const kh = on('housekeeping') ? h : null;
  const d = {
    modules,
    expenses: useLive<ExpenseRow>('expenses', h, 'id, paid_by, other_id, amount, split, payer_share, spent_on, category, created_by, note, created_at, car_id, source', { column: 'spent_on', ascending: false }),
    transfers: useLive<TransferRow>('transfers', h, 'id, from_id, to_id, amount, made_on, created_by', { column: 'made_on', ascending: false }),
    openings: useLive<OpeningRow>('ledger_openings', h, 'profile_a, profile_b, cutover, amount_a'),
    shop: useLive<ShopItem>('shopping_items', h, 'id, name, aisle, done, done_by, created_by, created_at', { column: 'created_at' }),
    deadlines: useLive<DeadlineRow>('deadlines', h, 'id, title, due_on, amount, paid_at, recurrence, car_id, bill_id, home_id, kind, remind_days', { column: 'due_on' }),
    events: useLive<EventRow>('events', h, 'id, title, starts_at, ends_at, all_day, owner_id, private, created_by, location, kind, repeat, weekdays, month_mode, until_on, skip_dates, remind_days', { column: 'starts_at' }),
    goals: useLive<GoalRow>('goals', h, 'id, owner_id, title, metric, target, start_value, due_on, status, created_by, created_at', { column: 'created_at' }),
    assets: useLive<AssetRow>('assets', ph, 'id, owner_id, name, kind, expected_return, role, archived, created_at', { column: 'created_at' }),
    snapshots: useLive<SnapshotRow>('asset_snapshots', ph, 'asset_id, on_date, value, created_at', { column: 'on_date' }),
    incomes: useLive<IncomeRow>('incomes', ph, 'id, profile_id, kind, label, amount, times_per_year, mode', { column: 'created_at' }),
    incomeEntries: useLive<IncomeEntryRow>('income_entries', ph, 'id, income_id, received_on, amount, note, created_at', { column: 'received_on', ascending: false }),
    cars: useLive<CarRow>('cars', gh, 'id, owner_id, name, plate, annual_insurance, annual_tax, annual_other, archived, created_at, registered_on, insurer, insurance_renews_on, tank_litres, energy', { column: 'created_at' }),
    homes: useLive<HomeRow>('homes', ch, 'id, household_id, name, tenure, imi, archived, updated_at, track_usage', { column: 'updated_at' }),
    bills: useLive<BillRow>('bills', ch, 'id, kind, name, provider, keywords, every_months, due_day, expected, unit, contract_ends_on, owner_id, home_id, archived, created_at', { column: 'created_at' }),
    billPayments: useLive<BillPayment>('bill_payments', ch, 'id, bill_id, expense_id, amount, period_from, period_to, usage, adjustment, due_on, source, created_at', { column: 'period_to' }),
    chores: useLive<ChoreRow>('chores', ch, 'id, home_id, kind, title, every_n, every_unit, next_on, assign, turn_id, note, archived, created_at', { column: 'next_on' }),
    choreLogs: useLive<ChoreLogRow>('chore_logs', ch, 'id, chore_id, done_on, done_by, expense_id, note, created_at', { column: 'done_on', ascending: false }),
    warranties: useLive<WarrantyRow>('warranties', ch, 'id, home_id, item, store, bought_on, years, price, receipt_path, archived, created_at', { column: 'bought_on', ascending: false }),
    todos: useLive<TodoRow>('todos', h, 'id, title, owner_id, due_on, done_at, done_by, created_by, created_at', { column: 'created_at' }),
    hk: useLive<HkRow>('housekeeping', kh, 'id, profile_id, name, weekdays, start_time, monthly_pay, pay_day, pay_nth, pay_weekday, pay_remind, bill_id, archived, created_at', { column: 'created_at' }),
    hkTasks: useLive<HkTaskRow>('hk_tasks', kh, 'id, title, repeat, due_on, archived, chore_id, created_at', { column: 'created_at' }),
    hkLog: useLive<HkLogRow>('hk_log', kh, 'id, task_id, done_on, done_by, created_at', { column: 'done_on', ascending: false }),
    hkMessages: useLive<HkMessageRow>('hk_messages', kh, 'id, author_id, body, photo_path, created_at', { column: 'created_at' }),
    hkPaid: useLive<HkPaidRow>('hk_paid', kh, 'hk_id, month, expense_id, paid_by, created_at', { column: 'month' }),
    carLogs: useLive<CarLog>('car_logs', gh, 'id, car_id, logged_on, odometer, litres, full_tank, kind, expense_id, amount, note, created_at', { column: 'logged_on' }),
  };
  const monthTotals = useMonthTotals(ph ?? null, d.expenses.rows);
  const gym = useGym(on('ginasio') ? me?.id : undefined);
  const busy = useBusy(h, d.events.rows);
  // Voltar a ler tudo (puxar para atualizar).
  const { expenses: e, transfers: t, openings: op, shop: s, deadlines: dl, events: ev, modules: mo, goals: go, assets: as, snapshots: sn, incomes: inc, incomeEntries: ie, cars: ca, carLogs: cl, homes: ho, bills: bi, billPayments: bp, chores: chs, choreLogs: chl, warranties: wa, todos: td, hk, hkTasks: hkt, hkLog: hkl, hkMessages: hkm, hkPaid: hkp } = d;
  const reloadAll = useCallback(() => Promise.all([e.reload(), t.reload(), op.reload(), s.reload(), dl.reload(), ev.reload(), mo.reload(), go.reload(), as.reload(), sn.reload(), inc.reload(), ie.reload(), ca.reload(), cl.reload(), ho.reload(), bi.reload(), bp.reload(), chs.reload(), chl.reload(), wa.reload(), td.reload(), hk.reload(), hkt.reload(), hkl.reload(), hkm.reload(), hkp.reload(), busy.reload(), monthTotals.reload()]),
    [e.reload, t.reload, op.reload, s.reload, dl.reload, ev.reload, mo.reload, go.reload, as.reload, sn.reload, inc.reload, ie.reload, ca.reload, cl.reload, ho.reload, bi.reload, bp.reload, chs.reload, chl.reload, wa.reload, td.reload, hk.reload, hkt.reload, hkl.reload, hkm.reload, hkp.reload, busy.reload, monthTotals.reload]);
  return { ...d, busy, monthTotals, gym, on, reloadAll };
}

const Ctx = createContext<ReturnType<typeof useHouseData> | null>(null);
export function HouseProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useHouseData()}>{children}</Ctx.Provider>;
}
export const useHouse = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useHouse fora do HouseProvider');
  return c;
};
