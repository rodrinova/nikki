// Os cinco destinos da NIKKI: o dia de hoje, o dinheiro, a agenda, a casa (os espaços em uso) e vocês os dois.
// Tudo o resto vive dentro deles. No telemóvel, «Nós» abre pelas caras no topo do Hoje.
import { moduleOf } from './modules';

export const DESTS = [
  { to: '/', ic: 'home', n: 'Hoje' },
  { to: '/dinheiro', ic: 'coins', n: 'Dinheiro' },
  { to: '/agenda', ic: 'cal', n: 'Agenda' },
  { to: '/espacos', ic: 'grid', n: 'Casa' },
  { to: '/nos', ic: 'people', n: 'Nós' },
] as const;

/** Um destino (sem «Voltar»: chega-se lá pela barra). */
export const isRoot = (p: string) => DESTS.some((d) => d.to === p);

const NOS = ['/pessoas', '/perfil', '/melhorar', '/admin'];

/** Se o caminho está dentro de um destino (para acender a barra). */
export function under(path: string, to: string): boolean {
  if (to === '/') return path === '/';
  if (path === to || path.startsWith(`${to}/`)) return true;
  if (to === '/espacos') return !!moduleOf(path) || path.startsWith('/salvados') || path.startsWith('/em-breve');
  if (to === '/nos') return NOS.some((x) => path === x || path.startsWith(`${x}/`));
  return false;
}
