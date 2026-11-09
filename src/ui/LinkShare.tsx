import { Icon } from './Icon';
import { QR } from './QR';
import { useOverlays } from './overlays';

/**
 * Um link para entrar na NIKKI, pronto a passar: o QR (para quem está ao lado ler com a câmara), WhatsApp, o menu de
 * partilha do telemóvel e copiar. `msg` é a mensagem que acompanha o link.
 */
export function LinkShare({ url, msg, qrLabel }: { url: string; msg: string; qrLabel: string }) {
  const { toast } = useOverlays();
  return (
    <>
      <div className="qr-box"><QR text={url} label={qrLabel} /><span className="s">Ao lado? Aponta a câmara do outro telemóvel a este QR.</span></div>
      <a className="btn wide press" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp <Icon n="arrow" s={20} /></a>
      {typeof navigator.share === 'function' && <button type="button" className="btn quiet wide press" onClick={() => navigator.share({ text: msg }).catch(() => {})}>Partilhar de outra forma</button>}
      <button type="button" className="btn quiet wide press" onClick={() => navigator.clipboard?.writeText(url).then(() => toast('Link copiado.', { ok: true }), () => toast('Não deu para copiar.'))}>Copiar o link</button>
      <p className="hkl-url">{url}</p>
    </>
  );
}
