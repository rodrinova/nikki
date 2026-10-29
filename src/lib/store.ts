// localStorage pode falhar (janela privada, dados bloqueados, pré-visualização): nunca deixa a app partir.
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue */ } },
  remove(k: string) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};
