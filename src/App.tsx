import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, MemoryRouter, Navigate, Route, Routes, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { DEMO, DEMO_VISIT, stopDemo } from '@/lib/supabase';
import { DraftWatcher } from '@/screens/Capture';
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
import { AgendaScreen, Hub, Nos, Soon, Spaces, Story } from '@/screens/Home';
import { Cats, Money } from '@/screens/Money';
import { Shop } from '@/screens/Shop';
import { People, Profile } from '@/screens/People';
import { Gate, Modules } from '@/screens/Modules';
import { Tickets, lastPlace } from '@/screens/Tickets';
import { useAdminBadge } from '@/data/adminBadge';
import { Loading, later } from '@/ui/lazy';
import { QuickAdd } from '@/screens/QuickAdd';
import { Goals } from '@/screens/Goals';
import { DESTS, isRoot, under } from '@/lib/nav';
import { Aurora } from '@/n2/Aurora';
import { isNewcomer, tourKey } from '@/lib/guide';
import { useToggleModule } from '@/screens/Modules';
import type { ModuleKey } from '@/lib/modules';
import { Tour } from '@/ui/Tour';
import { moduleOf } from '@/lib/modules';

// Ecrãs menos usados (ou só de algumas pessoas): só se carregam quando se abrem.
const Wealth = later(() => import('@/screens/Wealth'), 'Wealth');
const WealthPart = later(() => import('@/screens/Wealth'), 'WealthPart');
const Gym = later(() => import('@/screens/Gym'), 'Gym');
const GymMetric = later(() => import('@/screens/Gym'), 'GymMetric');
const Occasions = later(() => import('@/screens/Occasions'), 'Occasions');
const OccasionScreen = later(() => import('@/screens/Occasions'), 'OccasionScreen');
const Garage = later(() => import('@/screens/GarageScreens'), 'Garage');
const CarScreen = later(() => import('@/screens/GarageScreens'), 'CarScreen');
const Casa = later(() => import('@/screens/CasaScreens'), 'Casa');
const CasaPart = later(() => import('@/screens/CasaScreens'), 'CasaPart');
const BillScreen = later(() => import('@/screens/CasaScreens'), 'BillScreen');
const CasaSetup = later(() => import('@/screens/CasaScreens'), 'CasaSetup');
const Housekeeping = later(() => import('@/screens/HousekeepingScreens'), 'Housekeeping');
const HkDay = later(() => import('@/screens/HousekeepingScreens'), 'HkDay');
const HkPart = later(() => import('@/screens/HousekeepingScreens'), 'HkPart');
const Admin = later(() => import('@/screens/Admin'), 'Admin');
const Housekeeper = later(() => import('@/screens/Housekeeper'), 'Housekeeper');
const Salvage = later(() => import('@/screens/Salvage'), 'Salvage');
const SalvageCarScreen = later(() => import('@/screens/Salvage'), 'SalvageCarScreen');
const SalvageLinkPage = later(() => import('@/screens/Salvage'), 'SalvageLinkPage');
const HkLinkPage = later(() => import('@/screens/HkLink'), 'HkLinkPage');
const JoinLinkPage = later(() => import('@/screens/JoinLink'), 'JoinLinkPage');
// NIKKI 2 (protótipo à parte): só para quem administra a app e na demonstração.
const N2Home = later(() => import('@/n2/N2'), 'N2Home');
const N2Time = later(() => import('@/n2/N2'), 'N2Time');
const N2Money = later(() => import('@/n2/N2'), 'N2Money');
const N2Casa = later(() => import('@/n2/N2'), 'N2Casa');

/** As caras dos dois (ou só a tua), sobrepostas: abrem o «Nós». */
function Pair({ big }: { big?: boolean }) {
  const { me, partner } = useSession();
  return (
    <span className={`pair${big ? ' big' : ''}`} aria-hidden="true">
      <span className="avatar" style={{ ['--c' as any]: me?.color }}>{me?.name?.[0]}</span>
      {partner && <span className="avatar" style={{ ['--c' as any]: partner.color }}>{partner.name?.[0]}</span>}
    </span>
  );
}

