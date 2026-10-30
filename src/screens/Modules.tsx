import { useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { MODULES, moduleName, type ModuleKey } from '@/lib/modules';
import { shortDate } from '@/lib/admin';
import { Top } from './Home';

/** Ligar ou desligar um módulo da casa (só quem administra a casa). Otimista: volta atrás se a base recusar. */
function useToggleModule() {
  const { house, me } = useSession();
  const { modules } = useHouse();
  const { toast } = useOverlays();
  const nav = useNavigate();
  return useCallback(async (k: ModuleKey, quiet = false) => {
    if (!house || house.role === 'staff' || !me) return;
    const was = modules.rows, isOn = was.some((r) => r.module === k);
    modules.setRows(isOn ? was.filter((r) => r.module !== k) : [...was, { module: k, enabled_at: new Date().toISOString(), enabled_by: me.id }]);
    const { error } = isOn
      ? await supabase.from('household_modules').delete().eq('household_id', house.id).eq('module', k)
      : await supabase.from('household_modules').insert({ household_id: house.id, module: k, enabled_by: me.id });
    if (error) { modules.setRows(was); toast('Não deu para mudar. Tenta outra vez.'); return; }
    if (!quiet) toast(`${moduleName(k)} ${isOn ? 'escondido' : 'ligado'}.`, { ok: !isOn });
    if (quiet) return;
    if (k === 'garagem' && !isOn) nav('/garagem'); // ligar a Garagem pede logo os carros
    if (k === 'casa' && !isOn) nav('/casa'); // e a Casa pergunta como é a casa
  }, [house, me, modules, toast, nav]);
}

/** Módulos da casa: cada casa liga só o que lhe faz falta. Desligar esconde; nada se apaga. */
export function Modules() {
  const { house } = useSession();
  const { modules, on } = useHouse();
  const toggle = useToggleModule();
  const admin = !!house && house.role !== 'staff';
  return (
    <>
      <Top title="Módulos" />
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Os módulos ligam-se sozinhos quando os usam. Aqui escondem-se os que não fazem falta. Nada se apaga: só sai da vista.</p>
      <div className="tile card rows mods">
        <div className="mod"><span className="ic"><Icon n="coins" /></span><span className="t">Dinheiro, Agenda e Pessoas<span className="s">Sempre ligados. A agenda está no início.</span></span></div>
        {MODULES.map((m) => {
          const lit = on(m.k), since = modules.rows.find((r) => r.module === m.k)?.enabled_at;
          return (
            <div className="mod" key={m.k}>
              <span className="ic"><Icon n={m.ic} /></span>
              <span className="t">{m.name}<span className="s">{m.what}{lit && since ? ` Ligado desde ${shortDate(since)}.` : ''}</span></span>
              <button type="button" role="switch" aria-checked={lit} aria-label={m.name} className="sw press" disabled={!admin} onClick={() => toggle(m.k)}><i /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Um ecrã de módulo: aparece se o módulo estiver ligado; senão, diz como o ligar. */
export function Gate({ k, children }: { k: ModuleKey; children: ReactNode }) {
  const { on, modules } = useHouse();
  const toggle = useToggleModule();
  const lit = on(k);
  // Usar é ligar: abrir um módulo desligado liga-o para a casa (sem ecrã de «desligado» nem pedir a ninguém).
  useEffect(() => { if (!lit && !modules.loading) toggle(k, true); }, [lit, modules.loading, k, toggle]);
  return lit ? <>{children}</> : null;
}
