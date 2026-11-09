import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEMO, supabase } from '@/lib/supabase';
import { enterWithJoinLink, joinWhy, peekJoinLink } from '@/data/joinLink';
import { store } from '@/lib/store';
import { Face } from '@/brand/Face';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/lazy';
import { HomeScreenSteps } from './HkLink';

const MINE = 'nikki_join_link';
const standalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

/**
 * O link para entrar numa casa (/e/<link>): o nome e entra, sem e-mail nem palavra-passe. Como no link do
 * housekeeping, a página fica sem manifesto (o ícone do ecrã principal do iPhone fica com este endereço e entra
 * sozinho, durante 24 horas) e, se o aparelho já tiver outra conta, pergunta antes de a trocar.
 */
export function JoinLinkPage() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ house: string; from: string; used: boolean } | null>(null);
  const [state, setState] = useState<'checking' | 'ask' | 'other' | 'entering' | 'done' | 'bad'>('checking');
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const go = () => { if (DEMO) nav('/', { replace: true }); else location.replace(`${import.meta.env.BASE_URL}`); };
  const enter = async (n: string) => {
    setState('entering'); setErr('');
    const e = await enterWithJoinLink(token, n);
    if (e) { setErr(e); setState(info?.used ? 'bad' : 'ask'); return; }
    store.set(MINE, token);
    if (standalone()) go(); else setState('done');
  };
  useEffect(() => {
    const m = document.querySelector('link[rel="manifest"]'), parent = m?.parentNode;
    m?.remove();
    return () => { if (m && parent) parent.appendChild(m); };
  }, []);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && store.get(MINE) === token) return go();
      const r = await peekJoinLink(token);
      if (!r.ok) { setErr(joinWhy(r.why)); return setState('bad'); }
      setInfo(r.v);
      if (data.session) return setState('other');
      if (r.v.used) return void enter(''); // a mesma pessoa (ícone do ecrã principal): entra sozinha
      setState('ask');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (state === 'checking' || state === 'entering') return <Loading page label="A entrar" />;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!name.trim()) return setErr('Como te chamas?'); void enter(name.trim()); };
  return (
    <div className="hkl">
      <span className="hkl-face"><Face h={44} mode={state === 'done' ? 'wink' : 'alive'} /></span>
      {state === 'done' ? (
        <>
          <p className="l">Já está. Já fazes parte da casa{info?.house ? ` «${info.house}»` : ''}.</p>
          <HomeScreenSteps tu />
          <button type="button" className="btn wide press" onClick={go}>Abrir a NIKKI agora</button>
        </>
      ) : state === 'ask' ? (
        <form className="form" onSubmit={submit}>
          <p className="l">{info?.from ? `${info.from} convida-te para a casa${info.house ? ` «${info.house}»` : ''} na NIKKI.` : 'Tens um convite para uma casa na NIKKI.'}</p>
          <p className="s">Sem e-mail nem palavra-passe: escreve o teu nome e entras.</p>
          <label>O teu nome<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus autoComplete="given-name" /></label>
          {err && <p className="err">{err}</p>}
          <button className="btn wide press">Entrar <Icon n="arrow" s={20} /></button>
        </form>
      ) : state === 'other' ? (
        <>
          <p className="l">Este link é para outra pessoa entrar na casa.</p>
          <p className="s">Neste aparelho já está aberta uma conta da NIKKI. Se continuares, essa conta sai deste aparelho (não se apaga nada).</p>
          <button type="button" className="btn wide press" onClick={async () => { await supabase.auth.signOut({ scope: 'local' }); setState(info?.used ? 'checking' : 'ask'); if (info?.used) void enter(''); }}>Entrar com este link</button>
          <button type="button" className="btn quiet wide press" onClick={() => nav('/', { replace: true })}>Ficar como estou</button>
        </>
      ) : (
        <>
          <p className="l">{err || 'Este link não serve.'}</p>
          <button type="button" className="btn quiet wide press" onClick={() => nav('/', { replace: true })}>Ir para a NIKKI</button>
        </>
      )}
    </div>
  );
}
