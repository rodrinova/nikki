// Contas pequenas do painel de administração. Só contas, datas e módulos: nunca dados de dentro das casas.
import { addDays, toDateStr, weekStart } from './dates';

const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "3 mar" no mesmo ano, "3 mar 2025" noutro. */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

/** Há quanto tempo: "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", "há 2 semanas" ou a data. */
export function ago(iso: string | null, now = new Date()): string {
  if (!iso) return 'nunca';
  const d = new Date(iso), min = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const days = Math.round((Date.parse(toDateStr(now)) - Date.parse(toDateStr(d))) / 86_400_000); // dias de calendário
  if (days === 0) return `há ${Math.floor(min / 60)} h`;
  if (days === 1) return 'ontem';
  if (days < 14) return `há ${days} dias`;
  if (days < 56) return `há ${Math.floor(days / 7)} semanas`;
  return shortDate(iso, now);
}

/** As últimas n semanas (de segunda a domingo), da mais antiga à atual; 0 nas semanas sem registos. */
export function fillWeeks(rows: { week: string; n: number }[], today: string, n = 8): { week: string; n: number }[] {
  const cur = weekStart(today), by = new Map(rows.map((r) => [r.week, Number(r.n)]));
  return Array.from({ length: n }, (_, k) => {
    const week = addDays(cur, -7 * (n - 1 - k));
    return { week, n: by.get(week) ?? 0 };
  });
}

/** Horas → "40 min", "5 h", "2 dias". */
export function hoursLabel(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}
