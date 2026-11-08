import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { store } from '@/lib/store';
import { eur } from '@/lib/money';
import { monthName, todayStr } from '@/lib/dates';
import { groceryReport } from '@/lib/grocery';
import type { Unit } from '@/lib/pantry';
import { Icon } from '@/ui/Icon';

// Casa → Supermercado: o relatório dos últimos 6 meses (gasto por mês e por loja, consumo habitual por produto) e os
// conselhos da IA, a partir do resumo (nunca das faturas). O consumo é estimado: as faturas lidas são só uma parte.

interface Tip { title: string; text: string; saving?: number | null }
const money = (u: number) => `${eur(u, 0)} €`;
/** «~14 l», «~4,4 kg», «~3 unidades» (as unidades contam-se inteiras). */
const per = (q: number, unit: Unit) => (unit === 'un' ? `${Math.max(1, Math.round(q))} ${Math.max(1, Math.round(q)) === 1 ? 'unidade' : 'unidades'}` : `${(Math.round(q * 10) / 10).toString().replace('.', ',')} ${unit}`);
const CONF = { baixa: 'Poucos dados: uma primeira ideia', media: 'Estimativa razoável', boa: 'Boa estimativa' } as const;

export function GroceryReport() {
  const { house } = useSession();
  const { expenses, receiptItems } = useHouse();
  const today = todayStr();
  const r = useMemo(() => groceryReport(expenses.rows, receiptItems.rows, today), [expenses.rows, receiptItems.rows, today]);
  const key = `nikki_grocery_tips_${house?.id}_${today.slice(0, 7)}`;
  const [tips, setTips] = useState<Tip[] | null>(() => { try { return JSON.parse(store.get(key) ?? 'null'); } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');
  if (!r) return <p className="s">Ainda sem compras em Supermercado nos últimos 6 meses.</p>;
  const maxM = Math.max(...r.byMonth.map((m) => m.total), 1);
  async function ask() {
    if (!r) return;
    setBusy(true); setWhy('');
    const summary = {
      meses: r.months, gastoPorMes: Math.round(r.perMonth / 100_000), cobertura: Math.round(r.coverage * 100), faturasLidas: r.receipts,
      lojas: r.byStore.slice(0, 6).map((s) => ({ loja: s.store, parte: Math.round(s.share * 100) })),
      produtos: r.products.slice(0, 40).map((p) => ({ produto: p.product, porMes: `${p.perMonth} ${p.unit}`, eurosPorMes: Math.round(p.spendMonth / 100_000) })),
    };
    const { data, error } = await supabase.functions.invoke('grocery-advice', { body: { summary } });
    setBusy(false);
    const d = data as { tips?: Tip[]; error?: string } | null;
    if (error || d?.error || !d?.tips?.length) return setWhy(d?.error ?? 'Não deu para pedir os conselhos agora.');
    setTips(d.tips); store.set(key, JSON.stringify(d.tips));
  }
  return (
    <>
      <div className="swap">
        <p className="xl">{eur(r.perMonth, 0)}<small>€</small></p>
        <p className="s" style={{ marginTop: 8 }}>por mês no supermercado · últimos {Math.round(r.months)} {Math.round(r.months) === 1 ? 'mês' : 'meses'}</p>
      </div>
      <div className={`gr-cover ${r.confidence}`}>
        <span className="gr-bar"><i style={{ width: `${Math.round(r.coverage * 100)}%` }} /></span>
        <span className="s"><b>{Math.round(r.coverage * 100)}%</b> das compras com fatura lida ({r.receipts}) · {CONF[r.confidence]}</span>
      </div>

      <section className="stack" aria-label="Por mês">
        <p className="gr-h">Por mês</p>
        <div className="gr-months">{r.byMonth.map((m) => (
          <span key={m.month}><i style={{ height: `${Math.max(6, Math.round((m.total / maxM) * 100))}%` }} /><b>{eur(m.total, 0)}</b><small>{monthName(m.month).slice(0, 3)}</small></span>
        ))}</div>
      </section>

      <section className="stack" aria-label="Por loja">
        <p className="gr-h">Por loja</p>
        <div className="tile card">{r.byStore.slice(0, 6).map((s) => (
          <div key={s.store} className="gr-row"><span className="st2"><span>{s.store}</span><span className="s">{s.visits} {s.visits === 1 ? 'compra' : 'compras'}</span></span><span className="v">{money(Math.round(s.total / r.months))}<small>/mês</small></span><span className="gr-share"><i style={{ width: `${Math.round(s.share * 100)}%` }} /></span></div>
        ))}</div>
      </section>

      <section className="stack" aria-label="Consumo habitual">
        <p className="gr-h">Consumo habitual <span className="s">por mês, estimado</span></p>
        {r.products.length ? <div className="tile card">{r.products.slice(0, 25).map((p) => (
          <div key={p.product} className="gr-row"><span className="st2"><span>{p.product}</span><span className="s">~{per(p.perMonth, p.unit)} · em {p.buys} {p.buys === 1 ? 'fatura' : 'faturas'}</span></span><span className="v">{p.spendMonth ? money(p.spendMonth) : '—'}</span></div>
        ))}</div> : <p className="s">Junta as faturas das compras grandes (foto ou PDF) e a NIKKI passa a saber o que consomem. As pequenas não fazem falta: a NIKKI estima-as.</p>}
      </section>

      <section className="stack" aria-label="Conselhos">
        <p className="gr-h">Conselhos da IA</p>
        {tips && <div className="gr-tips">{tips.map((t) => (
          <div key={t.title} className="tile card gr-tip"><span className="l">{t.title}</span><span className="s">{t.text}</span>{t.saving ? <span className="pill">~{eur(Math.round(t.saving * 100_000), 0)} €/mês</span> : null}</div>
        ))}</div>}
        {why && <p className="s">{why}</p>}
        <button className="btn quiet wide press" disabled={busy || !r.products.length} onClick={ask}>{busy ? 'A pensar…' : tips ? 'Pedir conselhos novos' : 'Pedir conselhos'} <Icon n="arrow" s={20} /></button>
        <p className="s">A IA só recebe este resumo (gastos, lojas e produtos), nunca as faturas.</p>
      </section>
    </>
  );
}
