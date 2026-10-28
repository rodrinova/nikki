# NIKKI app — notas para o Claude Code

- Stack: React 18 + Vite 5 + TS + react-router 6 + supabase-js 2 (schema `nikki`). Sem Tailwind: o CSS é o do protótipo (`src/styles.css`).
- Contas em `src/lib/money.ts`, em inteiros (1 u = 0,00001 €); arredondar só ao mostrar (`eur`, meio-par). Testes em `src/lib/__tests__/`; acrescentar testes quando mudar contas.
- `pairBalance` tem de dar o mesmo que a função SQL `nikki.pair_balance` (o teste usa os mesmos números de `supabase/tests/rls_test.sql`).
- Datas: só `src/lib/dates.ts` (locais). Nunca `toISOString().slice(0, 10)`.
- Linguagem: sem "deves"; equipa ("adiantou mais", "contas a dois"). Partilha: Minha · Partilhada · De <nome>.
- Leituras de tabelas da casa: `useLive` (paginado + tempo real com sufixo aleatório no canal). Exceção: a presença nas Compras (`src/data/presence.ts`) usa um canal com o mesmo nome para os dois e fecha com atraso para sobreviver ao StrictMode.
- Eventos «só para mim» (coluna `private`) dos outros só por `rpc('busy_slots')`, sem título; a app mostra «<nome> tem planos». Nunca «privado» nem «ocupado» no ecrã.
- Escritas otimistas onde há lista (compras); erros com aviso.
- Migrações: `supabase/migrations/`, idempotentes, testadas com `supabase/tests/*` numa base local antes de ir para o Supabase.
- Nunca mexer nas tabelas `public.*` (app antiga).
- Preferência do Rodrigo: sempre que houver mudanças visíveis, publicar o HTML para ele ver (`npm run demo` → artefacto «NIKKI app»; o protótipo em thenikki/prototypes/nikki-hub.html → artefacto «NIKKI»).
- Marca: depois da abertura (`src/brand/Intro.tsx`, primeira abertura de cada dia) usa-se só a cara (`Face`), não a palavra; `Wordmark` fica para a entrada e para a história. Setas com o ângulo dos bigodes (`Icon`: back, arrow, chev). Avisos de algo gravado: `toast(msg, { ok: true })` (a cara pisca o olho).
- Modo de demonstração: `src/lib/demo.ts` imita o supabase-js em memória; manter em dia quando a app usar novas tabelas ou funções.