/**
 * Só o Hoje tem barra de topo: a marca e as vossas caras. Os outros ecrãs começam no título (ou no «Voltar»).
 * Depois da abertura a marca é só a cara (olhos e bigodes); um toque leva à história.
 */
function TopBar() {
  const { partner } = useSession();
  const adm = useAdminBadge(); // pedidos de conta e tickets: na administração, não no início da casa
  return (
    <header className="status" aria-label="NIKKI">
      <div className="left" style={{ color: 'var(--ink)' }}><Link className="press" to="/historia" aria-label="NIKKI: a história"><Face h={18} /></Link></div>
      <div className="right"><Link className="press pair-link" to="/nos" aria-label={`Nós${partner ? `: tu e ${partner.name}` : ''}${adm.pending + adm.novo ? ` (${adm.pending + adm.novo} na administração)` : ''}`}><Pair />{adm.pending + adm.novo > 0 && <span className="av-dot" aria-hidden="true" />}</Link></div>
    </header>
  );
}

/**
 * No iPad deitado e no computador: uma barra lateral de vidro com a marca, os cinco destinos, o «Registar» e o
 * perfil. Substitui a barra de topo e a de baixo (o CSS mostra uma ou outra pela largura do ecrã).
 */
function SideBar() {
  const { pathname } = useLocation();
  const { me } = useSession();
  const { open, isOpen, close } = useOverlays();
  const at = (to: string) => under(pathname, to);
  return (
    <nav className="side" aria-label="Principal">
      <Link className="side-brand press" to="/historia" aria-label="NIKKI: a história"><span className="side-tok"><Face h={18} /></span><span>NIKKI</span></Link>
      <button className="side-add press" aria-expanded={isOpen} aria-label="Registar: despesa, evento, compra, a fazer…" onClick={() => (isOpen ? close() : open(<QuickAdd />))}><Icon n="plus" s={20} w={1.6} /><span>Registar</span></button>
      <div className="side-list">
        {DESTS.map((d) => <Link key={d.to} className="side-i press" to={d.to} aria-current={at(d.to) ? 'page' : undefined}><Icon n={d.ic as any} s={20} /><span>{d.n}</span></Link>)}
      </div>
      <Link className="side-me press" to="/perfil" aria-current={at('/perfil') ? 'page' : undefined}><span className="avatar" style={{ ['--c' as any]: me?.color }}>{me?.name?.[0]}</span><span>{me?.name}</span></Link>
    </nav>
  );
}

/**
 * Barra de baixo: Hoje · Dinheiro · + · Agenda · Casa. Esconde-se ao descer a página (para não tapar o que se lê) e
 * volta ao subir ou no fim.
 */
