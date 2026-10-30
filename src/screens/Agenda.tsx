import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { supabase, DEMO, url as base } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type EventRow } from '@/data/house';
import { useAgendaItems, type AgendaItem } from '@/data/agenda';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { store } from '@/lib/store';
import { WEEKDAYS, addDays, monthKey, monthName, monthWeeks, nextMonth, parseDate, prevMonth, toDateStr, todayStr, weekOf, weekdayName } from '@/lib/dates';
import { isoWeekday, mapsLinks, nthOf, repeatLabel, type Repeat } from '@/lib/agenda';

// Agenda (no início, não é módulo): a semana ou o mês com o texto pequenino de cada coisa (como no iPhone), a lista
// do dia escolhido, eventos de uma vez ou que se repetem, aniversários, sítios (abrem no Waze ou no Google Maps) e a
// ligação ao calendário do telemóvel (só de leitura). Regras em docs/CALCULOS.md, secção 8.

const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const dayTitle = (d: string, today: string) => {
  const x = parseDate(d), tail = `${x.getDate()} ${MON[x.getMonth()]}`;
  return d === today ? `Hoje · ${weekdayName(d)}, ${tail}` : d === addDays(today, 1) ? `Amanhã · ${weekdayName(d)}, ${tail}` : `${cap(weekdayName(d))}, ${tail}`;
};

/** Abrir um sítio: no Android, o Waze (se houver) ou o Google Maps; no iPhone, tenta o Waze e, se não abrir, o Google Maps (e lembra-se). */
export function openPlace(place: string) {
  const l = mapsLinks(place), ua = navigator.userAgent;
  if (/android/i.test(ua)) { location.href = l.android; return; }
  if (/iphone|ipad|ipod/i.test(ua) && store.get('nikki_waze') !== 'nao') {
    let left = false;
    const away = () => { left = true; };
    document.addEventListener('visibilitychange', away, { once: true });
    location.href = l.wazeApp;
    setTimeout(() => { document.removeEventListener('visibilitychange', away); if (!left && !document.hidden) { store.set('nikki_waze', 'nao'); window.open(l.google, '_blank'); } }, 1400);
    return;
  }
  window.open(l.google, '_blank');
}

/**
 * A agenda no início (não é um módulo do menu): a semana com o texto pequenino de cada coisa, que abre no mês inteiro
 * com um toque no título ou a deslizar para baixo, como no iPhone; deslizar para o lado muda de semana ou de mês.
 * Por baixo, a lista do dia escolhido, «Novo» e a ligação ao calendário do telemóvel.
 */
