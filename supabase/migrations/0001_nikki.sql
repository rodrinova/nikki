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

create table if not exists nikki.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references nikki.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists nikki.memberships (
  household_id uuid not null references nikki.households (id) on delete cascade,
  profile_id uuid not null references nikki.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);
create index if not exists memberships_profile on nikki.memberships (profile_id);

create table if not exists nikki.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references nikki.households (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null default 'member' check (role in ('admin', 'member')),
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
  ('thigh', 'Coxa', 'cm', false), ('bmr', 'Metabolismo basal', 'kcal', false), ('rhr', 'Frequência em repouso', 'bpm', true)
on conflict (key) do nothing;

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

create or replace function nikki.is_member(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from nikki.memberships m where m.household_id = h and m.profile_id = auth.uid());
$$;

create or replace function nikki.is_admin(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from nikki.memberships m where m.household_id = h and m.profile_id = auth.uid() and m.role = 'admin');
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
  insert into nikki.profiles (id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), initcap(split_part(new.email, '@', 1))))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists nikki_on_auth_user_created on auth.users;
create trigger nikki_on_auth_user_created after insert on auth.users
  for each row execute function nikki.handle_new_user();

-- Criar casa: quem cria fica administrador.
create or replace function nikki.create_household(house_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'sem sessão'; end if;
  insert into nikki.households (name, created_by) values (trim(house_name), u) returning id into h;
  insert into nikki.memberships (household_id, profile_id, role) values (h, u, 'admin');
  return h;
end $$;

-- Aceitar convite por ligação (token) ou por código de 6 letras.
create or replace function nikki.accept_invite(invite text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i nikki.invites; u uuid := auth.uid();
begin
  if u is null then raise exception 'sem sessão'; end if;
  select * into i from nikki.invites where token = invite or code = upper(invite) for update;
  if not found then raise exception 'convite inválido'; end if;
  if i.accepted_at is not null then raise exception 'convite já usado'; end if;
  if i.expires_at < now() then raise exception 'convite expirado'; end if;
  insert into nikki.memberships (household_id, profile_id, role) values (i.household_id, u, i.role)
    on conflict (household_id, profile_id) do nothing;
  update nikki.invites set accepted_at = now(), accepted_by = u where id = i.id;
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
create or replace function nikki.busy_slots(h uuid, from_ts timestamptz, to_ts timestamptz)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, all_day boolean, owner_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.id, e.starts_at, e.ends_at, e.all_day, coalesce(e.owner_id, e.created_by)
  from nikki.events e
  where nikki.is_member(h) and e.household_id = h and e.private
    and coalesce(e.owner_id, e.created_by) <> auth.uid() and e.created_by <> auth.uid()
    and e.starts_at < to_ts and coalesce(e.ends_at, e.starts_at) >= from_ts
  order by e.starts_at;
$$;

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
    'gym_fields', 'gym_assessments'] loop
    execute format('alter table nikki.%I enable row level security', t);
    execute format('grant select, insert, update, delete on nikki.%I to authenticated', t);
    execute format('grant all on nikki.%I to service_role', t);
  end loop;
end $$;

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
create policy profiles_insert_self on nikki.profiles for insert to authenticated with check (id = auth.uid());

create policy households_read on nikki.households for select to authenticated using (nikki.is_member(id));
create policy households_admin on nikki.households for update to authenticated using (nikki.is_admin(id)) with check (nikki.is_admin(id));

create policy memberships_read on nikki.memberships for select to authenticated using (nikki.is_member(household_id));
create policy memberships_admin_update on nikki.memberships for update to authenticated using (nikki.is_admin(household_id)) with check (nikki.is_admin(household_id));
create policy memberships_leave_or_admin on nikki.memberships for delete to authenticated using (profile_id = auth.uid() or nikki.is_admin(household_id));

create policy invites_admin on nikki.invites for all to authenticated
  using (nikki.is_admin(household_id)) with check (nikki.is_admin(household_id) and created_by = auth.uid());

create policy share_read on nikki.share_ratios for select to authenticated using (nikki.is_member(household_id));
create policy share_admin on nikki.share_ratios for all to authenticated using (nikki.is_admin(household_id)) with check (nikki.is_admin(household_id));

-- Despesas: as "só minhas" só quem pagou as vê; as outras, quem as pagou e a pessoa envolvida.
create policy expenses_read on nikki.expenses for select to authenticated
  using (nikki.is_member(household_id) and (paid_by = auth.uid() or created_by = auth.uid() or other_id = auth.uid()));
create policy expenses_write on nikki.expenses for insert to authenticated
  with check (nikki.is_member(household_id) and created_by = auth.uid()
              and (other_id is null or exists (select 1 from nikki.memberships m where m.household_id = expenses.household_id and m.profile_id = expenses.other_id))
              and exists (select 1 from nikki.memberships m where m.household_id = expenses.household_id and m.profile_id = expenses.paid_by));
create policy expenses_edit on nikki.expenses for update to authenticated
  using (created_by = auth.uid() or paid_by = auth.uid() or nikki.is_admin(household_id))
  with check (nikki.is_member(household_id));
create policy expenses_delete on nikki.expenses for delete to authenticated
  using (created_by = auth.uid() or paid_by = auth.uid() or nikki.is_admin(household_id));

create policy transfers_read on nikki.transfers for select to authenticated
  using (nikki.is_member(household_id) and (from_id = auth.uid() or to_id = auth.uid()));
create policy transfers_write on nikki.transfers for insert to authenticated
  with check (nikki.is_member(household_id) and created_by = auth.uid() and (from_id = auth.uid() or to_id = auth.uid())
              and exists (select 1 from nikki.memberships m where m.household_id = transfers.household_id and m.profile_id = transfers.to_id)
              and exists (select 1 from nikki.memberships m where m.household_id = transfers.household_id and m.profile_id = transfers.from_id));
create policy transfers_delete on nikki.transfers for delete to authenticated using (created_by = auth.uid());

create policy openings_read on nikki.ledger_openings for select to authenticated
  using (nikki.is_member(household_id) and auth.uid() in (profile_a, profile_b));

create policy rules_own on nikki.merchant_rules for all to authenticated
  using (profile_id = auth.uid() and nikki.is_member(household_id)) with check (profile_id = auth.uid() and nikki.is_member(household_id));

-- Tudo o que é da casa: qualquer membro lê e escreve.
do $$
declare t text;
begin
  foreach t in array array['shopping_items', 'car_logs', 'deadlines', 'goals', 'asset_snapshots'] loop
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

-- Eventos: um «só para mim» só o lê o dono (ou quem o criou); aos outros chega só pela hora, por nikki.busy_slots,
-- e a app mostra «<nome> tem planos». Só o autor altera.
create policy events_read on nikki.events for select to authenticated
  using (nikki.is_member(household_id) and (not private or owner_id = auth.uid() or created_by = auth.uid()));
create policy events_insert on nikki.events for insert to authenticated with check (nikki.is_member(household_id) and created_by = auth.uid());
create policy events_edit on nikki.events for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy events_delete on nikki.events for delete to authenticated using (created_by = auth.uid());

create policy gym_fields_read on nikki.gym_fields for select to authenticated using (true);
create policy gym_own on nikki.gym_assessments for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ───────────────────────── tempo real ─────────────────────────

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['shopping_items', 'expenses', 'transfers', 'memberships', 'deadlines', 'goals'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'nikki' and tablename = t) then
        execute format('alter publication supabase_realtime add table nikki.%I', t);
      end if;
    end loop;
  end if;
end $$;