function BottomBar() {
  const { pathname } = useLocation();
  const { open, isOpen, close } = useOverlays();
  const [hide, setHide] = useState(false);
  useEffect(() => {
    let y = scrollY;
    const on = () => {
      const ny = scrollY, end = ny + innerHeight >= document.documentElement.scrollHeight - 8;
      if (Math.abs(ny - y) < 6) return;
      setHide(ny > y && ny > 80 && !end);
      y = ny;
    };
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  useEffect(() => setHide(false), [pathname]);
  const n2 = n2Mode(pathname);
  const D: readonly { to: string; ic: string; n: string }[] = n2 ? N2_DESTS : DESTS;
  const tab = (d: { to: string; ic: string; n: string }) => {
    const cur = n2 ? (d.to === '/n2' ? pathname === '/n2' : d.to === '/n2/casa' ? !['/n2', '/n2/tempo', '/melhorar', '/agenda'].includes(pathname) : pathname === d.to) : under(pathname, d.to);
    return <Link key={d.to} className="press" to={d.to} aria-label={d.n} aria-current={cur ? 'page' : undefined}><Icon n={d.ic as any} /></Link>;
  };
  return (
    <nav className={`bottom${hide && !isOpen && !n2 ? ' away' : ''}`} aria-label="Principal"><div className="in">
      {tab(D[0])}{tab(D[1])}
      <button className="press add" aria-label="Registar: despesa, evento, compra, a fazer…" aria-expanded={isOpen} onClick={() => (isOpen ? close() : open(<QuickAdd />))}><Icon n="plus" s={24} w={1.6} /></button>
      {tab(D[2])}{tab(D[3])}
    </div></nav>
  );
}

/**
 * NIKKI 2 (pré-visualização): ligada desde que se entra em /n2 e em todos os ecrãs que se abrem a partir daí; ao
 * voltar ao início de todos os dias, desliga. Com ela, a app inteira veste o azul-noite, o vidro e a luz, e a barra
 * de baixo passa a Hoje · Agenda · + · Casa · Ideias.
 */
function n2Mode(_pathname?: string): boolean {
  return true; // o novo visual é o de toda a gente
}
const N2_DESTS = [{ to: '/n2', ic: 'home', n: 'Hoje' }, { to: '/n2/tempo', ic: 'cal', n: 'Agenda' }, { to: '/n2/casa', ic: 'grid', n: 'Casa' }, { to: '/melhorar', ic: 'chat', n: 'Ideias e problemas' }];
function N2Skin() {
  const { pathname } = useLocation();
  const on = n2Mode(pathname);
  useEffect(() => { document.body.classList.toggle('n2x', on); return () => document.body.classList.remove('n2x'); }, [on]);
  // O fundo reage: ao scroll (--sc, de 0 a 1 nos primeiros 240px) e à inclinação do telemóvel (--gx, --gy), onde o
  // sistema a dá sem pedir licença. Uma só escrita por frame.
  useEffect(() => {
    if (!on || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const st = document.body.style; let raf = 0, gx = 0, gy = 0;
    const paint = () => { raf = 0; st.setProperty('--sc', Math.min(1, scrollY / 240).toFixed(3)); st.setProperty('--gx', gx.toFixed(3)); st.setProperty('--gy', gy.toFixed(3)); };
    const ask = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const tilt = (e: DeviceOrientationEvent) => { gx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 30)); gy = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 30)); ask(); };
    addEventListener('scroll', ask, { passive: true }); addEventListener('deviceorientation', tilt);
    return () => { removeEventListener('scroll', ask); removeEventListener('deviceorientation', tilt); if (raf) cancelAnimationFrame(raf); ['--sc', '--gx', '--gy'].forEach((k) => st.removeProperty(k)); };
  }, [on]);
  return on ? <Aurora /> : null;
}

/**
 * O guia da NIKKI: abre sozinho na primeira vez que a pessoa entra na casa (não na demonstração) e sempre que for
 * pedido (Perfil → Guia da NIKKI). No fim, cada frente explica-se ao abrir pela primeira vez.
 */
function TourHost() {
  const { me, house } = useSession();
  const { on } = useHouse();
  const toggle = useToggleModule();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (me && !DEMO && isNewcomer(me.created_at) && !store.get(tourKey(me.id))) setOpen(true);
    const again = () => setOpen(true);
    addEventListener('nikki:tour', again);
    return () => removeEventListener('nikki:tour', again);
  }, [me]);
  if (!open || !me) return null;
  return <Tour picked={(k) => on(k as ModuleKey)} toggle={(k) => void toggle(k as ModuleKey, true)} canPick={!!house && house.role !== 'staff'} onClose={() => { store.set(tourKey(me.id), '1'); setOpen(false); }} />;
}

function SoonRoute() {
  const { k = '' } = useParams();
  const m = moduleOf(`/em-breve/${k}`);
  return m ? <Gate k={m}><Soon k={k} /></Gate> : <Soon k={k} />;
}

function HousePull() { const { reloadAll } = useHouse(); return <Pull onRefresh={reloadAll} />; }

/**
 * O sentido da transição entre páginas: para dentro (um nível abaixo, ou ir para a frente) entra da direita; voltar
 * (o «Voltar» do sistema ou subir de nível) entra da esquerda; ao mesmo nível, um fade curto.
 */
