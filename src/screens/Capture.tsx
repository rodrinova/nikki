import { useEffect, useRef, useState } from 'react';
import { DEMO, supabase, url as base } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { ExpenseSheet } from './Money';

// Apple Pay → NIKKI. Um atalho do iPhone envia o valor e a loja de cada pagamento para a função «capture» (fica um
// rascunho); ao abrir a NIKKI, o rascunho abre já preenchido para confirmar. Nada conta sem confirmação.

interface Draft { id: string; amount: number | string; merchant: string | null; created_at: string }

/** «PINGO DOCE LISBOA 123» → «Pingo Doce Lisboa» (sem números de loja nem espaços a mais). */
export const tidyMerchant = (m: string | null) => (m ?? '').replace(/[*#]+/g, ' ').replace(/\b\d{3,}\b/g, '').replace(/\s+/g, ' ').trim()
  .toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, s: string, c: string) => s + c.toUpperCase()).slice(0, 40);

/** Ao abrir a app (e ao voltar a ela), abre o pagamento mais antigo à espera de confirmação. */
export function DraftWatcher() {
  const { house, me } = useSession();
  const { open } = useOverlays();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!house || !me) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      if (document.visibilityState !== 'visible') return;
      // Se estiver aberto um cartaz (o mês que fechou, um nível novo), espera que se feche.
      if (document.querySelector('.poster')) { clearTimeout(timer); timer = setTimeout(look, 1500); return; }
      const { data } = await supabase.from('expense_drafts').select('id, amount, merchant, created_at').eq('household_id', house.id).eq('profile_id', me.id).order('created_at').limit(1);
      const d = (data as Draft[] | null)?.[0];
      if (!d || shown.current === d.id) return;
      shown.current = d.id;
      const shop = tidyMerchant(d.merchant);
      open(<ExpenseSheet init={{ text: `${String(Number(d.amount).toFixed(2)).replace('.', ',')}${shop ? ` ${shop}` : ''}`, day: d.created_at.slice(0, 10), draftId: d.id }} />);
    };
    look();
    document.addEventListener('visibilitychange', look);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', look); };
  }, [house, me, open]);
  return null;
}

/** Ativar o registo pelo Apple Pay: a ligação de cada pessoa e os passos para o atalho do iPhone (uma vez só). */
export function ApplePaySheet() {
  const { house } = useSession();
  const { toast } = useOverlays();
  const [tok, setTok] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const get = async (renew = false) => {
    const { data, error } = await supabase.rpc('capture_token', { h: house!.id, renew });
    if (error) return toast(error.message);
    setTok(data as string);
    if (renew) toast('Ligação nova. Troca-a também no atalho do iPhone.', { ok: true });
  };
  useEffect(() => { get(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const link = tok ? `${base}/functions/v1/capture?t=${tok}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Endereço copiado. Cola-o no atalho.', { ok: true }); } catch { toast(link); } };
  async function test() {
    if (DEMO) return toast('Na demonstração, o teste não sai do telemóvel.');
    const r = await fetch(link, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ valor: '1,00 €', loja: 'Teste NIKKI' }) }).catch(() => null);
    if (!r?.ok) return toast('O teste não chegou. Vê se tens rede.');
    toast('Chegou! Fecha e volta a abrir a NIKKI: aparece um pagamento de 1,00 € para confirmar (ou não registar).', { ok: true });
  }
  const STEPS: [string, string][] = [
    ['Abre a app Atalhos', 'Separador «Automação» → «+» (Nova automação).'],
    ['Escolhe «Transação»', 'Marca os cartões da Carteira que queres; em baixo, «Executar de imediato». Seguinte.'],
    ['Junta a ação «Obter conteúdo do URL»', 'No endereço, cola o da NIKKI (botão em baixo). Toca na seta: Método POST; Corpo do pedido JSON.'],
    ['Três campos no corpo', '«valor» → a variável do valor (Quantia); «loja» → Comerciante; «cartao» → Nome do cartão. Concluído.'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">Apple Pay → NIKKI</p>
      <p className="s">Cada vez que pagas com o iPhone ou o relógio, o valor e a loja chegam à NIKKI. Ao abri-la, a despesa aparece preenchida: um toque para confirmar. Faz-se uma vez, em dois minutos.</p>
      <ol className="ap-steps">
        {STEPS.map(([t, d], k) => (
          <li key={t} className={k === step ? 'on' : k < step ? 'done' : ''}>
            <button type="button" className="press" onClick={() => setStep(k)}><b>{k + 1}</b><span className="st2"><span>{t}</span>{k === step && <span className="s">{d}</span>}</span></button>
          </li>
        ))}
      </ol>
      {step < STEPS.length - 1 ? <button className="btn quiet wide press" onClick={() => setStep(step + 1)}>Seguinte <Icon n="arrow" s={20} /></button> : null}
      <button className="btn wide press" onClick={copy} disabled={!tok}>Copiar o endereço da NIKKI <Icon n="link" s={18} /></button>
      <button className="btn quiet wide press" onClick={test} disabled={!tok}>Experimentar (1,00 €) <Icon n="arrow" s={20} /></button>
      <p className="s">O endereço é só teu e só serve para mandar pagamentos para confirmar. Se o partilhares por engano, troca-o.</p>
      <button className="back press" onClick={() => get(true)}>Trocar o endereço</button>
    </div>
  );
}
