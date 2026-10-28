import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useOverlays } from '@/ui/overlays';
import { Wordmark } from '@/brand/Wordmark';
import { Icon } from '@/ui/Icon';
import { InviteForm } from './People';

const PENDING_INVITE = 'nikki_invite';

/** Entrar com link mágico ou com o código de 6 algarismos do mesmo e-mail (útil na app instalada no iPhone). */
export function Login() {
  const { toast } = useOverlays();
  const [mode, setMode] = useState<'in' | 'new'>('in');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!email.includes('@')) return setErr('Escreve o teu e-mail.');
    if (mode === 'new' && !name.trim()) return setErr('Como te chamam?');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin, data: mode === 'new' ? { name: name.trim() } : undefined },
    });
    setBusy(false);
    if (error) return setErr(error.status === 429 ? 'Muitos pedidos seguidos. Espera um minuto e tenta outra vez.' : error.message);
    setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!/^\d{6}$/.test(code)) return setErr('O código tem 6 algarismos.');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
    setBusy(false);
    if (error) setErr('Código errado ou expirado. Pede outro link.');
    else toast('Entraste.');
  }

  if (sent) return (
    <section className="ob">
      <div style={{ color: 'var(--ink)' }}><Wordmark h={36} alive /></div>
      <h1 className="l">Vê o teu e-mail</h1>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Enviámos um link para {email}. Abre-o neste aparelho e entras. Não há palavra-passe.</p>
      <form className="form" onSubmit={verify}>
        <label>Ou escreve o código do e-mail<input className="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press" disabled={busy}>Entrar <Icon n="arrow" s={20} /></button>
      </form>
      <button className="back press" onClick={() => { setSent(false); setCode(''); }}>Usar outro e-mail</button>
    </section>
  );

  return (
    <section className="ob">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, color: 'var(--ink)' }}>
        <Wordmark h={36} draw alive />
        <p className="s" style={{ fontSize: 'var(--t-m)' }}>Põe ordem na vida da casa.</p>
      </div>
      <form className="form" onSubmit={send}>
        {mode === 'new' && <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como te chamam" autoComplete="given-name" /></label>}
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="o teu e-mail" autoComplete="email" /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press" disabled={busy}>{mode === 'new' ? 'Criar conta' : 'Receber link para entrar'} <Icon n="arrow" s={20} /></button>
      </form>
      {mode === 'in'
        ? <button className="btn quiet wide press" onClick={() => { setMode('new'); setErr(''); }}>Criar conta <Icon n="arrow" s={20} /></button>
        : <button className="back press" onClick={() => { setMode('in'); setErr(''); }}>Já tenho conta</button>}
      <Link className="back press" to="/historia"><span>A história da NIKKI</span><Icon n="arrow" s={18} /></Link>
    </section>
  );
}

/** Depois de entrar sem casa: nome, criar casa ou entrar com convite, convidar (opcional). */
export function Onboarding() {
  const { me, reload } = useSession();
  const { toast } = useOverlays();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(me?.name ?? '');
  const [mode, setMode] = useState<'new' | 'join'>('new');
  const [house, setHouse] = useState('');
  const [code, setCode] = useState('');
  const [hid, setHid] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (me && !name) setName(me.name); }, [me, name]);

  const steps = <div className="steps" aria-hidden="true">{[0, 1, 2].map((j) => <i key={j} className={j <= step ? 'on' : ''} />)}</div>;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !me) return setErr('Como te chamam?');
    const { error } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', me.id);
    if (error) return setErr(error.message);
    setErr(''); setStep(1);
  }
  async function makeHouse(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (mode === 'new') {
      if (!house.trim()) return setErr('Dá um nome à casa.');
      const { data, error } = await supabase.rpc('create_household', { house_name: house.trim() });
      if (error) return setErr(error.message);
      setHid(data as string); setStep(2);
    } else {
      const { error } = await supabase.rpc('accept_invite', { invite: code.trim() });
      if (error) return setErr(error.message === 'convite expirado' ? 'Este convite expirou. Pede outro.' : 'Código inválido.');
      await reload(); toast('Convite aceite.'); nav('/');
    }
  }

  if (step === 0) return (
    <section className="ob">{steps}<h1 className="l">Como te chamam?</h1>
      <form className="form" onSubmit={saveName}><label>Nome<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
        {err && <p className="err">{err}</p>}<button className="btn wide press">Continuar <Icon n="arrow" s={20} /></button></form>
    </section>
  );
  if (step === 1) return (
    <section className="ob"><button className="back press" onClick={() => setStep(0)}><Icon n="back" s={20} /><span>Voltar</span></button>{steps}<h1 className="l">A tua casa</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="choice press" aria-pressed={mode === 'new'} onClick={() => setMode('new')}><span>Criar uma casa<span className="s" style={{ display: 'block' }}>Ficas administrador. Funciona a solo ou com quem vive contigo.</span></span><Icon n="house" /></button>
        <button className="choice press" aria-pressed={mode === 'join'} onClick={() => setMode('join')}><span>Tenho um convite<span className="s" style={{ display: 'block' }}>Entro numa casa que já existe</span></span><Icon n="link" /></button>
      </div>
      <form className="form" onSubmit={makeHouse}>
        {mode === 'new'
          ? <label>Nome da casa<input value={house} onChange={(e) => setHouse(e.target.value)} placeholder="Ex.: Casa da Graça" /></label>
          : <label>Código do convite<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="6 caracteres" maxLength={32} /></label>}
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Continuar <Icon n="arrow" s={20} /></button>
      </form>
    </section>
  );
  return (
    <section className="ob">{steps}<h1 className="l">Convidar</h1>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Vives com alguém? Cada pessoa recebe um convite e cria o seu login. Se vives sozinho, salta este passo.</p>
      {hid && <InviteForm householdId={hid} />}
      <button className="btn wide press" onClick={async () => { await reload(); toast(`Casa criada. Bem-vindo, ${name.trim()}.`); nav('/'); }}>Entrar <Icon n="arrow" s={20} /></button>
    </section>
  );
}

/** /convite/:token — guarda o convite e aceita-o assim que houver sessão. */
export function InviteLanding() {
  const { token } = useParams();
  useEffect(() => { if (token) localStorage.setItem(PENDING_INVITE, token); }, [token]);
  return (
    <section className="ob"><div style={{ color: 'var(--ink)' }}><Wordmark h={36} alive /></div>
      <h1 className="l">Foste convidado para uma casa na NIKKI.</h1>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Entra ou cria conta com o teu e-mail. O convite fica guardado e é aceite logo a seguir.</p>
      <Link className="btn wide press" to="/">Continuar <Icon n="arrow" s={20} /></Link>
    </section>
  );
}

/** Aceita um convite guardado depois de entrar. */
export function usePendingInvite() {
  const { session, reload } = useSession();
  const { toast } = useOverlays();
  useEffect(() => {
    const t = localStorage.getItem(PENDING_INVITE);
    if (!session || !t) return;
    localStorage.removeItem(PENDING_INVITE);
    supabase.rpc('accept_invite', { invite: t }).then(({ error }) => {
      if (error) toast(error.message === 'convite já usado' ? 'Esse convite já foi usado.' : 'O convite não é válido ou expirou.');
      else { toast('Convite aceite. Bem-vindo à casa.'); reload(); }
    });
  }, [session, reload, toast]);
}
