-- NIKKI · schema próprio no projeto Supabase existente.
-- Só acrescenta: não altera nada em public.* (as tabelas da app do Lovable ficam intactas).
-- Idempotente: pode correr mais do que uma vez.
-- Regras de cálculo: docs/CALCULOS.md (repositório thenikki). Dinheiro em numeric, sem float.

create schema if not exists nikki;
grant usage on schema nikki to anon, authenticated, service_role;

-- ───────────────────────── pessoas, casas, papéis ─────────────────────────

create table if not exists nikki.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  color text not null default '#94B096',
  created_at timestamptz not null default now()
);

-- Estado da conta. A primeira pessoa de uma casa fica à espera da aprovação do administrador da app; a segunda
-- entra com o convite e fica ativa logo. «paused» = suspensa pelo administrador; «declined» = pedido não aceite.
alter table nikki.profiles add column if not exists email text;
alter table nikki.profiles add column if not exists status text not null default 'pending';
alter table nikki.profiles add column if not exists request jsonb; -- o pedido: {"house": "Casa da Graça", "note": "…"}
alter table nikki.profiles add column if not exists requested_at timestamptz;
alter table nikki.profiles add column if not exists approved_at timestamptz;
alter table nikki.profiles add column if not exists approved_via text;
alter table nikki.profiles add column if not exists last_seen_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table nikki.profiles add constraint profiles_status_check check (status in ('pending', 'active', 'declined', 'paused'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_via_check') then
    alter table nikki.profiles add constraint profiles_via_check check (approved_via in ('founder', 'admin', 'invite'));
  end if;
end $$;

-- Administração da app (o Rodrigo): aprova contas e vê contas, casas, módulos e tickets. Nunca os dados das casas.
-- A primeira conta criada fica administradora (ver nikki.first_account).
create table if not exists nikki.app_admins (
  profile_id uuid primary key references nikki.profiles (id) on delete cascade,
  since timestamptz not null default now()
);

create table if not exists nikki.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists nikki.memberships (
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'staff')), -- staff: housekeeping (não conta como pessoa da casa)
  joined_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);
create index if not exists memberships_profile on nikki.memberships (profile_id);
alter table nikki.memberships drop constraint if exists memberships_role_check;
alter table nikki.memberships add constraint memberships_role_check check (role in ('admin', 'member', 'staff'));

create table if not exists nikki.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null default 'member' check (role in ('admin', 'member', 'staff')),
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6)),
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references nikki.profiles (id)
);
create index if not exists invites_household on nikki.invites (household_id);

-- Taxa de partilha por par de adultos. ratio_a = parte de profile_a nas despesas partilhadas.
create table if not exists nikki.share_ratios (
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_a uuid not null references nikki.profiles (id) on delete cascade,
  profile_b uuid not null references nikki.profiles (id) on delete cascade,
  ratio_a numeric(4, 3) not null default 0.5 check (ratio_a between 0.1 and 0.9),
  updated_at timestamptz not null default now(),
  primary key (household_id, profile_a, profile_b),
  check (profile_a < profile_b)
);

-- Módulos ligados em cada casa (decide quem administra a casa). Sem linha = desligado. Dinheiro está sempre ligado.
create table if not exists nikki.household_modules (
  household_id uuid not null references nikki.households (id) on delete cascade,
  module text not null check (module in ('contas', 'compras', 'agenda', 'casa', 'garagem', 'objetivos', 'patrimonio', 'ginasio', 'extratos', 'housekeeping')),
  enabled_at timestamptz not null default now(),
  enabled_by uuid references nikki.profiles (id) on delete set null,
  primary key (household_id, module)
);

-- Ideias e problemas para melhorar a app. Quem escreve vê os seus; a administração vê todos (nikki.admin_tickets).
create table if not exists nikki.tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references nikki.profiles (id) on delete cascade,
  kind text not null check (kind in ('ideia', 'problema')),
  body text not null check (length(trim(body)) between 3 and 2000),
  screen text,  -- onde estava na app
  shot text,    -- captura no Storage: tickets/<pessoa>/<ficheiro>
  status text not null default 'novo' check (status in ('novo', 'a ver', 'feito', 'nao')),
  reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_by on nikki.tickets (created_by, created_at desc);

-- ───────────────────────── dinheiro ─────────────────────────

