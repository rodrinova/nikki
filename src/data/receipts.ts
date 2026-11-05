import { supabase } from '@/lib/supabase';
import { rid, shrink } from '@/screens/Tickets';

/**
 * Anexa a fatura (foto ou PDF) a uma despesa: vai para o bucket privado da casa (receipts/<casa>/despesas/<id>/…) e
 * substitui a anterior. As de supermercado são lidas a seguir (produtos e quantidades, para as sugestões das Compras).
 */
export async function attachReceipt(house: string, expense: { id: string; receipt_path?: string | null; category: string }, file: File): Promise<{ error: string | null; reading: Promise<string | null> | null }> {
  const blob = file.type === 'application/pdf' ? file : await shrink(file);
  const ext = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'jpg';
  const path = `${house}/despesas/${expense.id}/${rid()}.${ext}`;
  const up = await supabase.storage.from('receipts').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
  if (up.error) return { error: 'A fatura não foi. Tenta outra vez.', reading: null };
  const { error } = await supabase.from('expenses').update({ receipt_path: path, receipt_read_at: null }).eq('id', expense.id);
  if (error) return { error: error.message, reading: null };
  if (expense.receipt_path) await supabase.storage.from('receipts').remove([expense.receipt_path]);
  return { error: null, reading: expense.category === 'Supermercado' ? readReceipt(expense.id) : null };
}

/** Lê uma fatura de supermercado (função «receipt-read»): devolve null se correu bem, ou o porquê. */
export async function readReceipt(expenseId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('receipt-read', { body: { expense_id: expenseId } });
  if (error) {
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) return b.error as string; } catch { /* sem corpo */ }
    return 'Não deu para ler a fatura agora.';
  }
  return (data as { items?: number })?.items ? null : 'Não encontrei produtos nesta fatura.';
}
