// A cara natalícia (22 nov – 6 jan): o gorro do Pai Natal no logo e uns flocos de neve lentos a passar.
// A neve não se mexe com «reduzir movimento» e desliga-se em Definições → O meu perfil (fica guardado neste aparelho).
import { useEffect, useMemo, useState } from 'react';
import { store } from '@/lib/store';
import { todayStr } from '@/lib/dates';
import { festive } from '@/lib/xmas';

export const snowOn = () => store.get('nikki_neve') !== '0';
export const setSnow = (v: boolean) => { store.set('nikki_neve', v ? '1' : '0'); dispatchEvent(new Event('nikki-neve')); };

/** O gorro, por cima do logo (posicionado sobre o canto de cima). */
export function SantaHat() {
  return (
    <svg className="santa-hat" viewBox="0 0 32 24" aria-hidden="true">
      <path d="M4 18 C8 6 18 1 25 5 C28 7 29 11 28 14 L22 9 C18 11 14 14 12 18 Z" fill="#E5322D" />
      <path d="M25 5 C27 8 28 11 28 14" stroke="#B3201C" strokeWidth="1" fill="none" />
      <rect x="2" y="16" width="16" height="5" rx="2.5" fill="#F4F1EC" />
      <circle cx="28.5" cy="15.5" r="2.6" fill="#F4F1EC" />
    </svg>
  );
}

/** Flocos de neve: poucos, pequenos e lentos; nunca tapam os toques (pointer-events: none). */
export function Snow() {
  const [on, setOn] = useState(snowOn);
  useEffect(() => { const f = () => setOn(snowOn()); addEventListener('nikki-neve', f); return () => removeEventListener('nikki-neve', f); }, []);
  const flakes = useMemo(() => Array.from({ length: 18 }, (_, k) => ({
    x: (k * 37) % 100, d: 11 + ((k * 7) % 9), delay: -((k * 13) % 17), s: 3 + (k % 3) * 1.5, drift: (k % 2 ? 1 : -1) * (10 + (k % 4) * 6),
  })), []);
  if (!festive(todayStr()) || !on) return null;
  return (
    <div className="snow" aria-hidden="true">
      {flakes.map((f, k) => <i key={k} style={{ left: `${f.x}%`, width: f.s, height: f.s, animationDuration: `${f.d}s`, animationDelay: `${f.delay}s`, ['--dx' as string]: `${f.drift}px` }} />)}
    </div>
  );
}