create table if not exists nikki.cars (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  owner_id uuid references nikki.profiles (id) on delete set null, -- vazio = carro da casa
  name text not null,
  plate text,
  annual_insurance numeric(10, 2) not null default 0,
  annual_tax numeric(10, 2) not null default 0,
  annual_other numeric(10, 2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists cars_household on nikki.cars (household_id);

-- split: mine = só de quem pagou · shared = partilhada pela taxa do par · other = toda do outro (paguei por ele).
-- payer_share = parte de quem pagou numa partilhada, gravada no momento: mudar a taxa não reescreve o passado.
create table if not exists nikki.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  created_by uuid not null references nikki.profiles (id),
  paid_by uuid not null references nikki.profiles (id),
  other_id uuid references nikki.profiles (id), -- com quem se partilha, ou de quem é (split other)
  amount numeric(12, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  category text not null,
  split text not null default 'mine' check (split in ('mine', 'shared', 'other')),
  payer_share numeric(4, 3) check (payer_share between 0.1 and 0.9),
  owed numeric(14, 5) generated always as (
    case split when 'shared' then amount * (1 - payer_share) when 'other' then amount else 0 end
  ) stored,
  note text check (length(note) <= 120),
  car_id uuid references nikki.cars (id) on delete set null,
  receipt_path text,
  source text not null default 'manual' check (source in ('manual', 'statement', 'receipt', 'deadline', 'import')),
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((split = 'mine') = (other_id is null)),
  check ((split = 'shared') = (payer_share is not null)),
  check (other_id is distinct from paid_by)
);
create index if not exists expenses_household_day on nikki.expenses (household_id, spent_on);
create unique index if not exists expenses_external on nikki.expenses (household_id, external_ref) where external_ref is not null;

-- Transferências entre o par (equilibrar as contas a dois).
create table if not exists nikki.transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  from_id uuid not null references nikki.profiles (id),
  to_id uuid not null references nikki.profiles (id),
  amount numeric(12, 2) not null check (amount > 0),
  made_on date not null default current_date,
  note text,
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create index if not exists transfers_household on nikki.transfers (household_id);

-- Saldo de abertura de um par (migração da app antiga). amount_a > 0 = profile_a adiantou mais.
create table if not exists nikki.ledger_openings (
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_a uuid not null references nikki.profiles (id),
  profile_b uuid not null references nikki.profiles (id),
  cutover date not null,
  amount_a numeric(12, 2) not null,
  primary key (household_id, profile_a, profile_b),
  check (profile_a < profile_b)
);

-- O que a importação de extratos aprende: descritivo normalizado → categoria e partilha habitual.
create table if not exists nikki.merchant_rules (
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  pattern text not null,
  category text not null,
  split_counts jsonb not null default '{}'::jsonb,
  car_id uuid references nikki.cars (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, profile_id, pattern)
);

-- ───────────────────────── casa ─────────────────────────

create table if not exists nikki.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  aisle text not null default 'Mercearia',
  done boolean not null default false,
  done_by uuid references nikki.profiles (id),
  done_at timestamptz,
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists shopping_household on nikki.shopping_items (household_id, done);

create table if not exists nikki.car_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  car_id uuid not null references nikki.cars (id) on delete cascade,
  logged_on date not null default current_date,
  odometer integer check (odometer >= 0),
  litres numeric(8, 2) check (litres > 0),
  full_tank boolean not null default true,
  kind text not null default 'fuel' check (kind in ('fuel', 'service', 'other')),
  expense_id uuid references nikki.expenses (id) on delete set null,
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists car_logs_car on nikki.car_logs (car_id, logged_on);
-- O valor fica também no registo do carro: a Garagem é de toda a casa, mesmo quando a despesa é «só minha».
alter table nikki.car_logs add column if not exists amount numeric(12, 2) check (amount > 0);
-- Dados do carro para avisos e exatidão (todos opcionais): data da matrícula (o IUC paga-se no mês dela),
-- seguradora e data de renovação do seguro, e capacidade do depósito (para detetar abastecimentos esquecidos).
alter table nikki.cars add column if not exists registered_on date;
alter table nikki.cars add column if not exists insurer text check (length(insurer) <= 40);
alter table nikki.cars add column if not exists insurance_renews_on date;
alter table nikki.cars add column if not exists tank_litres numeric(5, 1) check (tank_litres between 10 and 200);
-- Combustão ou elétrico (o consumo elétrico, em kWh/100 km, chega mais tarde).
alter table nikki.cars add column if not exists energy text not null default 'combustao' check (energy in ('combustao', 'eletrico'));
-- Tipos de registo: abastecer, carregar (elétrico), oficina, portagens e outras. Combustível, carregamentos e
-- portagens são o custo de andar; o resto conta nos fixos por mês.
alter table nikki.car_logs drop constraint if exists car_logs_kind_check;
alter table nikki.car_logs add constraint car_logs_kind_check check (kind in ('fuel', 'charge', 'service', 'toll', 'other'));
alter table nikki.car_logs add column if not exists note text check (length(note) <= 60);
-- «Esqueci-me»: abastecimento que faltou, estimado pelas medianas (sem km e sem despesa).
alter table nikki.car_logs add column if not exists estimated boolean not null default false;

create table if not exists nikki.deadlines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  title text not null,
  due_on date not null,
  amount numeric(12, 2),
  recurrence text not null default 'none' check (recurrence in ('none', 'monthly', 'yearly')),
  car_id uuid references nikki.cars (id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references nikki.profiles (id),
  expense_id uuid references nikki.expenses (id) on delete set null,
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists deadlines_household on nikki.deadlines (household_id, due_on);
-- Prazos: de que tipo são (para não haver dois IUC do mesmo carro) e com quantos dias de antecedência avisar.
alter table nikki.deadlines add column if not exists kind text check (kind in ('iuc', 'insurance', 'inspection', 'service', 'other'));
alter table nikki.deadlines add column if not exists remind_days smallint not null default 7 check (remind_days between 0 and 90);

create table if not exists nikki.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  owner_id uuid references nikki.profiles (id) on delete set null, -- vazio = de todos
  private boolean not null default false, -- «só para mim»: os outros veem «<nome> tem planos»
  budget numeric(12, 2),
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists events_household on nikki.events (household_id, starts_at);
-- Agenda: sítio, repetições (semanal em certos dias, mensal no mesmo dia ou na n.ª semana, anual), até quando, dias
-- tirados («só este») e aniversários (com aviso uns dias antes).
alter table nikki.events add column if not exists location text check (length(location) <= 160);
alter table nikki.events add column if not exists kind text not null default 'event' check (kind in ('event', 'birthday'));
alter table nikki.events add column if not exists repeat text not null default 'none' check (repeat in ('none', 'weekly', 'monthly', 'yearly'));
alter table nikki.events add column if not exists weekdays smallint[]; -- 1 = segunda … 7 = domingo (semanal)
alter table nikki.events add column if not exists month_mode text not null default 'day' check (month_mode in ('day', 'nth')); -- mensal: dia 12, ou «2.ª terça»
alter table nikki.events add column if not exists until_on date;
alter table nikki.events add column if not exists skip_dates date[] not null default '{}';
alter table nikki.events add column if not exists remind_days smallint check (remind_days between 0 and 60);

-- Calendário na hora: a NIKKI escreve os eventos num calendário «NIKKI» no iCloud (CalDAV, com uma palavra-passe de
-- app) ou no Google (API, só com acesso aos calendários que a NIKKI cria). O acesso (palavra-passe ou token) fica
-- encriptado e só as funções calendar-link e calendar-sync o leem; a app vê só o estado.
create table if not exists nikki.calendar_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  household_id uuid not null references nikki.households (id) on delete cascade,
  provider text not null check (provider in ('icloud', 'google')),
  account_hint text, -- ex.: r•••@icloud.com
  calendar_ref text, -- endereço CalDAV do calendário, ou id do calendário Google
  secret_enc text, -- encriptado (AES-GCM) com a chave CALENDAR_KEY das funções
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (profile_id, household_id, provider)
);

-- Notificações no telemóvel (Web Push): cada aparelho onde a pessoa as ligou. A função «push» envia o resumo das
-- 8h00 e os avisos que não esperam; push_sent lembra o que já foi, para não repetir.
create table if not exists nikki.push_subs (
  endpoint text primary key,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  household_id uuid not null references nikki.households (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  morning boolean not null default true, -- o resumo das 8h00 (os urgentes vêm sempre)
  created_at timestamptz not null default now()
);
create index if not exists push_subs_profile on nikki.push_subs (profile_id);
create table if not exists nikki.push_sent (
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, key)
);

-- Ligação do calendário (iPhone, Google): um endereço secreto por pessoa e casa, só de leitura, que se pode trocar.
create table if not exists nikki.calendar_tokens (
  token text primary key,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  household_id uuid not null references nikki.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, household_id)
);

-- ───────────────────────── objetivos, património, ginásio ─────────────────────────

create table if not exists nikki.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  owner_id uuid references nikki.profiles (id) on delete cascade, -- vazio = da casa
  title text not null,
  metric text not null, -- ex.: category_cap:Restaurantes, invest_month, gym:fat
  target numeric(12, 2) not null,
  start_value numeric(12, 2),
  due_on date not null,
  reason text,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists goals_household on nikki.goals (household_id, status);

create table if not exists nikki.assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  owner_id uuid references nikki.profiles (id) on delete set null,
  name text not null,
  kind text not null default 'etf',
  invested boolean not null default true, -- casa própria e carros: false (fora das contas da independência)
  expected_return numeric(5, 2) not null default 0 check (expected_return between -20 and 30),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Tipo de cada ativo: decide se conta para o fundo de maneio (disponível no próprio dia) ou de emergência
-- (disponível em dias e sem risco de mercado), sem perguntar nada (regras em docs/CALCULOS.md, secção 6).
-- role: a casa diz que este ativo é o fundo de emergência ou o fundo de maneio; a app confirma se pode ser.
alter table nikki.assets add column if not exists role text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assets_kind_check') then
    alter table nikki.assets add constraint assets_kind_check check (kind in ('ordem', 'remunerada', 'prazo', 'aforro', 'monetario',
      'obrigacoes', 'fundos', 'etf', 'acoes', 'cripto', 'ppr', 'imovel', 'casa', 'carro', 'outro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assets_role_check') then
    alter table nikki.assets add constraint assets_role_check check (role in ('emergency', 'cushion'));
  end if;
end $$;

-- Rendimentos de cada pessoa (líquidos, por pagamento): salário, subsídio de alimentação, complementos.
-- Servem os rácios de poupança e o plano do mês; os fundos medem-se pela despesa, não pelo salário.
create table if not exists nikki.incomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  kind text not null check (kind in ('salario', 'alimentacao', 'complemento', 'outro')),
  label text check (length(label) <= 60),
  amount numeric(12, 2) not null check (amount > 0),
  times_per_year smallint not null default 12 check (times_per_year between 1 and 14), -- salário em Portugal: 14
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incomes_household on nikki.incomes (household_id);

-- ───────────────────────── casa: como é, contas fixas, faturas e prazos ─────────────────────────

-- As casas de uma conta NIKKI (a principal, a de férias, a dos pais…): como é cada uma (perguntado ao ligar o módulo
-- Casa; tudo opcional).
create table if not exists nikki.homes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  name text not null default 'Casa' check (length(name) between 1 and 40),
  tenure text check (tenure in ('propria', 'credito', 'arrendada')),
  imi numeric(12, 2) check (imi >= 0), -- valor anual; dá as prestações (maio; maio e novembro; maio, agosto e novembro)
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists homes_household on nikki.homes (household_id);
-- Acompanhar os consumos de água, luz e gás nesta casa: se sim, a NIKKI pede a fatura quando a despesa dessas contas
-- é registada (para ler o consumo e o período); se não, essas contas ficam só com o valor.
alter table nikki.homes add column if not exists track_usage boolean not null default false;

-- Contas fixas da casa: luz, gás, água, internet, renda ou prestação, condomínio, seguro…
create table if not exists nikki.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  kind text not null check (kind in ('luz', 'gas', 'agua', 'internet', 'telemovel', 'renda', 'credito', 'condominio', 'seguro', 'outra')),
  name text not null check (length(name) between 1 and 40),
  provider text check (length(provider) <= 40),
  keywords text check (length(keywords) <= 120), -- palavras para a reconhecer nas despesas (ex.: «edp, e-redes»)
  every_months smallint not null default 1 check (every_months in (1, 2, 3, 6, 12)),
  due_day smallint check (due_day between 1 and 31),
  expected numeric(12, 2) check (expected >= 0), -- valor típico (aprende com as faturas)
  unit text check (unit in ('kWh', 'm3')), -- consumo medido, se houver
  contract_ends_on date, -- fim da fidelização ou renovação do contrato
  owner_id uuid references nikki.profiles (id) on delete set null, -- vazio = dos dois
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists bills_household on nikki.bills (household_id);
alter table nikki.bills add column if not exists home_id uuid references nikki.homes (id) on delete set null;

-- Faturas: o valor, o período que cobrem (os acertos cobrem vários meses) e o consumo. Ligadas à despesa, se houver
-- (um acerto a favor não tem despesa). Sem conta (bill_id vazio) = já se perguntou e a despesa não é de uma conta fixa.
create table if not exists nikki.bill_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  bill_id uuid references nikki.bills (id) on delete cascade,
  expense_id uuid unique references nikki.expenses (id) on delete cascade,
  amount numeric(12, 2), -- negativo num acerto a favor
  period_from date not null,
  period_to date not null,
  usage numeric(10, 2) check (usage >= 0),
  adjustment boolean not null default false,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now(),
  check (period_to >= period_from),
  check (bill_id is null or amount is not null),
  check (bill_id is not null or (amount is null and expense_id is not null))
);
create index if not exists bill_payments_bill on nikki.bill_payments (bill_id, period_to);
-- Faturas lidas de um PDF ou de uma fotografia (o ficheiro não se guarda): a data limite de pagamento fica, e a despesa
-- do pagamento liga-se depois (débito direto).
alter table nikki.bill_payments add column if not exists due_on date;
alter table nikki.bill_payments add column if not exists source text not null default 'manual' check (source in ('manual', 'pdf', 'foto'));

alter table nikki.deadlines add column if not exists bill_id uuid references nikki.bills (id) on delete cascade;
alter table nikki.deadlines add column if not exists home_id uuid references nikki.homes (id) on delete cascade;

-- ───────────────────────── casa: tarefas, manutenção, a fazer hoje e garantias ─────────────────────────

-- Tarefas que se repetem (mudar lençóis, regar) e manutenção (caldeira, filtros). Cada uma: de quanto em quanto tempo,
-- a próxima data e de quem é (sempre a mesma pessoa, à vez entre os dois, ou de quem pegar).
create table if not exists nikki.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  home_id uuid references nikki.homes (id) on delete cascade,
  kind text not null default 'task' check (kind in ('task', 'maintenance')),
  title text not null check (length(title) between 1 and 60),
  every_n smallint not null default 1 check (every_n between 1 and 60),
  every_unit text not null default 'week' check (every_unit in ('day', 'week', 'month', 'year')),
  next_on date not null,
  assign text not null default 'anyone' check (assign in ('fixed', 'rotate', 'anyone')),
  turn_id uuid references nikki.profiles (id) on delete set null, -- de quem é a próxima vez (fixa ou à vez)
  note text check (length(note) <= 200),
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists chores_household on nikki.chores (household_id, next_on);

-- O que se fez (e, na manutenção, quanto custou: a despesa fica no Dinheiro).
create table if not exists nikki.chore_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  chore_id uuid not null references nikki.chores (id) on delete cascade,
  done_on date not null,
  done_by uuid references nikki.profiles (id) on delete set null,
  expense_id uuid references nikki.expenses (id) on delete set null,
  note text check (length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists chore_logs_chore on nikki.chore_logs (chore_id, done_on);

-- A fazer: coisas de uma vez, para um dia (ou sem dia), de alguém ou de quem puder.
create table if not exists nikki.todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  owner_id uuid references nikki.profiles (id) on delete cascade, -- vazio = de quem puder
  due_on date,
  done_at timestamptz,
  done_by uuid references nikki.profiles (id) on delete set null,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists todos_household on nikki.todos (household_id, due_on);

-- Garantias: o artigo, a loja, a data de compra e os anos (em Portugal, 3 nos bens novos), com a foto do talão
-- guardada no Storage (bucket receipts, pasta da casa).
create table if not exists nikki.warranties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  home_id uuid references nikki.homes (id) on delete set null,
  item text not null check (length(item) between 1 and 60),
  store text check (length(store) <= 60),
  bought_on date not null,
  years numeric(3, 1) not null default 3 check (years > 0 and years <= 10),
  price numeric(12, 2) check (price >= 0),
  receipt_path text,
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists warranties_household on nikki.warranties (household_id);
alter table nikki.household_modules drop constraint if exists household_modules_module_check;
alter table nikki.household_modules add constraint household_modules_module_check check (module in ('contas', 'compras', 'agenda', 'casa', 'garagem', 'objetivos', 'patrimonio', 'ginasio', 'extratos', 'housekeeping'));

-- ───────────────────────── housekeeping ─────────────────────────
-- A pessoa que trabalha na casa: dias fixos, valor por mês (com dia de pagar), a lista de cada visita (o que se repete
-- em todas, uma vez por semana ou por mês, e o que se junta para a próxima), o que fez, mensagens e o que pede.
-- Ela entra com conta própria (papel staff, convidada por quem administra a casa) e vê só isto e as compras.
create table if not exists nikki.housekeeping (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_id uuid references nikki.profiles (id) on delete set null, -- a conta dela, depois de aceitar o convite
  name text not null check (length(name) between 1 and 40),
  weekdays smallint[] not null default '{}', -- 1 = segunda … 7 = domingo
  start_time time,
  monthly_pay numeric(12, 2) check (monthly_pay >= 0),
  pay_day smallint check (pay_day between 1 and 31),
  bill_id uuid references nikki.bills (id) on delete set null, -- a conta fixa na Casa (para o custo por ano)
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists housekeeping_household on nikki.housekeeping (household_id);
-- O dia de pagar também pode ser «a última sexta-feira do mês» (pay_nth −1 ou 1–4, pay_weekday 1 = segunda … 7);
-- pay_remind: quantos dias antes a NIKKI avisa, para dar tempo de preparar o pagamento.
alter table nikki.housekeeping add column if not exists pay_nth smallint check (pay_nth in (-1, 1, 2, 3, 4));
alter table nikki.housekeeping add column if not exists pay_weekday smallint check (pay_weekday between 1 and 7);
alter table nikki.housekeeping add column if not exists pay_remind smallint not null default 3 check (pay_remind between 0 and 14);

create table if not exists nikki.hk_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  repeat text not null default 'visit' check (repeat in ('visit', 'week', 'month', 'once')),
  due_on date, -- «once»: para a visita deste dia (vazio = a próxima)
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists hk_tasks_household on nikki.hk_tasks (household_id);

create table if not exists nikki.hk_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  task_id uuid not null references nikki.hk_tasks (id) on delete cascade,
  done_on date not null,
  done_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now(),
  unique (task_id, done_on)
);

create table if not exists nikki.hk_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  author_id uuid not null default auth.uid() references nikki.profiles (id),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists hk_messages_household on nikki.hk_messages (household_id, created_at);
-- Fotografias nas mensagens (bucket privado «hk», pasta da casa): a mensagem pode ser só a fotografia.
alter table nikki.hk_messages add column if not exists photo_path text;
alter table nikki.hk_messages drop constraint if exists hk_messages_body_check;
alter table nikki.hk_messages add constraint hk_messages_body_check check (length(body) <= 1000 and (length(trim(body)) > 0 or photo_path is not null));
-- Uma tarefa pedida a partir de uma manutenção ou tarefa da casa: quando fica feita, a da casa também.
alter table nikki.hk_tasks add column if not exists chore_id uuid references nikki.chores (id) on delete set null;

-- Meses pagos (a despesa fica no Dinheiro, em Casa).
create table if not exists nikki.hk_paid (
  household_id uuid not null references nikki.households (id) on delete cascade,
  hk_id uuid not null references nikki.housekeeping (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  expense_id uuid references nikki.expenses (id) on delete set null,
  paid_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now(),
  primary key (hk_id, month)
);
alter table nikki.deadlines drop constraint if exists deadlines_kind_check;
alter table nikki.deadlines add constraint deadlines_kind_check check (kind in ('iuc', 'insurance', 'inspection', 'service', 'imi', 'contract', 'other'));

create table if not exists nikki.asset_snapshots (
  asset_id uuid not null references nikki.assets (id) on delete cascade,
  household_id uuid not null references nikki.households (id) on delete cascade,
  on_date date not null,
  value numeric(14, 2) not null check (value >= 0),
  created_at timestamptz not null default now(),
  primary key (asset_id, on_date)
);

create table if not exists nikki.gym_fields (
  key text primary key,
  label text not null,
  unit text not null,
  lower_is_better boolean not null default false
);
insert into nikki.gym_fields (key, label, unit, lower_is_better) values
  ('weight', 'Peso', 'kg', false), ('fat', 'Gordura', '%', true), ('muscle', 'Massa muscular', 'kg', false),
  ('visceral', 'Gordura visceral', '', true), ('water', 'Água', '%', false), ('waist', 'Cintura', 'cm', true),
  ('hip', 'Anca', 'cm', true), ('chest', 'Peito', 'cm', false), ('arm', 'Braço', 'cm', false),
  ('thigh', 'Coxa', 'cm', false), ('bmr', 'Metabolismo basal', 'kcal', false), ('rhr', 'Frequência em repouso', 'bpm', true),
  ('meta_age', 'Idade metabólica', 'anos', true)
on conflict (key) do nothing;
-- A ordem em que aparecem (por grupos: composição, medidas, coração).
alter table nikki.gym_fields add column if not exists sort smallint not null default 50;
-- Balança de composição (ex.: Tanita InnerScan): IMC, avaliação física (1–9), massa óssea e os valores por segmento.
insert into nikki.gym_fields (key, label, unit, lower_is_better) values
  ('bmi', 'IMC', '', false), ('physique', 'Avaliação física', '1–9', false), ('bone', 'Massa óssea', 'kg', false),
  ('fat_rarm', 'Gordura · braço direito', '%', true), ('fat_larm', 'Gordura · braço esquerdo', '%', true), ('fat_trunk', 'Gordura · tronco', '%', true),
  ('fat_rleg', 'Gordura · perna direita', '%', true), ('fat_lleg', 'Gordura · perna esquerda', '%', true),
  ('mus_rarm', 'Músculo · braço direito', 'kg', false), ('mus_larm', 'Músculo · braço esquerdo', 'kg', false), ('mus_trunk', 'Músculo · tronco', 'kg', false),
  ('mus_rleg', 'Músculo · perna direita', 'kg', false), ('mus_lleg', 'Músculo · perna esquerda', 'kg', false)
on conflict (key) do nothing;
update nikki.gym_fields set unit = 'nível' where key = 'visceral';
-- A ordem é a da balança (peso, músculo, IMC, água, gordura, avaliação física, metabolismo, osso, idade metabólica,
-- visceral), depois as medidas com fita, os segmentos e o coração.
update nikki.gym_fields f set sort = v.sort from (values ('weight', 1), ('muscle', 2), ('bmi', 3), ('water', 4), ('fat', 5), ('physique', 6), ('bmr', 7),
  ('bone', 8), ('meta_age', 9), ('visceral', 10), ('waist', 20), ('hip', 21), ('chest', 22), ('arm', 23), ('thigh', 24),
  ('fat_rarm', 30), ('fat_larm', 31), ('fat_trunk', 32), ('fat_rleg', 33), ('fat_lleg', 34),
  ('mus_rarm', 35), ('mus_larm', 36), ('mus_trunk', 37), ('mus_rleg', 38), ('mus_lleg', 39), ('rhr', 40)) as v(key, sort) where f.key = v.key;

-- Ginásio: as medidas que cada pessoa escolheu acompanhar e de quanto em quanto tempo quer o lembrete. Só o próprio.
create table if not exists nikki.gym_prefs (
  profile_id uuid primary key references nikki.profiles (id) on delete cascade,
  fields text[] not null default '{}',
  every_weeks smallint not null default 4 check (every_weeks between 1 and 26),
  updated_at timestamptz not null default now()
);

-- Só o próprio vê e escreve as suas avaliações.
create table if not exists nikki.gym_assessments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  measured_on date not null default current_date,
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gym_profile on nikki.gym_assessments (profile_id, measured_on);

-- ───────────────────────── funções de acesso ─────────────────────────

-- Conta ativa: sem isto não se vê nem escreve nada das casas (à espera, suspensa ou recusada).
create or replace function nikki.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from nikki.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create or replace function nikki.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from nikki.app_admins a join nikki.profiles p on p.id = a.profile_id
                 where a.profile_id = auth.uid() and p.status = 'active');
$$;

create or replace function nikki.is_member(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select nikki.is_active() and exists (select 1 from nikki.memberships m where m.household_id = h and m.profile_id = auth.uid() and m.role <> 'staff');
$$;

-- Housekeeping: a pessoa que trabalha na casa (vê só as tarefas das visitas, as mensagens e as compras).
create or replace function nikki.is_staff(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select nikki.is_active() and exists (select 1 from nikki.memberships m where m.household_id = h and m.profile_id = auth.uid() and m.role = 'staff');
$$;

-- Qualquer pessoa ligada à casa (as duas e o housekeeping): para nomes e mensagens.
create or replace function nikki.in_house(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select nikki.is_active() and exists (select 1 from nikki.memberships m where m.household_id = h and m.profile_id = auth.uid());
$$;

-- Os dois da casa são iguais: os dois convidam, ligam módulos, mudam a partilha e gerem carros e housekeeping
-- (o papel admin/membro fica na tabela, mas já não separa nada). O housekeeping (staff) nunca administra.
create or replace function nikki.is_admin(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select nikki.is_member(h);
$$;

-- Cada casa tem no máximo duas pessoas.
create or replace function nikki.has_room(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from nikki.memberships m where m.household_id = h and m.role <> 'staff') < 2;
$$;

-- Alguém com quem partilho uma casa (para ver nomes e cores).
create or replace function nikki.shares_household(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p = auth.uid() or exists (
    select 1 from nikki.memberships a join nikki.memberships b on a.household_id = b.household_id
    where a.profile_id = auth.uid() and b.profile_id = p);
$$;

-- Perfil criado no primeiro login (nome do registo ou a parte antes do @).
create or replace function nikki.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into nikki.profiles (id, name, email)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), initcap(split_part(new.email, '@', 1))), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists nikki_on_auth_user_created on auth.users;
create trigger nikki_on_auth_user_created after insert on auth.users
  for each row execute function nikki.handle_new_user();

-- A primeira conta da app é a do administrador (o Rodrigo): fica ativa e passa a administrar a app.
create or replace function nikki.first_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from nikki.app_admins) then
    perform pg_advisory_xact_lock(hashtext('nikki.first_account')); -- dois registos ao mesmo tempo: só um fica
    if not exists (select 1 from nikki.profiles) then
      new.status := 'active'; new.approved_at := now(); new.approved_via := 'founder';
    end if;
  end if;
  return new;
end $$;
create or replace function nikki.first_account_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.approved_via = 'founder' and not exists (select 1 from nikki.app_admins) then
    insert into nikki.app_admins (profile_id) values (new.id);
  end if;
  return null;
end $$;
drop trigger if exists profiles_first_account on nikki.profiles;
create trigger profiles_first_account before insert on nikki.profiles for each row execute function nikki.first_account();
drop trigger if exists profiles_first_account_admin on nikki.profiles;
create trigger profiles_first_account_admin after insert on nikki.profiles for each row execute function nikki.first_account_admin();

-- Quem já tinha conta antes desta migração ganha perfil, o mais antigo primeiro (se ainda não há administração,
-- é esse que fica). Confirmar depois com: select p.name, p.email from nikki.app_admins a join nikki.profiles p on p.id = a.profile_id;
insert into nikki.profiles (id, name, email)
select u.id, coalesce(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), initcap(split_part(u.email, '@', 1))), u.email
from auth.users u order by u.created_at, u.id
on conflict (id) do nothing;

-- Módulos com que uma casa nova começa (mudam-se no ecrã Módulos).
create or replace function nikki.default_modules(h uuid, u uuid) returns void
language sql security definer set search_path = '' as $$
  insert into nikki.household_modules (household_id, module, enabled_by)
  select h, m, u from unnest(array['contas', 'compras', 'agenda', 'casa']) m
  on conflict do nothing;
$$;

-- Criar casa: só com a conta ativa; quem cria fica administrador.
create or replace function nikki.create_household(house_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'sem sessão'; end if;
  if not nikki.is_active() then
    raise exception '%', case when exists (select 1 from nikki.profiles where id = u and status = 'pending')
      then 'conta à espera de aprovação' else 'conta sem acesso' end;
  end if;
  insert into nikki.households (name, created_by) values (trim(house_name), u) returning id into h;
  insert into nikki.memberships (household_id, profile_id, role) values (h, u, 'admin');
  perform nikki.default_modules(h, u);
  return h;
end $$;

-- Pedido de conta: o nome da casa e uma nota opcional, para a administração aprovar.
create or replace function nikki.request_account(house text, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(house), '') = '' then raise exception 'dá um nome à casa'; end if;
  update nikki.profiles set request = jsonb_build_object('house', left(trim(house), 80), 'note', nullif(left(trim(coalesce(note, '')), 300), '')),
    requested_at = now()
  where id = auth.uid() and status = 'pending';
  if not found then raise exception 'sem pedido para enviar'; end if;
end $$;

-- Última vez que a pessoa abriu a app (para a administração saber quem usa, sem ver o quê).
create or replace function nikki.touch() returns void
language sql security definer set search_path = '' as $$
  update nikki.profiles set last_seen_at = now() where id = auth.uid();
$$;

-- Aceitar convite por ligação (token) ou por código de 6 letras.
create or replace function nikki.accept_invite(invite text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i nikki.invites; u uuid := auth.uid();
begin
  if u is null then raise exception 'sem sessão'; end if;
  if exists (select 1 from nikki.profiles where id = u and status in ('declined', 'paused')) then raise exception 'conta sem acesso'; end if;
  select * into i from nikki.invites where token = invite or code = upper(invite) for update;
  if not found then raise exception 'convite inválido'; end if;
  if i.accepted_at is not null then raise exception 'convite já usado'; end if;
  if i.expires_at < now() then raise exception 'convite expirado'; end if;
  if i.role <> 'staff' and (select count(*) from nikki.memberships where household_id = i.household_id and profile_id <> u and role <> 'staff') >= 2 then
    raise exception 'a casa já tem duas pessoas';
  end if;
  insert into nikki.memberships (household_id, profile_id, role) values (i.household_id, u, i.role)
    on conflict (household_id, profile_id) do nothing;
  update nikki.invites set accepted_at = now(), accepted_by = u where id = i.id;
  -- Housekeeping: a conta fica ligada à ficha dela (a primeira ainda sem conta).
  if i.role = 'staff' then
    update nikki.housekeeping set profile_id = u
      where id = (select id from nikki.housekeeping where household_id = i.household_id and profile_id is null and not archived order by created_at limit 1);
  end if;
  -- Quem entra com convite fica ativo sem passar pela administração.
  update nikki.profiles set status = 'active', approved_at = now(), approved_via = 'invite' where id = u and status = 'pending';
  return i.household_id;
end $$;

-- Há sempre pelo menos um administrador por casa.
create or replace function nikki.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h uuid := coalesce(old.household_id, new.household_id);
begin
  if exists (select 1 from nikki.households where id = h)
     and not exists (select 1 from nikki.memberships where household_id = h and role = 'admin') then
    raise exception 'a casa precisa de pelo menos um administrador';
  end if;
  return null;
end $$;
drop trigger if exists memberships_keep_admin on nikki.memberships;
create constraint trigger memberships_keep_admin after update or delete on nikki.memberships
  deferrable initially deferred for each row execute function nikki.keep_one_admin();

-- Contas a dois: quanto profile a adiantou a mais face ao combinado com b (positivo = a adiantou mais).
-- Soma exata em numeric; arredonda-se só ao mostrar. Corre com os direitos de quem pergunta (RLS).
create or replace function nikki.pair_balance(h uuid, a uuid, b uuid) returns numeric
language sql stable security invoker set search_path = '' as $$
  with o as (select coalesce((select case when lo.profile_a = a then lo.amount_a else -lo.amount_a end
                               from nikki.ledger_openings lo
                               where lo.household_id = h and lo.profile_a = least(a, b) and lo.profile_b = greatest(a, b)), 0) as v,
                    coalesce((select lo.cutover from nikki.ledger_openings lo
                               where lo.household_id = h and lo.profile_a = least(a, b) and lo.profile_b = greatest(a, b)), '-infinity'::date) as since)
  select o.v
    + coalesce((select sum(case when e.paid_by = a then e.owed else -e.owed end) from nikki.expenses e
                where e.household_id = h and e.split <> 'mine' and e.spent_on >= o.since
                  and ((e.paid_by = a and e.other_id = b) or (e.paid_by = b and e.other_id = a))), 0)
    + coalesce((select sum(case when t.from_id = a then t.amount else -t.amount end) from nikki.transfers t
                where t.household_id = h and t.made_on >= o.since
                  and ((t.from_id = a and t.to_id = b) or (t.from_id = b and t.to_id = a))), 0)
  from o;
$$;

-- Eventos «só para mim» dos outros, só com a hora e o dono: a app mostra «<nome> tem planos» (o título nunca sai da base).
-- Os «só para mim» do outro: só as horas (e as repetições), nunca o título, o sítio ou o tipo.
drop function if exists nikki.busy_slots(uuid, timestamptz, timestamptz);
create or replace function nikki.busy_slots(h uuid, from_ts timestamptz, to_ts timestamptz)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, all_day boolean, owner_id uuid,
               repeat text, weekdays smallint[], month_mode text, until_on date, skip_dates date[])
language sql stable security definer set search_path = '' as $$
  select e.id, e.starts_at, e.ends_at, e.all_day, coalesce(e.owner_id, e.created_by), e.repeat, e.weekdays, e.month_mode, e.until_on, e.skip_dates
  from nikki.events e
  where nikki.is_member(h) and e.household_id = h and e.private
    and coalesce(e.owner_id, e.created_by) <> auth.uid() and e.created_by <> auth.uid()
    and e.starts_at < to_ts
    and (coalesce(e.ends_at, e.starts_at) >= from_ts or (e.repeat <> 'none' and (e.until_on is null or e.until_on >= from_ts::date)))
  order by e.starts_at;
$$;

-- A minha ligação do calendário nesta casa (cria-a se não houver; com «nova», troca-a e a antiga deixa de dar).
create or replace function nikki.calendar_token(h uuid, renew boolean default false) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare t text;
begin
  if not nikki.is_member(h) then raise exception 'sem acesso'; end if;
  if renew then delete from nikki.calendar_tokens where profile_id = auth.uid() and household_id = h; end if;
  select token into t from nikki.calendar_tokens where profile_id = auth.uid() and household_id = h;
  if t is null then
    t := encode(extensions.gen_random_bytes(24), 'hex');
    insert into nikki.calendar_tokens (token, profile_id, household_id) values (t, auth.uid(), h);
  end if;
  return t;
end $$;
revoke execute on function nikki.calendar_token(uuid, boolean) from anon, public;
grant execute on function nikki.calendar_token(uuid, boolean) to authenticated;

-- ───────────────────────── administração da app ─────────────────────────
-- Só o administrador da app. Devolvem contas, casas, módulos, datas e tickets; nunca dinheiro, agendas,
-- compras, carros, objetivos ou medidas.

create or replace function nikki.admin_check() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not nikki.is_app_admin() then raise exception 'só para a administração da app'; end if;
end $$;

-- Pessoas: estado, desde quando, última visita, casas e papel, pedido e quantos tickets abriu.
create or replace function nikki.admin_people() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'email', p.email, 'status', p.status, 'created_at', p.created_at,
    'approved_at', p.approved_at, 'approved_via', p.approved_via, 'last_seen_at', p.last_seen_at,
    'request', p.request, 'requested_at', p.requested_at,
    'admin', exists (select 1 from nikki.app_admins a where a.profile_id = p.id),
    'houses', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'role', m.role, 'joined_at', m.joined_at) order by m.joined_at), '[]'::jsonb)
               from nikki.memberships m join nikki.households h on h.id = m.household_id where m.profile_id = p.id),
    'tickets', (select count(*) from nikki.tickets t where t.created_by = p.id)
  ) order by p.created_at desc), '[]'::jsonb) from nikki.profiles p);
