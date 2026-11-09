import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { Icon } from './Icon';
import { readQr } from '@/lib/qrread';

/**
 * Ler um código QR com a câmara (ex.: o QR de outro aparelho para entrar neste). Lê umas 8 vezes por segundo, num
 * quadro reduzido; ao primeiro código, devolve o texto. Sem câmara (ou sem autorização): escolher uma fotografia do QR.
 */
export function QrScan({ title, onRead, onCancel }: { title: string; onRead: (text: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [noCam, setNoCam] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    let stream: MediaStream | null = null, t = 0;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      const v = video.current;
      if (!v || done.current || !ctx) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const r = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
        if (r?.data) { done.current = true; onRead(r.data); return; }
      }
      t = window.setTimeout(tick, 120);
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        tick();
      } catch { setNoCam(true); }
    })();
    return () => { done.current = true; clearTimeout(t); stream?.getTracks().forEach((x) => x.stop()); };
  }, [onRead]);
  return createPortal(
    <div className="qrscan" role="dialog" aria-modal="true" aria-label={title}>
      <div className="qrscan-top"><span>{title}</span><button type="button" className="x-btn press" aria-label="Fechar" onClick={onCancel}><Icon n="close" s={18} /></button></div>
      {!noCam ? <div className="qrscan-view"><video ref={video} playsInline muted /><span className="qrscan-frame" aria-hidden="true" /></div>
        : <p className="s" style={{ fontSize: 'var(--t-m)' }}>Sem acesso à câmara. Pode escolher uma fotografia do código.</p>}
      <button type="button" className="btn quiet wide press" onClick={() => fileRef.current?.click()}>Escolher uma fotografia do código</button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const t = await readQr(f); if (t) onRead(t); else setNoCam(true); }} />
    </div>,
    document.body,
  );
}
