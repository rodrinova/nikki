// Apple Pay → NIKKI: o atalho do iPhone («Quando pago com…») chama isto com a ligação secreta da pessoa, o valor e a
// loja. Fica um rascunho (nikki.expense_drafts) que a app abre preenchido para confirmar; nada conta sem confirmação.
//   GET  /functions/v1/capture?t=<ligação>&v=<valor>&m=<loja>&c=<cartão>
//   POST /functions/v1/capture?t=<ligação>   corpo JSON ou formulário: { valor, loja, cartao } (ou amount, merchant, card)
// Publicar sem verificação de JWT (o atalho não tem sessão: a ligação é a chave, longa e aleatória, troca-se na app).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** «€12,35», «12,35 €», «1.234,50», «12.35» → 12.35 */
export function money(raw: unknown): number | null {
  let s = String(raw ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,50
  else s = s.replace(/,/g, ''); // 1,234.50
  const n = Math.abs(Number(s));
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') ?? '';
    body = type.includes('json') ? await req.json().catch(() => ({})) : Object.fromEntries((await req.formData().catch(() => new FormData())).entries());
  }
  const q = (k: string[]) => { for (const x of k) { const v = body[x] ?? url.searchParams.get(x); if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return null; };
  const t = q(['t', 'token']);
  if (!t || !/^[0-9a-f]{36}$/.test(t)) return json({ error: 'Ligação inválida.' }, 404);
  const { data: tok } = await db.from('capture_tokens').select('profile_id, household_id').eq('token', t).maybeSingle();
  if (!tok) return json({ error: 'Esta ligação já não existe. Cria uma nova na NIKKI.' }, 404);
  const amount = money(q(['v', 'valor', 'amount', 'quantia']));
  if (!amount) return json({ error: 'Sem valor.' }, 400);
  const merchant = (q(['m', 'loja', 'merchant', 'comerciante']) ?? '').slice(0, 80) || null;
  const card = (q(['c', 'cartao', 'card']) ?? '').slice(0, 60) || null;
  const { error } = await db.from('expense_drafts').insert({ household_id: tok.household_id, profile_id: tok.profile_id, amount, merchant, card });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, texto: `NIKKI: ${amount.toFixed(2).replace('.', ',')} €${merchant ? ` · ${merchant}` : ''}. Confirma quando abrires.` });
});
