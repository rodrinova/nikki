import { CountUp } from './CountUp';

/**
 * Um arco de 0 a `max` (como o «84/100» do carrossel): um traço fino de fundo, o caminho feito do branco ao laranja,
 * e um botão laranja com brilho onde está o valor. O número fica ao centro e conta até ao valor.
 */
export function Arc({ value, max = 100, unit = `/${max}`, label }: { value: number; max?: number; unit?: string; label: string }) {
  const f = Math.max(0, Math.min(1, value / max));
  const W = 240, H = 140, cx = W / 2, cy = 124, r = 100;
  const a0 = Math.PI, a = Math.PI * (1 - f); // da esquerda (180°) para a direita (0°)
  const pt = (t: number) => [cx + r * Math.cos(t), cy - r * Math.sin(t)] as const;
  const [x0, y0] = pt(a0), [x1, y1] = pt(0), [kx, ky] = pt(a);
  const len = Math.PI * r;
  return (
    <div className="arc" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="arc-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="var(--ink)" /><stop offset="1" stopColor="var(--accent)" /></linearGradient>
        </defs>
        <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} className="arc-track" />
        <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} className="arc-fill" style={{ strokeDasharray: len, ['--off' as any]: len * (1 - f), ['--len' as any]: len }} />
        <circle cx={kx} cy={ky} r={11} className="arc-knob" />
      </svg>
      <span className="arc-n"><CountUp to={value} fmt={(v) => String(Math.round(v))} /><small>{unit}</small></span>
    </div>
  );
}