end $$;

-- Casas: quem lá está, desde quando, e que módulos têm ligados (desde quando).
create or replace function nikki.admin_houses() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'name', h.name, 'created_at', h.created_at,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'role', m.role, 'joined_at', m.joined_at) order by m.joined_at), '[]'::jsonb)
                from nikki.memberships m join nikki.profiles p on p.id = m.profile_id where m.household_id = h.id),
    'modules', (select coalesce(jsonb_agg(jsonb_build_object('module', x.module, 'since', x.enabled_at) order by x.enabled_at), '[]'::jsonb)
                from nikki.household_modules x where x.household_id = h.id)
  ) order by h.created_at desc), '[]'::jsonb) from nikki.households h);
end $$;

-- Números: contas por estado, casas, quem abriu a app, tempo até aprovar, registos por semana, módulos e tickets.
create or replace function nikki.admin_kpis() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  return jsonb_build_object(
    'accounts', (select jsonb_build_object('active', count(*) filter (where status = 'active'), 'pending', count(*) filter (where status = 'pending'),
                   'paused', count(*) filter (where status = 'paused'), 'declined', count(*) filter (where status = 'declined')) from nikki.profiles),
    'first_account', (select min(created_at) from nikki.profiles),
    'houses', (select count(*) from nikki.households),
    'houses_two', (select count(*) from (select household_id from nikki.memberships where role <> 'staff' group by household_id having count(*) >= 2) x),
    'seen_7d', (select count(*) from nikki.profiles where last_seen_at >= now() - interval '7 days'),
    'seen_30d', (select count(*) from nikki.profiles where last_seen_at >= now() - interval '30 days'),
    'approval_hours', (select round((avg(extract(epoch from approved_at - coalesce(requested_at, created_at))) / 3600)::numeric, 1)
                       from nikki.profiles where approved_via = 'admin'),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'n', n) order by w), '[]'::jsonb) from (
                  select date_trunc('week', created_at)::date w, count(*) n from nikki.profiles
                  where created_at >= date_trunc('week', now()) - interval '7 weeks' group by 1) s),
    'modules', (select coalesce(jsonb_agg(jsonb_build_object('module', module, 'houses', n, 'since', since) order by n desc, module), '[]'::jsonb) from (
                  select module, count(*) n, min(enabled_at) since from nikki.household_modules group by module) m),
    'tickets', (select jsonb_build_object('novo', count(*) filter (where status = 'novo'), 'a ver', count(*) filter (where status = 'a ver'),
                  'feito', count(*) filter (where status = 'feito'), 'nao', count(*) filter (where status = 'nao')) from nikki.tickets)
  );
