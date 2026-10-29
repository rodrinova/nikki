import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Face } from '@/brand/Face';
import { Icon } from './Icon';

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
 * Fecha-se de três maneiras: o botão ✕, um toque fora, ou puxá-la para baixo pela pega.
 */
export function SheetHost() {
  const { sheet, close } = useOverlays();
  const [dy, setDy] = useState(0);
  const y0 = useRef<number | null>(null);
  useEffect(() => { setDy(0); y0.current = null; }, [sheet]);
  if (!sheet) return null;
  const end = () => { if (dy > 90) close(); setDy(0); y0.current = null; };
  return (
    <div>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" style={dy ? { translate: `0 ${dy}px` } : undefined}>
        <div className="sheet-top" onTouchStart={(e) => { y0.current = e.touches[0].clientY; }} onTouchMove={(e) => { if (y0.current !== null) setDy(Math.max(0, e.touches[0].clientY - y0.current)); }} onTouchEnd={end} onTouchCancel={end}>
          <div className="grab" />
          <button type="button" className="sheet-x press" aria-label="Fechar" onClick={close}><Icon n="close" s={20} /></button>
        </div>
        {sheet}
      </div>
    </div>
  );
}
