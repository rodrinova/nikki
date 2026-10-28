import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useLive } from '@/data/live';
import type { InviteRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Top } from './Home';

const inviteUrl = (token: string) => `${location.origin}/convite/${token}`;

/** Partilha pelo menu do telemóvel (WhatsApp, Mensagens…) ou copia, se não houver. */
async function shareInvite(i: Pick<InviteRow, 'token' | 'code'>, house: string, toast: (m: string) => void) {
  const text = `Convite para a casa «${house}» na NIKKI. Código: ${i.code}`;
  try { if (navigator.share) { await navigator.share({ title: 'NIKKI', text, url: inviteUrl(i.token) }); return; } }
  catch (e) { if ((e as Error).name === 'AbortError') return; /* partilha recusada: copia */ }
  try { await navigator.clipboard.writeText(`${text}\n${inviteUrl(i.token)}`); toast('Convite copiado.'); }
  catch { toast(`Código do convite: ${i.code}`); }
}

export function InviteForm({ householdId, onDone }: { householdId: string; onDone?: () => void }) {
  const { me, house } = useSession();
  const { toast } = useOverlays();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [made, setMade] = useState<Pick<InviteRow, 'token' | 'code' | 'email'>[]>([]);
  const [err, setErr] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!email.includes('@') || !me) return setErr('Escreve o e-mail da pessoa.');
    const { data, error } = await supabase.from('invites').insert({ household_id: householdId, email: email.trim().toLowerCase(), role, created_by: me.id }).select('token, code, email').single();
    if (error) return setErr(error.message);
    setMade((m) => [...m, data as any]); setEmail('');
    await shareInvite(data as any, house?.name ?? 'NIKKI', toast);
    onDone?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form className="add-row" onSubmit={add}><label className="sr" htmlFor="inv-mail">E-mail</label><input id="inv-mail" className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.pt" /><button className="sq press" aria-label="Criar convite"><Icon n="plus" /></button></form>
      <div className="seg" role="group" aria-label="Papel">
        <button type="button" className="press" aria-pressed={role === 'member'} onClick={() => setRole('member')}>Membro</button>
        <button type="button" className="press" aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>Administrador</button>
      </div>
      {err && <p className="err">{err}</p>}
      {made.length > 0 && <div className="tile card rows">{made.map((i) => (
        <button key={i.token} className="press" onClick={() => shareInvite(i, house?.name ?? 'NIKKI', toast)}><span>{i.email}<span className="s" style={{ display: 'block' }}>código {i.code} · expira em 7 dias</span></span><span className="v s">Partilhar<Icon n="arrow" s={16} /></span></button>
      ))}</div>}
      <p className="s">O convite abre-se pela ligação ou com o código. Administradores convidam pessoas, mudam papéis e gerem a garagem.</p>
    </div>
  );
}