end $$;

create or replace function nikki.admin_tickets() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'body', t.body, 'screen', t.screen, 'shot', t.shot, 'status', t.status, 'reply', t.reply,
    'created_at', t.created_at, 'updated_at', t.updated_at, 'by', p.name, 'email', p.email
  ) order by t.created_at desc), '[]'::jsonb) from nikki.tickets t join nikki.profiles p on p.id = t.created_by);
end $$;

-- Mudar o estado de um ticket e responder (a pessoa vê a resposta).
create or replace function nikki.admin_ticket(t uuid, new_status text, new_reply text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  update nikki.tickets set status = new_status, reply = nullif(trim(coalesce(new_reply, '')), ''), updated_at = now() where id = t;
  if not found then raise exception 'ticket não encontrado'; end if;
end $$;

-- Aprovar ou recusar um pedido de conta. Ao aprovar, cria a casa pedida (a pessoa fica administradora dela).
create or replace function nikki.admin_decide(p uuid, approve boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r nikki.profiles; h uuid;
begin
  perform nikki.admin_check();
  select * into r from nikki.profiles where id = p and status = 'pending' for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if not approve then
    update nikki.profiles set status = 'declined' where id = p;
    return null;
  end if;
  update nikki.profiles set status = 'active', approved_at = now(), approved_via = 'admin' where id = p;
  if coalesce(r.request ->> 'house', '') <> '' and not exists (select 1 from nikki.memberships where profile_id = p) then
    insert into nikki.households (name, created_by) values (r.request ->> 'house', p) returning id into h;
    insert into nikki.memberships (household_id, profile_id, role) values (h, p, 'admin');
    perform nikki.default_modules(h, p);
  end if;
  return h;
end $$;

-- Suspender ou reativar uma conta (nunca a própria). Suspensa, não vê nada das casas.
create or replace function nikki.admin_pause(p uuid, paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  if p = auth.uid() then raise exception 'não podes suspender a tua conta'; end if;
  update nikki.profiles set status = case when paused then 'paused' else 'active' end
  where id = p and status in ('active', 'paused');
  if not found then raise exception 'conta não encontrada'; end if;
end $$;

grant execute on function nikki.is_active(), nikki.is_app_admin(), nikki.has_room(uuid), nikki.request_account(text, text), nikki.touch(),
  nikki.admin_people(), nikki.admin_houses(), nikki.admin_kpis(), nikki.admin_tickets(), nikki.admin_ticket(uuid, text, text),
  nikki.admin_decide(uuid, boolean), nikki.admin_pause(uuid, boolean) to authenticated;
revoke execute on function nikki.request_account(text, text), nikki.touch(), nikki.admin_people(), nikki.admin_houses(), nikki.admin_kpis(),
  nikki.admin_tickets(), nikki.admin_ticket(uuid, text, text), nikki.admin_decide(uuid, boolean), nikki.admin_pause(uuid, boolean),
  nikki.default_modules(uuid, uuid), nikki.admin_check() from anon, public;

-- Despesa da casa por mês (consumo, sem o investimento «Future Me»): só os totais, nunca as despesas.
-- Serve o Património do casal (despesa média, fundo de emergência, meses livres); inclui as «só minhas» de
-- cada um, que cada pessoa não vê uma a uma.
create or replace function nikki.house_month_totals(h uuid, since date) returns table (month text, total numeric)
language sql stable security definer set search_path = '' as $$
  select to_char(e.spent_on, 'YYYY-MM'), sum(e.amount)
  from nikki.expenses e
  where e.household_id = h and nikki.is_member(h) and e.spent_on >= since and e.category <> 'Future Me'
  group by 1 order by 1;
$$;
grant execute on function nikki.house_month_totals(uuid, date) to authenticated;
revoke execute on function nikki.house_month_totals(uuid, date) from anon, public;

grant execute on function nikki.is_member(uuid), nikki.is_admin(uuid), nikki.shares_household(uuid),
  nikki.create_household(text), nikki.accept_invite(text), nikki.pair_balance(uuid, uuid, uuid),
  nikki.busy_slots(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function nikki.busy_slots(uuid, timestamptz, timestamptz) from anon, public;
revoke execute on function nikki.create_household(text), nikki.accept_invite(text) from anon, public;

-- ───────────────────────── RLS ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['profiles', 'households', 'memberships', 'invites', 'share_ratios', 'cars', 'expenses', 'transfers',
    'ledger_openings', 'merchant_rules', 'shopping_items', 'car_logs', 'deadlines', 'events', 'goals', 'assets', 'asset_snapshots',
    'gym_fields', 'gym_assessments', 'gym_prefs', 'household_modules', 'tickets', 'app_admins', 'incomes', 'homes', 'bills', 'bill_payments', 'chores', 'chore_logs', 'todos', 'warranties', 'housekeeping', 'hk_tasks', 'hk_log', 'hk_messages', 'hk_paid'] loop
    execute format('alter table nikki.%I enable row level security', t);
    execute format('grant select, insert, update, delete on nikki.%I to authenticated', t);
    execute format('grant all on nikki.%I to service_role', t);
  end loop;
end $$;

-- O estado de uma conta só muda pelas funções (aprovar, convite, suspender): cada um muda só o nome e a cor.
-- O e-mail e a última visita não se mostram a mais ninguém da casa (só à administração, pelas funções admin_*).
revoke select, insert, update on nikki.profiles from authenticated;
grant select (id, name, color, created_at, status, request, requested_at, approved_at) on nikki.profiles to authenticated;
grant update (name, color) on nikki.profiles to authenticated;
-- Tickets: escrevem-se e leem-se; o estado e a resposta mudam-se só pela administração (nikki.admin_ticket).
revoke update, delete on nikki.tickets from authenticated;
revoke all on nikki.app_admins from authenticated;
alter table nikki.calendar_tokens enable row level security;
-- Ligações ao iCloud e ao Google: cada um vê o estado das suas (nunca o acesso guardado); muda-se só pelas funções.
alter table nikki.push_subs enable row level security;
alter table nikki.push_sent enable row level security;
revoke all on nikki.push_subs, nikki.push_sent from authenticated, anon;
grant select, insert, update, delete on nikki.push_subs to authenticated;
grant all on nikki.push_subs, nikki.push_sent to service_role;
alter table nikki.calendar_links enable row level security;
revoke all on nikki.calendar_links from authenticated, anon;
grant select (id, profile_id, household_id, provider, account_hint, status, last_sync_at, last_error, created_at) on nikki.calendar_links to authenticated;
grant all on nikki.calendar_links to service_role;

revoke all on nikki.calendar_tokens from authenticated, anon;
grant all on nikki.calendar_tokens to service_role;

-- Recria as políticas de raiz (idempotente).
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'nikki' loop
    execute format('drop policy %I on nikki.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_read on nikki.profiles for select to authenticated using (nikki.shares_household(id));
create policy profiles_self on nikki.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy households_read on nikki.households for select to authenticated using (nikki.is_member(id));
create policy households_admin on nikki.households for update to authenticated using (nikki.is_admin(id)) with check (nikki.is_admin(id));

create policy memberships_read on nikki.memberships for select to authenticated using (nikki.in_house(household_id));
create policy memberships_admin_update on nikki.memberships for update to authenticated using (nikki.is_admin(household_id)) with check (nikki.is_admin(household_id));
create policy memberships_leave_or_admin on nikki.memberships for delete to authenticated using (profile_id = auth.uid() or nikki.is_admin(household_id));

create policy invites_admin on nikki.invites for all to authenticated
  using (nikki.is_admin(household_id)) with check (nikki.is_admin(household_id) and created_by = auth.uid() and (role = 'staff' or nikki.has_room(household_id)));

-- Módulos: todos os da casa veem; quem administra a casa liga e desliga.
create policy modules_read on nikki.household_modules for select to authenticated using (nikki.is_member(household_id));
create policy modules_on on nikki.household_modules for insert to authenticated with check (nikki.is_admin(household_id) and enabled_by = auth.uid());
create policy modules_off on nikki.household_modules for delete to authenticated using (nikki.is_admin(household_id));

-- Tickets: cada um lê e escreve os seus (com a conta ativa).
create policy tickets_read on nikki.tickets for select to authenticated using (created_by = auth.uid());
create policy tickets_write on nikki.tickets for insert to authenticated with check (created_by = auth.uid() and nikki.is_active());

create policy share_read on nikki.share_ratios for select to authenticated using (nikki.is_member(household_id));
create policy share_admin on nikki.share_ratios for all to authenticated using (nikki.is_admin(household_id)) with check (nikki.is_admin(household_id));

-- Despesas: as "só minhas" só quem pagou as vê; as outras, quem as pagou e a pessoa envolvida.
create policy expenses_read on nikki.expenses for select to authenticated
  using (nikki.is_member(household_id) and (paid_by = auth.uid() or created_by = auth.uid() or other_id = auth.uid()));
create policy expenses_write on nikki.expenses for insert to authenticated
  with check (nikki.is_member(household_id) and created_by = auth.uid()
              and (other_id is null or exists (select 1 from nikki.memberships m where m.household_id = expenses.household_id and m.profile_id = expenses.other_id and m.role <> 'staff'))
              and exists (select 1 from nikki.memberships m where m.household_id = expenses.household_id and m.profile_id = expenses.paid_by and m.role <> 'staff'));
create policy expenses_edit on nikki.expenses for update to authenticated
  using (created_by = auth.uid() or paid_by = auth.uid() or nikki.is_admin(household_id))
  with check (nikki.is_member(household_id));
create policy expenses_delete on nikki.expenses for delete to authenticated
  using (created_by = auth.uid() or paid_by = auth.uid() or nikki.is_admin(household_id));

create policy transfers_read on nikki.transfers for select to authenticated
  using (nikki.is_member(household_id) and (from_id = auth.uid() or to_id = auth.uid()));
create policy transfers_write on nikki.transfers for insert to authenticated
  with check (nikki.is_member(household_id) and created_by = auth.uid() and (from_id = auth.uid() or to_id = auth.uid())
              and exists (select 1 from nikki.memberships m where m.household_id = transfers.household_id and m.profile_id = transfers.to_id and m.role <> 'staff')
              and exists (select 1 from nikki.memberships m where m.household_id = transfers.household_id and m.profile_id = transfers.from_id and m.role <> 'staff'));
create policy transfers_delete on nikki.transfers for delete to authenticated using (created_by = auth.uid());

create policy openings_read on nikki.ledger_openings for select to authenticated
  using (nikki.is_member(household_id) and auth.uid() in (profile_a, profile_b));

create policy rules_own on nikki.merchant_rules for all to authenticated
  using (profile_id = auth.uid() and nikki.is_member(household_id)) with check (profile_id = auth.uid() and nikki.is_member(household_id));

-- Tudo o que é da casa: qualquer membro lê e escreve.
do $$
declare t text;
begin
  foreach t in array array['shopping_items', 'car_logs', 'deadlines', 'goals', 'asset_snapshots', 'homes', 'bills', 'bill_payments', 'chores', 'chore_logs', 'todos', 'warranties', 'housekeeping', 'hk_tasks', 'hk_log', 'hk_paid'] loop
    execute format('create policy %I on nikki.%I for all to authenticated using (nikki.is_member(household_id)) with check (nikki.is_member(household_id))', t || '_house', t);
  end loop;
end $$;

-- Objetivos pessoais: só o dono os vê.
drop policy goals_house on nikki.goals;
create policy goals_read on nikki.goals for select to authenticated using (nikki.is_member(household_id) and (owner_id is null or owner_id = auth.uid()));
create policy goals_write on nikki.goals for all to authenticated
  using (nikki.is_member(household_id) and (owner_id is null or owner_id = auth.uid()))
  with check (nikki.is_member(household_id) and (owner_id is null or owner_id = auth.uid()));

-- Carros e investimentos: todos os membros veem; os administradores gerem os carros.
create policy cars_read on nikki.cars for select to authenticated using (nikki.is_member(household_id));
create policy cars_admin on nikki.cars for all to authenticated using (nikki.is_admin(household_id)) with check (nikki.is_admin(household_id));
create policy assets_house on nikki.assets for all to authenticated using (nikki.is_member(household_id)) with check (nikki.is_member(household_id));

-- Rendimentos: os dois da casa veem e registam (os rácios de poupança do casal precisam dos dois); só de quem é da casa.
create policy incomes_house on nikki.incomes for all to authenticated using (nikki.is_member(household_id))
  with check (nikki.is_member(household_id) and exists (select 1 from nikki.memberships m where m.household_id = incomes.household_id and m.profile_id = incomes.profile_id and m.role <> 'staff'));

-- Eventos: um «só para mim» só o lê o dono (ou quem o criou); aos outros chega só pela hora, por nikki.busy_slots,
-- e a app mostra «<nome> tem planos». Só o autor altera.
create policy events_read on nikki.events for select to authenticated
  using (nikki.is_member(household_id) and (not private or owner_id = auth.uid() or created_by = auth.uid()));
create policy events_insert on nikki.events for insert to authenticated with check (nikki.is_member(household_id) and created_by = auth.uid());
create policy events_edit on nikki.events for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy events_delete on nikki.events for delete to authenticated using (created_by = auth.uid());

-- Housekeeping (staff): vê os seus dias e o valor, as tarefas, o que fez (e marca), as mensagens e as compras (e pede).
create policy housekeeping_staff on nikki.housekeeping for select to authenticated using (nikki.is_staff(household_id) and profile_id = auth.uid());
create policy hk_tasks_staff on nikki.hk_tasks for select to authenticated using (nikki.is_staff(household_id));
create policy hk_log_staff_read on nikki.hk_log for select to authenticated using (nikki.is_staff(household_id));
create policy hk_log_staff_add on nikki.hk_log for insert to authenticated with check (nikki.is_staff(household_id) and done_by = auth.uid());
create policy hk_log_staff_undo on nikki.hk_log for delete to authenticated using (nikki.is_staff(household_id) and done_by = auth.uid());
create policy hk_messages_read on nikki.hk_messages for select to authenticated using (nikki.in_house(household_id));
create policy hk_messages_write on nikki.hk_messages for insert to authenticated with check (nikki.in_house(household_id) and author_id = auth.uid());
create policy shop_staff_read on nikki.shopping_items for select to authenticated using (nikki.is_staff(household_id));
create policy shop_staff_add on nikki.shopping_items for insert to authenticated with check (nikki.is_staff(household_id) and created_by = auth.uid());

-- Ligações do calendário (iCloud, Google): cada um vê o estado das suas.
-- Notificações: cada um gere os seus aparelhos (o housekeeping também pode, para as mensagens).
create policy push_subs_own on nikki.push_subs for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid() and nikki.in_house(household_id));
create policy calendar_links_own on nikki.calendar_links for select to authenticated using (profile_id = auth.uid() and nikki.is_member(household_id));

create policy gym_fields_read on nikki.gym_fields for select to authenticated using (true);
create policy gym_own on nikki.gym_assessments for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy gym_prefs_own on nikki.gym_prefs for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ───────────────────────── tempo real ─────────────────────────

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['shopping_items', 'expenses', 'transfers', 'memberships', 'deadlines', 'goals', 'events', 'household_modules', 'tickets', 'assets', 'asset_snapshots', 'incomes', 'homes', 'bills', 'bill_payments', 'chores', 'chore_logs', 'todos', 'warranties', 'housekeeping', 'hk_tasks', 'hk_log', 'hk_messages', 'hk_paid'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'nikki' and tablename = t) then
        execute format('alter publication supabase_realtime add table nikki.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Uma pasta do Storage com o id de uma casa: quem vê é membro dessa casa? (falso para nomes que não são ids)
create or replace function nikki.is_member_folder(h text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when h ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then nikki.is_member(h::uuid) else false end
$$;
revoke execute on function nikki.is_member_folder(text) from anon, public;
grant execute on function nikki.is_member_folder(text) to authenticated;

-- Uma pasta do Storage com o id de uma casa: quem vê é da casa, incluindo o housekeeping? (para as fotografias das mensagens)
create or replace function nikki.in_house_folder(h text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when h ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then nikki.in_house(h::uuid) else false end
$$;
revoke execute on function nikki.in_house_folder(text) from anon, public;
grant execute on function nikki.in_house_folder(text) to authenticated;

-- O housekeeping marcou feita uma tarefa que veio da manutenção (ou das tarefas) da casa: fica feita lá também, com a
-- data seguinte (a vez de quem não muda). Corre como dono, porque o housekeeping não escreve nas tarefas da casa.
create or replace function nikki.hk_done_chore() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid;
begin
  select t.chore_id into c from nikki.hk_tasks t where t.id = new.task_id;
  if c is null then return new; end if;
  insert into nikki.chore_logs (household_id, chore_id, done_on, done_by, note) values (new.household_id, c, new.done_on, new.done_by, 'Housekeeping');
  update nikki.chores set next_on = (new.done_on + case every_unit
      when 'day' then make_interval(days => every_n) when 'week' then make_interval(weeks => every_n)
      when 'month' then make_interval(months => every_n) else make_interval(years => every_n) end)::date
    where id = c;
  return new;
end $$;
drop trigger if exists hk_done_chore on nikki.hk_log;
create trigger hk_done_chore after insert on nikki.hk_log for each row execute function nikki.hk_done_chore();

-- ───────────────────────── capturas dos tickets (Storage) ─────────────────────────
-- Bucket privado. Cada pessoa só põe e lê na sua pasta (tickets/<id da pessoa>/…); a administração lê todas.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('tickets', 'tickets', false) on conflict (id) do nothing;
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
      update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/heic'] where id = 'tickets';
    end if;
    drop policy if exists nikki_tickets_put on storage.objects;
    create policy nikki_tickets_put on storage.objects for insert to authenticated
      with check (bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text and nikki.is_active());
    drop policy if exists nikki_tickets_get on storage.objects;
    create policy nikki_tickets_get on storage.objects for select to authenticated
      using (bucket_id = 'tickets' and ((storage.foldername(name))[1] = auth.uid()::text or nikki.is_app_admin()));
    -- Talões das garantias: bucket privado, pasta da casa (receipts/<id da casa>/…). Só os da casa põem, leem e apagam;
    -- a administração da app não tem acesso (são dados de dentro da casa).
    insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
      update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'] where id = 'receipts';
    end if;
    drop policy if exists nikki_receipts_rw on storage.objects;
    create policy nikki_receipts_rw on storage.objects for all to authenticated
      using (bucket_id = 'receipts' and nikki.is_member_folder((storage.foldername(name))[1]))
      with check (bucket_id = 'receipts' and nikki.is_member_folder((storage.foldername(name))[1]));
    -- Fotografias das mensagens do housekeeping: bucket privado, pasta da casa (hk/<id da casa>/…). Põem e veem os da
    -- casa e o housekeeping; cada um só apaga as suas.
    insert into storage.buckets (id, name, public) values ('hk', 'hk', false) on conflict (id) do nothing;
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
      update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/heic'] where id = 'hk';
    end if;
    drop policy if exists nikki_hk_get on storage.objects;
    create policy nikki_hk_get on storage.objects for select to authenticated using (bucket_id = 'hk' and nikki.in_house_folder((storage.foldername(name))[1]));
    drop policy if exists nikki_hk_put on storage.objects;
    create policy nikki_hk_put on storage.objects for insert to authenticated with check (bucket_id = 'hk' and nikki.in_house_folder((storage.foldername(name))[1]));
    drop policy if exists nikki_hk_del on storage.objects;
    create policy nikki_hk_del on storage.objects for delete to authenticated using (bucket_id = 'hk' and owner = auth.uid());
  end if;
end $$;

-- ───────────────────────── importação da app antiga ─────────────────────────
-- Marca de origem das linhas copiadas da app antiga (supabase/import_from_public.sql): «old:<tabela>:<id>».
-- Deixa repetir a importação (a final, no dia da mudança) sem duplicar nada.
alter table nikki.transfers add column if not exists external_ref text;
alter table nikki.cars add column if not exists external_ref text;
alter table nikki.car_logs add column if not exists external_ref text;
alter table nikki.assets add column if not exists external_ref text;
alter table nikki.incomes add column if not exists external_ref text;
create unique index if not exists transfers_external on nikki.transfers (household_id, external_ref) where external_ref is not null;
create unique index if not exists cars_external on nikki.cars (household_id, external_ref) where external_ref is not null;
create unique index if not exists car_logs_external on nikki.car_logs (household_id, external_ref) where external_ref is not null;
create unique index if not exists assets_external on nikki.assets (household_id, external_ref) where external_ref is not null;
create unique index if not exists incomes_external on nikki.incomes (household_id, external_ref) where external_ref is not null;

-- ───────────────────────── fechar o que não precisa de estar aberto ─────────────────────────
-- Ninguém sem sessão corre funções da NIKKI; funções e tabelas novas nascem fechadas para quem não entrou.
revoke execute on all functions in schema nikki from public, anon;
alter default privileges in schema nikki revoke execute on functions from public, anon;
alter default privileges in schema nikki revoke all on tables from anon;
grant execute on function nikki.has_room(uuid), nikki.in_house(uuid), nikki.is_active(), nikki.is_admin(uuid), nikki.is_app_admin(),
  nikki.is_member(uuid), nikki.is_staff(uuid), nikki.pair_balance(uuid, uuid, uuid), nikki.shares_household(uuid) to authenticated;

-- ───────────────────────── eventos (casamento, batizado, bodas, festas…) ─────────────────────────
-- Um centro de custos com data: orçamento, despesas ligadas (expenses.occasion_id; contam no mês mas ficam fora das
-- médias), convidados e respostas, compras e tarefas, fornecedores e presentes. Arquiva-se no fim.
-- (A Agenda já usa nikki.events; aqui chama-se occasions.)
create table if not exists nikki.occasions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null default 'festa' check (kind in ('casamento', 'batizado', 'aniversario', 'bodas', 'festa', 'viagem', 'outro')),
  on_date date,
  place text check (length(place) <= 120),
  budget numeric(12, 2) check (budget >= 0),
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists occasions_household on nikki.occasions (household_id, archived);
alter table nikki.expenses add column if not exists occasion_id uuid references nikki.occasions (id) on delete set null;
create index if not exists expenses_occasion on nikki.expenses (occasion_id) where occasion_id is not null;

create table if not exists nikki.occasion_guests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  occasion_id uuid not null references nikki.occasions (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  people smallint not null default 1 check (people between 1 and 20), -- quantos vêm com este convite
  rsvp text not null default 'pending' check (rsvp in ('pending', 'yes', 'no', 'maybe')),
  grp text check (length(grp) <= 40), -- família, amigos, trabalho, mesa 3…
  note text check (length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists occasion_guests_occ on nikki.occasion_guests (occasion_id);

create table if not exists nikki.occasion_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  occasion_id uuid not null references nikki.occasions (id) on delete cascade,
  kind text not null default 'todo' check (kind in ('buy', 'todo')),
  title text not null check (length(trim(title)) between 1 and 80),
  due_on date,
  done boolean not null default false,
  done_by uuid references nikki.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists occasion_items_occ on nikki.occasion_items (occasion_id);

create table if not exists nikki.occasion_vendors (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  occasion_id uuid not null references nikki.occasions (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  service text check (length(service) <= 60), -- quinta, fotografia, bolo…
  contact text check (length(contact) <= 120),
  total numeric(12, 2) check (total >= 0), -- o combinado
  paid numeric(12, 2) not null default 0 check (paid >= 0), -- já pago (sinal e prestações)
  created_at timestamptz not null default now()
);
create index if not exists occasion_vendors_occ on nikki.occasion_vendors (occasion_id);

create table if not exists nikki.occasion_gifts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  occasion_id uuid not null references nikki.occasions (id) on delete cascade,
  from_name text not null check (length(trim(from_name)) between 1 and 80),
  amount numeric(12, 2) check (amount >= 0), -- dinheiro (envelope, transferência)
  item text check (length(item) <= 80), -- ou o presente
  thanked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists occasion_gifts_occ on nikki.occasion_gifts (occasion_id);

alter table nikki.household_modules drop constraint if exists household_modules_module_check;
alter table nikki.household_modules add constraint household_modules_module_check check (module in ('contas', 'compras', 'agenda', 'casa', 'garagem', 'objetivos', 'patrimonio', 'ginasio', 'extratos', 'housekeeping', 'eventos'));

-- Só os da casa (o housekeeping não vê eventos: têm dinheiro e convidados).
do $$
declare t text;
begin
  foreach t in array array['occasions', 'occasion_guests', 'occasion_items', 'occasion_vendors', 'occasion_gifts'] loop
    execute format('alter table nikki.%I enable row level security', t);
    execute format('grant select, insert, update, delete on nikki.%I to authenticated', t);
    execute format('grant all on nikki.%I to service_role', t);
    if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = t and policyname = t || '_house') then
      execute format('create policy %I on nikki.%I for all to authenticated using (nikki.is_member(household_id)) with check (nikki.is_member(household_id))', t || '_house', t);
    end if;
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'nikki' and tablename = t) then
      execute format('alter publication supabase_realtime add table nikki.%I', t);
    end if;
  end loop;
end $$;

-- Despesa da casa por mês para as médias (Património): sem investimento e sem eventos (um casamento não é um mês normal).
create or replace function nikki.house_month_totals(h uuid, since date) returns table (month text, total numeric)
language sql stable security definer set search_path = '' as $$
  select to_char(e.spent_on, 'YYYY-MM'), sum(e.amount)
  from nikki.expenses e
  where e.household_id = h and nikki.is_member(h) and e.spent_on >= since and e.category <> 'Future Me' and e.occasion_id is null
  group by 1 order by 1;
$$;

-- Gasto de cada evento (só os totais): inclui as despesas «só minhas» de cada um ligadas ao evento, que o outro não
-- vê uma a uma.
create or replace function nikki.occasion_totals(h uuid) returns table (occasion_id uuid, total numeric)
language sql stable security definer set search_path = '' as $$
  select e.occasion_id, sum(e.amount) from nikki.expenses e
  where e.household_id = h and nikki.is_member(h) and e.occasion_id is not null
  group by 1;
$$;
revoke execute on function nikki.occasion_totals(uuid) from public, anon;
grant execute on function nikki.occasion_totals(uuid) to authenticated;
-- ───────────────────────── rendimentos: fixos ou pelos registos ─────────────────────────
-- Cada fonte é «fixa» (valor × vezes por ano) ou «pelos registos» (cada entrada com data e valor; o habitual é a
-- média dos últimos 12 meses completos). Pelos registos, o valor da fonte fica vazio.
alter table nikki.incomes add column if not exists mode text not null default 'fixed';
alter table nikki.incomes alter column amount drop not null;
alter table nikki.incomes drop constraint if exists incomes_mode_check;
alter table nikki.incomes add constraint incomes_mode_check check (mode in ('fixed', 'log') and (mode = 'log' or amount is not null));

create table if not exists nikki.income_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  income_id uuid not null references nikki.incomes (id) on delete cascade,
  received_on date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  note text check (length(note) <= 80),
  external_ref text,
  created_by uuid not null default auth.uid() references nikki.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists income_entries_income on nikki.income_entries (income_id, received_on);
create unique index if not exists income_entries_external on nikki.income_entries (household_id, external_ref) where external_ref is not null;
alter table nikki.income_entries enable row level security;
grant select, insert, update, delete on nikki.income_entries to authenticated;
grant all on nikki.income_entries to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'income_entries' and policyname = 'income_entries_house') then
    create policy income_entries_house on nikki.income_entries for all to authenticated
      using (nikki.is_member(household_id))
      with check (nikki.is_member(household_id) and exists (select 1 from nikki.incomes i where i.id = income_entries.income_id and i.household_id = income_entries.household_id));
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'nikki' and tablename = 'income_entries') then
    alter publication supabase_realtime add table nikki.income_entries;
  end if;
end $$;

-- ───────────────────────── Filhos (meta do fundo para imprevistos) ─────────────────────────
-- Fundo para imprevistos: pelo menos 2 000 € + 500 € por cada filho da casa.
alter table nikki.households add column if not exists children smallint not null default 0 check (children between 0 and 20);

-- ───────────────────────── compras extraordinárias ─────────────────────────
-- Uma compra grande (um carro, um sofá) é um centro de custos como um evento: juntam-se-lhe despesas (entrada,
-- prestações, extras), contam no mês mas à parte (fora do ritmo e do normal). Se for um carro, liga-se à garagem.
alter table nikki.occasions add column if not exists purchase boolean not null default false;
alter table nikki.occasions add column if not exists car_id uuid references nikki.cars (id) on delete set null;

-- ───────────────────────── entrar noutro aparelho ─────────────────────────
-- Num aparelho com sessão, a NIKKI dá um código curto (10 minutos, uma só vez). No aparelho novo (outro telemóvel,
-- o computador, a app no ecrã principal do iPhone) escreve-se o código e entra-se, cada aparelho com a sua sessão.
-- Guarda-se só o resumo (sha-256) do código. Só a função device-link (chave de serviço) lê e escreve aqui.
create table if not exists nikki.device_codes (
  code_hash text primary key,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table nikki.device_codes enable row level security;
revoke all on nikki.device_codes from anon, authenticated, public;
grant all on nikki.device_codes to service_role;


-- ───────────────────────── notificações: chaves e agendamento ─────────────────────────
-- As chaves VAPID e o segredo do agendamento vivem aqui (só a chave de serviço lê): a função «push» cria as chaves
-- na primeira volta, a app lê só a pública por rpc('push_public_key'), e o pg_cron chama a função de 15 em 15 min.
-- (pg_net e pg_cron só existem no Supabase: numa base local de testes, o agendamento fica de fora.)
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
  end if;
end $$;
create table if not exists nikki.push_config (
  id boolean primary key default true check (id),
  vapid_public text,
  vapid_private text,
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table nikki.push_config enable row level security;
revoke all on nikki.push_config from anon, authenticated, public;
grant all on nikki.push_config to service_role;
insert into nikki.push_config (id) values (true) on conflict (id) do nothing;

create or replace function nikki.push_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select vapid_public from nikki.push_config where id
$$;
revoke all on function nikki.push_public_key() from public, anon;
grant execute on function nikki.push_public_key() to authenticated;

do $do$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('nikki-push') where exists (select 1 from cron.job where jobname = 'nikki-push');
    perform cron.schedule('nikki-push', '*/15 * * * *', $cron$
      select net.http_post(
        url := 'https://imbflvhufvvjcfetljsd.supabase.co/functions/v1/push',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select cron_secret from nikki.push_config where id)),
        body := '{}'::jsonb);
    $cron$);
  end if;
end $do$;

-- ───────────────────────── entradas de dinheiro ─────────────────────────
-- As entradas (salário, outros rendimentos, reembolsos, acertos, presentes) são linhas de income_entries, com ou sem
-- fonte de rendimento. Têm quem recebeu, tipo, categoria, evento e partilha (como as despesas). Os reembolsos e os
-- acertos abatem nos gastos da categoria e do evento; as outras contam como rendimento. Numa partilhada, quem recebeu
-- fica a dever a parte do outro nas contas a dois.
alter table nikki.income_entries alter column income_id drop not null;
alter table nikki.income_entries add column if not exists received_by uuid references nikki.profiles (id);
alter table nikki.income_entries add column if not exists kind text;
alter table nikki.income_entries add column if not exists category text check (length(category) <= 40);
alter table nikki.income_entries add column if not exists occasion_id uuid references nikki.occasions (id) on delete set null;
alter table nikki.income_entries add column if not exists split text not null default 'mine';
alter table nikki.income_entries add column if not exists other_id uuid references nikki.profiles (id);
alter table nikki.income_entries add column if not exists payer_share numeric(4, 3);
update nikki.income_entries x set received_by = i.profile_id, kind = coalesce(x.kind, i.kind)
  from nikki.incomes i where i.id = x.income_id and x.received_by is null;
update nikki.income_entries set received_by = created_by where received_by is null;
update nikki.income_entries set kind = 'outro' where kind is null;
alter table nikki.income_entries alter column received_by set default auth.uid();
alter table nikki.income_entries alter column received_by set not null;
alter table nikki.income_entries alter column kind set default 'outro';
alter table nikki.income_entries alter column kind set not null;
alter table nikki.income_entries drop constraint if exists income_entries_kind_check;
alter table nikki.income_entries add constraint income_entries_kind_check
  check (kind in ('salario', 'alimentacao', 'complemento', 'reembolso', 'acerto', 'presente', 'outro'));
alter table nikki.income_entries drop constraint if exists income_entries_split_check;
alter table nikki.income_entries add constraint income_entries_split_check check (
  split in ('mine', 'shared', 'other') and (split = 'mine') = (other_id is null) and (split = 'shared') = (payer_share is not null)
  and (payer_share is null or payer_share between 0.1 and 0.9) and other_id is distinct from received_by);
alter table nikki.income_entries drop constraint if exists income_entries_note_check;
alter table nikki.income_entries add constraint income_entries_note_check check (length(note) <= 120);
create index if not exists income_entries_household on nikki.income_entries (household_id, received_on);
create index if not exists income_entries_occasion on nikki.income_entries (occasion_id) where occasion_id is not null;

-- Com fonte de rendimento: quem recebeu e o tipo vêm da fonte.
create or replace function nikki.income_entry_from_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.income_id is not null then
    select i.profile_id, i.kind into new.received_by, new.kind from nikki.incomes i where i.id = new.income_id;
  end if;
  return new;
end $$;
create or replace trigger income_entry_from_source before insert or update of income_id on nikki.income_entries
  for each row execute function nikki.income_entry_from_source();

alter policy income_entries_house on nikki.income_entries
  using (nikki.is_member(household_id))
  with check (nikki.is_member(household_id)
    and (income_id is null or exists (select 1 from nikki.incomes i where i.id = income_entries.income_id and i.household_id = income_entries.household_id))
    and exists (select 1 from nikki.memberships m where m.household_id = income_entries.household_id and m.profile_id = income_entries.received_by and m.role <> 'staff')
    and (other_id is null or exists (select 1 from nikki.memberships m where m.household_id = income_entries.household_id and m.profile_id = income_entries.other_id and m.role <> 'staff')));

-- O que fica a dever quem recebeu, numa entrada partilhada ou do outro (o contrário de uma despesa).
create or replace function nikki.entry_owed(split text, amount numeric, payer_share numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case split when 'other' then amount when 'shared' then amount * (1 - payer_share) else 0 end
$$;
grant execute on function nikki.entry_owed(text, numeric, numeric) to authenticated;

create or replace function nikki.pair_balance(h uuid, a uuid, b uuid) returns numeric
language sql stable security invoker set search_path = '' as $$
  with o as (select coalesce((select case when lo.profile_a = a then lo.amount_a else -lo.amount_a end
                               from nikki.ledger_openings lo
                               where lo.household_id = h and lo.profile_a = least(a, b) and lo.profile_b = greatest(a, b)), 0) as v,
                    coalesce((select lo.cutover from nikki.ledger_openings lo
                               where lo.household_id = h and lo.profile_a = least(a, b) and lo.profile_b = greatest(a, b)), '-infinity'::date) as since)
  select o.v
    + coalesce((select sum(case when e.paid_by = a then e.owed else -e.owed end) from nikki.expenses e
                where e.household_id = h and e.split <> 'mine' and e.spent_on >= o.since
                  and ((e.paid_by = a and e.other_id = b) or (e.paid_by = b and e.other_id = a))), 0)
    + coalesce((select sum(case when t.from_id = a then t.amount else -t.amount end) from nikki.transfers t
                where t.household_id = h and t.made_on >= o.since
                  and ((t.from_id = a and t.to_id = b) or (t.from_id = b and t.to_id = a))), 0)
    - coalesce((select sum(case when x.received_by = a then 1 else -1 end * nikki.entry_owed(x.split, x.amount, x.payer_share))
                from nikki.income_entries x
                where x.household_id = h and x.split <> 'mine' and x.received_on >= o.since
                  and ((x.received_by = a and x.other_id = b) or (x.received_by = b and x.other_id = a))), 0)
  from o;
$$;

-- As médias da casa e o gasto dos eventos descontam os reembolsos e os acertos (menos nas Prendas, onde nada abate).
create or replace function nikki.house_month_totals(h uuid, since date) returns table (month text, total numeric)
language sql stable security definer set search_path = '' as $$
  select m, sum(v) from (
    select to_char(e.spent_on, 'YYYY-MM') m, e.amount v from nikki.expenses e
    where e.household_id = h and e.spent_on >= since and e.category <> 'Future Me' and e.occasion_id is null
    union all
    select to_char(x.received_on, 'YYYY-MM'), -x.amount from nikki.income_entries x
    where x.household_id = h and x.received_on >= since and x.kind in ('reembolso', 'acerto')
      and coalesce(x.category, '') not in ('Future Me', 'Prendas') and x.occasion_id is null
  ) t where nikki.is_member(h)
  group by 1 order by 1;
$$;
create or replace function nikki.occasion_totals(h uuid) returns table (occasion_id uuid, total numeric)
language sql stable security definer set search_path = '' as $$
  select o, sum(v) from (
    select e.occasion_id o, e.amount v from nikki.expenses e where e.household_id = h and e.occasion_id is not null
    union all
    select x.occasion_id, -x.amount from nikki.income_entries x
    where x.household_id = h and x.occasion_id is not null and x.kind in ('reembolso', 'acerto') and coalesce(x.category, '') <> 'Prendas'
  ) t where nikki.is_member(h)
  group by 1;
$$;

-- Os reembolsos que ficaram como despesas negativas passam a entradas (do tipo reembolso, na mesma categoria, com a
-- mesma partilha); as despesas voltam a ser sempre positivas.
insert into nikki.income_entries (household_id, received_by, kind, category, amount, received_on, note, split, other_id, payer_share, created_by, created_at)
  select household_id, paid_by, 'reembolso', category, -amount, spent_on, note, split, other_id, payer_share, created_by, created_at
  from nikki.expenses where amount < 0;
delete from nikki.expenses where amount < 0;
alter table nikki.expenses drop constraint if exists expenses_amount_check;
alter table nikki.expenses add constraint expenses_amount_check check (amount > 0);

-- Prendas: uma categoria onde as entradas nunca abatem. As despesas com «prenda» ou «presente» na nota passam para lá.
update nikki.expenses set category = 'Prendas' where note ~* '(prend|present)' and category <> 'Prendas';

-- ───────────────────────── salvados (só para a administração da app) ─────────────────────────
-- Carros salvados comprados a meias com um amigo mecânico: a compra, as peças (quem pagou), as horas dele (a 40 €/h)
-- e a venda. As contas fazem-se a 40 €/h; o lucro divide-se a meias; no acerto, cada hora soma 20 € ao que o dono
-- deve ao mecânico. O mecânico regista peças e horas por uma ligação secreta, sem conta (funções salvage_link_*).
create table if not exists nikki.salvage_cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references nikki.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  bought_on date not null default current_date,
  price numeric(12, 2) not null check (price >= 0),
  price_paid_by text not null default 'me' check (price_paid_by in ('me', 'partner')),
  hour_rate numeric(8, 2) not null default 40 check (hour_rate >= 0),
  status text not null default 'repair' check (status in ('repair', 'selling', 'sold')),
  sold_on date,
  sold_for numeric(12, 2) check (sold_for >= 0),
  sale_to text not null default 'me' check (sale_to in ('me', 'partner')), -- quem recebeu o dinheiro da venda
  created_at timestamptz not null default now(),
  check ((status = 'sold') = (sold_on is not null and sold_for is not null))
);
create index if not exists salvage_cars_owner on nikki.salvage_cars (owner_id);
create table if not exists nikki.salvage_logs (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references nikki.salvage_cars (id) on delete cascade,
  kind text not null check (kind in ('part', 'hours')),
  on_date date not null default current_date,
  amount numeric(12, 2),
  hours numeric(6, 2),
  note text check (length(note) <= 80),
  paid_by text not null default 'partner' check (paid_by in ('me', 'partner')),
  by_link boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'part' and amount > 0 and hours is null) or (kind = 'hours' and hours > 0 and amount is null))
);
create index if not exists salvage_logs_car on nikki.salvage_logs (car_id, on_date);
create table if not exists nikki.salvage_links (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  owner_id uuid not null default auth.uid() references nikki.profiles (id) on delete cascade,
  partner_name text not null default 'Pedro' check (length(trim(partner_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table nikki.salvage_cars enable row level security;
alter table nikki.salvage_logs enable row level security;
alter table nikki.salvage_links enable row level security;
revoke all on nikki.salvage_cars, nikki.salvage_logs, nikki.salvage_links from anon, public;
grant select, insert, update, delete on nikki.salvage_cars, nikki.salvage_logs, nikki.salvage_links to authenticated;
grant all on nikki.salvage_cars, nikki.salvage_logs, nikki.salvage_links to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'salvage_cars' and policyname = 'salvage_cars_own') then
    create policy salvage_cars_own on nikki.salvage_cars for all to authenticated
      using (owner_id = auth.uid()) with check (owner_id = auth.uid() and nikki.is_app_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'salvage_logs' and policyname = 'salvage_logs_own') then
    create policy salvage_logs_own on nikki.salvage_logs for all to authenticated
      using (exists (select 1 from nikki.salvage_cars c where c.id = car_id and c.owner_id = auth.uid()))
      with check (exists (select 1 from nikki.salvage_cars c where c.id = car_id and c.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'salvage_links' and policyname = 'salvage_links_own') then
    create policy salvage_links_own on nikki.salvage_links for all to authenticated
      using (owner_id = auth.uid()) with check (owner_id = auth.uid() and nikki.is_app_admin());
  end if;
end $$;

-- A página do mecânico: pela ligação (sem conta), vê os carros do dono da ligação e regista peças e horas.
create or replace function nikki.salvage_link_view(t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'partner', l.partner_name,
    'cars', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'bought_on', c.bought_on, 'price', c.price, 'price_paid_by', c.price_paid_by,
        'hour_rate', c.hour_rate, 'status', c.status, 'sold_on', c.sold_on, 'sold_for', c.sold_for, 'sale_to', c.sale_to,
        'logs', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'on_date', g.on_date, 'amount', g.amount,
                    'hours', g.hours, 'note', g.note, 'paid_by', g.paid_by, 'by_link', g.by_link) order by g.on_date desc, g.created_at desc)
                  from nikki.salvage_logs g where g.car_id = c.id), '[]'::jsonb)) order by c.bought_on desc)
      from nikki.salvage_cars c where c.owner_id = l.owner_id), '[]'::jsonb))
  from nikki.salvage_links l where l.token = t and l.revoked_at is null;
