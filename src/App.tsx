import { useEffect } from 'react';
import { BrowserRouter, Link, MemoryRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { DEMO } from '@/lib/supabase';
import { SessionProvider, useSession } from '@/data/session';
import { HouseProvider } from '@/data/house';
import { OverlayProvider, SheetHost, useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Wordmark } from '@/brand/Wordmark';
import { InviteLanding, Login, Onboarding, usePendingInvite } from '@/screens/Auth';
import { Hub, Soon, Spaces, Story } from '@/screens/Home';
import { Cats, ExpenseSheet, Ledger, Money } from '@/screens/Money';
import { Shop } from '@/screens/Shop';
import { People, Profile } from '@/screens/People';

/** Só o início tem barra de topo: a marca e o perfil. Os outros ecrãs começam no «Voltar». */
function TopBar() {
  const { me } = useSession();
  return (
    <header className="status" aria-label="NIKKI">
      <div className="left" style={{ color: 'var(--ink)' }}><Wordmark h={12} alive /></div>
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

function Shell() {
  const { ready, session, house } = useSession();
  const { pathname } = useLocation();
  usePendingInvite();
  const onHub = !!house && pathname === '/';
  useEffect(() => { document.body.classList.toggle('nobar', !onHub); }, [onHub]);
  useEffect(() => { scrollTo(0, 0); }, [pathname]);

  if (!ready) return <div className="center"><Wordmark h={40} draw alive /></div>;
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

export default function App() {
  return (
    <Router>
      <OverlayProvider>
        <SessionProvider><Shell /></SessionProvider>
      </OverlayProvider>
    </Router>
  );
}
