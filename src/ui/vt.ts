import { flushSync } from 'react-dom';

/**
 * Uma mudança de ecrã com transição partilhada (View Transitions): o que tem o mesmo `view-transition-name` nos dois
 * ecrãs viaja de um para o outro (ex.: o total do mês, do Hoje para o título do Dinheiro). Sem suporte no browser, ou
 * com «reduzir movimento», muda logo. Durante a transição, <html> tem a classe «vt» (os ecrãs não fazem a entrada
 * deles e os números não voltam a contar).
 */
export function withVT(run: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { run(); return; }
  const root = document.documentElement;
  root.classList.add('vt');
  try {
    d.startViewTransition(() => flushSync(run)).finished.finally(() => root.classList.remove('vt'));
  } catch { root.classList.remove('vt'); run(); }
}

/** Se está a decorrer uma transição partilhada. */
export const inVT = () => typeof document !== 'undefined' && document.documentElement.classList.contains('vt');