$$;
create or replace function nikki.salvage_link_add(t text, car uuid, k text, amt numeric, hrs numeric, nt text, d date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o uuid; i uuid;
begin
  select owner_id into o from nikki.salvage_links where token = t and revoked_at is null;
  if o is null then raise exception 'ligação inválida'; end if;
  if not exists (select 1 from nikki.salvage_cars where id = car and owner_id = o and status <> 'sold') then raise exception 'carro não encontrado'; end if;
  insert into nikki.salvage_logs (car_id, kind, amount, hours, note, paid_by, by_link, on_date)
    values (car, k, case when k = 'part' then amt end, case when k = 'hours' then hrs end, nullif(trim(nt), ''), 'partner', true, coalesce(d, current_date))
    returning id into i;
  return i;
end $$;
create or replace function nikki.salvage_link_remove(t text, log uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o uuid;
begin
  select owner_id into o from nikki.salvage_links where token = t and revoked_at is null;
  if o is null then raise exception 'ligação inválida'; end if;
  delete from nikki.salvage_logs g using nikki.salvage_cars c
    where g.id = log and g.car_id = c.id and c.owner_id = o and g.by_link and g.created_at > now() - interval '7 days';
end $$;
revoke all on function nikki.salvage_link_view(text), nikki.salvage_link_add(text, uuid, text, numeric, numeric, text, date), nikki.salvage_link_remove(text, uuid) from public;
grant execute on function nikki.salvage_link_view(text), nikki.salvage_link_add(text, uuid, text, numeric, numeric, text, date), nikki.salvage_link_remove(text, uuid) to anon, authenticated;

-- ───────────────────────── salvados: conta corrente ─────────────────────────
-- A compra divide-se (price_me = quanto pagou o dono; por omissão, metade). Há transferências entre os dois (kind
-- 'transfer'; paid_by = quem transferiu). O valor/hora e o nome do sócio ficam nas definições do dono.
alter table nikki.salvage_cars add column if not exists price_me numeric(12, 2) check (price_me >= 0);
alter table nikki.salvage_logs drop constraint if exists salvage_logs_kind_check;
alter table nikki.salvage_logs add constraint salvage_logs_kind_check check (kind in ('part', 'hours', 'transfer'));
alter table nikki.salvage_logs drop constraint if exists salvage_logs_check;
alter table nikki.salvage_logs add constraint salvage_logs_check
  check ((kind in ('part', 'transfer') and amount > 0 and hours is null) or (kind = 'hours' and hours > 0 and amount is null));
create table if not exists nikki.salvage_settings (
  owner_id uuid primary key default auth.uid() references nikki.profiles (id) on delete cascade,
  partner_name text not null default 'Pedro' check (length(trim(partner_name)) between 1 and 40),
  hour_rate numeric(8, 2) not null default 40 check (hour_rate >= 0),
  updated_at timestamptz not null default now()
);
alter table nikki.salvage_settings enable row level security;
grant select, insert, update, delete on nikki.salvage_settings to authenticated;
grant all on nikki.salvage_settings to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'salvage_settings' and policyname = 'salvage_settings_own') then
    create policy salvage_settings_own on nikki.salvage_settings for all to authenticated
      using (owner_id = auth.uid()) with check (owner_id = auth.uid() and nikki.is_app_admin());
  end if;
end $$;
create or replace function nikki.salvage_link_view(t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'partner', l.partner_name,
    'cars', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'bought_on', c.bought_on, 'price', c.price, 'price_me', c.price_me, 'price_paid_by', c.price_paid_by,
        'hour_rate', c.hour_rate, 'status', c.status, 'sold_on', c.sold_on, 'sold_for', c.sold_for, 'sale_to', c.sale_to,
        'logs', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'on_date', g.on_date, 'amount', g.amount,
                    'hours', g.hours, 'note', g.note, 'paid_by', g.paid_by, 'by_link', g.by_link) order by g.on_date desc, g.created_at desc)
                  from nikki.salvage_logs g where g.car_id = c.id), '[]'::jsonb)) order by c.bought_on desc)
      from nikki.salvage_cars c where c.owner_id = l.owner_id), '[]'::jsonb))
  from nikki.salvage_links l where l.token = t and l.revoked_at is null;
