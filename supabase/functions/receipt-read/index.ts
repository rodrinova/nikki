// Lê a fatura de uma despesa de supermercado com o Gemini e guarda cada linha como produto simples (nikki.receipt_items).
// Chamada pela app (com a sessão) depois de anexar a fatura: { expense_id }. Precisa do segredo GEMINI_API_KEY
// (aistudio.google.com → Get API key; o plano gratuito chega). A fatura nunca sai do bucket privado sem ser por aqui.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';

const PROMPT = `És um leitor de talões de supermercado portugueses. Lê o talão e devolve só JSON.
Para cada linha de produto (ignora totais, IVA, descontos gerais, sacos, cartão, pagamentos):
- "raw": o texto da linha como está;
- "product": um nome simples e genérico em português de Portugal, no plural quando se conta (ex.: «LIMAO BIO KG» → «Limões»; «LEITE M/G 1L PINGO DOCE» → «Leite meio-gordo»; «BANANA CAT I» → «Bananas»; «AGUA LUSO 6X1,5L» → «Água»). Sem marcas nem tamanhos;
- "qty" e "unit": a quantidade comprada em kg (o que é pesado; converte gramas), l (líquidos; converte ml e packs, ex.: 6×1,5 L = 9) ou un (unidades; um pack de 6 iogurtes = 6);
- "price": o valor pago pela linha, em euros.
Junta também "date" (AAAA-MM-DD, se aparecer) e "total".`;
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    date: { type: 'STRING', nullable: true }, total: { type: 'NUMBER', nullable: true },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      raw: { type: 'STRING' }, product: { type: 'STRING' }, qty: { type: 'NUMBER' }, unit: { type: 'STRING', enum: ['kg', 'l', 'un'] }, price: { type: 'NUMBER', nullable: true },
    }, required: ['product', 'qty', 'unit'] } },
  },
  required: ['items'],
};

function b64(buf: ArrayBuffer) {
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  // A chave: o segredo GEMINI_API_KEY ou a posta na NIKKI (Administração → Números), em nikki.ai_config.
  const key = Deno.env.get('GEMINI_API_KEY') ?? (await admin.from('ai_config').select('gemini_key').eq('id', true).maybeSingle()).data?.gemini_key;
  if (!key) return json({ error: 'A fatura ficou guardada. A leitura dos produtos começa quando a chave do Gemini estiver posta.' }, 503);
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const uid = (await admin.auth.getUser(jwt)).data.user?.id;
  if (!uid) return json({ error: 'sem sessão' }, 401);
  const { expense_id } = await req.json().catch(() => ({}));
  const { data: e } = await admin.from('expenses').select('id, household_id, spent_on, receipt_path, paid_by, created_by, other_id').eq('id', expense_id).maybeSingle();
  if (!e || !e.receipt_path) return json({ error: 'despesa sem fatura' }, 404);
  const { data: m } = await admin.from('memberships').select('role').eq('household_id', e.household_id).eq('profile_id', uid).maybeSingle();
  if (!m || m.role === 'staff' || ![e.paid_by, e.created_by, e.other_id].includes(uid)) return json({ error: 'não autorizado' }, 403);
  const file = await admin.storage.from('receipts').download(e.receipt_path);
  if (file.error || !file.data) return json({ error: 'não deu para abrir a fatura' }, 404);
  const mime = file.data.type || (e.receipt_path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64(await file.data.arrayBuffer()) } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
    }),
  });
  if (!r.ok) return json({ error: `Gemini: ${r.status}` }, 502);
  const out = await r.json();
  let parsed: { items?: { raw?: string; product: string; qty: number; unit: string; price?: number | null }[] } = {};
  try { parsed = JSON.parse(out?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'); } catch { return json({ error: 'não percebi a fatura' }, 422); }
  const rows = (parsed.items ?? []).filter((i) => i.product?.trim() && i.qty > 0 && ['kg', 'l', 'un'].includes(i.unit)).slice(0, 120).map((i) => ({
    household_id: e.household_id, expense_id: e.id, bought_on: e.spent_on, product: i.product.trim().slice(0, 60),
    qty: Math.round(i.qty * 1000) / 1000, unit: i.unit, price: i.price ?? null, raw: (i.raw ?? '').slice(0, 120) || null,
  }));
  await admin.from('receipt_items').delete().eq('expense_id', e.id);
  if (rows.length) { const ins = await admin.from('receipt_items').insert(rows); if (ins.error) return json({ error: ins.error.message }, 500); }
  await admin.from('expenses').update({ receipt_read_at: new Date().toISOString() }).eq('id', e.id);
  return json({ items: rows.length });
});
