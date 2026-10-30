import { Suspense, useRef, useState } from 'react';
import { DEMO } from '@/lib/supabase';
import { Icon } from '@/ui/Icon';
import { addDays, monthKey, todayStr } from '@/lib/dates';
import { readInvoice, type InvoiceRead } from '@/lib/invoice';
import { imagesText, invoiceText, type ReadStep } from '@/lib/ocr';
import { Loading, later } from '@/ui/lazy';
const Scanner = later(() => import('@/ui/Scanner'), 'Scanner');

// A fatura de uma conta com consumo (água, luz, gás), pedida quando se regista a despesa e só nas casas que
// acompanham os consumos. Lê-se no telemóvel (PDF ou fotografia): consumo, período e se é acerto. O ficheiro não
// se guarda. Não há outro sítio para carregar faturas: a despesa é a porta de entrada.

const STEP: Record<ReadStep, string> = { abrir: 'A abrir o PDF…', ler: 'A ler o texto…', reconhecer: 'A reconhecer o texto da fotografia…' };

/** Uma fatura de exemplo (só na demonstração): a luz deste mês, para experimentar sem ficheiro. */
function sampleText() {
  const k = monthKey(todayStr()), last = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();
  const d = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return `EDP Comercial - Comercialização de Energia, S.A.
Data de emissão: ${d(todayStr())}
Período de faturação: 01/${k.slice(5, 7)}/${k.slice(0, 4)} a ${last}/${k.slice(5, 7)}/${k.slice(0, 4)}
Eletricidade  Leitura real
Consumo total 371 kWh
Total a pagar 88,30 €
Data limite de pagamento: ${d(addDays(todayStr(), 20))}  Débito direto`;
}

/** Os botões «Fotografar» e «PDF» e o estado da leitura. Devolve o que se leu e como (pdf ou foto). */
export function BillInvoice({ name, onRead }: { name: string; onRead: (r: InvoiceRead, source: 'pdf' | 'foto') => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState(false);
  const [step, setStep] = useState<{ s: ReadStep; p?: number } | null>(null);
  const [fail, setFail] = useState(false);
  async function go(read: () => Promise<{ text: string; source: 'pdf' | 'foto' }>) {
    setFail(false); setStep({ s: 'abrir' });
    try { const out = await read(); const r = readInvoice(out.text); if (r.found < 1) setFail(true); else onRead(r, out.source); }
    catch { setFail(true); } finally { setStep(null); }
  }
  return (
    <div className="bill-inv">
      <input ref={ref} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) go(() => invoiceText(f, (s, p) => setStep({ s, p }))); }} />
      {scan && <Suspense fallback={<Loading full label="A abrir o scanner" />}><Scanner title={`Fatura: ${name}`} onCancel={() => setScan(false)} onDone={(pages) => { setScan(false); go(async () => ({ text: await imagesText(pages, (s, p) => setStep({ s, p })), source: 'foto' })); }} /></Suspense>}
      <p className="s">Para os consumos, a fatura de {name}: a NIKKI lê o consumo e o período aqui no telemóvel.</p>
      <div className="two-btn">
        <button type="button" className="btn quiet press" disabled={!!step} onClick={() => setScan(true)}><Icon n="cam" s={18} /> Fotografar</button>
        <button type="button" className="btn quiet press" disabled={!!step} onClick={() => ref.current?.click()}><Icon n="doc" s={18} /> PDF</button>
      </div>
      {DEMO && <button type="button" className="tb quiet press" onClick={() => onRead(readInvoice(sampleText()), 'pdf')}>Fatura de exemplo</button>}
      {step && <p className="s" aria-live="polite">{STEP[step.s]}{step.p ? ` ${Math.round(step.p * 100)}%` : ''}</p>}
      {fail && <p className="s">Esta não consegui ler. Tenta o PDF da área de cliente ou uma foto direita e com luz. Ou escreve o consumo, que também serve.</p>}
    </div>
  );
}
