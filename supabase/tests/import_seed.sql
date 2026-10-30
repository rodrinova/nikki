-- Só para testes locais: tabelas da app antiga (public.*) com dados de exemplo, e as duas contas na app nova.
\set ON_ERROR_STOP on
create table public.transactions (
  id bigint generated always as identity primary key, date date not null, amount numeric not null,
  category text, paid_by text, shared boolean default false, split_type text, description text,
  car text, ride_type text, odometer numeric, litres numeric, full_tank boolean,
  weighted_amount numeric generated always as (case when shared and split_type = 'full' then amount
                                                     when shared and split_type = 'equal' then amount / 2 else 0 end) stored);
create table public.settlements (id bigint generated always as identity primary key, date date not null, amount numeric not null, note text, created_at timestamptz default now());
create table public.cars (id uuid primary key default gen_random_uuid(), name text not null, plate text, owner text,
  annual_insurance numeric, annual_tax numeric, annual_other numeric, archived boolean default false, created_at timestamptz default now());
create table public.incomes (id uuid primary key default gen_random_uuid(), date date not null, amount numeric not null, user_id text not null, created_at timestamptz default now());
create table public.estate_assets (id uuid primary key default gen_random_uuid(), user_id text not null, name text not null, category text not null,
  current_value numeric not null default 0, annual_return numeric, notes text not null default '', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.estate_snapshots (id uuid primary key default gen_random_uuid(), user_id text not null, asset_id uuid references public.estate_assets(id) on delete set null,
  value numeric not null, snapshot_date date not null default current_date, created_at timestamptz default now());
create table public.ledger_opening_balance (id uuid primary key default gen_random_uuid(), cutover_date date not null, amount_ra numeric not null default 0, note text, created_at timestamptz default now());

insert into public.cars (id, name, plate, owner, annual_insurance, annual_tax) values
  ('11111111-1111-1111-1111-111111111111', 'Golf', '00-AA-00', 'Rodrigo', 320, 150),
  ('22222222-2222-2222-2222-222222222222', 'Zoe', null, 'Inês', null, null);
insert into public.transactions (date, amount, category, paid_by, shared, split_type, description, car, ride_type, odometer, litres, full_tank) values
  ('2026-01-05', 80, 'Groceries', 'RA', true, 'equal', 'Pingo Doce', null, null, null, null, null),       -- Inês deve 40
  ('2026-01-10', 30, 'Eating Out', 'IG', true, 'full', 'Jantar do Rodrigo', null, null, null, null, null), -- Rodrigo deve 30
  ('2026-01-12', 12.5, 'Glow Up', 'IG', false, 'none', 'Cabeleireiro', null, null, null, null, null),
  ('2026-02-01', 60, 'Rides', 'RA', false, 'none', 'Gasóleo', '11111111-1111-1111-1111-111111111111', 'Fuel', 42130.4, 38.2, true),
  ('2026-02-20', 200, 'Rides', 'IG', true, 'equal', 'Revisão', 'Zoe', 'Repair', null, null, null),          -- Rodrigo deve 100; carro pelo nome
  ('2026-03-01', 500, 'Future Me', 'RA', false, 'none', 'ETF', null, null, null, null, null),
  ('2026-03-02', 0, 'Bits & Bobs', 'RA', false, 'none', 'zero', null, null, null, null, null),
  ('2026-02-14', 900, 'The Big Day', 'IG', true, 'equal', 'Fotógrafo', null, null, null, null, null),            -- Rodrigo deve 450
  ('2025-12-01', 100, 'Nest', 'RA', true, 'equal', 'antes do corte', null, null, null, null, null);
insert into public.settlements (date, amount, note) values ('2026-02-25', 20, 'MB Way'), ('2026-03-03', -5, 'troco');
insert into public.ledger_opening_balance (cutover_date, amount_ra) values ('2026-01-01', 15.75);
insert into public.incomes (date, amount, user_id)
  select (date_trunc('month', current_date) - (n || ' months')::interval)::date + 24, 1800, 'RA' from generate_series(1, 13) n;
insert into public.incomes (date, amount, user_id) values (current_date, 9999, 'IG');                     -- mês corrente não conta
insert into public.estate_assets (id, user_id, name, category, current_value, annual_return, updated_at) values
  ('33333333-3333-3333-3333-333333333333', 'RA', 'VWCE', 'investment', 12000, 7, '2026-10-20'),
  ('44444444-4444-4444-4444-444444444444', 'IG', 'Casa', 'property', 250000, 45, '2026-06-01');
insert into public.estate_snapshots (user_id, asset_id, value, snapshot_date, created_at) values
  ('RA', '33333333-3333-3333-3333-333333333333', 10000, '2026-06-01', '2026-06-01 10:00'),
  ('RA', '33333333-3333-3333-3333-333333333333', 10500, '2026-06-01', '2026-06-01 18:00'),
  ('RA', null, 99, '2026-05-01', now());

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'rodrigo@exemplo.pt'), ('00000000-0000-0000-0000-00000000000b', 'ines@exemplo.pt');
update nikki.profiles set status = 'active';
insert into nikki.households (id, name, created_by) values ('00000000-0000-0000-0000-0000000000f1', 'A nossa casa', '00000000-0000-0000-0000-00000000000a');
insert into nikki.memberships (household_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'admin');

-- A cópia que o script lê (no projeto real vem da API da app antiga).
create schema if not exists legacy;
create table legacy.raw (tbl text not null, j jsonb not null, batch text not null, loaded_at timestamptz not null default now());
insert into legacy.raw (tbl, j, batch)
select 'transactions', to_jsonb(t), 'b1' from public.transactions t union all
select 'settlements', to_jsonb(t), 'b1' from public.settlements t union all
select 'cars', to_jsonb(t), 'b1' from public.cars t union all
select 'incomes', to_jsonb(t), 'b1' from public.incomes t union all
select 'estate_assets', to_jsonb(t), 'b1' from public.estate_assets t union all
select 'estate_snapshots', to_jsonb(t), 'b1' from public.estate_snapshots t union all
select 'ledger_opening_balance', to_jsonb(t), 'b1' from public.ledger_opening_balance t;
