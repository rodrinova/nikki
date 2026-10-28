import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Face } from '@/brand/Face';

// Folhas (bottom sheets) e avisos (toasts), partilhados por toda a app.
// Um aviso de algo gravado (ok) traz a cara da NIKKI a piscar o olho.
interface Overlays { open: (node: ReactNode) => void; close: () => void; toast: (msg: string, o?: { ok?: boolean }) => void; isOpen: boolean; sheet: ReactNode }
const Ctx = createContext<Overlays | null>(null);
export const useOverlays = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOverlays fora do OverlayProvider');
  return c;
};

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<ReactNode>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok?: boolean }[]>([]);
  const n = useRef(0);
  const close = useCallback(() => setSheet(null), []);
  const open = useCallback((node: ReactNode) => setSheet(node), []);
  const toast = useCallback((msg: string, o?: { ok?: boolean }) => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-1), { id, msg, ok: o?.ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('has-sheet', !!sheet); // com uma folha aberta, os avisos sobem
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [sheet]);

  return (
    <Ctx.Provider value={{ open, close, toast, isOpen: !!sheet, sheet }}>
      {children}
      <div className="toast-root" role="status" aria-live="polite">
        {toasts.map((t) => <div className="toast" key={t.id}>{t.ok && <Face h={14} mode="wink" />}<span>{t.msg}</span></div>)}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Onde a folha aberta aparece. Fica dentro dos providers da sessão e da casa (cada ramo da app tem um),
 * para que o conteúdo da folha possa usar useSession e useHouse.
 */
export function SheetHost() {
  const { sheet, close } = useOverlays();
  if (!sheet) return null;
  return (
    <div>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true"><div className="grab" />{sheet}</div>
    </div>
  );
}
