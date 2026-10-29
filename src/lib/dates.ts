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

/** Mês seguinte a "YYYY-MM". */
export const nextMonth = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Segunda-feira da semana de um dia (em Portugal a semana começa à segunda). */
export const weekStart = (s: string): string => addDays(s, -((parseDate(s).getDay() + 6) % 7));

/** Os 7 dias da semana de um dia, de segunda a domingo. */
export const weekOf = (s: string): string[] => Array.from({ length: 7 }, (_, j) => addDays(weekStart(s), j));

/** As semanas (de segunda a domingo) que cobrem um mês: 4 a 6 linhas de 7 dias. */
export const monthWeeks = (key: string): string[][] => {
  const last = `${key}-${String(daysInMonth(key)).padStart(2, '0')}`;
  const out: string[][] = [];
  for (let d = weekStart(`${key}-01`); d <= last; d = addDays(d, 7)) out.push(weekOf(d));
  return out;
};

/** Iniciais dos dias, de segunda a domingo. */
export const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const weekdayName = (s: string): string => WEEKDAY_NAMES[parseDate(s).getDay()];

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (key: string): string => MONTHS[Number(key.slice(5, 7)) - 1];

/** "hoje", "ontem", "amanhã", "daqui a 3 dias" ou "27 out". */
export const dayLabel = (s: string, today = todayStr()): string => {
  if (s === today) return 'hoje';
  if (s === addDays(today, -1)) return 'ontem';
  if (s === addDays(today, 1)) return 'amanhã';
  for (let n = 2; n <= 6; n++) if (s === addDays(today, n)) return `daqui a ${n} dias`;
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};