$$;
create or replace function nikki.salvage_link_add(t text, car uuid, k text, amt numeric, hrs numeric, nt text, d date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o uuid; i uuid;
begin
  if k not in ('part', 'hours') then raise exception 'pela ligação só peças e horas'; end if;
  select owner_id into o from nikki.salvage_links where token = t and revoked_at is null;
  if o is null then raise exception 'ligação inválida'; end if;
  if not exists (select 1 from nikki.salvage_cars where id = car and owner_id = o and status <> 'sold') then raise exception 'carro não encontrado'; end if;
  insert into nikki.salvage_logs (car_id, kind, amount, hours, note, paid_by, by_link, on_date)
    values (car, k, case when k = 'part' then amt end, case when k = 'hours' then hrs end, nullif(trim(nt), ''), 'partner', true, coalesce(d, current_date))
    returning id into i;
  return i;
end $$;

-- ───────────────────────── salvados: marca e matrícula ─────────────────────────
-- name fica com o modelo («Golf VI 2012»); a marca e a matrícula são opcionais.
alter table nikki.salvage_cars add column if not exists brand text check (length(brand) <= 30);
alter table nikki.salvage_cars add column if not exists plate text check (length(plate) <= 12);
create or replace function nikki.salvage_link_view(t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'partner', l.partner_name,
    'cars', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'brand', c.brand, 'plate', c.plate, 'bought_on', c.bought_on, 'price', c.price, 'price_me', c.price_me, 'price_paid_by', c.price_paid_by,
        'hour_rate', c.hour_rate, 'status', c.status, 'sold_on', c.sold_on, 'sold_for', c.sold_for, 'sale_to', c.sale_to,
        'logs', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'on_date', g.on_date, 'amount', g.amount,
                    'hours', g.hours, 'note', g.note, 'paid_by', g.paid_by, 'by_link', g.by_link) order by g.on_date desc, g.created_at desc)
                  from nikki.salvage_logs g where g.car_id = c.id), '[]'::jsonb)) order by c.bought_on desc)
      from nikki.salvage_cars c where c.owner_id = l.owner_id), '[]'::jsonb))
  from nikki.salvage_links l where l.token = t and l.revoked_at is null;
