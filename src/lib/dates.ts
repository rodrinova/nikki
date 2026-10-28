// Datas de calendário locais "YYYY-MM-DD" (Europe/Lisbon no telemóvel). Nunca toISOString() para dias:
// em UTC, depois da meia-noite no verão, o dia sai errado.

export const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayStr = (): string => toDateStr(new Date());

export const parseDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number): string => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};

/** "YYYY-MM" do dia dado. */
export const monthKey = (s: string): string => s.slice(0, 7);

export const daysInMonth = (key: string): number => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** Mês anterior a "YYYY-MM". */
export const prevMonth = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (key: string): string => MONTHS[Number(key.slice(5, 7)) - 1];

/** "hoje", "ontem" ou "27 out". */
export const dayLabel = (s: string, today = todayStr()): string => {
  if (s === today) return 'hoje';
  if (s === addDays(today, -1)) return 'ontem';
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};
