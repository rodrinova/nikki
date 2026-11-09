import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEMO, supabase } from '@/lib/supabase';
import { enterWithHkLink } from '@/data/hkLink';
import { Face } from '@/brand/Face';
import { Loading } from '@/ui/lazy';

/**
 * O link de quem faz o housekeeping (/h/<link>): entra logo, sem e-mail nem palavra-passe. Se o aparelho já tiver
 * outra sessão (por exemplo, quem enviou o link a experimentar), pergunta antes de a trocar.
 */
export function HkLinkPage() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState<'checking' | 'other' | 'entering' | string>('checking');
  const enter = async () => {
    setState('entering');
    const err = await enterWithHkLink(token);
    if (err) return setState(err);
    // A app abre de novo, já com a sessão dela (na demonstração, que é uma página só, muda-se de ecrã).
    if (DEMO) nav('/', { replace: true }); else location.replace(`${import.meta.env.BASE_URL}`);
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) setState('other'); else void enter(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (state === 'checking' || state === 'entering') return <Loading page label="A entrar" />;
  return (
    <div className="hkl">
      <span className="hkl-face"><Face h={44} mode={state === 'other' ? 'alive' : 'still'} /></span>
      {state === 'other' ? (
        <>
          <p className="l">Este link é para entrar como quem faz o housekeeping.</p>
          <p className="s">Neste aparelho já está aberta outra conta da NIKKI. Se continuar, essa conta sai deste aparelho (não se apaga nada).</p>
          <button type="button" className="btn wide press" onClick={async () => { await supabase.auth.signOut({ scope: 'local' }); void enter(); }}>Entrar com este link</button>
          <button type="button" className="btn quiet wide press" onClick={() => nav('/', { replace: true })}>Ficar como estou</button>
        </>
      ) : (
        <>
          <p className="l">{state}</p>
          <button type="button" className="btn wide press" onClick={() => void enter()}>Tentar outra vez</button>
        </>
      )}
    </div>
  );
}
