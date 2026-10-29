import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { store } from '@/lib/store';

export interface Profile { id: string; name: string; color: string }
/**
 * A conta de quem entrou. «pending»: a primeira pessoa de uma casa espera pela aprovação da administração da app
 * (quem entra com convite fica ativa logo). «paused»: suspensa. «declined»: pedido não aceite.
 */
export interface Me extends Profile { status: 'pending' | 'active' | 'paused' | 'declined'; request: { house: string; note: string | null } | null; requested_at: string | null }
export interface Member extends Profile { role: 'admin' | 'member' }
/** «staff»: quem faz o housekeeping (vê só as tarefas das visitas, as mensagens e as compras). */
export interface House { id: string; name: string; role: 'admin' | 'member' | 'staff' }

interface State {
  ready: boolean;
  session: Session | null;
  me: Me | null;
  /** Administração da app (o Rodrigo): aprova contas e vê o painel. Nunca vê os dados das casas. */
  appAdmin: boolean;
  houses: House[];
  house: House | null;
  members: Member[];
  /** Quem faz o housekeeping (não conta como pessoa da casa). */
  staff: Profile[];
  /** A outra pessoa adulta (contas a dois). Com mais de duas, a primeira; a solo, null. */
  partner: Member | null;
  /** Minha parte nas despesas partilhadas com o partner (0,1 a 0,9). */
  myShare: number;
  ratioRow: { profile_a: string; profile_b: string; ratio_a: number } | null;
  setHouse: (id: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<State | null>(null);
export const useSession = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession fora do SessionProvider');
  return c;
};

const HOUSE_KEY = 'nikki_house';
const COLORS = ['#8EA6BD', '#D29B7A', '#94B096', '#B7A2C9', '#C9B37A'];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [appAdmin, setAppAdmin] = useState(false);
  const touched = useRef<string | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState<string | null>(() => store.get(HOUSE_KEY));
  const [members, setMembers] = useState<Member[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [ratioRow, setRatioRow] = useState<State['ratioRow']>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) { setMe(null); setAppAdmin(false); setHouses([]); setMembers([]); setReady(true); return; }
    const [{ data: p }, { data: ms }, { data: adm }] = await Promise.all([
      supabase.from('profiles').select('id, name, color, status, request, requested_at').eq('id', uid).maybeSingle(),
      supabase.from('memberships').select('household_id, role, households(name)').eq('profile_id', uid),
      supabase.rpc('is_app_admin'),
    ]);
    setMe(p as Me | null);
    setAppAdmin(adm === true);
    // Última visita (uma vez por arranque): a administração vê quem usa a app, nunca o quê.
    if (touched.current !== uid && (p as Me | null)?.status === 'active') { touched.current = uid; supabase.rpc('touch').then(() => undefined, () => undefined); }
    const hs: House[] = (ms ?? []).map((m: any) => ({ id: m.household_id, role: m.role, name: m.households?.name ?? 'Casa' }));
    setHouses(hs);
    const h = hs.find((x) => x.id === houseId) ?? hs[0] ?? null;
    if (h && h.id !== houseId) { setHouseId(h.id); store.set(HOUSE_KEY, h.id); }
    if (h) {
      const [{ data: mm }, { data: rr }] = await Promise.all([
        supabase.from('memberships').select('profile_id, role, profiles(id, name, color)').eq('household_id', h.id).order('joined_at'),
        supabase.from('share_ratios').select('profile_a, profile_b, ratio_a').eq('household_id', h.id),
      ]);
      const all = (mm ?? []).map((m: any, k: number) => ({ id: m.profile_id, role: m.role, name: m.profiles?.name ?? '—', color: m.profiles?.color ?? COLORS[k % COLORS.length] }));
      setMembers(all.filter((m) => m.role !== 'staff'));
      setStaff(all.filter((m) => m.role === 'staff').map(({ id, name, color }) => ({ id, name, color })));
      setRatioRow((rr ?? [])[0] ? { ...(rr as any)[0], ratio_a: Number((rr as any)[0].ratio_a) } : null);
    } else { setMembers([]); setStaff([]); setRatioRow(null); }
    setReady(true);
  }, [session?.user.id, houseId]);

  useEffect(() => { reload(); }, [reload]);

  // Alguém entrou ou saiu da casa: atualiza já.
  useEffect(() => {
    if (!houseId) return;
    const ch = supabase.channel(`nikki-members-${houseId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'nikki', table: 'memberships', filter: `household_id=eq.${houseId}` }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [houseId, reload]);

  const house = houses.find((x) => x.id === houseId) ?? null;
  const partner = members.find((m) => m.id !== me?.id) ?? null;
  let myShare = 0.5;
  if (ratioRow && me && partner && [ratioRow.profile_a, ratioRow.profile_b].includes(partner.id)) {
    myShare = ratioRow.profile_a === me.id ? ratioRow.ratio_a : 1 - ratioRow.ratio_a;
  }
  const setHouse = (id: string) => { store.set(HOUSE_KEY, id); setHouseId(id); };

  return (
    <Ctx.Provider value={{ ready, session, me, appAdmin, houses, house, members, staff, partner, myShare: Math.round(myShare * 1000) / 1000, ratioRow, setHouse, reload }}>
      {children}
    </Ctx.Provider>
  );
}