$$;

-- ───────────────────────── salvados: sócios iguais ─────────────────────────
-- O registo do carro (pago na compra): a meias por omissão. Os registos apagados ficam marcados (removed_at), para
-- os dois lados poderem desfazer enganos sem apagar nada às escuras.
alter table nikki.salvage_cars add column if not exists reg_cost numeric(10, 2) check (reg_cost >= 0);
alter table nikki.salvage_cars add column if not exists reg_paid_by text not null default 'half' check (reg_paid_by in ('half', 'me', 'partner'));
alter table nikki.salvage_logs add column if not exists removed_at timestamptz;
-- Ligações curtas: 6 letras e números sem os que se confundem (0/o, 1/l/i).
create or replace function nikki.short_code(n int) returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('23456789abcdefghjkmnpqrstuvwxyz', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) r, generate_series(0, least(n, 16) - 1) as i;
$$;
alter table nikki.salvage_links alter column token set default nikki.short_code(6);
-- A página do sócio vê tudo o que o dono vê: os carros, os registos, o valor/hora e o nome do dono.
create or replace function nikki.salvage_link_view(t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'partner', l.partner_name,
    'owner', (select p.name from nikki.profiles p where p.id = l.owner_id),
    'rate', coalesce((select s.hour_rate from nikki.salvage_settings s where s.owner_id = l.owner_id), 40),
    'cars', coalesce((select jsonb_agg((to_jsonb(c) - 'owner_id') || jsonb_build_object(
        'logs', coalesce((select jsonb_agg(to_jsonb(g) - 'car_id' order by g.on_date desc, g.created_at desc)
                  from nikki.salvage_logs g where g.car_id = c.id and g.removed_at is null), '[]'::jsonb)) order by c.bought_on desc)
      from nikki.salvage_cars c where c.owner_id = l.owner_id), '[]'::jsonb))
  from nikki.salvage_links l where l.token = t and l.revoked_at is null;