export function People() {
  const { house, members, me, partner, myShare, ratioRow, reload } = useSession();
  const { open, close, toast } = useOverlays();
  const admin = house?.role === 'admin';
  const invites = useLive<InviteRow>('invites', admin ? house?.id : null, 'id, email, role, token, code, expires_at, accepted_at', { column: 'created_at' });
  const pending = invites.rows.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());
  const pct = Math.round(myShare * 100);

  async function setRole(id: string, role: 'admin' | 'member') {
    const { error } = await supabase.from('memberships').update({ role }).eq('household_id', house!.id).eq('profile_id', id);
    if (error) toast(error.message.includes('administrador') ? 'A casa precisa de pelo menos um administrador.' : error.message); else reload();
  }

  function ratioSheet() {
    if (!me || !partner || !house) return;
    const a = me.id < partner.id ? me.id : partner.id, b = me.id < partner.id ? partner.id : me.id;
    function Ratio() {
      const [mine, setMine] = useState(pct);
      async function save() {
        const ratio_a = (a === me!.id ? mine : 100 - mine) / 100;
        const { error } = await supabase.from('share_ratios').upsert({ household_id: house!.id, profile_a: a, profile_b: b, ratio_a, updated_at: new Date().toISOString() });
        if (error) { toast(error.message); return; }
        close(); toast(`Partilha: ${me!.name} ${mine}% · ${partner!.name} ${100 - mine}%`); reload();
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="l">Partilha das despesas</p>
          <p className="s" style={{ fontSize: 'var(--t-m)' }}>Como dividem as partilhadas. Muda as contas a dois e a parte de cada um, daqui para a frente.</p>
          <div className="chips" role="group" aria-label="Predefinições">{[50, 60, 70, 40, 30].map((r) => <button key={r} type="button" className="press" aria-pressed={mine === r} onClick={() => setMine(r)}>{r}/{100 - r}</button>)}</div>
          <label className="knob"><span className="row1"><span>{me!.name} {mine}%</span><span>{partner!.name} {100 - mine}%</span></span><input type="range" min={10} max={90} step={5} value={mine} onChange={(e) => setMine(+e.target.value)} /></label>
          <p className="s">Numa partilhada de 100 €: {me!.name} {mine} €, {partner!.name} {100 - mine} €.</p>
          <button className="btn wide press" onClick={save}>Guardar <Icon n="check" s={20} /></button>
        </div>
      );
    }
    open(<Ratio />);
  }

  return (
    <>
      <Top title="Pessoas" right={admin ? <button className="tb press" onClick={() => open(<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><p className="l">Convidar</p><InviteForm householdId={house!.id} onDone={() => invites.reload()} /></div>)}>Convidar</button> : null} />
      <p className="s">{house?.name} · {admin ? 'és administrador' : 'és membro'}</p>
      {partner && <div className="tile card rows">{admin
        ? <button className="press" onClick={ratioSheet}><span className="k">Partilha das despesas</span><span className="v">{pct}/{100 - pct}<Icon n="arrow" s={16} /></span></button>
        : <div><span className="k">Partilha das despesas</span><span className="v">{pct}/{100 - pct}</span></div>}</div>}
      {partner && !ratioRow && admin && <p className="hint">Ainda a 50/50 por defeito.</p>}
      <div className="tile card rows">
        {members.map((m) => (
          <div key={m.id}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className="avatar" style={{ ['--c' as any]: m.color }}>{m.name[0]}</span><span>{m.name}{m.id === me?.id ? ' (tu)' : ''}<span className="role" style={{ display: 'block' }}>{m.role === 'admin' ? 'Administrador' : 'Membro'}</span></span></span>
            {admin && m.id !== me?.id && <button className="tb press" onClick={() => setRole(m.id, m.role === 'admin' ? 'member' : 'admin')}>{m.role === 'admin' ? 'Tirar admin' : 'Tornar admin'}</button>}
          </div>
        ))}
        {pending.map((i) => (
          <div key={i.id}><span>{i.email}<span className="role" style={{ display: 'block' }}>convite · código {i.code}</span></span>
            <button className="tb press" onClick={() => shareInvite(i, house?.name ?? 'NIKKI', toast)}>Partilhar</button></div>
        ))}
      </div>
      <p className="s">Cada pessoa tem o seu login. Administradores convidam, mudam papéis e gerem a garagem.</p>
    </>
  );
}

export function Profile() {
  const { me, members, reload } = useSession();
  const { toast } = useOverlays();
  const [name, setName] = useState(me?.name ?? '');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !me) return;
    const { error } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', me.id);
    if (error) toast(error.message); else { toast('Nome guardado.'); reload(); }
  }
  return (
    <>
      <Top title="Perfil" />
      <form className="add-row" onSubmit={save}><label className="sr" htmlFor="p-name">Nome</label><input id="p-name" className="field" value={name} onChange={(e) => setName(e.target.value)} /><button className="sq press" aria-label="Guardar nome"><Icon n="check" /></button></form>
      <div className="tile card rows">
        <Link className="press" to="/pessoas"><span className="k">Casa</span><span className="v">{members.length} {members.length === 1 ? 'pessoa' : 'pessoas'}<Icon n="arrow" s={16} /></span></Link>
        <Link className="press" to="/historia"><span className="k">A história da NIKKI</span><span className="v"><Icon n="arrow" s={16} /></span></Link>
      </div>
      <p className="s">Quem vê o quê</p>
      <div className="tile card rows">
        <div><span className="k">Despesas só tuas e ginásio</span><span className="v">só tu</span></div>
        <div><span className="k">Despesas partilhadas e contas a dois</span><span className="v">os dois</span></div>
        <div><span className="k">Compras, agenda, garagem e casa</span><span className="v">toda a casa</span></div>
      </div>
      <button className="btn quiet wide press" onClick={() => supabase.auth.signOut()}>Sair <Icon n="arrow" s={20} /></button>
    </>
  );
}
