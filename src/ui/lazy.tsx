import { lazy, type ComponentType } from 'react';
import { Face } from '@/brand/Face';

/**
 * Partes da app que só se carregam quando se abrem (a app abre mais depressa com a rede lenta). Se o ficheiro já não
 * existir (saiu uma versão nova entretanto), recarrega a app para a versão nova, no máximo uma vez por minuto.
 */
export const later = <T extends Record<string, ComponentType<any>>, K extends keyof T>(load: () => Promise<T>, name: K) =>
  lazy(() => Promise.resolve().then(load).then((m) => ({ default: m[name] })).catch((e: unknown) => {
    // Recarregar resolve quando saiu uma versão nova. Só uma vez por minuto: se o erro for do aparelho (um browser antigo
    // a quem falta alguma coisa), recarregar sempre era um ciclo sem fim no ecrã de carregamento; assim o erro aparece.
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOADED)) || 0; } catch { /* sem sessionStorage */ }
    if (Date.now() - last < 60_000) throw e;
    try { sessionStorage.setItem(RELOADED, String(Date.now())); } catch { /* sem sessionStorage */ }
    location.reload();
    return new Promise<never>(() => {});
  }));
const RELOADED = 'nikki:recarregou';

/**
 * Enquanto carrega: a cara da NIKKI a piscar, sempre no mesmo sítio. `full` cobre o ecrã (para o que abre por cima,
 * como o scanner); `page` ocupa o ecrã inteiro ao abrir a app; por omissão, o espaço de um ecrã.
 */
export function Loading({ label = 'A carregar', full, page, h }: { label?: string; full?: boolean; page?: boolean; h?: number }) {
  return (
    <div className={full ? 'wait wait-full' : page ? 'wait wait-page' : 'wait'} aria-busy="true" role="status">
      <Face h={h ?? (page ? 40 : 32)} mode="busy" label={label} />
    </div>
  );
}
