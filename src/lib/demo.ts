// Modo de demonstração (VITE_DEMO=1): a app real, com uma base de dados de exemplo em memória.
// Imita só o que a app usa do supabase-js: auth, from().select/insert/update/delete/upsert, rpc e tempo real.
// Respeita as regras de acesso que importam: as despesas «Minha» do outro não aparecem.
import { addDays, monthKey, prevMonth, todayStr } from './dates';

type Row = Record<string, any>;
type Listener = () => void;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));
const R = 'demo-rodrigo', I = 'demo-ines', H = 'demo-casa';

function seed() {
  const today = todayStr(), cur = monthKey(today), day = Number(today.slice(8, 10));
  const db: Record<string, Row[]> = {
    profiles: [{ id: R, name: 'Rodrigo', color: '#8EA6BD' }, { id: I, name: 'Inês', color: '#D29B7A' }],
    households: [{ id: H, name: 'A nossa casa' }],
    memberships: [{ household_id: H, profile_id: R, role: 'admin', joined_at: '2026-01-01' }, { household_id: H, profile_id: I, role: 'member', joined_at: '2026-01-02' }],
    share_ratios: [{ household_id: H, profile_a: R, profile_b: I, ratio_a: 0.5 }],
    invites: [{ id: uid(), household_id: H, email: 'teresa@exemplo.pt', role: 'member', token: 'demo-token', code: 'K7Q2NB', expires_at: addDays(today, 5) + 'T12:00:00Z', accepted_at: null, created_at: today }],
    expenses: [], transfers: [], deadlines: [], shopping_items: [],
  };
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
  for (const [key, k, until] of [[m2, 0.94, 31], [m1, 1.0, 31], [cur, 1.08, day]] as const) {
    for (const [d, cat, v, paid, other, share, note] of plan) {
      if (d > until) continue;
      const amount = (Math.round(Number(v) * k * 100) / 100).toFixed(2);
      const split = other == null ? 'mine' : share == null ? 'other' : 'shared';
      db.expenses.push({ id: uid(), household_id: H, created_by: paid, paid_by: paid, other_id: other, amount, split, payer_share: share, spent_on: `${key}-${String(d).padStart(2, '0')}`, category: cat, note, created_at: `${key}-${String(d).padStart(2, '0')}T12:00:00Z` });
    }
  }
  for (const [d, v] of [[`${m2}-28`, '411.80'], [`${m1}-28`, '438.10'], [`${cur}-${String(Math.min(day, 15)).padStart(2, '0')}`, '363.00']])
    db.transfers.push({ id: uid(), household_id: H, from_id: I, to_id: R, amount: v, made_on: d, created_by: I });
  for (const [n, a] of [['Bananas', 'Fruta e legumes'], ['Tomate cherry', 'Fruta e legumes'], ['Espinafres', 'Fruta e legumes'], ['Peito de frango', 'Talho e peixe'], ['Salmão', 'Talho e peixe'], ['Iogurte grego', 'Laticínios e ovos'], ['Leite meio-gordo', 'Laticínios e ovos'], ['Café em grão', 'Mercearia'], ['Aveia', 'Mercearia']])
    db.shopping_items.push({ id: uid(), household_id: H, name: n, aisle: a, done: false, done_by: null, done_at: null, created_by: R, created_at: today + 'T08:00:00Z' });
  db.deadlines.push({ id: uid(), household_id: H, title: 'Revisão do Mini', due_on: addDays(today, 2), amount: '210.00', paid_at: null });
  db.deadlines.push({ id: uid(), household_id: H, title: 'IUC do Golf', due_on: addDays(today, 4), amount: '148.37', paid_at: null });
  return db;
}

