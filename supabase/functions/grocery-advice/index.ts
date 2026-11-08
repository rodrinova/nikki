// Conselhos do supermercado: a app manda só o resumo (gasto por mês, lojas, consumo estimado por produto, cobertura das
// faturas) e o Gemini devolve 3 a 5 conselhos curtos em português de Portugal. Nada de faturas nem de nomes.
// A chave: o segredo GEMINI_API_KEY ou a posta na NIKKI (Administração → Números), em nikki.ai_config.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
// O gemini-2.5-flash já não está disponível para chaves novas (nov. 2026); o 3.5 Flash responde bem com a resposta em JSON.
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash';
/** O texto da resposta (sem as partes de raciocínio, que os modelos novos às vezes mandam à parte). */
const answer = (out: any): string => ((out?.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
// A chave do Google AI Studio («AIza…») fala com a Gemini API; a do Vertex AI («AQ.…», modo express) com o Vertex.
const endpoint = (key: string) => key.startsWith('AQ.')
  ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent?key=${key}`
  : `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

const PROMPT = `És um conselheiro de poupança doméstica em Portugal, prático e simpático, que fala com um casal (tratamento por «vocês»).
Recebes o resumo do supermercado da casa nos últimos meses: gasto médio por mês, lojas e a parte de cada uma, e o consumo
habitual estimado por produto (quantidade e euros por mês). As faturas lidas são só uma parte das compras: a cobertura
indica quanto; com cobertura baixa, sê prudente e diz que é uma estimativa.
Dá 3 a 5 conselhos concretos, com números quando fizer sentido (ex.: «Leite: ~14 l por mês; em pack de 6 na marca da loja
poupam ~3 € por mês»). Ideias: embalagens maiores, marca da loja, juntar compras numa loja mais barata, cortar o que pesa
muito, água da torneira com filtro, congelar, comprar fruta da época. Sem moralismos, sem falar de saúde nem de dietas.
Cada conselho: um título curto (até 6 palavras) e uma frase. Português de Portugal.`;
const SCHEMA = { type: 'OBJECT', properties: { tips: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, text: { type: 'STRING' }, saving: { type: 'NUMBER', nullable: true } }, required: ['title', 'text'] } } }, required: ['tips'] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!(await admin.auth.getUser(jwt)).data.user) return json({ error: 'sem sessão' }, 401);
  const key = Deno.env.get('GEMINI_API_KEY') ?? (await admin.from('ai_config').select('gemini_key').eq('id', true).maybeSingle()).data?.gemini_key;
  if (!key) return json({ error: 'Os conselhos começam quando a chave do Gemini estiver posta (Administração → Números).' });
  const { summary } = await req.json().catch(() => ({}));
  const text = JSON.stringify(summary ?? {});
  if (text.length > 12000) return json({ error: 'Resumo grande demais.' }, 400);
  const r = await fetch(endpoint(key), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT }, { text: `Resumo: ${text}` }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.4 } }),
  });
  if (!r.ok) { console.error('gemini', r.status, (await r.text()).slice(0, 500)); return json({ error: r.status === 400 || r.status === 401 || r.status === 403 ? 'O Gemini não aceitou a chave. Confirma-a em Administração → Números.' : `O Gemini não respondeu (${r.status}).` }); }
  const out = await r.json();
  try {
    const tips = JSON.parse(answer(out) || '{}').tips ?? [];
    return json({ tips: tips.slice(0, 5) });
  } catch { return json({ error: 'Não percebi a resposta do Gemini.' }); }
});
