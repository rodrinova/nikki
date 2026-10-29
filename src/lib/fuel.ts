// Abastecer por fotografia: do talão ou do mostrador da bomba tiram-se o valor, os litros e o preço por litro; do
// conta-quilómetros, os km. O texto chega do reconhecimento no telemóvel (lib/ocr.ts). Regras em docs/CALCULOS.md,
// secção 12. Puro.

export interface FuelRead { amount: number | null; litres: number | null; price: number | null }

// «1.234,56» (milhares com ponto) ou «1,789» / «1.789» (decimais): só com os dois sinais o ponto é dos milhares.
const num = (s: string) => { const t = s.replace(/\s/g, ''); return Number(t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.')); };
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.06, b * 0.015);

/**
 * Talão: «Total 62,00 €», «Gasóleo 34,66 L», «Preço/L 1,789». Mostrador da bomba: três números soltos (valor, litros
 * e preço com três casas). Com dois dos três, o terceiro calcula-se; quando os três batem (valor ≈ litros × preço),
 * fica certo.
 */
export function readFuel(text: string): FuelRead {
  const t = text.replace(/€/g, ' € ').replace(/[ \t]+/g, ' ');
  const tag = (re: RegExp) => { const m = t.match(re); return m ? num(m[1]) : null; };
  let litres = tag(/(\d{1,3}[.,]\d{1,3})\s?(?:l|lt|lts|litros)\b/i) ?? tag(/(?:litros|volume|quantidade|qtd\.?)\s*[:=]?\s*(\d{1,3}[.,]\d{1,3})/i);
  let price = tag(/(?:pre[cç]o|p\.?\s?unit\.?|€\s?\/\s?l|eur\/l)\s*(?:\/\s?l)?\s*[:=]?\s*(\d[.,]\d{2,3})/i) ?? tag(/(\d[.,]\d{3})\s?(?:€|eur)?\s?\/\s?l/i);
  let amount = tag(/(?:total|a pagar|valor|montante|importe)\s*(?:a pagar)?\s*[:=]?\s*(?:€\s?)?(\d{1,4}[.,]\d{2})/i) ?? tag(/(\d{1,4}[.,]\d{2})\s?€/);
  // Sem rótulos (o mostrador da bomba): procura no meio dos números um trio que bata.
  const all = [...t.matchAll(/\d{1,4}[.,]\d{2,3}/g)].map((m) => num(m[0])).filter((x) => x > 0);
  // Se os três não batem certo (ou falta algum), o trio que bate entre todos os números ganha aos rótulos.
  if (!(amount !== null && litres !== null && price !== null && near(amount, litres * price))) {
    const prices = all.filter((x) => x >= 0.8 && x <= 3.5);
    outer: for (const p of price !== null ? [price, ...prices] : prices) for (const a of all) for (const l of all) {
      if (a === p || l === p || a === l) continue;
      if (l <= 200 && near(a, l * p)) { amount = a; litres = l; price = p; break outer; }
    }
  }
  if (amount === null && litres !== null && price !== null) amount = Math.round(litres * price * 100) / 100;
  if (litres === null && amount !== null && price !== null) litres = Math.round((amount / price) * 100) / 100;
  if (litres !== null && !(litres > 0 && litres <= 200)) litres = null;
  return { amount, litres, price };
}

/**
 * Os km do conta-quilómetros: o número inteiro maior (sem casas decimais, que são o parcial «trip»), de 3 a 7
 * algarismos, com ou sem espaço nos milhares. Sabendo o último registo, prefere o que vem a seguir (até 5 000 km).
 */
export function readOdometer(text: string, last: number | null = null): number | null {
  const t = ` ${text.replace(/[|]/g, ' ')} `;
  const cands = [...t.matchAll(/(?<![\d.,])(\d{1,3}(?:[ .]\d{3})+|\d{3,7})(?![\d]|[.,]\d)/g)].map((m) => Number(m[1].replace(/[ .]/g, ''))).filter((x) => x >= 100 && x <= 1_999_999);
  if (!cands.length) return null;
  if (last !== null) {
    const after = cands.filter((x) => x >= last && x <= last + 5000).sort((a, b) => a - b);
    if (after.length) return after[0];
  }
  return Math.max(...cands);
}
