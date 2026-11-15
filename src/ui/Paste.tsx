import { useEffect } from 'react';
import { Icon } from './Icon';

// Colar um recorte de ecrã (copiado no iPhone com «Copiar» depois de recortar, ou Cmd+V no computador) sem o guardar
// nas fotografias. Serve onde se junta uma fatura.

const asFile = (b: Blob) => new File([b], `recorte-${Date.now()}.${b.type.split('/')[1] || 'png'}`, { type: b.type || 'image/png' });

/** Enquanto o ecrã está aberto, colar uma imagem (Cmd+V / colar) entrega-a como ficheiro. */
export function usePasteImage(onFile: (f: File) => void, on = true) {
  useEffect(() => {
    if (!on) return;
    const h = (e: ClipboardEvent) => {
      const it = [...(e.clipboardData?.items ?? [])].find((x) => x.type.startsWith('image/'));
      const f = it?.getAsFile();
      if (f) { e.preventDefault(); onFile(asFile(f)); }
    };
    document.addEventListener('paste', h);
    return () => document.removeEventListener('paste', h);
  }, [onFile, on]);
}

/** O botão «Colar recorte»: lê a imagem que está copiada. Sem imagem copiada, diz como se faz. */
export function PasteButton({ onFile, onNone }: { onFile: (f: File) => void; onNone: (why: string) => void }) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !('read' in navigator.clipboard)) return null;
  async function go() {
    try {
      for (const item of await navigator.clipboard.read()) {
        const t = item.types.find((x) => x.startsWith('image/'));
        if (t) return onFile(asFile(await item.getType(t)));
      }
      onNone('Não há nenhuma imagem copiada. Recorta o ecrã, toca em «Copiar» e volta aqui.');
    } catch { onNone('Não deu para colar. Recorta o ecrã, toca em «Copiar» e volta a tentar.'); }
  }
  return <button type="button" className="rcpt-pick press" onClick={() => void go()}><Icon n="doc" s={18} /><span>Colar recorte de ecrã</span></button>;
}
