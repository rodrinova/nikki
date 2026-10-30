// Modo de demonstração (VITE_DEMO=1): a app real, com uma base de dados de exemplo em memória.
// Imita só o que a app usa do supabase-js: auth, from().select/insert/update/delete/upsert, rpc e tempo real.
// Respeita as regras de acesso que importam: as despesas «Minha» do outro não aparecem, contas à espera ou em
// pausa não veem casas, e só o Rodrigo (administração da app) chega ao painel, que nunca mostra dados das casas.
import { addDays, monthKey, nextMonth, parseDate, prevMonth, todayStr, toDateStr, weekStart } from './dates';
import { DEFAULT_MODULES } from './modules';
import { nthWeekday } from './agenda';
import { addPeriod } from './chores';

type Row = Record<string, any>;
type Listener = () => void;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));
const R = 'demo-rodrigo', I = 'demo-ines', M = 'demo-maria', H = 'demo-casa';
/** Há n dias (frações = horas), em ISO. */
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// Captura de exemplo para um ticket (um ecrã das compras, desenhado).
const SHOT = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="#0B0B0B"/><rect x="20" y="28" width="90" height="10" rx="3" fill="#9B9B9B"/><rect x="20" y="52" width="150" height="18" rx="4" fill="#F4F4F4"/>' +
  [0, 1, 2, 3, 4, 5].map((k) => `<rect x="20" y="${100 + k * 46}" width="18" height="18" rx="4" fill="none" stroke="#9B9B9B" stroke-width="2"/><rect x="50" y="${104 + k * 46}" width="${150 - k * 14}" height="10" rx="3" fill="${k === 1 ? '#FF7A1F' : '#F4F4F4'}"/><rect x="20" y="${132 + k * 46}" width="260" height="1" fill="#2A2A2A"/>`).join('') + '</svg>');