export function AgendaPane({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const today = todayStr();
  const [open, setOpen] = useState(defaultOpen);
  const [sel, setSel] = useState(today);
  const [mk, setMk] = useState(monthKey(today));
  const { open: sheet } = useOverlays();
  const month = monthWeeks(open ? mk : monthKey(sel));
  const weeks = open ? month : [weekOf(sel)];
  const items = useAgendaItems(weeks[0][0], weeks[weeks.length - 1][6]);
  const by = useMemo(() => { const m = new Map<string, AgendaItem[]>(); for (const it of items) m.set(it.day, [...(m.get(it.day) ?? []), it]); return m; }, [items]);
  const t0 = useRef<{ x: number; y: number } | null>(null);
  const shift = (dir: 1 | -1) => {
    if (open) { const k = dir > 0 ? nextMonth(mk) : prevMonth(mk); setMk(k); setSel(k === monthKey(today) ? today : `${k}-01`); }
    else setSel(addDays(sel, 7 * dir));
  };
  const toggle = (v: boolean) => { setOpen(v); if (v) setMk(monthKey(sel)); };
  const shown = open ? mk : monthKey(sel);
  const list = by.get(sel) ?? [];
  const next = by.get(addDays(today, 1)) ?? [];
  return (
    <section className={`tile ag${open ? ' open' : ''}`} aria-label="Agenda"
      onTouchStart={(e) => { t0.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const s = t0.current; t0.current = null; if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) shift(dx < 0 ? 1 : -1);
        else if (Math.abs(dy) > 50 && (e.target as HTMLElement).closest('.ag-grid')) toggle(dy > 0);
      }}>
      <div className="ag-top">
        <button className="ag-month press" aria-expanded={open} onClick={() => toggle(!open)}>{cap(monthName(shown))}{shown.slice(0, 4) !== today.slice(0, 4) ? ` ${shown.slice(0, 4)}` : ''} <span className={`ag-chev${open ? ' up' : ''}`} aria-hidden="true"><Icon n="chev" s={14} /></span></button>
        <span style={{ display: 'flex', gap: 6 }}>
          {(sel !== today || (open && mk !== monthKey(today))) && <button className="tb quiet press" onClick={() => { setSel(today); setMk(monthKey(today)); }}>Hoje</button>}
          <button className="tb press" onClick={() => sheet(<EventSheet day={sel} />)}>Novo</button>
        </span>
      </div>
      <div className="ag-wd" aria-hidden="true">{WEEKDAYS.map((w, j) => <span key={j}>{w}</span>)}</div>
      <div className="ag-grid" role="grid">{weeks.map((w) => w.map((d) => {
        const its = by.get(d) ?? [], out = open && d.slice(0, 7) !== mk;
        return (
          <button key={d} role="gridcell" className={`ag-d press${out ? ' out' : ''}${d === sel ? ' sel' : ''}${d === today ? ' today' : ''}`} aria-label={`${dayTitle(d, today)}${its.length ? `, ${its.length} ${its.length === 1 ? 'coisa' : 'coisas'}` : ''}`} onClick={() => setSel(d)}>
            <span className="n">{Number(d.slice(8, 10))}</span>
            {open ? <>
              {its.slice(0, 3).map((it, j) => <span key={j} className={`mt k-${it.kind}`} style={it.color ? { ['--c' as string]: it.color } : undefined}>{it.title}</span>)}
              {its.length > 3 && <span className="mt more">+{its.length - 3}</span>}
            </> : <span className="dots" aria-hidden="true">{its.slice(0, 3).map((it, j) => <i key={j} className={`k-${it.kind}`} style={it.color ? { ['--c' as string]: it.color } : undefined} />)}</span>}
          </button>
        );
      }))}</div>
      <div className="ag-day">
        <span className="s">{dayTitle(sel, today)}</span>
        {list.length ? <div className="rows">{list.map((it, j) => <DayRow key={j} it={it} day={sel} />)}</div> : <p className="s">Nada neste dia.</p>}
      </div>
      {/* Fechada (no início), mostra também amanhã: o que importa de manhã é hoje e amanhã. */}
      {!open && sel === today && <div className="ag-day">
        <span className="s">{dayTitle(addDays(today, 1), today)}</span>
        {next.length ? <div className="rows">{next.map((it, j) => <DayRow key={j} it={it} day={addDays(today, 1)} />)}</div> : <p className="s">Nada amanhã.</p>}
      </div>}
      {open && <button className="ag-phone s press" onClick={() => sheet(<PhoneSheet />)}><Icon n="cal" s={14} /> No calendário do telemóvel</button>}
    </section>
  );
}

function DayRow({ it, day }: { it: AgendaItem; day: string }) {
  const { open } = useOverlays();
  const e = it.ev;
  return (
    <div className="ag-row">
      <span className={`bar k-${it.kind}`} style={it.color ? { ['--c' as string]: it.color } : undefined} aria-hidden="true" />
      <button type="button" className="row-main press" disabled={!e} onClick={() => e && open(<EventSheet ev={e} day={day} />)}>
        <span className="st2"><span>{it.title}</span><span className="s">{[it.time ? `${it.time}${it.endTime ? `–${it.endTime}` : ''}` : it.kind === 'due' ? '' : 'dia inteiro', it.note, e && e.repeat !== 'none' ? repeatLabel(e) : '', it.kind === 'due' ? it.note : ''].filter(Boolean).join(' · ')}</span></span>
      </button>
      {it.location && <button type="button" className="tb press" onClick={() => openPlace(it.location!)} aria-label={`Ir para ${it.location}`}>Ir</button>}
    </div>
  );
}

