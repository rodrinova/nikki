import { useEffect, type ReactNode } from 'react';
import { Face } from '@/brand/Face';
import { Icon } from './Icon';

// Fechos em voz alta (a ideia dos cartazes do Public Theater, de Paula Scher). A NIKKI é calma quase sempre;
// só o fim do mês e um objetivo cumprido falam alto, num cartaz de ecrã inteiro que se pode partilhar.
export function Poster({ lines, band, foot, how, share, onClose }: {
  lines: [string, string]; band: string; foot: string; how?: ReactNode; share: string; onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    document.body.classList.add('has-poster');
    return () => { removeEventListener('keydown', esc); document.body.classList.remove('has-poster'); };
  }, [onClose]);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className="poster" role="dialog" aria-modal="true" aria-label={`${lines[0]} ${lines[1]}`}>
      <div className="in">
        <Face h={22} />
        <p className="big"><span>{lines[0]}</span><span>{lines[1]}</span></p>
        <p className="band">{band}</p>
        <p className="s foot">{foot}</p>
        {how}
        <div className="actions">
          <button className="btn press" onClick={onClose} autoFocus>Continuar <Icon n="arrow" s={18} /></button>
          {canShare && <button className="btn quiet press" onClick={() => navigator.share({ text: share }).catch(() => undefined)}>Partilhar</button>}
        </div>
      </div>
    </div>
  );
}
