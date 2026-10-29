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
import { InviteLanding, Login, NoAccess, Onboarding, Waiting, usePendingInvite } from '@/screens/Auth';
import { Hub, Soon, Spaces, Story } from '@/screens/Home';
import { Cats, Money } from '@/screens/Money';
import { Shop } from '@/screens/Shop';
import { People, Profile } from '@/screens/People';
import { Gate, Modules } from '@/screens/Modules';
import { Tickets, lastPlace } from '@/screens/Tickets';
import { Admin, useAdminBadge } from '@/screens/Admin';
import { Wealth } from '@/screens/Wealth';
import { CarScreen, Garage } from '@/screens/Garage';
import { QuickAdd } from '@/screens/QuickAdd';
import { BillScreen, Casa, CasaPart, CasaSetup } from '@/screens/Casa';
import { HkDay, HkPart, Housekeeping } from '@/screens/Housekeeping';
import { Goals } from '@/screens/Goals';
import { Gym, GymMetric } from '@/screens/Gym';
import { Housekeeper } from '@/screens/Housekeeper';
import { moduleOf } from '@/lib/modules';

/**
 * Só o início tem barra de topo: a marca e o perfil. Os outros ecrãs começam no «Voltar».
 * Depois da abertura a marca é só a cara (olhos e bigodes); um toque leva à história.
 */
function TopBar() {
  const { me } = useSession();
  const adm = useAdminBadge(); // pedidos de conta e tickets: na administração, não no início da casa
  return (
    <header className="status" aria-label="NIKKI">
      <div className="left" style={{ color: 'var(--ink)' }}><Link className="press" to="/historia" aria-label="NIKKI: a história"><Face h={18} /></Link></div>
      <div className="right"><Link className="avatar press" to="/perfil" style={{ ['--c' as any]: me?.color }} aria-label={`Perfil de ${me?.name ?? ''}${adm.pending + adm.novo ? ` (${adm.pending + adm.novo} na administração)` : ''}`}>{me?.name?.[0]}{adm.pending + adm.novo > 0 && <span className="av-dot" aria-hidden="true" />}</Link></div>
    </header>
  );
}

/** Barra de baixo: só ícones. Início · + · Espaços. */
function BottomBar() {
  const { pathname } = useLocation();
  const { open, isOpen, close } = useOverlays();
  return (
    <nav className="bottom" aria-label="Principal"><div className="in">
      <Link className="press" to="/" aria-label="Início" aria-current={pathname === '/' ? 'page' : undefined}><Icon n="home" /></Link>
      <button className="press add" aria-label="Juntar: despesa, evento, a fazer…" aria-expanded={isOpen} onClick={() => (isOpen ? close() : open(<QuickAdd />))}><Icon n="plus" s={24} w={1.6} /></button>
      <Link className="press" to="/espacos" aria-label="Espaços" aria-current={pathname === '/espacos' ? 'page' : undefined}><Icon n="grid" /></Link>
    </div></nav>
  );
}


function SoonRoute() {
  const { k = '' } = useParams();
  const m = moduleOf(`/em-breve/${k}`);
  return m ? <Gate k={m}><Soon k={k} /></Gate> : <Soon k={k} />;
}

function HousePull() { const { reloadAll } = useHouse(); return <Pull onRefresh={reloadAll} />; }

function Shell() {
  const { ready, session, house, me, appAdmin } = useSession();
  const { pathname } = useLocation();
  usePendingInvite();
  const onHub = !!house && house.role !== 'staff' && pathname === '/';
  useEffect(() => { document.body.classList.toggle('nobar', !onHub); }, [onHub]);
  useEffect(() => { scrollTo(0, 0); if (pathname !== '/melhorar' && pathname !== '/perfil') lastPlace.path = pathname; }, [pathname]);

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
  // Sem casa: conta à espera (pedido feito), sem acesso (em pausa ou recusada) ou primeiro uso.
  if (!house) {
    const gate = me?.status === 'paused' || me?.status === 'declined' ? <NoAccess /> : me?.status === 'pending' && me.request ? <Waiting /> : <Onboarding />;
    return (
      <div className="app"><main className="screen"><Routes>
        <Route path="/historia" element={<Story />} />
        {appAdmin && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={gate} />
      </Routes></main><SheetHost /></div>
    );
  }
  // Quem faz o housekeeping tem a sua NIKKI: só a lista da visita, as mensagens e as compras.
  if (house.role === 'staff') return <><Housekeeper /><SheetHost /></>;
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
          <Route path="/contas" element={<Navigate to="/dinheiro?ver=entre-nos" replace />} />
          <Route path="/compras" element={<Gate k="compras"><Shop /></Gate>} />
          <Route path="/patrimonio" element={<Gate k="patrimonio"><Wealth /></Gate>} />
          <Route path="/casa" element={<Gate k="casa"><Casa /></Gate>} />
          <Route path="/casa/arranque/:id" element={<Gate k="casa"><CasaSetup key="edit" /></Gate>} />
          <Route path="/casa/nova" element={<Gate k="casa"><CasaSetup key="new" /></Gate>} />
          <Route path="/casa/conta/:id" element={<Gate k="casa"><BillScreen /></Gate>} />
          <Route path="/casa/:part" element={<Gate k="casa"><CasaPart /></Gate>} />
          <Route path="/ginasio" element={<Gate k="ginasio"><Gym /></Gate>} />
          <Route path="/ginasio/:key" element={<Gate k="ginasio"><GymMetric /></Gate>} />
          <Route path="/objetivos" element={<Gate k="objetivos"><Goals /></Gate>} />
          <Route path="/housekeeping" element={<Gate k="housekeeping"><Housekeeping /></Gate>} />
          <Route path="/housekeeping/dia/:day" element={<Gate k="housekeeping"><HkDay /></Gate>} />
          <Route path="/housekeeping/:part" element={<Gate k="housekeeping"><HkPart /></Gate>} />
          <Route path="/garagem" element={<Gate k="garagem"><Garage /></Gate>} />
          <Route path="/garagem/:id" element={<Gate k="garagem"><CarScreen /></Gate>} />
          <Route path="/modulos" element={<Modules />} />
          <Route path="/melhorar" element={<Tickets />} />
          {appAdmin && <Route path="/admin" element={<Admin />} />}
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
    <Router basename={DEMO ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      {intro && <Intro onDone={endIntro} />}
      <OverlayProvider>
        <SessionProvider><Shell /></SessionProvider>
      </OverlayProvider>
    </Router>
  );
}