function usePageDir(pathname: string): 'fwd' | 'back' | 'fade' {
  const nav = useNavigationType();
  const prev = useRef(pathname), dir = useRef<'fwd' | 'back' | 'fade'>('fade');
  if (prev.current !== pathname) {
    // O Início e os Espaços são o nível de cima (os separadores da barra); cada espaço é um nível abaixo.
    const depth = (p: string) => (isRoot(p) ? 0 : p.split('/').filter(Boolean).length);
    const a = depth(prev.current), b = depth(pathname);
    dir.current = nav === 'POP' ? 'back' : b > a ? 'fwd' : b < a ? 'back' : 'fade';
    prev.current = pathname;
  }
  return dir.current;
}

function Shell() {
  const { ready, session, house, me, appAdmin } = useSession();
  const { pathname } = useLocation();
  const dir = usePageDir(pathname);
  usePendingInvite();
  const onHub = !!house && house.role !== 'staff' && pathname === '/';
  useEffect(() => { document.body.classList.toggle('nobar', !onHub); }, [onHub]);
  useEffect(() => { scrollTo(0, 0); if (pathname !== '/melhorar' && pathname !== '/perfil') lastPlace.path = pathname; }, [pathname]);

  // A página do mecânico (salvados): abre só com a ligação, com ou sem sessão, e não mostra mais nada da NIKKI.
  // Os links de entrada (quem faz o housekeeping, /h/; uma pessoa da casa, /e/): sem e-mail nem convite.
  if (pathname.startsWith('/h/') || pathname.startsWith('/e/')) return (
    <div className="app"><main className="screen"><Suspense fallback={<Loading page />}><Routes><Route path="/h/:token" element={<HkLinkPage />} /><Route path="/e/:token" element={<JoinLinkPage />} /></Routes></Suspense></main><SheetHost /></div>
  );
  if (pathname.startsWith('/s/') || pathname.startsWith('/p/')) return (
    <div className="app"><main className="screen"><Suspense fallback={<Loading page />}><Routes><Route path="/s/:token" element={<SalvageLinkPage />} /><Route path="/p/:code" element={<SalvageLinkPage />} /><Route path="/p/:code/:id" element={<SalvageLinkPage />} /></Routes></Suspense></main><SheetHost /></div>
  );
  if (!ready) return <Loading page />;
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
        {appAdmin && <Route path="/admin" element={<Suspense fallback={<Loading />}><Admin /></Suspense>} />}
        <Route path="*" element={gate} />
      </Routes></main><SheetHost /></div>
    );
  }
  // Quem faz o housekeeping tem a sua NIKKI: só a lista da visita, as mensagens e as compras.
  if (house.role === 'staff') return <><Suspense fallback={<Loading page />}><Housekeeper /></Suspense><SheetHost /></>;
  return (
    <HouseProvider>
      <HousePull />
      <DraftWatcher />
      {onHub && <TopBar />}
      <div className={`app${pathname === '/' || pathname === '/agenda' ? ' is-hub' : ''}`}><main className={`screen enter pg-${dir}`} key={pathname}>
        <Suspense fallback={<Loading label="A abrir" />}>
        <Routes>
          <Route path="/" element={n2Mode() ? <Navigate to="/n2" replace /> : <Hub />} />
          <Route path="/espacos" element={<Spaces />} />
          <Route path="/agenda" element={<AgendaScreen />} />
          <Route path="/nos" element={<Nos />} />
          <Route path="/dinheiro" element={<Money />} />
          <Route path="/dinheiro/categorias" element={<Cats />} />
          <Route path="/contas" element={<Navigate to="/dinheiro?ver=entre-nos" replace />} />
          <Route path="/compras" element={<Gate k="compras"><Shop /></Gate>} />
          <Route path="/patrimonio" element={<Gate k="patrimonio"><Wealth /></Gate>} />
          <Route path="/patrimonio/:part" element={<Gate k="patrimonio"><WealthPart /></Gate>} />
          <Route path="/casa" element={<Gate k="casa"><Casa /></Gate>} />
          <Route path="/casa/arranque/:id" element={<Gate k="casa"><CasaSetup key="edit" /></Gate>} />
          <Route path="/casa/nova" element={<Gate k="casa"><CasaSetup key="new" /></Gate>} />
          <Route path="/casa/conta/:id" element={<Gate k="casa"><BillScreen /></Gate>} />
          <Route path="/casa/:part" element={<Gate k="casa"><CasaPart /></Gate>} />
          <Route path="/ginasio" element={<Gate k="ginasio"><Gym /></Gate>} />
          <Route path="/ginasio/:key" element={<Gate k="ginasio"><GymMetric /></Gate>} />
          <Route path="/eventos" element={<Gate k="eventos"><Occasions /></Gate>} />
          <Route path="/eventos/:id" element={<Gate k="eventos"><OccasionScreen /></Gate>} />
          <Route path="/objetivos" element={<Gate k="objetivos"><Goals /></Gate>} />
          <Route path="/housekeeping" element={<Gate k="housekeeping"><Housekeeping /></Gate>} />
          <Route path="/housekeeping/dia/:day" element={<Gate k="housekeeping"><HkDay /></Gate>} />
          <Route path="/housekeeping/:part" element={<Gate k="housekeeping"><HkPart /></Gate>} />
          <Route path="/garagem" element={<Gate k="garagem"><Garage /></Gate>} />
          <Route path="/garagem/:id" element={<Gate k="garagem"><CarScreen /></Gate>} />
          <Route path="/modulos" element={<Modules />} />
          <Route path="/melhorar" element={<Tickets />} />
          {appAdmin && <Route path="/admin" element={<Admin />} />}
          <Route path="/n2" element={<N2Home />} />
          <Route path="/n2/tempo" element={<N2Time />} />
          <Route path="/n2/dinheiro" element={<N2Money />} />
          <Route path="/n2/casa" element={<N2Casa />} />
          {appAdmin && <Route path="/salvados" element={<Salvage />} />}
          {appAdmin && <Route path="/salvados/:id" element={<SalvageCarScreen />} />}
          <Route path="/pessoas" element={<People />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/historia" element={<Story />} />
          <Route path="/em-breve/:k" element={<SoonRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main></div>
      <BottomBar />
      <SideBar />
      <N2Skin />
      <TourHost />
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

/**
 * Uma versão nova da app ficou pronta enquanto esta estava aberta (o service worker trocou): um aviso discreto
 * para atualizar já, em vez de esperar pela próxima abertura.
 */
function UpdateReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw || DEMO) return;
    const had = !!sw.controller; // na primeira instalação não há versão anterior: nada a avisar
    const on = () => { if (had) setReady(true); };
    sw.addEventListener('controllerchange', on);
    return () => sw.removeEventListener('controllerchange', on);
  }, []);
  if (!ready) return null;
  return <button type="button" className="update-pill press" onClick={() => location.reload()}>Versão nova da NIKKI · <b>Atualizar</b></button>;
}