// ───────────── evento ─────────────

const WD_SHORT = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const WD_NAME = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const hm = (iso: string) => { const x = new Date(iso); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };

/** Novo evento ou ver/editar: o quê, dia e horas (ou dia inteiro), de quem, «só para mim», sítio e repetição. */
export function EventSheet({ ev, day }: { ev?: EventRow; day: string }) {
  const { me, partner, house } = useSession();
  const { events } = useHouse();
  const { close, toast } = useOverlays();
  const mine = !ev || ev.created_by === me?.id;
  const [kind, setKind] = useState<'event' | 'birthday'>(ev?.kind ?? 'event');
  const [title, setTitle] = useState(ev?.title ?? '');
  const [date, setDate] = useState(ev ? toDateStr(new Date(ev.starts_at)) : day);
  const [allDay, setAllDay] = useState(ev?.all_day ?? false);
  const [t0, setT0] = useState(ev && !ev.all_day ? hm(ev.starts_at) : '20:00');
  const [t1, setT1] = useState(ev?.ends_at && !ev.all_day ? hm(ev.ends_at) : '21:00');
  const [owner, setOwner] = useState<string | null>(ev ? ev.owner_id : null);
  const [priv, setPriv] = useState(ev?.private ?? false);
  const [place, setPlace] = useState(ev?.location ?? '');
  const [repeat, setRepeat] = useState<Repeat>(ev?.repeat ?? 'none');
  const [wds, setWds] = useState<number[]>(ev?.weekdays?.length ? ev.weekdays : [isoWeekday(day)]);
  const [mmode, setMmode] = useState<'day' | 'nth'>(ev?.month_mode ?? 'day');
  const [until, setUntil] = useState(ev?.until_on ?? '');
  const [remind, setRemind] = useState(String(ev?.remind_days ?? 7));
  const [err, setErr] = useState('');
  const bday = kind === 'birthday';
  const nth = nthOf(date), wd = isoWeekday(date);
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!title.trim()) return setErr(bday ? 'De quem é o aniversário?' : 'O que é?');
    const all = bday || allDay;
    const s = all ? parseDate(date) : new Date(`${date}T${t0}:00`);
    let en: Date | null = all ? null : new Date(`${date}T${t1}:00`);
    if (en && en <= s) en = new Date(en.getTime() + 86_400_000); // acaba depois da meia-noite
    const r = Number(remind);
    const row = {
      household_id: house!.id, title: (bday && !/anivers/i.test(title) ? `Aniversário: ${title.trim()}` : title.trim()).slice(0, 80),
      starts_at: s.toISOString(), ends_at: en ? en.toISOString() : null, all_day: all, kind,
      owner_id: bday ? null : priv ? me!.id : owner, private: !bday && priv, location: place.trim().slice(0, 160) || null,
      repeat: bday ? 'yearly' : repeat, weekdays: !bday && repeat === 'weekly' ? [...wds].sort() : null, month_mode: mmode,
      until_on: bday || repeat === 'none' ? null : until || null, remind_days: bday ? (r >= 0 && r <= 60 ? r : 7) : null,
    };
    const res = ev ? await supabase.from('events').update(row).eq('id', ev.id).select('id').single() : await supabase.from('events').insert({ ...row, created_by: me!.id }).select('id').single();
    const error = res.error;
    if (!error) pushToPhones(house!.id, (res.data as { id: string }).id);
    if (error) return setErr(error.message);
    events.reload(); close();
    toast(ev ? 'Guardado.' : `${row.title}${row.repeat !== 'none' ? `: ${repeatLabel(row as unknown as EventRow)}` : ''}.`, { ok: true });
  }
  async function remove(onlyThis: boolean) {
    const { error } = onlyThis
      ? await supabase.from('events').update({ skip_dates: [...(ev!.skip_dates ?? []), day] }).eq('id', ev!.id)
      : await supabase.from('events').delete().eq('id', ev!.id);
    if (error) return toast(error.message);
    pushToPhones(house!.id, ev!.id);
    events.reload(); close(); toast(onlyThis ? 'Tirado deste dia.' : 'Apagado.');
  }
  if (!mine && ev) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">{ev.title}</p>
      <p className="s">{ev.all_day ? 'Dia inteiro' : `${hm(ev.starts_at)}${ev.ends_at ? `–${hm(ev.ends_at)}` : ''}`}{ev.repeat !== 'none' ? ` · ${repeatLabel(ev)}` : ''}</p>
      {ev.location && <button className="btn quiet wide press" onClick={() => openPlace(ev.location!)}>{ev.location} <Icon n="arrow" s={18} /></button>}
      <p className="s">Só quem o criou o pode mudar. Regras da casa.</p>
    </div>
  );
  return (
    <>
      <form className="form" onSubmit={save} autoComplete="off">
        <div className="seg sm" role="group" aria-label="Tipo"><button type="button" className="press" aria-pressed={!bday} onClick={() => setKind('event')}>Evento</button><button type="button" className="press" aria-pressed={bday} onClick={() => setKind('birthday')}>Aniversário</button></div>
        <label>{bday ? 'De quem' : 'O quê'}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={bday ? 'ex.: da mãe' : 'ex.: Jantar com amigos'} maxLength={80} /></label>
        <div className="two">
          <label>{bday ? 'Data (com o ano, se souberes)' : 'Dia'}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {bday ? <label>Avisar (dias antes)<input inputMode="numeric" value={remind} onChange={(e) => setRemind(e.target.value)} /></label> : <span />}
        </div>
        {!bday && <>
          <div className="seg sm" role="group" aria-label="Horas"><button type="button" className="press" aria-pressed={!allDay} onClick={() => setAllDay(false)}>Com horas</button><button type="button" className="press" aria-pressed={allDay} onClick={() => setAllDay(true)}>Dia inteiro</button></div>
          {!allDay && <div className="two"><label>Das<input type="time" value={t0} onChange={(e) => setT0(e.target.value)} /></label><label>Às<input type="time" value={t1} onChange={(e) => setT1(e.target.value)} /></label></div>}
          <label>Sítio (abre no Waze ou no Google Maps)<input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="ex.: Rua da Graça 12, Lisboa" maxLength={160} /></label>
          {partner && <>
            <div className="seg sm" role="group" aria-label="De quem">
              <button type="button" className="press" aria-pressed={!priv && owner === null} onClick={() => { setOwner(null); setPriv(false); }}>Da casa</button>
              <button type="button" className="press" aria-pressed={!priv && owner === me!.id} onClick={() => { setOwner(me!.id); setPriv(false); }}>Meu</button>
              <button type="button" className="press" aria-pressed={!priv && owner === partner.id} onClick={() => { setOwner(partner.id); setPriv(false); }}>De {partner.name}</button>
              <button type="button" className="press" aria-pressed={priv} onClick={() => setPriv(true)}>Só para mim</button>
            </div>
            {priv && <p className="s">{partner.name} vê só «{me!.name} tem planos», sem o título nem o sítio.</p>}
          </>}
          <span className="s">Repetir</span>
          <div className="seg sm" role="group" aria-label="Repetir">
            {([['none', 'Não'], ['weekly', 'Semanal'], ['monthly', 'Mensal'], ['yearly', 'Anual']] as [Repeat, string][]).map(([k, l]) => <button key={k} type="button" className="press" aria-pressed={repeat === k} onClick={() => setRepeat(k)}>{l}</button>)}
          </div>
          {repeat === 'weekly' && <div className="wd-pick" role="group" aria-label="Dias da semana">{WD_SHORT.map((l, j) => <button key={j} type="button" className="press" aria-pressed={wds.includes(j + 1)} aria-label={WD_NAME[j]} onClick={() => setWds((x) => (x.includes(j + 1) ? (x.length > 1 ? x.filter((y) => y !== j + 1) : x) : [...x, j + 1]))}>{l}</button>)}</div>}
          {repeat === 'monthly' && <div className="seg sm" role="group" aria-label="Que dia do mês">
            <button type="button" className="press" aria-pressed={mmode === 'day'} onClick={() => setMmode('day')}>Dia {Number(date.slice(8, 10))}</button>
            <button type="button" className="press" aria-pressed={mmode === 'nth'} onClick={() => setMmode('nth')}>{nth === -1 ? (wd <= 5 ? 'Última' : 'Último') : `${nth}.${wd <= 5 ? 'ª' : 'º'}`} {WD_NAME[wd - 1]}</button>
          </div>}
          {repeat !== 'none' && <label>Até (opcional)<input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} /></label>}
        </>}
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {ev && (ev.repeat !== 'none'
        ? <div className="actions" style={{ marginTop: 8 }}><button className="back press" onClick={() => remove(true)}>Apagar só neste dia</button><button className="back press" onClick={() => remove(false)}>Apagar todos</button></div>
        : <button className="back press" onClick={() => remove(false)}>Apagar</button>)}
    </>
  );
}

