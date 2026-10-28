# NIKKI

Hub da casa: dinheiro, contas a dois, compras, garagem, agenda, objetivos. App web instalável (PWA)
em React + Vite + TypeScript, com Supabase (Auth, Postgres com RLS, tempo real).

Regras de cálculo, arquitetura, decisões de produto e marca vivem no repositório `rodrinova/thenikki`
(`docs/CALCULOS.md`, `docs/ARQUITETURA.md`, `docs/DECISOES.md`, `brand/`). O protótipo de referência é
`prototypes/nikki-hub.html` nesse repositório.

## Correr

```bash
npm ci
npm run dev        # http://localhost:8080
npm test           # contas e datas (Europe/Lisbon)
npm run build      # tsc + vite build
```

`.env` é opcional: sem ele, a app usa o projeto `xjhlcfgihyoiewuamzfv` (ver `.env.example`).

## Ver sem base de dados (demonstração)

```bash
npm run demo       # gera nikki-demo.html: a app real com dados de exemplo em memória, numa página só
```

Na demonstração entra-se como Rodrigo ou Inês, ou cria-se uma conta nova (qualquer código de 6 algarismos
serve) para ver o primeiro uso a solo. Nada sai do aparelho.

## Base de dados

Tudo vive no schema `nikki` do projeto Supabase existente. As tabelas `public.*` da app antiga (Lovable)
não são tocadas.

- Migração: `supabase/migrations/0001_nikki.sql` (idempotente; corre no SQL Editor do Supabase).
- Depois de a correr, em **Project Settings → API → Exposed schemas**, juntar `nikki`.
- Testes de acesso (RLS), convites e contas a dois numa base local:

```bash
createdb nikki_test
psql -d nikki_test -f supabase/tests/local_stubs.sql
psql -d nikki_test -f supabase/migrations/0001_nikki.sql
psql -d nikki_test -f supabase/tests/rls_test.sql   # termina com "rls_test: tudo certo"
```

### Entrar

Link mágico por e-mail, sem palavra-passe. Na app instalada no iPhone, o link abre no Safari e não na
app; por isso o ecrã aceita também o **código de 6 algarismos** do mesmo e-mail. Para o e-mail trazer o
código, o modelo "Magic Link" em **Authentication → Email Templates** deve incluir `{{ .Token }}`.
Em **Authentication → URL Configuration**, o Site URL e os Redirect URLs têm de apontar para o endereço
onde a app estiver publicada.

O envio de e-mails do Supabase sem SMTP próprio está limitado a poucos por hora: para uso diário,
configurar um SMTP (ex.: Resend) em **Authentication → SMTP Settings**.

## O que já funciona (fase 1)

- Entrar ou criar conta por e-mail; nome; criar casa (fica administrador) ou entrar com código/ligação.
- Convites com ligação e código, partilhados pelo menu do telemóvel; papéis Administrador e Membro.
- Início fixo: primeiros passos, «Agora» que se desliza, agenda em calendário (a semana, que abre no mês), Avisos,
  Contas a dois (a solo: Mês), Objetivos.
- Dinheiro: a tua parte do mês, ritmo face ao teu normal, fecho previsto, categorias, movimentos.
- Despesa: Minha · Partilhada · Do outro, dia, nota. A percentagem da partilha define-se em Pessoas.
- Contas a dois: quem adiantou mais (os bigodes da cara medem), transferências nos dois sentidos.
- Compras sincronizadas, arrumadas por corredor, sem unidades; em direto quando os dois as têm abertas.

Garagem, agenda, casa (prazos), ginásio, objetivos, património e independência, importação de extratos
e talões com Gemini chegam nas fases seguintes (ver `docs/ARQUITETURA.md`).
