import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { Icon } from '@/ui/Icon';
import { MAP, countMap, searchMap, type MapPage, type MapZone } from '@/lib/map';
import type { ModuleKey } from '@/lib/modules';
import { Top } from './Home';

/** Uma página do mapa: o nome (que leva lá), por onde se chega, e as funções. As subpáginas penduram-se por baixo. */
function Page({ p, depth = 0 }: { p: MapPage; depth?: number }) {
  const [open, setOpen] = useState(depth === 0 ? false : false);
  return (
    <li className={`mp-page${open ? ' open' : ''}`} style={{ ['--d' as string]: depth }}>
      <div className="mp-head">
        <button type="button" className="mp-tog press" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="mp-n">{p.n}</span>
          <span className="mp-c">{p.fns.length + (p.sub?.length ?? 0)}</span>
          <Icon n="chev" s={14} />
        </button>
        {p.to && <Link to={p.to} className="mp-go press" aria-label={`Abrir ${p.n}`}><Icon n="arrow" s={16} /></Link>}
      </div>
      {open && (
        <div className="mp-body">
          <p className="mp-via">{p.via}</p>
          <ul className="mp-fns">{p.fns.map((f) => <li key={f.n}><b>{f.n}</b>{f.how && <small>{f.how}</small>}</li>)}</ul>
          {p.sub && <ul className="mp-sub">{p.sub.map((s) => <Page key={s.n} p={s} depth={depth + 1} />)}</ul>}
        </div>
      )}
    </li>
  );
}

/**
 * O mapa da NIKKI: a organização da app num esquema. Em cima, a barra (os cinco botões); por baixo, cada zona com
 * as suas páginas e, dentro de cada página, todas as funções e onde se toca. A procura responde a «onde está…?».
 */
export function MapScreen() {
  const { appAdmin } = useSession();
  const { on } = useHouse();
  const [q, setQ] = useState('');
  const zones = useMemo(() => {
    const keep = (p: MapPage): MapPage | null => ((p.admin && !appAdmin) || (p.mod && !on(p.mod as ModuleKey)) ? null : { ...p, sub: p.sub?.map(keep).filter(Boolean) as MapPage[] | undefined });
    return MAP.map((z): MapZone => ({ ...z, pages: z.pages.map(keep).filter(Boolean) as MapPage[] }));
  }, [appAdmin, on]);
  const total = countMap(zones), hits = searchMap(zones, q);
  return (
    <>
      <Top title="Mapa da NIKKI" />
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>{total.pages} páginas, {total.fns} funções. Toca numa página para ver o que lá se faz; a seta leva-te lá.</p>
      <label className="mp-find"><Icon n="ask" s={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Onde está…? (ex.: fatura, convite, IUC)" aria-label="Procurar no mapa" /></label>
      {q.trim() ? (
        <ul className="mp-hits">
          {hits.length ? hits.map(({ zone, page, fns }) => (
            <li key={zone.k + page.n}>
              {page.to ? <Link to={page.to} className="mp-hit press"><span><b>{page.n}</b><small>{page.via}</small></span><Icon n="arrow" s={16} /></Link> : <div className="mp-hit"><span><b>{page.n}</b><small>{page.via}</small></span></div>}
              <ul className="mp-fns">{fns.map((f) => <li key={f.n}><b>{f.n}</b>{f.how && <small>{f.how}</small>}</li>)}</ul>
            </li>
          )) : <li className="s">Nada com esse nome. Experimenta outra palavra.</li>}
        </ul>
      ) : (
        <>
          <div className="mp-dock" aria-hidden="true">{zones.slice(0, 5).map((z, k) => <a key={z.k} href={`#mp-${z.k}`} className={k === 2 ? 'add' : ''} style={{ ['--k' as string]: k }}><Icon n={z.ic as never} s={20} /><small>{z.n.replace(' (+)', '').replace(' e problemas', '')}</small></a>)}</div>
          {zones.map((z, k) => (
            <section key={z.k} id={`mp-${z.k}`} className="mp-zone" style={{ ['--k' as string]: k }}>
              <h2><span className="mp-ic"><Icon n={z.ic as never} s={18} /></span>{z.n}<small>{z.where}</small></h2>
              <ul className="mp-tree">{z.pages.map((p) => <Page key={p.n} p={p} />)}</ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
