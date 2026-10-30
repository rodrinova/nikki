import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DEMO, supabase } from '@/lib/supabase';
import { store } from '@/lib/store';
import { useSession } from '@/data/session';
import { useOverlays } from '@/ui/overlays';
import { Wordmark } from '@/brand/Wordmark';
import { Face } from '@/brand/Face';
import { Icon } from '@/ui/Icon';
import { ago } from '@/lib/admin';
import { enterWithCode } from '@/data/devices';
import { InviteForm } from './People';

const PENDING_INVITE = 'nikki_invite';

/** Mensagens da base ao aceitar um convite, em frases para pessoas. */
export function inviteError(m: string): string {
  if (m === 'convite expirado') return 'Este convite expirou. Os convites também têm prazo. Pede outro.';
  if (m === 'convite já usado') return 'Esse convite já foi usado.';
  if (m === 'a casa já tem duas pessoas') return 'Essa casa já tem duas pessoas.';
  if (m === 'conta sem acesso') return 'Esta conta não tem acesso.';
  return 'Código inválido.';
}

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
      options: { emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}`, data: mode === 'new' ? { name: name.trim() } : undefined },
    });
    setBusy(false);
    if (error) return setErr(error.status === 429 ? 'Muitos pedidos seguidos. Respira um minuto e tenta outra vez.' : error.message);
    setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!/^\d{6}$/.test(code)) return setErr('O código tem 6 algarismos.');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
    setBusy(false);
    if (error) setErr('Esse código não serve (errado ou já expirou). Pede outro link.');
    else toast('Entraste.');
  }

  if (sent) return (
    <section className="ob">
      <div style={{ color: 'var(--ink)' }}><Wordmark h={36} alive /></div>
      <h1 className="l">Vê o teu e-mail</h1>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Enviámos um link para {email}. Abre-o neste aparelho e entras. Sem palavras-passe para esquecer.{DEMO && ' Na demonstração, qualquer código de 6 algarismos serve.'}</p>
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
        {mode === 'new' && <p className="s">A NIKKI abre por convite. A primeira conta de cada casa é aprovada à mão, por um humano simpático. Com um convite de casa, entra-se logo.</p>}
      </form>
      {mode === 'in'
        ? <button className="btn quiet wide press" onClick={() => { setMode('new'); setErr(''); }}>Criar conta <Icon n="arrow" s={20} /></button>
        : <button className="back press" onClick={() => { setMode('in'); setErr(''); }}>Já tenho conta</button>}
      <FromDevice />
      <Link className="back press" to="/historia"><span>A história da NIKKI</span><Icon n="arrow" s={18} /></Link>
      {DEMO && <p className="demo"><span>Demonstração:</span><button onClick={() => (supabase.auth as any).demoSignIn('R')}>entrar como Rodrigo</button><button onClick={() => (supabase.auth as any).demoSignIn('I')}>entrar como Inês</button><button onClick={() => (supabase.auth as any).demoSignIn('M')}>entrar como Maria (housekeeping)</button></p>}
    </section>
  );
}

/**
 * Entrar com um código de outro aparelho (Perfil → «Entrar noutro aparelho»). Serve também para a app no ecrã
 * principal do iPhone, que não partilha a sessão com o Safari. A ligação «?codigo=…» já traz o código preenchido.
 */
function FromDevice() {
  const pre = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('codigo') ?? '' : '';
  const [open, setOpen] = useState(!!pre);
  const [code, setCode] = useState(pre.toUpperCase());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) return setErr('O código tem 8 letras e números (ex.: ABCD-2345).');
    setBusy(true);
    const why = await enterWithCode(code);
    setBusy(false);
    if (why) setErr(why); else if (pre) history.replaceState(null, '', location.pathname);
  }
  if (!open) return <button className="btn quiet wide press" onClick={() => setOpen(true)}>Já uso a NIKKI noutro aparelho <Icon n="arrow" s={20} /></button>;
  return (
    <form className="form tile card" style={{ padding: 16 }} onSubmit={go}>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>No aparelho onde já tens a NIKKI: Perfil → «Entrar noutro aparelho». Escreve aqui o código que aparece. Sem e-mails, sem esperas.</p>
      <label>Código<input className="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-2345" maxLength={9} autoCapitalize="characters" autoComplete="off" /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn wide press" disabled={busy}>Entrar <Icon n="arrow" s={20} /></button>
    </form>
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
  const [note, setNote] = useState('');
  const [hid, setHid] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const asks = me?.status === 'pending'; // a primeira casa precisa de aprovação
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
    if (mode === 'new' && asks) {
      if (!house.trim()) return setErr('Dá um nome à casa.');
      const { error } = await supabase.rpc('request_account', { house: house.trim(), note: note.trim() });
      if (error) return setErr(error.message);
      await reload(); // passa para o ecrã de espera
    } else if (mode === 'new') {
      if (!house.trim()) return setErr('Dá um nome à casa.');
      const { data, error } = await supabase.rpc('create_household', { house_name: house.trim() });
      if (error) return setErr(error.message);
      setHid(data as string); setStep(2);
    } else {
      const { error } = await supabase.rpc('accept_invite', { invite: code.trim() });
      if (error) return setErr(inviteError(error.message));
      await reload(); toast('Convite aceite. A casa é tua também.', { ok: true }); nav('/');
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
        <button className="choice press" aria-pressed={mode === 'new'} onClick={() => setMode('new')}><span>{asks ? 'Pedir uma casa' : 'Criar uma casa'}<span className="s" style={{ display: 'block' }}>{asks ? 'O pedido vai para aprovação. Depois, convidas quem vive contigo.' : 'Ficas administrador. Funciona a solo ou com quem vive contigo.'}</span></span><Icon n="house" /></button>
        <button className="choice press" aria-pressed={mode === 'join'} onClick={() => setMode('join')}><span>Tenho um convite<span className="s" style={{ display: 'block' }}>Entro numa casa que já existe</span></span><Icon n="link" /></button>
      </div>
      <form className="form" onSubmit={makeHouse}>
        {mode === 'new'
          ? <>
            <label>Nome da casa<input value={house} onChange={(e) => setHouse(e.target.value)} placeholder="Ex.: Casa da Graça" maxLength={80} /></label>
            {asks && <label>Uma nota para quem aprova (opcional)<textarea className="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quem vive contigo, como conheceste a NIKKI…" maxLength={300} rows={3} /></label>}
          </>
          : <label>Código do convite<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="6 caracteres" maxLength={32} /></label>}
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">{mode === 'new' && asks ? 'Enviar pedido' : 'Continuar'} <Icon n="arrow" s={20} /></button>
      </form>
    </section>
  );
  return (
    <section className="ob">{steps}<h1 className="l">Convidar</h1>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Vives com alguém? Cada pessoa recebe um convite e tem o seu login. Casa de uma pessoa só? Salta este passo, a NIKKI faz companhia.</p>
      {hid && <InviteForm householdId={hid} />}
      <button className="btn wide press" onClick={async () => { await reload(); toast(`Casa criada. Olá, ${name.trim()}.`, { ok: true }); nav('/'); }}>Entrar <Icon n="arrow" s={20} /></button>
    </section>
  );
}

/** /convite/:token — guarda o convite e aceita-o assim que houver sessão. */
export function InviteLanding() {
  const { token } = useParams();
  useEffect(() => { if (token) store.set(PENDING_INVITE, token); }, [token]);
  return (
    <section className="ob"><div style={{ color: 'var(--ink)' }}><Wordmark h={36} alive /></div>
      <h1 className="l">Tens um convite para uma casa na NIKKI.</h1>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Entra ou cria conta com o teu e-mail. O convite fica guardado e aceita-se sozinho a seguir.</p>
      <Link className="btn wide press" to="/">Continuar <Icon n="arrow" s={20} /></Link>
    </section>
  );
}

/** Aceita um convite guardado depois de entrar. */
export function usePendingInvite() {
  const { session, reload } = useSession();
  const { toast } = useOverlays();
  useEffect(() => {
    const t = store.get(PENDING_INVITE);
    if (!session || !t) return;
    store.remove(PENDING_INVITE);
    supabase.rpc('accept_invite', { invite: t }).then(({ error }) => {
      if (error) toast(error.message === 'convite inválido' ? 'O convite não é válido ou expirou.' : inviteError(error.message));
      else { toast('Convite aceite. Já fazes parte da casa.', { ok: true }); reload(); }
    });
  }, [session, reload, toast]);
}

/**
 * À espera de aprovação: o pedido já foi. Volta a ver sozinho de 30 em 30 segundos e quando a app volta a primeiro
 * plano; quando a administração aprova, a casa abre aqui. Com um convite de casa, entra logo.
 */
export function Waiting() {
  const { me, reload } = useSession();
  const { toast } = useOverlays();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') reload(); };
    const t = setInterval(check, 30_000);
    addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [reload]);
  async function join(e: FormEvent) {
    e.preventDefault(); setErr('');
    const { error } = await supabase.rpc('accept_invite', { invite: code.trim() });
    if (error) return setErr(inviteError(error.message));
    await reload(); toast('Convite aceite. Já fazes parte da casa.', { ok: true }); nav('/');
  }
  return (
    <section className="ob">
      <div style={{ color: 'var(--ink)' }}><Face h={44} label="NIKKI à espera" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="l">Pedido enviado. A chinchila está a ler.</h1>
        <p className="s" style={{ fontSize: 'var(--t-m)' }}>A casa abre aqui assim que o pedido for aprovado. Podes fechar a app: quando voltares, já cá está.</p>
      </div>
      <div className="tile card rows">
        <div><span className="k">Casa</span><span className="v">{me?.request?.house}</span></div>
        <div><span className="k">Pedido</span><span className="v">{ago(me?.requested_at ?? null)}</span></div>
      </div>
      <form className="form" onSubmit={join}>
        <label>Vais viver com alguém que já usa a NIKKI? Com o código do convite entras já.<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código do convite" maxLength={32} /></label>
        {err && <p className="err">{err}</p>}
        {code.trim() && <button className="btn wide press">Entrar na casa <Icon n="arrow" s={20} /></button>}
      </form>
      {DEMO && <p className="demo"><span>Demonstração:</span><button onClick={async () => { await (supabase as any).demoApprove(); await reload(); toast('Pedido aprovado. A NIKKI é tua.', { ok: true }); }}>aprovar o pedido, como faria o administrador</button></p>}
      <button className="back press" onClick={() => supabase.auth.signOut()}>Sair</button>
    </section>
  );
}

/** Conta suspensa ou pedido não aceite: sem acesso às casas (os dados ficam guardados). */
export function NoAccess() {
  const { me } = useSession();
  const paused = me?.status === 'paused';
  return (
    <section className="ob">
      <div style={{ color: 'var(--ink)' }}><Face h={44} mode="still" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="l">{paused ? 'Conta em pausa.' : 'Pedido não aceite.'}</h1>
        <p className="s" style={{ fontSize: 'var(--t-m)' }}>{paused
          ? 'Fala com quem administra a NIKKI para voltares. Está tudo guardado, tal como deixaste.'
          : 'Por agora a NIKKI abre a poucas casas. Fica para breve, prometido.'}</p>
      </div>
      <button className="btn quiet wide press" onClick={() => supabase.auth.signOut()}>Sair <Icon n="arrow" s={20} /></button>
    </section>
  );
}
