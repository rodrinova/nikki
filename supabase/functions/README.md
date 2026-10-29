# Funções do Supabase

| Função | Para quê | Publicar |
|---|---|---|
| `calendar` | O calendário da NIKKI em `.ics` (subscrever por ligação, só leitura). | `supabase functions deploy calendar --no-verify-jwt` |
| `calendar-link` | Ligar/desligar o calendário «NIKKI» ao iCloud (palavra-passe de app) ou ao Google (entrar com o Google). | `supabase functions deploy calendar-link --no-verify-jwt` |
| `calendar-sync` | Na hora: a app chama-a depois de guardar ou apagar um evento; escreve no iCloud/Google de quem o deve ver. | `supabase functions deploy calendar-sync` |

## Segredos (uma vez)

```
supabase secrets set CALENDAR_KEY=$(openssl rand -base64 32)   # encripta os acessos guardados
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

1. Gerar as chaves VAPID (uma vez): `npx web-push generate-vapid-keys`.
2. Segredos da função: `supabase secrets set VAPID_PUBLIC=… VAPID_PRIVATE=… VAPID_SUBJECT=mailto:o-teu-email PUSH_CRON_SECRET=<aleatório> TZ=Europe/Lisbon`.
3. Na app (build): `VITE_VAPID_PUBLIC=<a chave pública>`.
4. Publicar: `supabase functions deploy push --no-verify-jwt` (a app chama-a com a sessão para o «Experimentar»; o
   pg_cron chama-a com `x-cron-secret`).
5. Agendar de 15 em 15 minutos (SQL, com as extensões pg_cron e pg_net ligadas):
   ```sql
   select cron.schedule('nikki-push', '*/15 * * * *', $$
     select net.http_post(url := 'https://imbflvhufvvjcfetljsd.supabase.co/functions/v1/push',
       headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<o mesmo PUSH_CRON_SECRET>'),
       body := '{}'::jsonb);
   $$);
   ```
Entre as 22h e as 8h não se envia nada. O resumo sai na primeira volta depois das 8h00; cada aviso vai uma só vez.
No iPhone, as notificações só funcionam com a NIKKI adicionada ao ecrã principal (iOS 16.4+).
