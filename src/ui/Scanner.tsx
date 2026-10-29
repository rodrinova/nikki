import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { clean, findSheet, fullQuad, gray, outSize, scaleQuad, warp, type Quad } from '@/lib/scan';

// Digitalizar um documento como o scanner do iPhone: câmara com a folha marcada ao vivo, fotografar, acertar os cantos,
// endireitar e limpar; várias páginas. Tudo no telemóvel. Sem câmara (ou sem autorização), abre a câmara do sistema
// ou a galeria e segue igual a partir da fotografia.

type Step = 'live' | 'adjust' | 'busy' | 'review';
interface Shot { canvas: HTMLCanvasElement; quad: Quad }
interface Page { doc: Blob; color: Blob; url: string; urlColor: string }

const DETECT_W = 240;

/** Os cantos da folha numa imagem (canvas), com a imagem reduzida para ser rápido. */
function detect(src: HTMLCanvasElement | HTMLVideoElement, w: number, h: number): Quad | null {
  const k = DETECT_W / w, sw = DETECT_W, sh = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, sw, sh);
  const q = findSheet(gray(ctx.getImageData(0, 0, sw, sh).data, sw, sh), sw, sh);
  return q ? scaleQuad(q, 1 / k) : null;
}

const blob = (c: HTMLCanvasElement, q = 0.85) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('imagem'))), 'image/jpeg', q));