/** Um talão de exemplo (a garantia da máquina de lavar), desenhado: loja, data, artigo e total. */
const RECEIPT = (bought: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420"><rect width="300" height="420" fill="#FBF8F2"/><g font-family="monospace" fill="#222" font-size="13"><text x="150" y="40" text-anchor="middle" font-size="16">WORTEN</text><text x="150" y="60" text-anchor="middle">Equipamentos para o Lar</text><text x="20" y="100">NIF 503630330</text><text x="20" y="122">Data: ${bought.slice(8, 10)}/${bought.slice(5, 7)}/${bought.slice(0, 4)} 18:22</text><text x="20" y="170">Máquina de lavar 8kg</text><text x="280" y="170" text-anchor="end">429,99</text><text x="20" y="192">Entrega e instalação</text><text x="280" y="192" text-anchor="end">0,00</text><line x1="20" y1="215" x2="280" y2="215" stroke="#222" stroke-dasharray="4 3"/><text x="20" y="240" font-size="15">TOTAL</text><text x="280" y="240" text-anchor="end" font-size="15">429,99 €</text><text x="150" y="300" text-anchor="middle">Garantia: 3 anos</text><text x="150" y="380" text-anchor="middle">Obrigado pela preferência</text></g></svg>`);

// Outras casas e pessoas, só para o painel de administração (nomes e casas de exemplo).
function others(db: Record<string, Row[]>) {
  const p = (id: string, name: string, o: Row) => db.profiles.push({ id, name, email: `${id.slice(5)}@exemplo.pt`, color: '#94B096', request: null, requested_at: null, approved_at: null, approved_via: null, last_seen_at: null, ...o });
  const h = (id: string, name: string, days: number, people: [string, string, number][], mods: [string, number][]) => {
    db.households.push({ id, name, created_at: ago(days) });
    for (const [pid, role, d] of people) db.memberships.push({ household_id: id, profile_id: pid, role, joined_at: ago(d) });
    for (const [m, d] of mods) db.household_modules.push({ household_id: id, module: m, enabled_at: ago(d), enabled_by: people[0][0] });
  };
  p('demo-joana', 'Joana', { status: 'active', created_at: ago(121), requested_at: ago(121), approved_at: ago(120.8), approved_via: 'admin', last_seen_at: ago(2) });
  p('demo-miguel', 'Miguel', { status: 'active', created_at: ago(118), approved_at: ago(118), approved_via: 'invite', last_seen_at: ago(9) });
  h('demo-estrela', 'Casa da Estrela', 120.8, [['demo-joana', 'admin', 120.8], ['demo-miguel', 'member', 118]], [['contas', 120.8], ['compras', 120.8], ['agenda', 120.8], ['casa', 120.8], ['objetivos', 64], ['patrimonio', 41]]);
  p('demo-pedro', 'Pedro', { status: 'active', created_at: ago(62), requested_at: ago(62), approved_at: ago(61.6), approved_via: 'admin', last_seen_at: ago(0.2) });
  h('demo-ourique', 'T1 em Campo de Ourique', 61.6, [['demo-pedro', 'admin', 61.6]], [['compras', 61.6], ['casa', 61.6], ['garagem', 50], ['ginasio', 33]]);
  p('demo-sofia', 'Sofia', { status: 'active', created_at: ago(36), requested_at: ago(36), approved_at: ago(35.9), approved_via: 'admin', last_seen_at: ago(3) });
  p('demo-tiago', 'Tiago', { status: 'active', created_at: ago(30), approved_at: ago(30), approved_via: 'invite', last_seen_at: ago(40) });
  h('demo-jardim', 'Casa do Jardim', 35.9, [['demo-sofia', 'admin', 35.9], ['demo-tiago', 'member', 30]], [['contas', 35.9], ['compras', 35.9], ['agenda', 35.9], ['casa', 35.9]]);
  p('demo-rui', 'Rui', { status: 'paused', created_at: ago(90), requested_at: ago(90), approved_at: ago(89), approved_via: 'admin', last_seen_at: ago(80) });
  h('demo-rui-casa', 'Estúdio do Rui', 89, [['demo-rui', 'admin', 89]], [['compras', 89]]);
  p('demo-bruno', 'Bruno', { status: 'declined', created_at: ago(50), request: { house: 'Teste', note: null }, requested_at: ago(50) });
  p('demo-marta', 'Marta', { status: 'pending', created_at: ago(0.14), request: { house: 'Casa da Graça', note: 'Vivo com o Tomás. Queremos deixar de fazer as contas da casa numa folha de Excel.' }, requested_at: ago(0.12) });
  p('demo-luis', 'Luís', { status: 'pending', created_at: ago(1.2), request: { house: 'Casa de Alvalade', note: null }, requested_at: ago(1.15) });
  p('demo-carla', 'Carla', { status: 'pending', created_at: ago(0.02) });
  const t = (by: string, kind: string, body: string, screen: string, status: string, d: number, reply: string | null = null, shot: string | null = null) =>
    db.tickets.push({ id: uid(), created_by: by, kind, body, screen, shot, status, reply, created_at: ago(d), updated_at: ago(reply ? d / 2 : d) });
  t(I, 'ideia', 'Lembrar a renda no dia 1 de cada mês, já com o valor preenchido.', 'Início', 'feito', 12, 'Feito! Aparece nos avisos da Casa dois dias antes.');
  t(I, 'problema', 'No supermercado, a lista saltou para o topo quando risquei o leite.', 'Compras', 'a ver', 2, null, 'demo-ines/compras.svg');
  t('demo-joana', 'ideia', 'Exportar as despesas do ano para mandar ao contabilista.', 'Dinheiro', 'novo', 1);
  t('demo-pedro', 'ideia', 'Dividir o combustível por quilómetros quando empresto o carro.', 'Garagem', 'novo', 0.25);
  t('demo-sofia', 'problema', 'O código do convite não funcionou à primeira no iPhone.', 'Pessoas', 'feito', 20, 'Corrigido: o código já funciona em minúsculas.');
  t('demo-miguel', 'ideia', 'Registar despesas de viagem noutra moeda.', 'Dinheiro', 'nao', 15, 'Para já não: a NIKKI fica em euros. Fica guardada para mais tarde.');
}

function seed() {
  const today = todayStr(), cur = monthKey(today), day = Number(today.slice(8, 10));
  const db: Record<string, Row[]> = {
    profiles: [
      { id: R, name: 'Rodrigo', color: '#8EA6BD', email: 'rodrigo@exemplo.pt', status: 'active', created_at: ago(210), approved_at: ago(210), approved_via: 'founder', last_seen_at: ago(0), request: null, requested_at: null },
      { id: I, name: 'Inês', color: '#D29B7A', email: 'ines@exemplo.pt', status: 'active', created_at: ago(209), approved_at: ago(209), approved_via: 'invite', last_seen_at: ago(1), request: null, requested_at: null },
      { id: M, name: 'Maria', color: '#94B096', email: 'maria@exemplo.pt', status: 'active', created_at: ago(69), approved_at: ago(69), approved_via: 'invite', last_seen_at: ago(0.1), request: null, requested_at: null },
    ],
    households: [{ id: H, name: 'A nossa casa', children: 0, created_at: ago(210) }],
    memberships: [{ household_id: H, profile_id: R, role: 'admin', joined_at: ago(210) }, { household_id: H, profile_id: I, role: 'member', joined_at: ago(209) }, { household_id: H, profile_id: M, role: 'staff', joined_at: ago(69) }],
    household_modules: [['contas', 210], ['compras', 210], ['agenda', 210], ['casa', 210], ['housekeeping', 70], ['garagem', 45], ['ginasio', 120], ['objetivos', 20], ['patrimonio', 120], ['eventos', 30]].map(([m, d]) => ({ household_id: H, module: m, enabled_at: ago(d as number), enabled_by: R })),
    share_ratios: [{ household_id: H, profile_a: R, profile_b: I, ratio_a: 0.5 }],
    invites: [], tickets: [], goals: [], assets: [], asset_snapshots: [], incomes: [], cars: [], car_logs: [], homes: [], bills: [], bill_payments: [], chores: [], chore_logs: [], todos: [], warranties: [], calendar_links: [], housekeeping: [], hk_tasks: [], hk_log: [], hk_messages: [], hk_paid: [], gym_fields: [], gym_prefs: [], gym_assessments: [],
    expenses: [], transfers: [], deadlines: [], shopping_items: [], events: [],
  };
  others(db);
  // Património de exemplo: fundos (um deles num ETF, que não conta como maneio), investimentos e a casa própria.
  const asset = (name: string, kind: string, owner: string | null, value: number, ret: number, role: string | null = null) => {
    const id = uid();
    db.assets.push({ id, household_id: H, owner_id: owner, name, kind, expected_return: ret, role, invested: !['casa', 'carro'].includes(kind), archived: false, created_at: ago(200) });
    db.asset_snapshots.push({ asset_id: id, household_id: H, on_date: addDays(today, -9), value: value.toFixed(2), created_at: ago(9) });
    // Valores dos meses anteriores (a evolução do património): a crescer, com os altos e baixos da bolsa.
    for (let m = 1; m <= 8; m++) {
      const v = value * (1 - (kind === 'casa' ? 0.004 : 0.035) * m) * (['etf', 'acoes'].includes(kind) ? 1 + 0.03 * Math.sin(m * 1.7) : 1);
      db.asset_snapshots.push({ asset_id: id, household_id: H, on_date: addDays(today, -9 - 30 * m), value: v.toFixed(2), created_at: ago(9 + 30 * m) });
    }
  };
  asset('Conta à ordem', 'ordem', null, 1300, 0, 'cushion');
  asset('Certificados de Aforro', 'aforro', null, 9000, 2.5, 'emergency');
  asset('Conta poupança', 'remunerada', R, 4200, 1.5, 'emergency');
  asset('ETF S&P 500', 'etf', I, 14500, 6, 'cushion');
  asset('ETF MSCI World', 'etf', R, 38000, 6);
  asset('Ações', 'acoes', R, 5300, 7);
  asset('PPR', 'ppr', I, 11200, 4);
  asset('Casa', 'casa', null, 280000, 0);
  const inc = (who: string, kind: string, amount: string, times: number, label: string | null = null) => db.incomes.push({ id: uid(), household_id: H, profile_id: who, kind, label, amount, times_per_year: times, mode: 'fixed', created_at: ago(100) });
  inc(R, 'salario', '1500.00', 14); inc(R, 'alimentacao', '176.00', 11);
  inc(I, 'salario', '1350.00', 14); inc(I, 'alimentacao', '165.00', 11); inc(I, 'complemento', '120.00', 14, 'Isenção de horário');
  // Um rendimento irregular «pelos registos»: as explicações do Rodrigo, uma entrada por mês, valores diferentes.
  { const id = uid(); db.incomes.push({ id, household_id: H, profile_id: R, kind: 'complemento', label: 'Explicações', amount: null, times_per_year: 12, mode: 'log', created_at: ago(200) });
    db.income_entries = [];
    let k = monthKey(today); for (const v of ['180.00', '240.00', '120.00', '200.00', '160.00', '220.00']) { k = prevMonth(k); db.income_entries.push({ id: uid(), household_id: H, income_id: id, received_on: `${k}-28`, amount: v, note: null, created_by: R, created_at: `${k}-28T18:00:00Z` }); } }
  // Três meses: dois completos (o "normal") e o corrente até hoje. Valores de exemplo.
  const plan: [number, string, string, string, string | null, number | null, string][] = [
    // dia, categoria, valor, pagou, com quem (ou de quem), parte de quem pagou, nota
    [1, 'Casa', '840.00', R, I, 0.5, 'Renda'], [3, 'Supermercado', '96.40', I, R, 0.5, 'Pingo Doce'], [5, 'Contas', '92.15', I, R, 0.5, 'EDP'],
    [6, 'Carros', '67.10', R, null, null, 'Galp · Golf'], [8, 'Restaurantes', '46.80', R, I, 0.5, 'Jantar fora'], [9, 'Supermercado', '124.30', R, I, 0.5, 'Continente'],
    [11, 'Lazer', '13.99', I, R, 0.5, 'Netflix'], [12, 'Saúde', '18.40', I, null, null, 'Farmácia'], [14, 'Contas', '41.90', R, I, 0.5, 'Internet'],
    [15, 'Supermercado', '88.75', I, R, 0.5, 'Mercado'], [17, 'Lazer', '49.95', I, null, null, 'Zara'], [18, 'Restaurantes', '32.40', I, R, 0.5, 'Almoço'],
    [20, 'Carros', '58.30', I, null, null, 'Galp · Mini'], [21, 'Supermercado', '112.60', R, I, 0.5, 'Lidl'], [23, 'Saúde', '24.00', R, I, null, 'Farmácia para a Inês'],
    [24, 'Restaurantes', '61.20', R, I, 0.5, 'Sushi'], [26, 'Supermercado', '74.90', I, R, 0.5, 'Pingo Doce'], [28, 'Lazer', '22.00', R, null, null, 'Cinema'],
  ];
  const m2 = prevMonth(prevMonth(cur)), m1 = prevMonth(cur);
  // Garagem: o Golf (do Rodrigo) e o Mini (da Inês); cada abastecimento do plano fica ligado ao carro, com km e litros.
  const GOLF = 'demo-golf', MINI = 'demo-mini';
  db.cars.push({ id: GOLF, household_id: H, owner_id: R, name: 'Golf', plate: '12-AB-34', annual_insurance: '380.00', annual_tax: '148.37', annual_other: '60.00', archived: false, created_at: `${m2}-01T09:00:00Z`, registered_on: `2019-${addDays(today, 3).slice(5, 7)}-12`, insurer: 'Fidelidade', insurance_renews_on: `2024-${addDays(today, 24).slice(5)}`, tank_litres: '50.0', energy: 'combustao' });
  db.cars.push({ id: MINI, household_id: H, owner_id: I, name: 'Mini', plate: '56-CD-78', annual_insurance: '320.00', annual_tax: '98.00', annual_other: '0.00', archived: false, created_at: `${m2}-01T09:00:00Z`, registered_on: null, insurer: null, insurance_renews_on: null, tank_litres: '40.0', energy: 'combustao' });
  const fuel: Record<string, [string, number, number][]> = { // mês → carro, odómetro, litros (depósito cheio)
    [m2]: [[GOLF, 41200, 38.2], [MINI, 18300, 33.1]], [m1]: [[GOLF, 41820, 39.1], [MINI, 18820, 32.5]], [cur]: [[GOLF, 42450, 25.1], [MINI, 19310, 31.0]],
  };
  const carLog = (car: string, on: string, odometer: number | null, litres: number | null, full: boolean, expense: string, by: string, amount: string) =>
    db.car_logs.push({ id: uid(), household_id: H, car_id: car, logged_on: on, odometer, litres: litres?.toFixed(2) ?? null, full_tank: full, kind: 'fuel', expense_id: expense, amount, created_by: by, created_at: `${on}T12:00:00Z` });
  for (const [key, k, until] of [[m2, 0.94, 31], [m1, 1.0, 31], [cur, 1.08, day]] as const) {
    for (const [d, cat, v, paid, other, share, note] of plan) {
      if (d > until) continue;
      const amount = (Math.round(Number(v) * k * 100) / 100).toFixed(2);
      const split = other == null ? 'mine' : share == null ? 'other' : 'shared';
      const id = uid(), on = `${key}-${String(d).padStart(2, '0')}`;
      const car = cat === 'Carros' ? (note.includes('Golf') ? GOLF : MINI) : null;
      db.expenses.push({ id, household_id: H, created_by: paid, paid_by: paid, other_id: other, amount, split, payer_share: share, spent_on: on, category: cat, note, car_id: car, source: 'manual', created_at: `${on}T12:00:00Z` });
      if (car) { const f = fuel[key].find((x) => x[0] === car)!; carLog(car, on, f[1], f[2], true, id, paid, amount); }
    }
  }
  // Um abastecimento parcial do Golf a meio do mês passado (entra no troço seguinte).
  { const id = uid(), on = `${m1}-18`; db.expenses.push({ id, household_id: H, created_by: R, paid_by: R, other_id: null, amount: '25.00', split: 'mine', payer_share: null, spent_on: on, category: 'Carros', note: 'Combustível · Golf', car_id: GOLF, source: 'manual', created_at: `${on}T18:00:00Z` }); carLog(GOLF, on, 42130, 14.4, false, id, R, '25.00'); }
  // Eventos: um batizado daqui a três semanas (a meio da preparação) e o casamento, já arquivado.
  { const BAT = 'demo-batizado', CAS = 'demo-casamento', on = addDays(today, 22);
    db.occasions = [
      { id: BAT, household_id: H, name: 'Batizado da Matilde', kind: 'batizado', on_date: on, place: 'Quinta do Lago, Sintra', budget: '1500.00', archived: false, created_by: I, created_at: ago(40) },
      { id: CAS, household_id: H, name: 'O nosso casamento', kind: 'casamento', on_date: addDays(today, -400), place: null, budget: '18000.00', archived: true, created_by: R, created_at: ago(700) },
    ];
    const ex = (id: string, occ: string, d: string, amount: string, cat: string, note: string, by: string, split: string) => db.expenses.push({ id, household_id: H, created_by: by, paid_by: by, other_id: split === 'mine' ? null : by === R ? I : R, amount, split, payer_share: split === 'shared' ? 0.5 : null, spent_on: d, category: cat, note, car_id: null, source: 'manual', occasion_id: occ, created_at: `${d}T12:00:00Z` });
    ex(uid(), BAT, addDays(today, -12), '300.00', 'Restaurantes', 'Sinal da quinta', I, 'shared');
    ex(uid(), BAT, addDays(today, -5), '64.90', 'Casa', 'Vestido de batizado', I, 'mine');
    ex(uid(), BAT, addDays(today, -2), '38.50', 'Casa', 'Lembranças', R, 'shared');
    ex(uid(), BAT, addDays(today, -40), '400.00', 'Lazer', 'Fotógrafo (sinal)', R, 'shared');
    ex(uid(), BAT, addDays(today, -70), '180.00', 'Casa', 'Convites e decoração', R, 'shared');
    for (const [d, v, c, n] of [[-430, '4500.00', 'Restaurantes', 'Quinta (2.ª prestação)'], [-410, '1800.00', 'Lazer', 'Fotografia'], [-402, '950.00', 'Roupa', 'Fato']] as const) ex(uid(), CAS, addDays(today, d), v, c, n, R, 'shared');
    let g = 0;
    db.occasion_guests = ([['Avós Fernandes', 2, 'yes', 'Família'], ['Avó Lurdes', 1, 'yes', 'Família'], ['Tios do Porto', 4, 'pending', 'Família'], ['Padrinhos', 2, 'yes', 'Família'], ['Marta e Rui', 3, 'maybe', 'Amigos'], ['Sofia', 1, 'no', 'Amigos'], ['Equipa da Inês', 2, 'pending', 'Trabalho']] as const)
      .map(([name, people, rsvp, grp]) => ({ id: `demo-g${++g}`, household_id: H, occasion_id: BAT, name, people, rsvp, grp, note: null, created_at: ago(30 - g) }));
    db.occasion_items = ([['todo', 'Marcar a cerimónia na igreja', addDays(today, -6), true], ['todo', 'Confirmar o número de pessoas à quinta', addDays(today, -1), false], ['todo', 'Escolher o menu', addDays(today, 7), false], ['buy', 'Velas e toalha de batismo', addDays(today, 14), false], ['buy', 'Lembranças (40)', null, true]] as const)
      .map(([kind, title, due_on, done], j) => ({ id: `demo-i${j}`, household_id: H, occasion_id: BAT, kind, title, due_on, done, done_by: done ? I : null, created_at: ago(20 - j) }));
    db.occasion_vendors = [
      { id: 'demo-v1', household_id: H, occasion_id: BAT, name: 'Quinta do Lago', service: 'Almoço', contact: '219 000 000', total: '1050.00', paid: '300.00', created_at: ago(15) },
      { id: 'demo-v2', household_id: H, occasion_id: BAT, name: 'Pastelaria Doce', service: 'Bolo', contact: null, total: '120.00', paid: '0.00', created_at: ago(10) },
    ];
    db.occasion_gifts = [{ id: 'demo-p1', household_id: H, occasion_id: BAT, from_name: 'Avós Fernandes', amount: '200.00', item: null, thanked: false, created_at: ago(3) }];
  }
  // Histórico mais antigo do Golf, com um abastecimento esquecido: o troço até ao de há dois meses fica a rever
  // (1100 km com 38 L) e a Garagem propõe «Esqueci-me».
  { const m3 = prevMonth(m2), m4 = prevMonth(m3);
    for (const [on, odo, l, v] of [[`${m4}-05`, 39500, 38.0, '64.20'], [`${m3}-02`, 40100, 37.5, '63.40']] as const) db.car_logs.push({ id: uid(), household_id: H, car_id: GOLF, logged_on: on, odometer: odo, litres: l.toFixed(2), full_tank: true, kind: 'fuel', expense_id: null, amount: v, created_by: R, created_at: `${on}T12:00:00Z` }); }
  // Oficina e portagens do Golf (as portagens entram no €/km, não nos fixos) e um elétrico dos dois, com carregamentos.
  const extra = (car: string, on: string, kind: string, amount: string, note: string, by: string, odometer: number | null, split: 'mine' | 'shared') => {
    const id = uid();
    db.expenses.push({ id, household_id: H, created_by: by, paid_by: by, other_id: split === 'shared' ? (by === R ? I : R) : null, amount, split, payer_share: split === 'shared' ? 0.5 : null, spent_on: on, category: 'Carros', note: `${note} · ${car === GOLF ? 'Golf' : 'Zoe'}`, car_id: car, source: 'manual', created_at: `${on}T17:00:00Z` });
    db.car_logs.push({ id: uid(), household_id: H, car_id: car, logged_on: on, odometer, litres: null, full_tank: true, kind, expense_id: id, amount, note, created_by: by, created_at: `${on}T17:00:00Z` });
  };
  extra(GOLF, `${m1}-09`, 'service', '286.00', 'Pneus da frente', R, 41950, 'mine');
  extra(GOLF, `${m2}-14`, 'toll', '18.40', 'Via Verde', R, null, 'mine');
  extra(GOLF, `${m1}-22`, 'toll', '12.75', 'Via Verde', R, null, 'mine');
  const ZOE = 'demo-zoe';
  db.cars.push({ id: ZOE, household_id: H, owner_id: null, name: 'Zoe', plate: '90-EF-12', annual_insurance: '290.00', annual_tax: '0.00', annual_other: '0.00', archived: false, created_at: `${m2}-01T09:00:00Z`, registered_on: null, insurer: null, insurance_renews_on: null, tank_litres: null, energy: 'eletrico' });
  for (const [on, v, odo, by] of [[`${m2}-05`, '9.80', 30110, I], [`${m2}-21`, '11.20', 30690, R], [`${m1}-07`, '10.40', 31230, I], [`${m1}-24`, '12.10', 31840, R], [`${cur}-${String(Math.min(day, 6)).padStart(2, '0')}`, '8.90', 32190, I]] as const)
    extra(ZOE, on, 'charge', v, by === R ? 'Ionity' : 'Casa', by, odo, 'shared');
  for (const [d, v] of [[`${m2}-28`, '411.80'], [`${m1}-28`, '438.10'], [`${cur}-${String(Math.min(day, 15)).padStart(2, '0')}`, '363.00']])
    db.transfers.push({ id: uid(), household_id: H, from_id: I, to_id: R, amount: v, made_on: d, created_by: I });
  for (const [n, a] of [['Bananas', 'Fruta e legumes'], ['Tomate cherry', 'Fruta e legumes'], ['Espinafres', 'Fruta e legumes'], ['Peito de frango', 'Talho e peixe'], ['Salmão', 'Talho e peixe'], ['Iogurte grego', 'Laticínios e ovos'], ['Leite meio-gordo', 'Laticínios e ovos'], ['Café em grão', 'Mercearia'], ['Aveia', 'Mercearia']])
    db.shopping_items.push({ id: uid(), household_id: H, name: n, aisle: a, done: false, done_by: null, done_at: null, created_by: R, created_at: today + 'T08:00:00Z' });
  // Casa (arrendada): luz, água, internet e telemóveis da MEO, renda e seguro, com dois anos de faturas (as mais antigas
  // sem despesa). A luz subiu de preço; uma despesa da EDP deste mês e uma da MEO do mês passado ficam por confirmar.
  db.homes.push({ id: 'demo-casa', household_id: H, name: 'Casa', tenure: 'arrendada', imi: null, archived: false, updated_at: ago(30), track_usage: true });
  db.homes.push({ id: 'demo-praia', household_id: H, name: 'Praia', tenure: 'propria', imi: '180.00', archived: false, updated_at: ago(29), track_usage: false });
  const bill = (id: string, o: Row) => db.bills.push({ id, household_id: H, home_id: 'demo-casa', owner_id: null, archived: false, keywords: null, unit: null, contract_ends_on: null, every_months: 1, expected: null, created_by: R, created_at: ago(30), ...o });
  bill('demo-luz', { kind: 'luz', name: 'Luz', provider: 'EDP', keywords: 'e-redes', due_day: 5, unit: 'kWh', expected: '92.00' });
  bill('demo-agua', { kind: 'agua', name: 'Água', provider: 'EPAL', every_months: 2, due_day: 18, unit: 'm3', expected: '38.00' });
  bill('demo-net', { kind: 'internet', name: 'Internet e TV', provider: 'MEO', due_day: 14, expected: '41.90', contract_ends_on: addDays(today, 25) });
  bill('demo-tlm', { kind: 'telemovel', name: 'Telemóveis', provider: 'MEO', due_day: 14, expected: '24.00' });
  bill('demo-renda', { kind: 'renda', name: 'Renda', provider: 'Senhorio', due_day: 1, expected: '840.00' });
  bill('demo-seguro', { kind: 'seguro', name: 'Seguro da casa', provider: 'Tranquilidade', every_months: 12, expected: '210.00', contract_ends_on: addDays(today, 40) });
  // O T1 em Arroios, arquivado (mudaram-se há dois anos): fica a renda desse tempo.
  db.homes.push({ id: 'demo-arroios', household_id: H, name: 'T1 em Arroios', tenure: 'arrendada', imi: null, archived: true, updated_at: ago(400) });
  bill('demo-arenda', { home_id: 'demo-arroios', kind: 'renda', name: 'Renda · Arroios', provider: 'Senhorio', keywords: 'arroios', due_day: 1, expected: '650.00' });
  // A casa da praia (própria, dos dois): luz e água baixas fora do verão, condomínio, seguro e IMI em duas prestações.
  bill('demo-pluz', { home_id: 'demo-praia', kind: 'luz', name: 'Luz · Praia', provider: 'EDP', keywords: 'praia', due_day: 9, unit: 'kWh', expected: '22.00' });
  bill('demo-pagua', { home_id: 'demo-praia', kind: 'agua', name: 'Água · Praia', provider: 'SMAS', keywords: 'praia', every_months: 2, unit: 'm3', expected: '19.00' });
  bill('demo-pcond', { home_id: 'demo-praia', kind: 'condominio', name: 'Condomínio · Praia', provider: 'Administração', keywords: 'praia', due_day: 8, expected: '35.00' });
  bill('demo-pseg', { home_id: 'demo-praia', kind: 'seguro', name: 'Seguro · Praia', provider: 'Fidelidade', keywords: 'praia', every_months: 12, expected: '140.00' });
  const recent = (() => { let k = cur; for (let j = 0; j < 12; j++) k = prevMonth(k); return k; })(); // antes disto: o ano anterior
  const endOf = (k: string) => `${k}-${String(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
  const bp = (bill_id: string, amount: number, from: string, to: string, usage: number | null, expense_id: string | null = null) =>
    db.bill_payments.push({ id: uid(), household_id: H, bill_id, expense_id, amount: amount.toFixed(2), period_from: from, period_to: to, usage, adjustment: false, due_on: null, source: 'manual', created_by: R, created_at: `${addDays(to, 5)}T12:00:00Z` });
  const KWH = [520, 470, 400, 330, 280, 260, 300, 320, 280, 330, 420, 510];
  { let k = prevMonth(m2); const ks: string[] = []; for (let j = 0; j < 22; j++) { ks.unshift(k); k = prevMonth(k); }
    ks.forEach((k, j) => {
      const late = k >= recent, kwh = KWH[Number(k.slice(5, 7)) - 1];
      if (j < ks.length - 1) bp('demo-luz', kwh * (late ? 0.205 : 0.17) + 9, `${k}-01`, endOf(k), kwh); // julho: a da EDP de agosto
      bp('demo-net', late ? 41.9 : 39.9, `${k}-01`, endOf(k), null);
      bp('demo-tlm', 24, `${k}-01`, endOf(k), null);
      bp('demo-renda', late ? 840 : 800, `${k}-01`, endOf(k), null);
    });
    // Água de dois em dois meses, até junho (julho e agosto: a fatura paga no mês passado).
    let e = prevMonth(prevMonth(prevMonth(m1)));
    for (let j = 0; j < 11; j++) { const st = prevMonth(e); bp('demo-agua', 14 * (st >= recent ? 2.7 : 2.55) + 2.2, `${st}-01`, endOf(e), 14); e = prevMonth(prevMonth(e)); } }
  { let k = prevMonth(cur); for (let j = 0; j < 24; j++) {
    const summer = ['06', '07', '08', '09'].includes(k.slice(5, 7)), kwh = summer ? 160 : 45;
    bp('demo-pluz', kwh * (k >= recent ? 0.205 : 0.17) + 7, `${k}-01`, endOf(k), kwh);
    bp('demo-pcond', k >= recent ? 35 : 32, `${k}-01`, endOf(k), null);
    if (j % 2 === 0) { const st = prevMonth(k), m3 = summer ? 9 : 2; bp('demo-pagua', m3 * 2.4 + 6, `${st}-01`, endOf(k), m3); }
    k = prevMonth(k);
  } }
  { let k = cur; for (let j = 0; j < 25; j++) k = prevMonth(k); for (let j = 0; j < 12; j++) { bp('demo-arenda', 650, `${k}-01`, endOf(k), null); k = prevMonth(k); } }
  bp('demo-pseg', 132, addDays(today, -500 - 365), addDays(today, -501), null);
  bp('demo-pseg', 140, addDays(today, -500), addDays(today, -500 + 364), null);
  bp('demo-seguro', 195, addDays(today, 40 - 730), addDays(today, 39 - 365), null);
  bp('demo-seguro', 210, addDays(today, 40 - 365), addDays(today, 39), null);
  // As despesas do plano: EDP, Internet e Renda ligadas às contas (a EDP deste mês fica por confirmar).
  for (const e of db.expenses) {
    const k = e.spent_on.slice(0, 7);
    if (e.note === 'EDP' && k !== cur) { const kwh = Math.round((Number(e.amount) - 9) / 0.205); bp('demo-luz', Number(e.amount), `${prevMonth(k)}-01`, endOf(prevMonth(k)), kwh, e.id); }
    if (e.note === 'Internet') bp('demo-net', Number(e.amount), `${k}-01`, endOf(k), null, e.id);
    if (e.note === 'Renda') bp('demo-renda', Number(e.amount), `${k}-01`, endOf(k), null, e.id);
  }
  { // Água de dois meses (paga no mês passado) e os telemóveis: o do mês antes ligado; o do mês passado (31,50 €, com
    // chamadas a mais) fica por confirmar, porque tanto pode ser dos telemóveis como da internet, ambos da MEO.
    const water = uid(), on = `${m1}-18`;
    db.expenses.push({ id: water, household_id: H, created_by: I, paid_by: I, other_id: R, amount: '40.10', split: 'shared', payer_share: 0.5, spent_on: on, category: 'Contas', note: 'EPAL', car_id: null, source: 'manual', created_at: `${on}T12:00:00Z` });
    bp('demo-agua', 40.1, `${prevMonth(prevMonth(m1))}-01`, endOf(prevMonth(m1)), 14, water);
    for (const [k, link, v] of [[m2, true, '24.00'], [m1, false, '31.50']] as const) {
      const id = uid(), d = `${k}-14`;
      db.expenses.push({ id, household_id: H, created_by: R, paid_by: R, other_id: I, amount: v, split: 'shared', payer_share: 0.5, spent_on: d, category: 'Contas', note: 'MEO', car_id: null, source: 'manual', created_at: `${d}T12:00:00Z` });
      if (link) bp('demo-tlm', 24, `${k}-01`, endOf(k), null, id);
    }
  }
  db.deadlines.push({ id: uid(), household_id: H, title: 'Fim da fidelização · Internet e TV MEO', due_on: addDays(today, 25), amount: null, paid_at: null, recurrence: 'none', car_id: null, bill_id: 'demo-net', kind: 'contract', remind_days: 30 });
  // Tarefas (à vez, sempre a mesma, quem pegar), manutenção e coisas a fazer hoje; garantias com um talão.
  const ch = (o: Row) => db.chores.push({ id: uid(), household_id: H, home_id: 'demo-casa', kind: 'task', every_n: 1, every_unit: 'week', assign: 'anyone', turn_id: null, note: null, archived: false, created_by: R, created_at: ago(40), ...o });
  ch({ title: 'Mudar os lençóis', every_n: 2, next_on: today, assign: 'rotate', turn_id: R });
  ch({ title: 'Regar as plantas', every_n: 3, every_unit: 'day', next_on: addDays(today, -1) });
  ch({ title: 'Pôr o lixo e a reciclagem', next_on: today, assign: 'fixed', turn_id: I });
  ch({ title: 'Limpar a casa de banho', next_on: addDays(today, 1), assign: 'rotate', turn_id: I });
  ch({ kind: 'maintenance', title: 'Revisão da caldeira ou esquentador', every_unit: 'year', next_on: addDays(today, 9), note: 'Segurança e consumo; melhor antes do inverno.' });
  ch({ kind: 'maintenance', title: 'Lavar o filtro do exaustor', every_n: 3, every_unit: 'month', next_on: addDays(today, -2) });
  ch({ kind: 'maintenance', title: 'Testar os detetores de fumo', every_n: 6, every_unit: 'month', next_on: addDays(today, 60) });
  ch({ home_id: 'demo-praia', title: 'Abrir e arejar a casa da praia', every_unit: 'month', next_on: addDays(today, 12), assign: 'rotate', turn_id: R });
  for (const c of db.chores) db.chore_logs.push({ id: uid(), household_id: H, chore_id: c.id, done_on: addDays(c.next_on, -14), done_by: c.turn_id === R ? I : R, expense_id: null, note: null, created_at: ago(14) });
  const td = (title: string, owner_id: string | null, due_on: string | null) => db.todos.push({ id: uid(), household_id: H, title, owner_id, due_on, done_at: null, done_by: null, created_by: R, created_at: ago(1) });
  td('Ligar ao senhorio por causa do estore', R, today);
  td('Levantar a encomenda nos CTT', I, today);
  td('Marcar o dentista', null, addDays(today, -1));
  const wr = (o: Row) => db.warranties.push({ id: uid(), household_id: H, home_id: 'demo-casa', store: null, price: null, receipt_path: null, years: '3.0', archived: false, created_by: R, created_at: ago(30), ...o });
  wr({ item: 'Máquina de lavar roupa', store: 'Worten', bought_on: addDays(today, 40 - 3 * 365 - 1), price: '429.99', receipt_path: `${H}/talao-maquina.svg` });
  wr({ item: 'Frigorífico', store: 'Radio Popular', bought_on: addDays(today, -420), price: '689.00' });
  wr({ item: 'Sofá', store: 'IKEA', bought_on: addDays(today, -1300), price: '799.00' });
  db.deadlines.push({ id: uid(), household_id: H, home_id: 'demo-praia', title: 'IMI · Praia · novembro', due_on: `${today.slice(0, 4)}-11-30` >= today ? `${today.slice(0, 4)}-11-30` : `${Number(today.slice(0, 4)) + 1}-11-30`, amount: '90.00', paid_at: null, recurrence: 'yearly', car_id: null, bill_id: null, kind: 'imi', remind_days: 30 });
  db.deadlines.push({ id: uid(), household_id: H, home_id: 'demo-praia', title: 'IMI · Praia · maio', due_on: `${Number(today.slice(0, 4)) + (today.slice(5) > '05-31' ? 1 : 0)}-05-31`, amount: '90.00', paid_at: null, recurrence: 'yearly', car_id: null, bill_id: null, kind: 'imi', remind_days: 30 });
  db.deadlines.push({ id: uid(), household_id: H, title: 'Seguro da casa (Tranquilidade)', due_on: addDays(today, 40), amount: '210.00', paid_at: null, recurrence: 'yearly', car_id: null, bill_id: 'demo-seguro', kind: 'insurance', remind_days: 30 });
  // Prazos dos carros: o IUC do Golf no fim do mês da matrícula e o seguro a renovar (avisam um mês antes).
  const eom = (d: string) => `${d.slice(0, 7)}-${String(new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
  db.deadlines.push({ id: uid(), household_id: H, title: 'Revisão do Mini', due_on: addDays(today, 2), amount: '210.00', paid_at: null, recurrence: 'yearly', car_id: MINI, kind: 'service', remind_days: 7 });
  db.deadlines.push({ id: uid(), household_id: H, title: 'IUC do Golf', due_on: eom(addDays(today, 3)), amount: '148.37', paid_at: null, recurrence: 'yearly', car_id: GOLF, kind: 'iuc', remind_days: 30 });
  db.deadlines.push({ id: uid(), household_id: H, title: 'Seguro do Golf (Fidelidade)', due_on: addDays(today, 24), amount: '380.00', paid_at: null, recurrence: 'yearly', car_id: GOLF, kind: 'insurance', remind_days: 30 });
  db.deadlines.push({ id: uid(), household_id: H, title: 'Inspeção do Golf', due_on: addDays(today, 47), amount: '35.00', paid_at: null, recurrence: 'yearly', car_id: GOLF, kind: 'inspection', remind_days: 7 });
  // Agenda: da casa (sem dono), de cada um e dois «só para mim» (o outro vê «Rodrigo tem planos»).
  // Com repetições (pilates e treino semanais, jantar na 1.ª sexta), sítios e um aniversário com aviso.
  const ev = (o: number, hm: string, title: string, owner: string | null, priv = false, x: Row = {}) => {
    const d = parseDate(addDays(today, o)), [h, m] = hm.split(':').map(Number);
    d.setHours(h, m);
    const end = new Date(d.getTime() + (x.mins ?? 60) * 60_000);
    delete x.mins;
    db.events.push({ id: uid(), household_id: H, title, starts_at: d.toISOString(), ends_at: end.toISOString(), all_day: false, owner_id: owner, private: priv, created_by: owner ?? R, created_at: today, location: null, kind: 'event', repeat: 'none', weekdays: null, month_mode: 'day', until_on: null, skip_dates: [], remind_days: null, ...x });
  };
  const wd = (o: number) => ((parseDate(addDays(today, o)).getDay() + 6) % 7) + 1;
  ev(-6, '15:00', 'Dentista', I, false, { location: 'Clínica Dentária da Graça, Lisboa' }); ev(-4, '20:00', 'Jantar fora', null, false, { mins: 120 });
  ev(-21, '18:45', 'Pilates', I, false, { repeat: 'weekly', weekdays: [wd(0), wd(2)], location: 'Estúdio Pilates Graça, Lisboa' });
  ev(-30, '19:30', 'Treino', R, false, { repeat: 'weekly', weekdays: [1, 3, 5], location: 'Holmes Place Saldanha' });
  ev(1, '10:00', 'Reunião de equipa', I, true); ev(1, '13:00', 'Almoço com a Rita', R, true, { location: 'Time Out Market, Lisboa' });
  { const d = parseDate(addDays(today, 4)); db.events.push({ id: uid(), household_id: H, title: 'Aniversário da mãe', starts_at: new Date(1966, d.getMonth(), d.getDate()).toISOString(), ends_at: null, all_day: true, owner_id: null, private: false, created_by: R, created_at: today, location: null, kind: 'birthday', repeat: 'yearly', weekdays: null, month_mode: 'day', until_on: null, skip_dates: [], remind_days: 7 }); }
  { const k = today.slice(0, 7), first = [1, 2, 3, 4, 5, 6, 7].map((n) => `${k}-0${n}`).find((d) => parseDate(d).getDay() === 5)!;
    const o = Math.round((parseDate(first).getTime() - parseDate(today).getTime()) / 86_400_000);
    ev(o, '20:30', 'Jantar com amigos', null, false, { repeat: 'monthly', month_mode: 'nth', mins: 150, location: 'Taberna da Rua das Flores, Lisboa' }); }
  ev(12, '10:00', 'Padel', R, false, { location: 'Padel Campo Pequeno' });
  // Ginásio do Rodrigo (só ele vê): uma avaliação por mês, a gordura a descer e o músculo a subir.
  ([['weight', 'Peso', 'kg', false, 1], ['muscle', 'Massa muscular', 'kg', false, 2], ['bmi', 'IMC', '', false, 3], ['water', 'Água', '%', false, 4], ['fat', 'Gordura', '%', true, 5],
    ['physique', 'Avaliação física', '1–9', false, 6], ['bmr', 'Metabolismo basal', 'kcal', false, 7], ['bone', 'Massa óssea', 'kg', false, 8], ['meta_age', 'Idade metabólica', 'anos', true, 9],
    ['visceral', 'Gordura visceral', 'nível', true, 10], ['waist', 'Cintura', 'cm', true, 20], ['hip', 'Anca', 'cm', true, 21], ['chest', 'Peito', 'cm', false, 22], ['arm', 'Braço', 'cm', false, 23],
    ['thigh', 'Coxa', 'cm', false, 24], ...(['rarm', 'larm', 'trunk', 'rleg', 'lleg'] as const).flatMap((k, j) => [[`fat_${k}`, `Gordura · ${['braço direito', 'braço esquerdo', 'tronco', 'perna direita', 'perna esquerda'][j]}`, '%', true, 30 + j], [`mus_${k}`, `Músculo · ${['braço direito', 'braço esquerdo', 'tronco', 'perna direita', 'perna esquerda'][j]}`, 'kg', false, 35 + j]]),
    ['rhr', 'Frequência em repouso', 'bpm', true, 40]] as [string, string, string, boolean, number][])
    .forEach(([key, label, unit, lower_is_better, sort]) => db.gym_fields.push({ key, label, unit, lower_is_better, sort }));
  db.gym_prefs.push({ profile_id: R, fields: ['weight', 'muscle', 'bmi', 'water', 'fat', 'physique', 'bmr', 'bone', 'meta_age', 'visceral'], every_weeks: 4, updated_at: ago(120) });
  [[82.6, 22.8, 34.1, 39, 92], [81.9, 22.1, 34.3, 38, 91], [81.0, 21.4, 34.6, 37, 90], [80.4, 20.9, 34.8, 36, 89], [79.8, 20.1, 35.2, 35, 88]].forEach(([w, f, m, a, c], j) =>
    db.gym_assessments.push({ id: uid(), profile_id: R, measured_on: addDays(today, -26 - (4 - j) * 28), values: { weight: w, fat: f, muscle: m, meta_age: a, waist: c, bmi: Math.round(w / 1.82 / 1.82 * 10) / 10, water: Math.round((58 - f * 0.4 + j * 0.3) * 10) / 10, physique: 5, bmr: 1790 + j * 8, bone: 3.2, visceral: 6 - (j > 2 ? 1 : 0) }, created_at: ago(26 + (4 - j) * 28) }));
  db.goals.push({ id: uid(), household_id: H, owner_id: R, title: 'Gordura: 18%', metric: 'gym:fat', target: '18.00', start_value: '22.80', due_on: addDays(today, 180), reason: null, status: 'active', created_by: R, created_at: ago(140) });
  // Objetivos: o limite dos restaurantes do Rodrigo e o consumo do Golf (com o ponto de partida).
  db.goals.push({ id: uid(), household_id: H, owner_id: R, title: 'Restaurantes: até 120 € por mês', metric: 'category_cap:Restaurantes', target: '120.00', start_value: null, due_on: addDays(today, 150), reason: null, status: 'active', created_by: R, created_at: ago(70) });
  db.goals.push({ id: uid(), household_id: H, owner_id: null, title: 'Golf: 6,5 L/100 km', metric: 'car_l100:demo-golf', target: '6.50', start_value: '7.10', due_on: addDays(today, 120), reason: null, status: 'active', created_by: R, created_at: ago(40) });
  // Housekeeping: a Maria vem hoje e daqui a 3 dias; paga-se a 320 € por mês, daqui a dois dias (aviso no início).
  // Hoje já marcou duas coisas, deixou uma mensagem e pediu dois produtos.
  const vdays = [wd(0), wd(3)].sort((a, b) => a - b), lastFri = nthWeekday(cur, -1, 5)!; // paga-se na última sexta-feira; avisa 5 dias antes
  db.bills.push({ id: 'demo-hk', household_id: H, home_id: 'demo-casa', kind: 'outra', name: 'Housekeeping', provider: null, keywords: 'housekeeping, maria', every_months: 1, due_day: null, expected: '320.00', unit: null, contract_ends_on: null, owner_id: null, archived: false, created_by: R, created_at: ago(70) });
  db.housekeeping.push({ id: 'demo-hk-maria', household_id: H, profile_id: M, name: 'Maria', weekdays: vdays, start_time: '09:00:00', monthly_pay: '320.00', pay_day: null, pay_nth: -1, pay_weekday: 5, pay_remind: 5, bill_id: 'demo-hk', archived: false, created_by: R, created_at: ago(70) });
  for (let m = monthKey(addDays(today, -70)); m < cur || (m === cur && lastFri < today); m = nextMonth(m)) { // se a última sexta já passou, o deste mês está pago
    db.hk_paid.push({ household_id: H, hk_id: 'demo-hk-maria', month: m, expense_id: null, paid_by: R, created_at: ago(5) });
    db.bill_payments.push({ id: uid(), household_id: H, bill_id: 'demo-hk', expense_id: null, amount: '320.00', period_from: `${m}-01`, period_to: `${m}-28`, usage: null, adjustment: false, due_on: null, source: 'manual', created_at: ago(5) });
  }
  const hkt = (id: string, title: string, repeat: string, due_on: string | null = null) => db.hk_tasks.push({ id, household_id: H, title, repeat, due_on, archived: false, created_by: R, created_at: ago(70) });
  hkt('hk-wc', 'Casas de banho', 'visit'); hkt('hk-chao', 'Aspirar e lavar o chão', 'visit'); hkt('hk-cozinha', 'Cozinha: bancadas e placa', 'visit');
  hkt('hk-ferro', 'Passar a ferro', 'visit'); hkt('hk-camas', 'Mudar as camas', 'week'); hkt('hk-vidros', 'Limpar os vidros da sala', 'month'); hkt('hk-forno', 'Limpar o forno', 'once');
  for (const d of [-4, -7, -11, -14].map((o) => addDays(today, o)))
    for (const t of ['hk-wc', 'hk-chao', 'hk-cozinha', 'hk-ferro', ...(d === addDays(today, -4) ? ['hk-camas'] : []), ...(d === addDays(today, -14) ? ['hk-vidros'] : [])])
      db.hk_log.push({ id: uid(), household_id: H, task_id: t, done_on: d, done_by: M, created_at: d + 'T12:00:00Z' });
  for (const t of ['hk-wc', 'hk-cozinha']) db.hk_log.push({ id: uid(), household_id: H, task_id: t, done_on: today, done_by: M, created_at: ago(0.08) });
  db.hk_messages.push({ id: uid(), household_id: H, author_id: R, body: 'Bom dia, Maria! Esta semana, se der, limpe também o forno. Obrigado!', created_at: ago(2) });
  db.hk_messages.push({ id: uid(), household_id: H, author_id: M, body: 'Combinado. Falta detergente da loiça e sacos do lixo, já pus na lista.', created_at: ago(0.06) });
  db.shopping_items.push({ id: uid(), household_id: H, name: 'Detergente da loiça', aisle: 'Limpeza e casa', done: false, done_by: null, created_by: M, created_at: ago(0.07) });
  db.shopping_items.push({ id: uid(), household_id: H, name: 'Sacos do lixo', aisle: 'Limpeza e casa', done: false, done_by: null, created_by: M, created_at: ago(0.07) });
  return db;
}

export function createDemoClient() {
  const db = seed();
  let me: string | null = null;
  let pendingName = '', pendingEmail = '';
  const files = new Map<string, string>([['demo-ines/compras.svg', SHOT], [`${H}/talao-maquina.svg`, RECEIPT(addDays(todayStr(), 40 - 3 * 365 - 1))]]); // Storage: caminho → endereço
  const authListeners = new Set<(e: string, s: any) => void>();
  const tableListeners = new Map<string, Set<Listener>>();
  const session = () => (me ? { user: { id: me, email: `${me}@exemplo.pt` }, access_token: 'demo' } : null);
  const emitAuth = (e: string) => authListeners.forEach((f) => f(e, session()));
  const changed = (t: string) => setTimeout(() => tableListeners.get(t)?.forEach((f) => f()), 30);

  // O que cada pessoa pode ver (resumo das regras de acesso do schema nikki).
  const prof = (id: string | null) => db.profiles.find((p) => p.id === id);
  const visible = (t: string, r: Row) => {
    const houses = prof(me)?.status !== 'active' ? [] : db.memberships.filter((m) => m.profile_id === me).map((m) => m.household_id);
    // Housekeeping (papel «staff»): só a lista das visitas, as mensagens, as compras e quem é da casa.
    const staffIn = db.memberships.filter((m) => m.profile_id === me && m.role === 'staff').map((m) => m.household_id);
    if (r.household_id && staffIn.includes(r.household_id)) return ['hk_tasks', 'hk_log', 'hk_messages', 'shopping_items', 'memberships'].includes(t) || (t === 'housekeeping' && r.profile_id === me);
    if (t === 'tickets') return r.created_by === me;
    if (t === 'calendar_links') return r.profile_id === me;
    if (t === 'gym_fields') return true;
    if (t === 'gym_prefs' || t === 'gym_assessments') return r.profile_id === me; // só o próprio
    if (t === 'goals') return houses.includes(r.household_id) && (!r.owner_id || r.owner_id === me);
    if (t === 'profiles') return r.id === me || db.memberships.some((m) => m.profile_id === r.id && houses.includes(m.household_id));
    if (t === 'households') return houses.includes(r.id);
    if (t === 'expenses') return houses.includes(r.household_id) && (r.paid_by === me || r.created_by === me || r.other_id === me);
    if (t === 'transfers') return houses.includes(r.household_id) && (r.from_id === me || r.to_id === me);
    if (t === 'events') return houses.includes(r.household_id) && (!r.private || r.owner_id === me || r.created_by === me);
    return houses.includes(r.household_id);
  };
  const embed = (t: string, r: Row, sel: string) => {
    const out = { ...r };
    if (t === 'memberships' && sel.includes('households(')) out.households = db.households.find((h) => h.id === r.household_id);
    if (t === 'memberships' && sel.includes('profiles(')) out.profiles = db.profiles.find((p) => p.id === r.profile_id);
    return out;
  };

  class Query implements PromiseLike<{ data: any; error: any }> {
    private filters: ((r: Row) => boolean)[] = [];
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    private payload: any = null;
    private sel = '*';
    private one: 'single' | 'maybe' | null = null;
    private ord: { c: string; asc: boolean } | null = null;
    private rng: [number, number] | null = null;
    private returning = false;
    constructor(private t: string) {}
    select(s = '*') { if (this.op === 'select') this.sel = s; else this.returning = true; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    upsert(p: any, _o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
    in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
    order(c: string, o?: { ascending?: boolean }) { this.ord = { c, asc: o?.ascending ?? true }; return this; }
    range(a: number, b: number) { this.rng = [a, b]; return this; }
    single() { this.one = 'single'; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    then<A, B>(ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null, ko?: ((e: any) => B | PromiseLike<B>) | null) {
      return Promise.resolve().then(() => this.run()).then(ok, ko);
    }
    private run(): { data: any; error: any } {
      const rows = (db[this.t] ??= []);
      const mine = () => rows.filter((r) => visible(this.t, r) && this.filters.every((f) => f(r)));
      if (this.op === 'select') {
        let out = mine().map((r) => embed(this.t, r, this.sel));
        if (this.ord) { const { c, asc } = this.ord; out.sort((x, y) => (x[c] < y[c] ? -1 : x[c] > y[c] ? 1 : 0) * (asc ? 1 : -1)); }
        if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
        if (this.one) return out.length || this.one === 'maybe' ? { data: out[0] ?? null, error: null } : { data: null, error: { message: 'sem resultados' } };
        return { data: out, error: null };
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        const items: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row): Row => ({
          id: uid(), created_at: new Date().toISOString(),
          ...(this.t === 'invites' ? { token: uid().replace(/-/g, ''), code: Math.random().toString(36).slice(2, 8).toUpperCase(), expires_at: addDays(todayStr(), 7) + 'T12:00:00Z', accepted_at: null } : {}),
          ...(this.t === 'shopping_items' ? { done: false, done_by: null } : {}),
          ...(this.t === 'tickets' ? { created_by: me, status: 'novo', reply: null, updated_at: new Date().toISOString() } : {}),
          ...(this.t === 'household_modules' ? { enabled_at: new Date().toISOString() } : {}),
          ...(this.t === 'goals' ? { status: 'active', owner_id: null, start_value: null, reason: null } : {}),
          ...(this.t === 'events' ? { location: null, kind: 'event', repeat: 'none', weekdays: null, month_mode: 'day', until_on: null, skip_dates: [], remind_days: null, ends_at: null } : {}),
          ...(this.t === 'chores' ? { archived: false, home_id: null, turn_id: null, note: null, kind: 'task', assign: 'anyone' } : {}),
          ...(this.t === 'todos' ? { owner_id: null, due_on: null, done_at: null, done_by: null, created_by: me } : {}),
          ...(this.t === 'chore_logs' ? { expense_id: null, note: null } : {}),
          ...(this.t === 'warranties' ? { archived: false, home_id: null, store: null, price: null, receipt_path: null, years: 3 } : {}),
          ...(this.t === 'homes' ? { archived: false, name: 'Casa', tenure: null, imi: null, track_usage: false, updated_at: new Date().toISOString() } : {}),
          ...(this.t === 'bills' ? { home_id: null, archived: false, owner_id: null, keywords: null, provider: null, unit: null, contract_ends_on: null, every_months: 1, due_day: null, expected: null } : {}),
          ...(this.t === 'bill_payments' ? { usage: null, adjustment: false, expense_id: null, due_on: null, source: 'manual' } : {}),
          ...(this.t === 'deadlines' ? { car_id: null, bill_id: null, home_id: null, paid_at: null } : {}),
          ...(this.t === 'housekeeping' ? { profile_id: null, weekdays: [], start_time: null, monthly_pay: null, pay_day: null, pay_nth: null, pay_weekday: null, pay_remind: 3, bill_id: null, archived: false, created_by: me } : {}),
          ...(this.t === 'hk_tasks' ? { repeat: 'visit', due_on: null, archived: false, chore_id: null, created_by: me } : {}),
          ...(this.t === 'hk_log' ? { done_by: me } : {}),
          ...(this.t === 'hk_messages' ? { author_id: me, photo_path: null } : {}),
          ...(this.t === 'hk_paid' ? { paid_by: me, expense_id: null } : {}),
          ...p,
        }));
        for (const it of items) {
          if (this.op === 'upsert' && this.t === 'asset_snapshots') {
            const k = rows.findIndex((r) => r.asset_id === it.asset_id && r.on_date === it.on_date);
            if (k >= 0) { rows[k] = { ...rows[k], ...it, created_at: new Date().toISOString() }; continue; }
          }
          if (this.op === 'upsert' && this.t === 'homes') {
            const k = rows.findIndex((r) => r.household_id === it.household_id);
            if (k >= 0) { rows[k] = { ...rows[k], ...it }; continue; }
          }
          if (this.op === 'upsert' && this.t === 'gym_prefs') {
            const k = rows.findIndex((r) => r.profile_id === it.profile_id);
            if (k >= 0) { rows[k] = { ...rows[k], ...it }; continue; }
          }
          if (this.op === 'upsert' && this.t === 'share_ratios') {
            const k = rows.findIndex((r) => r.household_id === it.household_id && r.profile_a === it.profile_a && r.profile_b === it.profile_b);
            if (k >= 0) { rows[k] = { ...rows[k], ...it }; continue; }
          }
          rows.push(it);
          // Como o gatilho da base: uma tarefa do housekeeping que veio de uma tarefa da casa, feita, fica feita lá também.
          if (this.t === 'hk_log') {
            const task = db.hk_tasks.find((x) => x.id === it.task_id), c = task?.chore_id ? db.chores.find((x) => x.id === task.chore_id) : null;
            if (c) { db.chore_logs.push({ id: uid(), household_id: it.household_id, chore_id: c.id, done_on: it.done_on, done_by: it.done_by, expense_id: null, note: 'Housekeeping', created_at: new Date().toISOString() }); c.next_on = addPeriod(it.done_on, c.every_n, c.every_unit); changed('chores'); changed('chore_logs'); }
          }
        }
        changed(this.t);
        const data = this.returning ? (this.one ? items[0] : items) : null;
        return { data, error: null };
      }
      if (this.op === 'update') {
        const target = mine();
        if (this.t === 'memberships' && this.payload.role === 'member') {
          const h = target[0]?.household_id;
          const admins = rows.filter((r) => r.household_id === h && r.role === 'admin' && !target.includes(r));
          if (!admins.length) return { data: null, error: { message: 'a casa precisa de pelo menos um administrador' } };
        }
        target.forEach((r) => Object.assign(r, this.payload));
        changed(this.t);
        return { data: this.returning ? (this.one ? target[0] ?? null : target) : null, error: null };
      }
      const del = new Set(mine());
      db[this.t] = rows.filter((r) => !del.has(r));
      changed(this.t);
      return { data: null, error: null };
    }
  }

  // Presença nas compras. Na demonstração, o outro (Rodrigo ou Inês) abre as compras uns segundos depois de
  // ti e vai riscando artigos, corredor a corredor, enquanto as tiveres abertas.
  function presence(key: string) {
    const state: Record<string, { aisle: string | null }[]> = {};
    const syncs: Listener[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sync = () => syncs.forEach((f) => f());
    const other = key === R ? I : key === I ? R : null;
    const partnerTick = () => {
      const it = db.shopping_items.find((x) => x.household_id === H && !x.done);
      if (!it || !other) return;
      it.done = true; it.done_by = other; it.done_at = new Date().toISOString();
      state[other] = [{ aisle: it.aisle }];
      sync(); changed('shopping_items');
      timers.push(setTimeout(partnerTick, 4000 + Math.random() * 2500));
    };
    const ch = {
      on(_e: string, _f: unknown, cb: Listener) { syncs.push(cb); return ch; },
      subscribe(cb?: (s: string) => void) {
        setTimeout(() => cb?.('SUBSCRIBED'), 20);
        if (other) timers.push(setTimeout(() => { state[other] = [{ aisle: null }]; sync(); timers.push(setTimeout(partnerTick, 2500)); }, 2500));
        return ch;
      },
      track(meta: { aisle: string | null }) { state[key] = [meta]; sync(); return Promise.resolve('ok'); },
      untrack() { delete state[key]; return Promise.resolve('ok'); },
      presenceState() { return state; },
      _off() { timers.forEach(clearTimeout); },
    };
    return ch;
  }

  const newHouse = (name: string, owner: string) => {
    const id = uid(), now = new Date().toISOString();
    db.households.push({ id, name, created_at: now });
    db.memberships.push({ household_id: id, profile_id: owner, role: 'admin', joined_at: now });
    for (const m of DEFAULT_MODULES) db.household_modules.push({ household_id: id, module: m, enabled_at: now, enabled_by: owner });
    changed('memberships');
    return id;
  };
  const err = (message: string) => ({ data: null, error: { message } });
  const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

  // O painel: o mesmo que as funções nikki.admin_* (contas, casas, módulos, datas e tickets).
  const admin: Record<string, (a: Row) => any> = {
    admin_people: () => [...db.profiles].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((p) => ({
      id: p.id, name: p.name, email: p.email, status: p.status, created_at: p.created_at, approved_at: p.approved_at, approved_via: p.approved_via,
      last_seen_at: p.last_seen_at, request: p.request, requested_at: p.requested_at, admin: p.id === R,
      houses: db.memberships.filter((m) => m.profile_id === p.id).map((m) => ({ id: m.household_id, name: db.households.find((h) => h.id === m.household_id)?.name, role: m.role, joined_at: m.joined_at })),
      tickets: db.tickets.filter((t) => t.created_by === p.id).length,
    })),
    admin_houses: () => [...db.households].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((h) => ({
      id: h.id, name: h.name, created_at: h.created_at,
      members: db.memberships.filter((m) => m.household_id === h.id).map((m) => ({ name: prof(m.profile_id)?.name, role: m.role, joined_at: m.joined_at })),
      modules: db.household_modules.filter((m) => m.household_id === h.id).map((m) => ({ module: m.module, since: m.enabled_at })),
    })),
    admin_kpis: () => {
      const n = (st: string) => db.profiles.filter((p) => p.status === st).length;
      const seen = (d: number) => db.profiles.filter((p) => p.last_seen_at && Date.parse(p.last_seen_at) >= Date.now() - d * 86_400_000).length;
      const approved = db.profiles.filter((p) => p.approved_via === 'admin');
      const weeks = new Map<string, number>(), from = addDays(weekStart(todayStr()), -49);
      for (const p of db.profiles) { const w = weekStart(toDateStr(new Date(p.created_at))); if (w >= from) weeks.set(w, (weeks.get(w) ?? 0) + 1); }
      const mods = new Map<string, { houses: number; since: string }>();
      for (const m of db.household_modules) { const x = mods.get(m.module); mods.set(m.module, { houses: (x?.houses ?? 0) + 1, since: x && x.since < m.enabled_at ? x.since : m.enabled_at }); }
      const per = new Map<string, number>(); for (const m of db.memberships.filter((x) => x.role !== 'staff')) per.set(m.household_id, (per.get(m.household_id) ?? 0) + 1);
      const tk = (st: string) => db.tickets.filter((t) => t.status === st).length;
      return {
        accounts: { active: n('active'), pending: n('pending'), paused: n('paused'), declined: n('declined') },
        first_account: db.profiles.reduce((a, p) => (p.created_at < a ? p.created_at : a), db.profiles[0].created_at),
        houses: db.households.length, houses_two: [...per.values()].filter((v) => v >= 2).length, seen_7d: seen(7), seen_30d: seen(30),
        approval_hours: approved.length ? Math.round((approved.reduce((t, p) => t + hours(p.requested_at ?? p.created_at, p.approved_at), 0) / approved.length) * 10) / 10 : null,
        signups: [...weeks].map(([week, c]) => ({ week, n: c })),
        modules: [...mods].map(([module, x]) => ({ module, ...x })).sort((a, b) => b.houses - a.houses),
        tickets: { novo: tk('novo'), 'a ver': tk('a ver'), feito: tk('feito'), nao: tk('nao') },
      };
    },
    admin_tickets: () => [...db.tickets].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((t) => ({ ...t, by: prof(t.created_by)?.name, email: prof(t.created_by)?.email })),
    admin_ticket: (a) => {
      const t = db.tickets.find((x) => x.id === a.t);
      if (!t) throw new Error('ticket não encontrado');
      Object.assign(t, { status: a.new_status, reply: String(a.new_reply ?? '').trim() || null, updated_at: new Date().toISOString() });
      changed('tickets');
    },
    admin_decide: (a) => decide(a.p, a.approve),
    admin_pause: (a) => {
      if (a.p === me) throw new Error('não podes suspender a tua conta');
      const p = prof(a.p);
      if (!p || !['active', 'paused'].includes(p.status)) throw new Error('conta não encontrada');
      p.status = a.paused ? 'paused' : 'active';
    },
  };
  function decide(id: string, approve: boolean) {
    const p = prof(id);
    if (!p || p.status !== 'pending') throw new Error('pedido não encontrado');
    if (!approve) { p.status = 'declined'; return null; }
    Object.assign(p, { status: 'active', approved_at: new Date().toISOString(), approved_via: 'admin' });
    return p.request?.house && !db.memberships.some((m) => m.profile_id === id) ? newHouse(p.request.house, id) : null;
  }

  const client = {
    from: (t: string) => new Query(t),
    async rpc(name: string, args: Row) {
      const p = prof(me);
      if (name in admin) {
        if (me !== R) return err('só para a administração da app');
        try { return { data: admin[name](args ?? {}) ?? null, error: null }; } catch (e) { return err((e as Error).message); }
      }
      if (name === 'is_app_admin') return { data: me === R, error: null };
      if (name === 'house_month_totals') {
        // Só totais por mês, sem o investimento; inclui as «só minhas» de cada um (como a função da base).
        if (!db.memberships.some((m) => m.profile_id === me && m.household_id === args.h)) return { data: [], error: null };
        const by = new Map<string, number>();
        for (const e of db.expenses) if (e.household_id === args.h && e.spent_on >= args.since && e.category !== 'Future Me' && !e.occasion_id) by.set(e.spent_on.slice(0, 7), (by.get(e.spent_on.slice(0, 7)) ?? 0) + Number(e.amount));
        return { data: [...by].sort().map(([month, total]) => ({ month, total: total.toFixed(2) })), error: null };
      }
      if (name === 'occasion_totals') {
        // Só os totais de cada evento, com as «só minhas» de cada um (como a função da base).
        if (!db.memberships.some((m) => m.profile_id === me && m.household_id === args.h && m.role !== 'staff')) return { data: [], error: null };
        const by = new Map<string, number>();
        for (const e of db.expenses) if (e.household_id === args.h && e.occasion_id) by.set(e.occasion_id, (by.get(e.occasion_id) ?? 0) + Number(e.amount));
        return { data: [...by].map(([occasion_id, total]) => ({ occasion_id, total: total.toFixed(2) })), error: null };
      }
      if (name === 'touch') { if (p) p.last_seen_at = new Date().toISOString(); return { data: null, error: null }; }
      if (name === 'request_account') {
        if (!p || p.status !== 'pending') return err('sem pedido para enviar');
        Object.assign(p, { request: { house: String(args.house).trim(), note: String(args.note ?? '').trim() || null }, requested_at: new Date().toISOString() });
        return { data: null, error: null };
      }
      if (name === 'create_household') {
        if (p?.status !== 'active') return err(p?.status === 'pending' ? 'conta à espera de aprovação' : 'conta sem acesso');
        return { data: newHouse(args.house_name, me!), error: null };
      }
      if (name === 'accept_invite') {
        if (p && ['declined', 'paused'].includes(p.status)) return err('conta sem acesso');
        const i = db.invites.find((x) => x.token === args.invite || x.code === String(args.invite).toUpperCase());
        if (!i) return err('convite inválido');
        if (i.accepted_at) return err('convite já usado');
        if (i.role !== 'staff' && db.memberships.filter((m) => m.household_id === i.household_id && m.profile_id !== me && m.role !== 'staff').length >= 2) return err('a casa já tem duas pessoas');
        i.accepted_at = new Date().toISOString();
        db.memberships.push({ household_id: i.household_id, profile_id: me, role: i.role, joined_at: i.accepted_at });
        if (i.role === 'staff') { const c = db.housekeeping.find((x) => x.household_id === i.household_id && !x.profile_id && !x.archived); if (c) { c.profile_id = me; changed('housekeeping'); } }
        if (p?.status === 'pending') Object.assign(p, { status: 'active', approved_at: i.accepted_at, approved_via: 'invite' });
        changed('memberships');
        return { data: i.household_id, error: null };
      }
      if (name === 'busy_slots') {
        // Os «só para mim» dos outros, só com a hora e o dono.
        const mine = db.memberships.some((m) => m.profile_id === me && m.household_id === args.h);
        const data = !mine ? [] : db.events
          .filter((e) => e.household_id === args.h && e.private && (e.owner_id ?? e.created_by) !== me && e.created_by !== me && e.starts_at < args.to_ts && ((e.ends_at ?? e.starts_at) >= args.from_ts || (e.repeat !== 'none' && (!e.until_on || e.until_on >= args.from_ts.slice(0, 10)))))
          .map((e) => ({ id: e.id, starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day, owner_id: e.owner_id ?? e.created_by, repeat: e.repeat, weekdays: e.weekdays, month_mode: e.month_mode, until_on: e.until_on, skip_dates: e.skip_dates }));
        return { data, error: null };
      }
      if (name === 'calendar_token') return { data: 'demo' + '0'.repeat(44), error: null };
      return { data: null, error: { message: 'função desconhecida' } };
    },
    channel(_topic: string, opts?: { config?: { presence?: { key: string } } }) {
      if (opts?.config?.presence?.key) return presence(opts.config.presence.key);
      const subs: [string, Listener][] = [];
      const ch = {
        on(_e: string, f: { table: string }, cb: Listener) { subs.push([f.table, cb]); return ch; },
        subscribe() { for (const [t, cb] of subs) { if (!tableListeners.has(t)) tableListeners.set(t, new Set()); tableListeners.get(t)!.add(cb); } return ch; },
        _off() { for (const [t, cb] of subs) tableListeners.get(t)?.delete(cb); },
      };
      return ch;
    },
    removeChannel(ch: any) { ch?._off?.(); return Promise.resolve('ok'); },
    // Storage dos tickets: as capturas ficam na memória da página.
    // Funções: na demonstração, ligar o iCloud ou o Google «resulta» logo (e fica a ligação de exemplo).
    functions: {
      async invoke(name: string, o: { body?: Row }) {
        const b = o?.body ?? {};
        if (name === 'calendar-link' && b.action === 'icloud') { db.calendar_links.push({ id: uid(), profile_id: me, household_id: b.household, provider: 'icloud', account_hint: `${String(b.apple_id)[0]}•••@${String(b.apple_id).split('@')[1] ?? 'icloud.com'}`, status: 'ok', last_sync_at: new Date().toISOString(), last_error: null, created_at: new Date().toISOString() }); return { data: { ok: true }, error: null }; }
        if (name === 'calendar-link' && b.action === 'google') { db.calendar_links.push({ id: uid(), profile_id: me, household_id: b.household, provider: 'google', account_hint: 'r•••@gmail.com', status: 'ok', last_sync_at: new Date().toISOString(), last_error: null, created_at: new Date().toISOString() }); return { data: { url: '#' }, error: null }; }
        if (name === 'calendar-link' && b.action === 'unlink') { db.calendar_links = db.calendar_links.filter((l) => !(l.profile_id === me && l.provider === b.provider)); return { data: { ok: true }, error: null }; }
        return { data: { ok: true }, error: null };
      },
    },
    storage: {
      from: () => ({
        async upload(path: string, blob: Blob) { files.set(path, URL.createObjectURL(blob)); return { data: { path }, error: null }; },
        async remove(paths: string[]) { for (const p of paths) files.delete(p); return { data: null, error: null }; },
        async createSignedUrl(path: string) { const u = files.get(path); return u ? { data: { signedUrl: u }, error: null } : err('não encontrado'); },
      }),
    },
    /** Só na demonstração: aprovar o pedido da conta que está a ver, como faria o administrador. */
    async demoApprove() { if (me) decide(me, true); },
    auth: {
      async getSession() { return { data: { session: session() }, error: null }; },
      onAuthStateChange(cb: (e: string, s: any) => void) { authListeners.add(cb); return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } }; },
      async signInWithOtp(o: { email: string; options?: { data?: { name?: string } } }) { pendingName = o.options?.data?.name ?? o.email.split('@')[0]; pendingEmail = o.email; return { data: {}, error: null }; },
      async verifyOtp() {
        // Na demonstração, qualquer código entra como uma pessoa nova, sem casa e à espera de aprovação (mostra o pedido).
        me = 'demo-' + uid().slice(0, 8);
        db.profiles.push({ id: me, name: pendingName ? pendingName[0].toUpperCase() + pendingName.slice(1) : 'Tu', color: '#94B096', email: pendingEmail, status: 'pending', created_at: new Date().toISOString(), request: null, requested_at: null, approved_at: null, approved_via: null, last_seen_at: null });
        emitAuth('SIGNED_IN');
        return { data: {}, error: null };
      },
      async signOut() { me = null; emitAuth('SIGNED_OUT'); return { error: null }; },
      /** Só na demonstração: entrar como uma das pessoas de exemplo. */
      demoSignIn(who: 'R' | 'I' | 'M') { me = who === 'R' ? R : who === 'I' ? I : M; emitAuth('SIGNED_IN'); },
    },
  };
  return client;
}
