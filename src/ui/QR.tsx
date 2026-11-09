import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * Um código QR (SVG), para o outro telemóvel ler com a câmara: escuro sobre claro, com margem (os leitores precisam
 * dela), num quadrado branco mesmo no tema escuro.
 */
export function QR({ text, size = 220, label }: { text: string; size?: number; label: string }) {
  const path = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d, n: n + 8 };
  }, [text]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="#FFFFFF" rx="1.5" />
      <path d={path.d} fill="#0B0B0B" />
    </svg>
  );
}
