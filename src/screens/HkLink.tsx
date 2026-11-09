import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEMO, supabase } from '@/lib/supabase';
import { enterWithHkLink } from '@/data/hkLink';
import { store } from '@/lib/store';
import { Face } from '@/brand/Face';
import { Loading } from '@/ui/lazy';

const MINE = 'nikki_hk_link'; // o link com que este aparelho (ou esta app do ecrã principal) já entrou
const standalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * O link de quem faz o housekeeping (/h/<link>): entra logo, sem e-mail nem palavra-passe.
 * · No iPhone, a app do ecrã principal (com «Abrir como app web») não partilha a sessão com o Safari. Por isso,
 *   nesta página tira-se o manifesto: ao «Adicionar ao ecrã principal», o ícone fica com ESTE endereço e, ao abrir,
 *   entra sozinho (e das vezes seguintes vai direto, porque já tem sessão).
 * · Se o aparelho já tiver outra conta (por exemplo, quem enviou o link a experimentar), pergunta antes de a trocar.
 */
export function HkLinkPage() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState<'checking' | 'other' | 'entering' | 'done' | string>('checking');
  const go = () => { if (DEMO) nav('/', { replace: true }); else location.replace(`${import.meta.env.BASE_URL}`); };
  const enter = async () => {
    setState('entering');
    const err = await enterWithHkLink(token);
    if (err) return setState(err);
    store.set(MINE, token);
    // Na app do ecrã principal já está tudo: abre. No browser, mostra como a pôr no ecrã principal.
    if (standalone()) go(); else setState('done');
  };
  // Sem manifesto nesta página: o ícone do ecrã principal fica com o endereço do link.
  useEffect(() => {
    const m = document.querySelector('link[rel="manifest"]');
    const parent = m?.parentNode;
    m?.remove();
    return () => { if (m && parent) parent.appendChild(m); };
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return void enter();
      if (store.get(MINE) === token) return go(); // já é ela: direto à NIKKI
      setState('other');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (state === 'checking' || state === 'entering') return <Loading page label="A entrar" />;
  return (
    <div className="hkl">
      <span className="hkl-face"><Face h={44} mode={state === 'done' ? 'wink' : state === 'other' ? 'alive' : 'still'} /></span>
      {state === 'done' ? (
        <>
          <p className="l">Já está. Esta é a sua NIKKI.</p>
          <p className="s">Para a ter sempre à mão, com um ícone como as outras aplicações:</p>
          <ol className="hkl-steps">
            {ios() ? <>
              <li>Abra esta página no <b>Safari</b> (se veio do WhatsApp, toque em ⋯ e «Abrir no Safari»).</li>
              <li>Toque em <b>Partilhar</b> (o quadrado com a seta para cima).</li>
              <li>Escolha <b>Adicionar ao ecrã principal</b> e depois <b>Adicionar</b>.</li>
            </> : <>
              <li>Toque no menu <b>⋮</b> do browser.</li>
              <li>Escolha <b>Adicionar ao ecrã principal</b> (ou «Instalar aplicação»).</li>
            </>}
            <li>Daí em diante, é só tocar no ícone da NIKKI: entra sempre, sem pedir nada.</li>
          </ol>
          <button type="button" className="btn wide press" onClick={go}>Abrir a NIKKI agora</button>
        </>
      ) : state === 'other' ? (
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