/**
 * Os olhos da marca são um traço de luz: do branco ao laranja, com brilho no escuro (no claro, do preto ao laranja,
 * sem brilho). Os gradientes vivem aqui, uma vez, e o CSS usa-os em todas as caras e no nome.
 */
function BrandDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="nk-eyes" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".55" stopColor="#FFD2AE" /><stop offset="1" stopColor="#FF7A1F" /></linearGradient>
        <linearGradient id="nk-eyes-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B0B0B" /><stop offset=".45" stopColor="#3A2210" /><stop offset="1" stopColor="#E8600A" /></linearGradient>
      </defs>
    </svg>
  );
}

export default function App() {
  const [intro, endIntro] = useIntro();
  return (
    <Router basename={DEMO ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || undefined} {...(DEMO && location.hash.startsWith('#/') ? { initialEntries: [location.hash.slice(1)] } : {})}>
      <BrandDefs />
      {intro && <Intro onDone={endIntro} />}
      <OverlayProvider>
        <SessionProvider><Shell /></SessionProvider>
        <UpdateReady />
        {DEMO_VISIT && <button type="button" className="demo-pill press" onClick={stopDemo} aria-label="Sair da demonstração">Demonstração · Sair</button>}
      </OverlayProvider>
    </Router>
  );
}
