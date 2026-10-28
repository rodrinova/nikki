import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, MemoryRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { DEMO } from '@/lib/supabase';
import { SessionProvider, useSession } from '@/data/session';
import { HouseProvider, useHouse } from '@/data/house';
import { OverlayProvider, SheetHost, useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Face } from '@/brand/Face';
import { INTRO_KEY, Intro } from '@/brand/Intro';
import { Pull } from '@/ui/Pull';
import { store } from '@/lib/store';
import { todayStr } from '@/lib/dates';
import { InviteLanding, Login, Onboarding, usePendingInvite } from '@/screens/Auth';
import { Hub, Soon, Spaces, Story } from '@/screens/Home';
import { Cats, ExpenseSheet, Ledger, Money } from '@/screens/Money';
import { Shop } from '@/screens/Shop';
import { People, Profile } from '@/screens/People';

/**
 * Só o início tem barra de topo: a marca e o perfil. Os outros ecrãs começam no «Voltar».
 * Depois da abertura a marca é só a cara (olhos e bigodes); um toque leva à história.
 */
function TopBar() {
  const { me } = useSession();
  return (
    <header className="status" aria-label="NIKKI">
      <div className="left" style={{ color: 'var(--ink)' }}><Link className="press" to="/historia" aria-label="NIKKI: a história"><Face h={18} /></Link></div>
      <div className="right"><Link className="avatar press" to="/perfil" style={{ ['--c' as any]: me?.color }} aria-label={`Perfil de ${me?.name ?? ''}`}>{me?.name?.[0]}</Link></div>
    </header>
  );
}

/** Barra de baixo: só ícones. Início · Espaços · + · Perguntar. */
function BottomBar() {
  const { pathname } = useLocation();
  const { open, toast, isOpen, close } = useOverlays();
  return (
    <nav className="bottom" aria-label="Principal"><div className="in">
      <Link className="press" to="/" aria-label="Início" aria-current={pathname === '/' ? 'page' : undefined}><Icon n="home" /></Link>
      <Link className="press" to="/espacos" aria-label="Espaços" aria-current={pathname === '/espacos' ? 'page' : undefined}><Icon n="grid" /></Link>
      <button className="press add" aria-label="Registar uma despesa" aria-expanded={isOpen} onClick={() => (isOpen ? close() : open(<ExpenseSheet />))}><Icon n="plus" s={24} w={1.6} /></button>
      <button className="press" aria-label="Perguntar à NIKKI" onClick={() => toast('A Pergunta à NIKKI chega na próxima fase.')}><Icon n="ask" /></button>
    </div></nav>
  );
}

function SoonRoute() { const { k } = useParams(); return <Soon k={k ?? ''} />; }

function HousePull() { const { reloadAll } = useHouse(); return <Pull onRefresh={reloadAll} />; }

function Shell() {
  const { ready, session, house } = useSession();
  const { pathname } = useLocation();
  usePendingInvite();
  const onHub = !!house && pathname === '/';
  useEffect(() => { document.body.classList.toggle('nobar', !onHub); }, [onHub]);
  useEffect(() => { scrollTo(0, 0); }, [pathname]);

  if (!ready) return <div className="center" style={{ color: 'var(--ink)' }}><Face h={40} mode="busy" label="A carregar" /></div>;
  if (!session) return (
    <div className="app"><main className="screen">
      <Routes>
        <Route path="/convite/:token" element={<InviteLanding />} />
        <Route path="/historia" element={<Story />} />
        <Route path="*" element={<Login />} />
      </Routes>
    </main><SheetHost /></div>
  );
  if (!house) return <div className="app"><main className="screen"><Routes><Route path="/historia" element={<Story />} /><Route path="*" element={<Onboarding />} /></Routes></main><SheetHost /></div>;
  return (
    <HouseProvider>
      <HousePull />
      {onHub && <TopBar />}
      <div className="app"><main className="screen" key={pathname}>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/espacos" element={<Spaces />} />
          <Route path="/dinheiro" element={<Money />} />
          <Route path="/dinheiro/categorias" element={<Cats />} />
          <Route path="/contas" element={<Ledger />} />
          <Route path="/compras" element={<Shop />} />
          <Route path="/pessoas" element={<People />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/historia" element={<Story />} />
          <Route path="/em-breve/:k" element={<SoonRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main></div>
      <BottomBar />
      <SheetHost />
    </HouseProvider>
  );
}

// Na demonstração (página única, sem servidor) as rotas vivem em memória.
const Router = DEMO ? MemoryRouter : BrowserRouter;

/** A abertura aparece na primeira abertura de cada dia (e quando se pede na história). */
function useIntro() {
  const [on, setOn] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches && store.get(INTRO_KEY) !== todayStr());
  useEffect(() => {
    if (on) store.set(INTRO_KEY, todayStr());
    const again = () => setOn(true);
    addEventListener('nikki:intro', again);
    return () => removeEventListener('nikki:intro', again);
  }, [on]);
  return [on, useCallback(() => setOn(false), [])] as const;
}

export default function App() {
  const [intro, endIntro] = useIntro();
  return (
    <Router>
      {intro && <Intro onDone={endIntro} />}
      <OverlayProvider>
        <SessionProvider><Shell /></SessionProvider>
      </OverlayProvider>
    </Router>
  );
}