// ───────────── no calendário do telemóvel ─────────────

/** Depois de guardar ou apagar: a NIKKI escreve logo no calendário do iCloud ou do Google de quem o ligou. */
export function pushToPhones(household: string, event_id: string) {
  supabase.functions.invoke('calendar-sync', { body: { household, event_id } }).catch(() => { /* fica para a próxima */ });
}

interface LinkRow { id: string; provider: 'icloud' | 'google'; account_hint: string | null; status: 'ok' | 'error'; last_sync_at: string | null; last_error: string | null }

/** No calendário do telemóvel: na hora (iCloud ou Google, a NIKKI escreve lá) ou por ligação (só leitura, sem conta). */
function PhoneSheet() {
  const { house, partner } = useSession();
  const { toast } = useOverlays();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [form, setForm] = useState(false);
  const [apple, setApple] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tok, setTok] = useState<string | null>(null);
  const load = async () => { const { data } = await supabase.from('calendar_links').select('id, provider, account_hint, status, last_sync_at, last_error').eq('household_id', house!.id); setLinks((data ?? []) as LinkRow[]); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const call = (body: Record<string, unknown>) => supabase.functions.invoke('calendar-link', { body: { household: house!.id, ...body } });
  async function icloud(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!/@/.test(apple) || pass.replace(/[\s-]/g, '').length < 16) return setErr('Põe o e-mail do Apple ID e a palavra-passe de app (16 letras, como xxxx-xxxx-xxxx-xxxx).');
    setBusy(true);
    const { data, error } = await call({ action: 'icloud', apple_id: apple, app_password: pass });
    setBusy(false);
    if (error || (data as { error?: string })?.error) return setErr((data as { error?: string })?.error ?? 'Não foi possível ligar ao iCloud. Tenta outra vez.');
    setForm(false); setPass(''); load();
    toast('Ligado ao iCloud. O calendário «NIKKI» já está no iPhone.', { ok: true });
  }
  async function google() {
    setBusy(true);
    const { data, error } = await call({ action: 'google' });
    setBusy(false);
    const url = (data as { url?: string })?.url;
    if (error || !url) return toast('Não foi possível abrir o Google. Tenta outra vez.');
    location.href = url;
    if (DEMO) { load(); toast('Ligado ao Google. O calendário «NIKKI» já está no telemóvel.', { ok: true }); }
  }
  async function unlink(provider: 'icloud' | 'google') {
    await call({ action: 'unlink', provider }); load();
    toast(`Desligado. O calendário «NIKKI» fica no ${provider === 'icloud' ? 'iPhone' : 'Google'} até o apagares lá.`);
  }
  async function getTok(renew = false) {
    const { data, error } = await supabase.rpc('calendar_token', { h: house!.id, renew });
    if (error) return toast(error.message);
    setTok(data as string);
    if (renew) toast('Ligação nova. A antiga deixou de funcionar.', { ok: true });
  }
  const https = tok ? `${base}/functions/v1/calendar?t=${tok}` : '';
  const row = (p: 'icloud' | 'google') => links?.find((l) => l.provider === p);
  const Status = ({ l, name }: { l: LinkRow; name: string }) => (
    <div className="tile card rows"><div>
      <span className="st2"><span>{name} · {l.account_hint}</span><span className={`s${l.status === 'error' ? ' warn' : ''}`}>{l.status === 'error' ? `Parou: ${l.last_error ?? 'erro'}. Volta a ligar.` : l.last_sync_at ? `Na hora · atualizado ${new Date(l.last_sync_at).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Na hora'}</span></span>
      <button className="tb quiet press" onClick={() => unlink(l.provider)}>Desligar</button>
    </div></div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">No calendário do telemóvel</p>
      <p className="s">A NIKKI escreve os eventos da casa e os teus num calendário «NIKKI». O telemóvel mostra-os em segundos, com o Waze já apontado.{partner ? ` Os de ${partner.name} não vão.` : ''}</p>
      {links === null ? <p className="s">A ver…</p> : <>
        {row('icloud') ? <Status l={row('icloud')!} name="iCloud" /> : form
          ? <form className="form" onSubmit={icloud} autoComplete="off">
              <p className="s">1. Em <a href="https://account.apple.com" target="_blank" rel="noreferrer">account.apple.com</a> → Iniciar sessão e segurança → Palavras-passe de apps → criar uma («NIKKI»). 2. Põe-na aqui com o teu e-mail do Apple ID. Não é a tua palavra-passe; podes revogá-la lá quando quiseres.</p>
              <label>E-mail do Apple ID<input type="email" value={apple} onChange={(e) => setApple(e.target.value)} placeholder="nome@icloud.com" autoComplete="username" /></label>
              <label>Palavra-passe de app<input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" /></label>
              {err && <p className="err">{err}</p>}
              <button className="btn wide press" disabled={busy}>{busy ? 'A ligar…' : 'Ligar o iCloud'} <Icon n="check" s={18} /></button>
            </form>
          : <button className="btn wide press" onClick={() => setForm(true)}>iPhone: ligar o iCloud <Icon n="cal" s={18} /></button>}
        {row('google') ? <Status l={row('google')!} name="Google" /> : <button className="btn quiet wide press" disabled={busy} onClick={google}>Android: entrar com o Google <Icon n="cal" s={18} /></button>}
        <p className="s">O acesso fica guardado encriptado e só serve para escrever no calendário «NIKKI» (no Google, a NIKKI nem vê os outros calendários).</p>
      </>}
      <details className="how"><summary className="s">Sem ligar contas (só leitura, atualiza de 15 em 15 min ou mais)</summary>
        {!tok ? <button className="btn quiet wide press" onClick={() => getTok()}>Criar a minha ligação <Icon n="link" s={18} /></button> : <>
          <a className="btn quiet wide press" href={https.replace(/^https:/, 'webcal:')}>Abrir no iPhone <Icon n="cal" s={18} /></a>
          <button className="btn quiet wide press" onClick={async () => { try { await navigator.clipboard.writeText(https); toast('Ligação copiada.', { ok: true }); } catch { toast(https); } }}>Copiar a ligação (Google Calendar)</button>
          <button className="back press" onClick={() => getTok(true)}>Trocar a ligação</button>
        </>}
      </details>
      {DEMO && <p className="s">Na demonstração, as ligações são de exemplo.</p>}
    </div>
  );
}
