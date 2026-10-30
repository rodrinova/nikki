import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { moduleName, moduleOf } from '@/lib/modules';
import { shortDate } from '@/lib/admin';
import { Top } from './Home';

export type TicketStatus = 'novo' | 'a ver' | 'feito' | 'nao';
export interface Ticket { id: string; kind: 'ideia' | 'problema'; body: string; screen: string | null; shot: string | null; status: TicketStatus; reply: string | null; created_at: string; updated_at: string }

export const STATUS: Record<TicketStatus, string> = { novo: 'Recebido', 'a ver': 'A ver', feito: 'Feito', nao: 'Não vamos fazer' };
export const statusClass = (s: TicketStatus) => `st st-${s.replace(' ', '')}`;

/** O último ecrã antes de vir escrever (o Shell vai atualizando). */
export const lastPlace = { path: '/' };
const PLACES = ['Início', 'Dinheiro', 'Entre nós', 'Compras', 'Agenda', 'Pessoas', 'Outro'];
function placeOf(path: string): string {
  if (path === '/') return 'Início';
  if (path.startsWith('/dinheiro')) return 'Dinheiro';
  if (path === '/pessoas') return 'Pessoas';
  if (path === '/espacos') return 'Espaços';
  const m = moduleOf(path);
  return m ? moduleName(m) : 'Outro';
}

/** Reduz a captura (até 1600 px, JPEG) para poupar dados. Se o aparelho não conseguir, vai como está. */
export async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? file), 'image/jpeg', 0.82));
  } catch { return file; }
}
export const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Captura de um ticket ou foto de um talão (bucket privado: link assinado de 1 hora). Um toque abre-a inteira. */
export function Shot({ path, bucket = 'tickets', alt = 'Captura de ecrã' }: { path: string; bucket?: string; alt?: string }) {
  const { open } = useOverlays();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    supabase.storage.from(bucket).createSignedUrl(path, 3600).then(({ data }) => { if (on) setUrl(data?.signedUrl ?? null); });
    return () => { on = false; };
  }, [path, bucket]);
  if (!url) return <span className="shot" aria-hidden="true" />;
  return <button type="button" className="shot press" aria-label="Ver a captura" onClick={() => open(<img className="shot-full" src={url} alt={alt} />)}><img src={url} alt="" loading="lazy" /></button>;
}

function useMyTickets(uid: string | undefined) {
  const [rows, setRows] = useState<Ticket[]>([]);
  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('tickets').select('id, kind, body, screen, shot, status, reply, created_at, updated_at').eq('created_by', uid).order('created_at', { ascending: false });
    setRows((data ?? []) as Ticket[]);
  }, [uid]);
  useEffect(() => {
    load();
    if (!uid) return;
    const ch = supabase.channel(`nikki-tickets-${uid}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'nikki', table: 'tickets', filter: `created_by=eq.${uid}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, uid]);
  return { rows, reload: load };
}

/** Ideias e problemas: escreve-se, junta-se uma captura se ajudar, e acompanha-se o estado e a resposta. */
export function Tickets() {
  const { me } = useSession();
  const { toast } = useOverlays();
  const mine = useMyTickets(me?.id);
  const [kind, setKind] = useState<Ticket['kind']>('ideia');
  const [where, setWhere] = useState(() => placeOf(lastPlace.path));
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const places = PLACES.includes(where) ? PLACES : [where, ...PLACES];

  async function send(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!me) return;
    if (body.trim().length < 3) return setErr(kind === 'ideia' ? 'Conta lá a ideia.' : 'Conta o que aconteceu.');
    setBusy(true);
    let shot: string | null = null;
    if (file) {
      const blob = await shrink(file);
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'png';
      const path = `${me.id}/${rid()}.${ext}`;
      const { error } = await supabase.storage.from('tickets').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
      if (error) { setBusy(false); return setErr('A captura não foi. Tenta outra vez, ou envia só o texto.'); }
      shot = path;
    }
    const { error } = await supabase.from('tickets').insert({ kind, body: body.trim().slice(0, 2000), screen: where, shot });
    setBusy(false);
    if (error) return setErr('Não foi. Tenta outra vez.');
    setBody(''); setFile(null);
    toast(kind === 'ideia' ? 'Ideia enviada. A chinchila agradece.' : 'Problema enviado. Vamos a isso.', { ok: true });
    mine.reload();
  }

  return (
    <>
      <Top title="Ideias e problemas" />
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>A NIKKI melhora com o que lhe contas. Aqui vês o estado e a resposta. Sem formulários de três páginas.</p>
      <form className="form" onSubmit={send}>
        <div className="seg" role="group" aria-label="Tipo">
          <button type="button" className="press" aria-pressed={kind === 'ideia'} onClick={() => setKind('ideia')}>Ideia</button>
          <button type="button" className="press" aria-pressed={kind === 'problema'} onClick={() => setKind('problema')}>Problema</button>
        </div>
        <div className="chips" role="group" aria-label="Onde">{places.map((p) => <button key={p} type="button" className="press" aria-pressed={where === p} onClick={() => setWhere(p)}>{p}</button>)}</div>
        <label className="sr" htmlFor="tk-body">{kind === 'ideia' ? 'A ideia' : 'O problema'}</label>
        <textarea id="tk-body" className="note" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={kind === 'ideia' ? 'O que gostavas que a NIKKI fizesse?' : 'O que aconteceu? E o que esperavas que acontecesse?'} />
        <div className="att">
          {preview
            ? <><img src={preview} alt="Captura escolhida" /><button type="button" className="tb press" onClick={() => setFile(null)}>Tirar a captura</button></>
            : <label className="btn quiet press"><Icon n="plus" s={18} />Juntar captura ou foto<input className="sr" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>}
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press" disabled={busy}>{busy ? 'A enviar…' : 'Enviar'} <Icon n="arrow" s={20} /></button>
      </form>
      {mine.rows.length > 0 && <>
        <p className="s">Os teus</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{mine.rows.map((t) => (
          <article className="tile tk" key={t.id}>
            <div className="tk-top"><span className="s">{t.kind === 'ideia' ? 'Ideia' : 'Problema'}{t.screen ? ` · ${t.screen}` : ''} · {shortDate(t.created_at)}</span><span className={statusClass(t.status)}>{STATUS[t.status]}</span></div>
            <p className="tk-body">{t.body}</p>
            {t.shot && <Shot path={t.shot} />}
            {t.reply && <div className="reply"><span className="s">Resposta</span><p>{t.reply}</p></div>}
          </article>
        ))}</div>
      </>}
    </>
  );
}