export function createDemoClient() {
  const db = seed();
  let me: string | null = null;
  let pendingName = '';
  const authListeners = new Set<(e: string, s: any) => void>();
  const tableListeners = new Map<string, Set<Listener>>();
  const session = () => (me ? { user: { id: me, email: `${me}@exemplo.pt` }, access_token: 'demo' } : null);
  const emitAuth = (e: string) => authListeners.forEach((f) => f(e, session()));
  const changed = (t: string) => setTimeout(() => tableListeners.get(t)?.forEach((f) => f()), 30);

  // O que cada pessoa pode ver (resumo das regras de acesso do schema nikki).
  const visible = (t: string, r: Row) => {
    const houses = db.memberships.filter((m) => m.profile_id === me).map((m) => m.household_id);
    if (t === 'profiles') return r.id === me || db.memberships.some((m) => m.profile_id === r.id && houses.includes(m.household_id));
    if (t === 'households') return houses.includes(r.id);
    if (t === 'expenses') return houses.includes(r.household_id) && (r.paid_by === me || r.created_by === me || r.other_id === me);
    if (t === 'transfers') return houses.includes(r.household_id) && (r.from_id === me || r.to_id === me);
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
    upsert(p: any) { this.op = 'upsert'; this.payload = p; return this; }
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
          ...p,
        }));
        for (const it of items) {
          if (this.op === 'upsert' && this.t === 'share_ratios') {
            const k = rows.findIndex((r) => r.household_id === it.household_id && r.profile_a === it.profile_a && r.profile_b === it.profile_b);
            if (k >= 0) { rows[k] = { ...rows[k], ...it }; continue; }
          }
          rows.push(it);
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
        return { data: null, error: null };
      }
      const del = new Set(mine());
      db[this.t] = rows.filter((r) => !del.has(r));
      changed(this.t);
      return { data: null, error: null };
    }
  }

  const client = {
    from: (t: string) => new Query(t),
    async rpc(name: string, args: Row) {
      if (name === 'create_household') {
        const id = uid();
        db.households.push({ id, name: args.house_name });
        db.memberships.push({ household_id: id, profile_id: me, role: 'admin', joined_at: new Date().toISOString() });
        changed('memberships');
        return { data: id, error: null };
      }
      if (name === 'accept_invite') {
        const i = db.invites.find((x) => x.token === args.invite || x.code === String(args.invite).toUpperCase());
        if (!i) return { data: null, error: { message: 'convite inválido' } };
        if (i.accepted_at) return { data: null, error: { message: 'convite já usado' } };
        i.accepted_at = new Date().toISOString();
        db.memberships.push({ household_id: i.household_id, profile_id: me, role: i.role, joined_at: i.accepted_at });
        changed('memberships');
        return { data: i.household_id, error: null };
      }
      return { data: null, error: { message: 'função desconhecida' } };
    },
    channel() {
      const subs: [string, Listener][] = [];
      const ch = {
        on(_e: string, f: { table: string }, cb: Listener) { subs.push([f.table, cb]); return ch; },
        subscribe() { for (const [t, cb] of subs) { if (!tableListeners.has(t)) tableListeners.set(t, new Set()); tableListeners.get(t)!.add(cb); } return ch; },
        _off() { for (const [t, cb] of subs) tableListeners.get(t)?.delete(cb); },
      };
      return ch;
    },
    removeChannel(ch: any) { ch?._off?.(); return Promise.resolve('ok'); },
    auth: {
      async getSession() { return { data: { session: session() }, error: null }; },
      onAuthStateChange(cb: (e: string, s: any) => void) { authListeners.add(cb); return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } }; },
      async signInWithOtp(o: { email: string; options?: { data?: { name?: string } } }) { pendingName = o.options?.data?.name ?? o.email.split('@')[0]; return { data: {}, error: null }; },
      async verifyOtp() {
        // Na demonstração, qualquer código entra como uma pessoa nova, sem casa (mostra o primeiro uso).
        me = 'demo-' + uid().slice(0, 8);
        db.profiles.push({ id: me, name: pendingName ? pendingName[0].toUpperCase() + pendingName.slice(1) : 'Tu', color: '#94B096' });
        emitAuth('SIGNED_IN');
        return { data: {}, error: null };
      },
      async signOut() { me = null; emitAuth('SIGNED_OUT'); return { error: null }; },
      /** Só na demonstração: entrar como uma das pessoas de exemplo. */
      demoSignIn(who: 'R' | 'I') { me = who === 'R' ? R : I; emitAuth('SIGNED_IN'); },
    },
  };
  return client;
}
