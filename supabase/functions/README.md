# Funções do Supabase

| Função | Para quê | Publicar |
|---|---|---|
| `calendar` | O calendário da NIKKI em `.ics` (subscrever por ligação, só leitura). | `supabase functions deploy calendar --no-verify-jwt` |
| `calendar-link` | Ligar/desligar o calendário «NIKKI» ao iCloud (palavra-passe de app) ou ao Google (entrar com o Google). | `supabase functions deploy calendar-link --no-verify-jwt` |
| `calendar-sync` | Na hora: a app chama-a depois de guardar ou apagar um evento; escreve no iCloud/Google de quem o deve ver. | `supabase functions deploy calendar-sync` |

## Segredos (uma vez)

A chave que encripta os acessos guardados fica em `nikki.calendar_config` (criada pela migração; só a chave de serviço a lê). Publicar juntando cada função num só ficheiro (como a `push`), porque importam `src/lib/*.ts`.

```
supabase secrets set APP_URL=https://<endereço da app>           # para onde volta depois do Google
supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…   # só para o Google
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem nas funções.

## Google (uma vez, na Google Cloud Console)

1. Projeto novo → APIs → ativar **Google Calendar API**.
2. Ecrã de consentimento OAuth: tipo Externo, em modo de teste, com os e-mails da casa como utilizadores de teste.
   O âmbito é `calendar.app.created`: a NIKKI só vê e mexe nos calendários que ela própria cria.
3. Credenciais → ID de cliente OAuth (aplicação Web), com o URI de redirecionamento
   `https://<projeto>.supabase.co/functions/v1/calendar-link`.

## iCloud

Não precisa de configuração. Cada pessoa cria uma palavra-passe de app em account.apple.com (Iniciar sessão e
segurança → Palavras-passe de apps) e põe-na na NIKKI. Pode revogá-la lá a qualquer momento.

## Notificações (função `push`)

Não há segredos a pôr à mão. A migração cria `nikki.push_config` (só a chave de serviço lê), liga o `pg_cron` e o
`pg_net` e agenda a função de 15 em 15 minutos com o segredo dessa tabela. Na primeira volta, a função cria as chaves
VAPID e guarda-as lá. A app lê a chave pública por `rpc('push_public_key')` (ou `VITE_VAPID_PUBLIC`, se existir no build).

Publicar: a função importa `src/lib/*.ts` sem extensão, por isso junta-se num só ficheiro antes:
```
npx esbuild supabase/functions/push/index.ts --bundle --format=esm --platform=neutral --external:'npm:*' --outfile=/tmp/push.js
```
e publica-se esse ficheiro como `push`, sem verificação de JWT (a app chama-a com a sessão para o «Experimentar»; o
pg_cron chama-a com `x-cron-secret`).

A função corre em UTC: as horas dos eventos passam para a hora de Lisboa antes do resumo. Para verificar, chamar com
`{"check": true}` e o `x-cron-secret`. Entre as 22h e as 8h não se envia nada. O resumo sai na primeira volta depois
das 8h00; cada aviso vai uma só vez. No iPhone, as notificações só funcionam com a NIKKI adicionada ao ecrã principal
(iOS 16.4+).
