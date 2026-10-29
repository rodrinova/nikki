// «Agora» no início: o que pede atenção, numa lista ordenada por urgência, que cada pessoa pode dispensar.
// Dispensar esconde aquele aviso tal como está: se mudar (outro prazo, mais 50 € nas contas a dois, outro dia),
// a chave muda e volta a aparecer. Fica só neste aparelho (é uma preferência de quem vê). Puro.

export interface NowItem {
  key: string; // estável enquanto o aviso é o mesmo
  rank: number; // 0 = mais urgente
  due?: string; // desempate pela data (YYYY-MM-DD)
  t: string;
  s: string;
  to?: string;
  urgent?: boolean;
}

/** As dispensas: chave → dia em que se dispensou. */
export type Hidden = Record<string, string>;

export function arrange(items: NowItem[], hidden: Hidden): { shown: NowItem[]; hiddenKeys: string[] } {
  const order = [...items].sort((a, b) => a.rank - b.rank || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.t.localeCompare(b.t));
  return { shown: order.filter((i) => !hidden[i.key]), hiddenKeys: order.filter((i) => hidden[i.key]).map((i) => i.key) };
}

/** Esquece as dispensas com mais de `days` dias (para a lista não crescer para sempre). */
export function prune(hidden: Hidden, today: string, days = 60): Hidden {
  const t = new Date(`${today}T12:00:00`).getTime();
  return Object.fromEntries(Object.entries(hidden).filter(([, on]) => (t - new Date(`${on}T12:00:00`).getTime()) / 86_400_000 <= days));
}

export function parseHidden(raw: string | null): Hidden {
  try { const v = JSON.parse(raw ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