$$;
-- E faz o mesmo que o dono: carros novos, mudar um carro (datas, estado, venda, divisão), registos e o valor/hora.
-- Os dados chegam já do lado do dono («me» = o dono); a página do sócio é que os troca.
create or replace function nikki.salvage_link_do(t text, op text, a jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o uuid; i uuid;
begin
  select owner_id into o from nikki.salvage_links where token = t and revoked_at is null;
  if o is null then raise exception 'ligação inválida'; end if;
  if op = 'car_add' then
    insert into nikki.salvage_cars (owner_id, name, brand, plate, bought_on, price, price_me, price_paid_by, hour_rate, reg_cost, reg_paid_by)
    values (o, trim(a->>'name'), nullif(trim(a->>'brand'), ''), nullif(trim(a->>'plate'), ''), coalesce((a->>'bought_on')::date, current_date),
      (a->>'price')::numeric, (a->>'price_me')::numeric, coalesce(a->>'price_paid_by', 'me'),
      coalesce((a->>'hour_rate')::numeric, (select s.hour_rate from nikki.salvage_settings s where s.owner_id = o), 40),
      (a->>'reg_cost')::numeric, coalesce(a->>'reg_paid_by', 'half'))
    returning id into i;
  elsif op = 'car_set' then
    update nikki.salvage_cars c set
      name = case when a ? 'name' then trim(a->>'name') else c.name end,
      brand = case when a ? 'brand' then nullif(trim(a->>'brand'), '') else c.brand end,
      plate = case when a ? 'plate' then nullif(trim(a->>'plate'), '') else c.plate end,
      bought_on = case when a ? 'bought_on' then (a->>'bought_on')::date else c.bought_on end,
      price = case when a ? 'price' then (a->>'price')::numeric else c.price end,
      price_me = case when a ? 'price_me' then (a->>'price_me')::numeric else c.price_me end,
      price_paid_by = case when a ? 'price_paid_by' then a->>'price_paid_by' else c.price_paid_by end,
      reg_cost = case when a ? 'reg_cost' then (a->>'reg_cost')::numeric else c.reg_cost end,
      reg_paid_by = case when a ? 'reg_paid_by' then a->>'reg_paid_by' else c.reg_paid_by end,
      status = case when a ? 'status' then a->>'status' else c.status end,
      sold_on = case when a ? 'sold_on' then (a->>'sold_on')::date else c.sold_on end,
      sold_for = case when a ? 'sold_for' then (a->>'sold_for')::numeric else c.sold_for end,
      sale_to = case when a ? 'sale_to' then a->>'sale_to' else c.sale_to end
    where c.id = (a->>'id')::uuid and c.owner_id = o
    returning c.id into i;
  elsif op = 'log_add' then
    if not exists (select 1 from nikki.salvage_cars where id = (a->>'car_id')::uuid and owner_id = o) then raise exception 'carro não encontrado'; end if;
    insert into nikki.salvage_logs (car_id, kind, on_date, amount, hours, note, paid_by, by_link)
    values ((a->>'car_id')::uuid, a->>'kind', coalesce((a->>'on_date')::date, current_date), (a->>'amount')::numeric, (a->>'hours')::numeric,
      nullif(trim(a->>'note'), ''), coalesce(a->>'paid_by', 'partner'), true)
    returning id into i;
  elsif op = 'log_remove' then
    update nikki.salvage_logs g set removed_at = now()
    from nikki.salvage_cars c where g.id = (a->>'id')::uuid and c.id = g.car_id and c.owner_id = o
    returning g.id into i;
  elsif op = 'rate_set' then
    insert into nikki.salvage_settings (owner_id, hour_rate) values (o, (a->>'hour_rate')::numeric)
      on conflict (owner_id) do update set hour_rate = excluded.hour_rate, updated_at = now();
    update nikki.salvage_cars set hour_rate = (a->>'hour_rate')::numeric where owner_id = o and status <> 'sold';
    i := o;
  else raise exception 'operação desconhecida';
  end if;
  if i is null then raise exception 'não encontrado'; end if;
  return i;
end $$;
grant execute on function nikki.short_code(int), nikki.salvage_link_do(text, text, jsonb) to anon, authenticated;

-- ───────────────────────── calendário: a chave dos acessos guardados ─────────────────────────
-- A chave que encripta as palavras-passe de app (iCloud) e os acessos do Google fica aqui, criada sozinha, em vez de
-- um segredo posto à mão nas funções. Com RLS e sem regras, só a chave de serviço (as funções) a lê.
create table if not exists nikki.calendar_config (
  id boolean primary key default true check (id),
  key text not null default encode(extensions.gen_random_bytes(32), 'base64')
);
alter table nikki.calendar_config enable row level security;
grant all on nikki.calendar_config to service_role;
insert into nikki.calendar_config (id) values (true) on conflict (id) do nothing;

-- ───────────────────────── calendário nos dois sentidos ─────────────────────────
-- Eventos criados no iPhone (calendário «NIKKI»): guardam o UID do iPhone e ficam «só para mim» até a pessoa escolher
-- de quem são (ask_share). calendar_seen: o que está em cada iCloud (endereço e etag), para saber o que lá mudou.
alter table nikki.events add column if not exists ext_uid text check (length(ext_uid) <= 300);
alter table nikki.events add column if not exists ask_share boolean not null default false;
create index if not exists events_ext_uid on nikki.events (household_id, ext_uid) where ext_uid is not null;
create table if not exists nikki.calendar_seen (
  link_id uuid not null references nikki.calendar_links (id) on delete cascade,
  event_id uuid not null,
  href text not null,
  etag text,
  primary key (link_id, event_id)
);
alter table nikki.calendar_seen enable row level security;
grant all on nikki.calendar_seen to service_role;
do $do$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('nikki-calendar-pull') where exists (select 1 from cron.job where jobname = 'nikki-calendar-pull');
    perform cron.schedule('nikki-calendar-pull', '*/15 * * * *', $cron$
      select net.http_post(
        url := 'https://imbflvhufvvjcfetljsd.supabase.co/functions/v1/calendar-pull',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select cron_secret from nikki.push_config where id)),
        body := '{}'::jsonb);
    $cron$);
  end if;
end $do$;
-- ───────────────────────── faturas das despesas e o que se compra ─────────────────────────
-- Cada despesa pode ter a fotografia (ou o PDF) da fatura, no bucket «receipts» (receipts/<casa>/despesas/<id>/…).
-- As de supermercado são lidas pela função «receipt-read» (Gemini): cada linha vira um produto simples com quantidade
-- (kg, l ou unidades), para as sugestões das Compras («costumam comprar 4 kg de limões por mês»).
alter table nikki.expenses add column if not exists receipt_path text check (length(receipt_path) <= 300);
alter table nikki.expenses add column if not exists receipt_read_at timestamptz;
create table if not exists nikki.receipt_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  expense_id uuid not null references nikki.expenses (id) on delete cascade,
  bought_on date not null,
  product text not null check (length(trim(product)) between 1 and 60),
  qty numeric(10, 3) check (qty > 0),
  unit text check (unit in ('kg', 'l', 'un')),
  price numeric(10, 2),
  raw text check (length(raw) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists receipt_items_house on nikki.receipt_items (household_id, product, bought_on);
create index if not exists receipt_items_expense on nikki.receipt_items (expense_id);
alter table nikki.receipt_items enable row level security;
grant select, insert, update, delete on nikki.receipt_items to authenticated;
grant all on nikki.receipt_items to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'receipt_items' and policyname = 'receipt_items_house') then
    create policy receipt_items_house on nikki.receipt_items for all to authenticated
      using (nikki.is_member(household_id)) with check (nikki.is_member(household_id));
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'nikki' and tablename = 'receipt_items') then
    alter publication supabase_realtime add table nikki.receipt_items;
  end if;
end $$;

-- ───────────────────────── despesas: editar e apagar tudo o que se vê ─────────────────────────
-- Quem vê uma despesa (pagou, registou ou é a outra pessoa nela) pode mudá-la ou apagá-la.
alter policy expenses_edit on nikki.expenses
  using (created_by = auth.uid() or paid_by = auth.uid() or other_id = auth.uid() or nikki.is_admin(household_id));
alter policy expenses_delete on nikki.expenses
  using (created_by = auth.uid() or paid_by = auth.uid() or other_id = auth.uid() or nikki.is_admin(household_id));

-- ───────────────────────── faturas: a chave do Gemini ─────────────────────────
-- Posta pela administração da app (na NIKKI, em Administração → Números), sem ir ao painel do Supabase.
-- Só a chave de serviço (a função receipt-read) a lê; a app só sabe se já está posta.
create table if not exists nikki.ai_config (
  id boolean primary key default true check (id),
  gemini_key text check (length(gemini_key) <= 200),
  updated_at timestamptz not null default now()
);
alter table nikki.ai_config enable row level security;
grant all on nikki.ai_config to service_role;
create or replace function nikki.admin_set_gemini_key(k text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  insert into nikki.ai_config (id, gemini_key, updated_at) values (true, nullif(trim(k), ''), now())
    on conflict (id) do update set gemini_key = excluded.gemini_key, updated_at = now();
end $$;
create or replace function nikki.admin_gemini_ready() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform nikki.admin_check();
  return exists (select 1 from nikki.ai_config where id and gemini_key is not null);
end $$;
grant execute on function nikki.admin_set_gemini_key(text), nikki.admin_gemini_ready() to authenticated;

-- ───────────────────────── registo rápido: QR das faturas e Apple Pay ─────────────────────────
-- O NIF da loja (lido do QR da fatura): a NIKKI aprende por ele a nota, a categoria e a partilha.
alter table nikki.expenses add column if not exists merchant_nif text check (merchant_nif ~ '^[0-9]{9}$');
-- Apple Pay: um atalho do iPhone envia o valor e a loja para a função «capture» com a ligação secreta da pessoa; fica
-- um rascunho que a app abre preenchido para confirmar. Nada conta para as contas sem ser confirmado.
create table if not exists nikki.capture_tokens (
  token text primary key default encode(extensions.gen_random_bytes(18), 'hex'),
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  household_id uuid not null references nikki.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, household_id)
);
create table if not exists nikki.expense_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  merchant text check (length(merchant) <= 80),
  card text check (length(card) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists expense_drafts_me on nikki.expense_drafts (profile_id, created_at);
alter table nikki.capture_tokens enable row level security;
alter table nikki.expense_drafts enable row level security;
grant select on nikki.capture_tokens to authenticated;
grant select, delete on nikki.expense_drafts to authenticated;
grant all on nikki.capture_tokens, nikki.expense_drafts to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'capture_tokens' and policyname = 'capture_tokens_own') then
    create policy capture_tokens_own on nikki.capture_tokens for select to authenticated using (profile_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'nikki' and tablename = 'expense_drafts' and policyname = 'expense_drafts_own') then
    create policy expense_drafts_own on nikki.expense_drafts for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
  end if;
end $$;
-- A ligação de cada pessoa (criada ou trocada pela app).
create or replace function nikki.capture_token(h uuid, renew boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not nikki.is_member(h) then raise exception 'sem acesso'; end if;
  if renew then
    update nikki.capture_tokens set token = encode(extensions.gen_random_bytes(18), 'hex'), created_at = now() where profile_id = auth.uid() and household_id = h;
  end if;
  insert into nikki.capture_tokens (profile_id, household_id) values (auth.uid(), h) on conflict (profile_id, household_id) do nothing;
  select token into t from nikki.capture_tokens where profile_id = auth.uid() and household_id = h;
  return t;
end $$;
grant execute on function nikki.capture_token(uuid, boolean) to authenticated;