export function Scanner({ title, onDone, onCancel, single }: { title: string; onDone: (pages: Blob[]) => void; onCancel: () => void; single?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState<Step>('live');
  const [live, setLive] = useState<Quad | null>(null);
  const [noCam, setNoCam] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [mode, setMode] = useState<'doc' | 'color'>('doc');
  const [drag, setDrag] = useState<number | null>(null);
  const [dims, setDims] = useState({ w: 1, h: 1 });

  // Câmara traseira; sem ela, a câmara do sistema ou a galeria.
  useEffect(() => {
    let stream: MediaStream | null = null, stop = false, timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (stop) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream; await v.play();
        const tick = () => {
          if (stop) return;
          if (v.videoWidth) { setDims({ w: v.videoWidth, h: v.videoHeight }); setLive(detect(v, v.videoWidth, v.videoHeight)); }
          timer = window.setTimeout(tick, 280);
        };
        tick();
      } catch { setNoCam(true); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []); // ao fechar

  function capture() {
    const v = video.current!;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setShot({ canvas: c, quad: detect(c, c.width, c.height) ?? fullQuad(c.width, c.height) });
    setStep('adjust');
  }
  async function fromFile(f: File) {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 2600 / Math.max(bmp.width, bmp.height)); // fotografias de 12 MP: reduz para ser rápido
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    setShot({ canvas: c, quad: detect(c, c.width, c.height) ?? fullQuad(c.width, c.height) });
    setStep('adjust');
  }
  function process() {
    if (!shot) return;
    setStep('busy');
    setTimeout(async () => {
      const { canvas: c } = shot;
      // Um pouco para dentro (0,6%), para não apanhar a mesa na borda.
      const cx = shot.quad.reduce((t, p) => t + p.x, 0) / 4, cy = shot.quad.reduce((t, p) => t + p.y, 0) / 4;
      const quad = shot.quad.map((p) => ({ x: p.x + (cx - p.x) * 0.012, y: p.y + (cy - p.y) * 0.012 })) as Quad;
      const src = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const s = outSize(quad, 2000);
      const flat = warp(src, c.width, c.height, quad, s.w, s.h);
      const out = document.createElement('canvas'); out.width = s.w; out.height = s.h;
      const ctx = out.getContext('2d')!;
      ctx.putImageData(new ImageData(flat, s.w, s.h), 0, 0);
      const color = await blob(out);
      ctx.putImageData(new ImageData(clean(flat, s.w, s.h), s.w, s.h), 0, 0);
      const doc = await blob(out, 0.8);
      const page = { doc, color, url: URL.createObjectURL(doc), urlColor: URL.createObjectURL(color) };
      urls.current.push(page.url, page.urlColor);
      setPages((p) => [...p, page]);
      setShot(null); setStep('review');
    }, 30);
  }
  // Arrastar um canto (coordenadas da imagem).
  const toImg = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse(), p = svg.current!.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const r = p.matrixTransform(m);
    return { x: Math.max(0, Math.min(shot!.canvas.width, r.x)), y: Math.max(0, Math.min(shot!.canvas.height, r.y)) };
  };
  const poly = (q: Quad) => q.map((p) => `${p.x},${p.y}`).join(' ');
  const done = () => onDone(pages.map((p) => (mode === 'doc' ? p.doc : p.color)));
  const sw = shot ? shot.canvas.width : dims.w, sh = shot ? shot.canvas.height : dims.h, r = Math.max(sw, sh) / 34;

  return createPortal(
    <div className="scanner" role="dialog" aria-label={title}>
      <div className="sc-top">
        <button className="sc-btn press" onClick={onCancel} aria-label="Cancelar"><Icon n="close" s={20} /></button>
        <span>{title}</span>
        {pages.length > 0 && step !== 'review' ? <button className="sc-btn txt press" onClick={() => setStep('review')}>{pages.length} {pages.length === 1 ? 'página' : 'páginas'}</button> : <span style={{ width: 44 }} />}
      </div>

      <div className="sc-stage">
        <video ref={video} playsInline muted className={step === 'live' && !noCam ? '' : 'hide'} />
        {step === 'live' && !noCam && <svg className="sc-over" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {live && <polygon points={poly(live)} className="sc-quad" />}
        </svg>}
        {step === 'live' && noCam && <div className="sc-msg"><p>Sem acesso à câmara aqui.</p><p className="s">Tira a fotografia com a câmara do telemóvel: a NIKKI encontra a folha, endireita e limpa.</p></div>}
        {(step === 'adjust' || step === 'busy') && shot && <>
          <img src={shot.canvas.toDataURL('image/jpeg', 0.7)} alt="" className="sc-img" />
          <svg ref={svg} className="sc-over edit" viewBox={`0 0 ${sw} ${sh}`} preserveAspectRatio="xMidYMid meet"
            onPointerMove={(e) => { if (drag === null) return; const p = toImg(e); setShot((s) => s && ({ ...s, quad: s.quad.map((q, i) => (i === drag ? p : q)) as Quad })); }}
            onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
            <polygon points={poly(shot.quad)} className="sc-quad" />
            {shot.quad.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} className="sc-h" onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); setDrag(i); }} />)}
          </svg>
          {step === 'busy' && <div className="sc-busy">A endireitar…</div>}
        </>}
        {step === 'review' && pages.length > 0 && <div className="sc-pages">{pages.map((p, i) => <img key={i} src={mode === 'doc' ? p.url : p.urlColor} alt={`Página ${i + 1}`} />)}</div>}
      </div>

      <div className="sc-bottom">
        {step === 'live' && <>
          <button className="sc-btn txt press" onClick={() => fileRef.current?.click()}>Galeria</button>
          {noCam
            ? <label className="sc-shutter press" aria-label="Fotografar"><input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fromFile(f); }} /><i /></label>
            : <button className="sc-shutter press" aria-label="Fotografar" onClick={capture}><i /></button>}
          <span className="sc-hint">{noCam ? '' : live ? 'Folha encontrada' : 'Põe a folha numa superfície escura'}</span>
        </>}
        {step === 'adjust' && <>
          <button className="sc-btn txt press" onClick={() => { setShot(null); setStep('live'); }}>Repetir</button>
          <span className="sc-hint">Arrasta os cantos se for preciso</span>
          <button className="sc-btn txt main press" onClick={process}>Continuar</button>
        </>}
        {step === 'review' && <>
          {!single && <button className="sc-btn txt press" onClick={() => setStep('live')}>Mais uma página</button>}
          <div className="seg sm sc-seg" role="group" aria-label="Aspeto"><button className="press" aria-pressed={mode === 'doc'} onClick={() => setMode('doc')}>Documento</button><button className="press" aria-pressed={mode === 'color'} onClick={() => setMode('color')}>Cor</button></div>
          <button className="sc-btn txt main press" onClick={done}>{single ? 'Usar' : `Terminar (${pages.length})`}</button>
        </>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fromFile(f); }} />
    </div>,
    document.body,
  );
}
