# Segurança da NIKKI

O código é público; os dados não. O que protege os dados é a base de dados, não o segredo do código.

## Na base de dados (Supabase, projeto `imbflvhufvvjcfetljsd`)
- **Regras de acesso (RLS) em todas as tabelas.** Cada pessoa só lê o que é da sua casa; as despesas «só minhas» só quem
  as pagou; avaliações do ginásio só o próprio; o housekeeping nunca vê dinheiro, agenda privada nem património.
  Testes em `supabase/tests/rls_test.sql`.
- **Contas por aprovação.** Quem se regista fica «à espera» e não vê nada até ser aprovado (ou entrar por convite).
- **Sem sessão, nada.** Quem não entrou não lê tabelas nem corre funções do schema `nikki`; funções novas nascem fechadas.
- **A cópia da app antiga** (`legacy`) não está exposta na API e só o dono da base a lê. Apaga-se depois da mudança.
- **Ficheiros** (talões, fotografias, capturas) em arquivos privados, por pasta da casa ou da pessoa, com ligações que
  expiram.
- A chave que vai na app é a **publicável**: é pública por natureza. A chave de serviço nunca está no código.

## Na app publicada (GitHub Pages)
- **Política de conteúdo** (`vite.config.ts`): só corre código da própria app; só fala com o Supabase da NIKKI e com o
  jsDelivr (leitor de faturas, versões fixas). Um script injetado não consegue mandar dados para outro sítio.
- Ligações de entrada e convites só voltam para o endereço da app (lista de endereços no Supabase).
- Dependências sem vulnerabilidades conhecidas (`npm audit`); o Dependabot avisa das novas.

## Definições a manter (fora do código)
- **Supabase → Authentication → URL Configuration:** Site URL `https://rodrinova.github.io/nikki/` e só esse endereço
  em Redirect URLs.
- **Supabase → Authentication → Providers → Email:** «Confirm email» ligado.
- **Supabase → Authentication → Rate Limits:** os valores de origem chegam (limitam e-mails e tentativas).
- **GitHub → Settings → Code security:** Secret scanning, Push protection e Dependabot alerts ligados.
- **GitHub → Settings → Rules:** proteger `main` (sem force push nem apagar).
- **App antiga (Lovable):** a base dela aceita leitura e escrita de quem tiver o endereço. Depois da mudança, fechá-la.
