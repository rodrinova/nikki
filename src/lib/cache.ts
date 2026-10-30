// Cópia local dos dados da casa (IndexedDB), para a app abrir já com o que se viu da última vez e atualizar quando a
// rede responder. Fica só neste aparelho e apaga-se ao sair. Se o IndexedDB falhar (janela privada, bloqueado), a app
// segue sem cópia, como antes.

const DB = 'nikki', STORE = 'rows';
let db: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (db) return db;
  db = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return db;
}

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return open().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const t = d.transaction(STORE, mode), req = f(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      t.onerror = t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const cache = {
  get: <T>(key: string) => run<T>('readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key)).then(() => undefined),
  clear: () => run('readwrite', (s) => s.clear()).then(() => undefined),
};
