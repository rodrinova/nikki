// O código QR das faturas portuguesas (Portaria 195/2020, obrigatório desde 2022): campos «chave:valor» separados por «*».
// A: NIF de quem emite · B: NIF do cliente · D: tipo (FT, FS, FR, NC, ND…) · F: data (AAAAMMDD) · G: n.º do documento
// H: ATCUD · N: total do IVA · O: total com impostos. Sem dependências: usam-no a app e os testes.

export interface AtInvoice {
  nif: string; // de quem emitiu (a loja)
  buyerNif: string | null; // o do cliente (999999990 = consumidor final)
  type: string; // FT, FS, FR, NC (nota de crédito), ND…
  date: string; // AAAA-MM-DD
  doc: string; // ex.: «FS 0123/45678»
  atcud: string | null;
  total: string; // «12.35» (euros, com ponto)
  vat: string | null;
  credit: boolean; // nota de crédito: dinheiro que volta
}

/** Lê o texto de um QR de fatura portuguesa; null se não for um. */
export function parseAtQr(text: string): AtInvoice | null {
  const t = text.trim();
  if (!/^A:\d{9}\*/.test(t)) return null;
  const f: Record<string, string> = {};
  for (const part of t.split('*')) { const i = part.indexOf(':'); if (i > 0) f[part.slice(0, i)] = part.slice(i + 1); }
  const d = f.F ?? '', total = Number((f.O ?? '').replace(',', '.'));
  if (!/^\d{8}$/.test(d) || !Number.isFinite(total) || total <= 0) return null;
  const type = (f.D ?? 'FT').toUpperCase();
  return {
    nif: f.A, buyerNif: f.B && f.B !== '999999990' ? f.B : null, type,
    date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, doc: f.G ?? '', atcud: f.H && f.H !== '0' ? f.H : null,
    total: total.toFixed(2), vat: f.N ? Number(f.N.replace(',', '.')).toFixed(2) : null, credit: type === 'NC',
  };
}
