-- Importar os dados da app antiga (tabelas public.*) para a NIKKI nova (schema nikki).
--
-- Lê a cópia da app antiga em legacy.raw (o projeto do Lovable não é tocado). A app antiga continua a funcionar.
-- Pode correr-se mais do que uma vez (por exemplo, a importação final no dia da mudança): cada linha copiada
-- leva a marca «old:<tabela>:<id>»; o que já existe é atualizado, o que entretanto foi apagado na app antiga
-- é retirado da nova. Até à mudança, a app antiga manda: corrigir uma linha importada na app nova não serve,
-- porque a próxima importação volta a pô-la como está na antiga.
--
-- O que vem: despesas (com abastecimentos e idas à oficina nos carros), acertos entre os dois, saldo de abertura,
-- carros, rendimentos e património (ativos e histórico de valores). O casamento não vem.
--
-- Antes de correr:
--   1. A migração supabase/migrations/0001_nikki.sql aplicada e o schema nikki exposto na API.
--   2. O Rodrigo e a Inês entraram uma vez na app nova e estão na mesma casa (convite aceite).
--   3. Escrever os dois e-mails com que entraram nas duas linhas logo abaixo.
-- Correr no editor SQL do Supabase (como postgres). Tudo numa transação: se algo falhar, nada fica a meio.

begin;

create temp table imp_cfg on commit drop as
select 'EMAIL_DO_RODRIGO'::text as ra_email,
       'EMAIL_DA_INES'::text as ig_email;

-- As categorias antigas e os nomes novos. As que não estão aqui ficam com o nome antigo.
create temp table imp_cat (old text primary key, new text not null) on commit drop;
insert into imp_cat values
  ('Rides', 'Carros'), ('Nest', 'Casa'), ('The Big Day', 'Casamento'), ('Lifestyle', 'Lazer'),
  ('Glow Up', 'Beleza'), ('Future Me', 'Future Me'), ('Tax Season', 'Impostos'), ('My Things', 'Coisas minhas'),
  ('Bits & Bobs', 'Outros'), ('Treats & Gifts', 'Presentes'), ('Eating Out', 'Restaurantes'),
  ('Wellness', 'Saúde'), ('Bills & Services', 'Contas'), ('Groceries', 'Supermercado'), ('Fresh Entry', 'Outros');

-- Quem é quem e em que casa.
create temp table imp on commit drop as
with p as (
  select (select pr.id from nikki.profiles pr join auth.users u on u.id = pr.id
           where lower(u.email) = lower(trim(c.ra_email))) as ra,
         (select pr.id from nikki.profiles pr join auth.users u on u.id = pr.id
           where lower(u.email) = lower(trim(c.ig_email))) as ig
  from imp_cfg c
)
select p.ra, p.ig,
       (select m1.household_id from nikki.memberships m1
          join nikki.memberships m2 on m2.household_id = m1.household_id and m2.profile_id = p.ig and m2.role <> 'staff'
         where m1.profile_id = p.ra and m1.role <> 'staff'
         order by m1.joined_at limit 1) as h
from p;

do $$
declare r record;
begin
  select * into r from imp;
  if r.ra is null then raise exception 'Não encontro a conta do Rodrigo com esse e-mail (já entrou na app nova?)'; end if;
  if r.ig is null then raise exception 'Não encontro a conta da Inês com esse e-mail (já entrou na app nova?)'; end if;
  if r.h is null then raise exception 'O Rodrigo e a Inês ainda não estão na mesma casa (falta aceitar o convite)'; end if;
end $$;

-- As linhas antigas, da última cópia carregada em legacy.raw (lida da app do Lovable pela API dela, só leitura).
-- Em JSON: uma coluna que não exista na base antiga fica vazia, em vez de partir o script.
create temp table old_tx on commit drop as select j from legacy.raw where tbl = 'transactions' and batch = (select batch from legacy.raw order by loaded_at desc limit 1);
create temp table old_settle on commit drop as select j from legacy.raw where tbl = 'settlements' and batch = (select batch from legacy.raw order by loaded_at desc limit 1);
create temp table old_cars on commit drop as select j from legacy.raw where tbl = 'cars' and batch = (select batch from legacy.raw order by loaded_at desc limit 1);
create temp table old_inc on commit drop as select j from legacy.raw where tbl = 'incomes' and batch = (select batch from legacy.raw order by loaded_at desc limit 1);
create temp table old_assets on commit drop as select j from legacy.raw where tbl = 'estate_assets' and batch = (select batch from legacy.raw order by loaded_at desc limit 1);
create temp table old_snaps on commit drop as select j from legacy.raw where tbl = 'estate_snapshots' and batch = (select batch from legacy.raw order by loaded_at desc limit 1);
create temp table old_open on commit drop as select j from legacy.raw where tbl = 'ledger_opening_balance' and batch = (select batch from legacy.raw order by loaded_at desc limit 1);

create function pg_temp.who(code text) returns uuid language sql stable as $$
  select case code when 'RA' then (select ra from imp) when 'IG' then (select ig from imp) end
$$;
create function pg_temp.who_name(name text) returns uuid language sql stable as $$
  select case name when 'Rodrigo' then (select ra from imp) when 'Inês' then (select ig from imp) end
$$;
create function pg_temp.num(v text) returns numeric language sql immutable as $$
  select case when v ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then v::numeric end
$$;

-- ───────── carros ─────────
insert into nikki.cars (household_id, owner_id, name, plate, annual_insurance, annual_tax, annual_other, archived, external_ref)
select i.h, pg_temp.who_name(c.j->>'owner'), coalesce(nullif(trim(c.j->>'name'), ''), 'Carro'), nullif(trim(c.j->>'plate'), ''),
       coalesce(pg_temp.num(c.j->>'annual_insurance'), 0), coalesce(pg_temp.num(c.j->>'annual_tax'), 0),
       coalesce(pg_temp.num(c.j->>'annual_other'), 0), coalesce((c.j->>'archived')::boolean, false),
       'old:car:' || (c.j->>'id')
from old_cars c, imp i
on conflict (household_id, external_ref) where external_ref is not null do update
  set owner_id = excluded.owner_id, name = excluded.name, plate = excluded.plate, annual_insurance = excluded.annual_insurance,
      annual_tax = excluded.annual_tax, annual_other = excluded.annual_other, archived = excluded.archived;

-- O carro de uma despesa antiga: pelo id e, nas mais antigas, pelo nome.
create temp table imp_car on commit drop as
select c.j->>'id' as key, n.id from old_cars c join nikki.cars n on n.external_ref = 'old:car:' || (c.j->>'id')
union all
select lower(trim(c.j->>'name')), n.id from old_cars c join nikki.cars n on n.external_ref = 'old:car:' || (c.j->>'id')
where lower(trim(c.j->>'name')) not in (select lower(trim(j->>'name')) from old_cars group by 1 having count(*) > 1);

-- ───────── despesas ─────────
-- A partilha vem do valor ponderado (weighted_amount), que era o que contava nas contas a dois da app antiga:
--   0 → só de quem pagou; igual ao valor → toda do outro; o resto → partilhada, com a parte de quem pagou.
create temp table imp_tx on commit drop as
with t as (
  select j, j->>'id' as id, pg_temp.num(j->>'amount') as amount, pg_temp.who(j->>'paid_by') as paid_by,
         coalesce((j->>'shared')::boolean, false) as shared, coalesce(j->>'split_type', 'none') as split_type,
         pg_temp.num(j->>'weighted_amount') as w
  from old_tx
), s as (
  select t.*, case when not shared then 0
                   when w is not null then w
                   when split_type = 'full' then amount
                   when split_type = 'equal' then amount / 2
                   else 0 end as owed
  from t
)
select s.*,
       case when s.amount is null or s.amount <= 0 then 'valor zero ou negativo'
            when s.paid_by is null then 'quem pagou desconhecido'
            when (j->>'date') is null then 'sem data'
            when s.owed <> 0 and abs(s.owed - s.amount) >= 0.005
                 and (1 - s.owed / s.amount) not between 0.1 and 0.9 then 'partilha fora de 10–90 %'
       end as skip,
       case when s.owed = 0 then 'mine' when abs(s.owed - s.amount) < 0.005 then 'other' else 'shared' end as split
from s;

insert into nikki.expenses (household_id, created_by, paid_by, other_id, amount, spent_on, category, split, payer_share,
                            note, car_id, source, external_ref)
select i.h, x.paid_by, x.paid_by, case when x.split = 'mine' then null when x.paid_by = i.ra then i.ig else i.ra end,
       round(x.amount, 2), (x.j->>'date')::date, coalesce(c.new, nullif(x.j->>'category', ''), 'Outros'), x.split,
       case when x.split = 'shared' then round(1 - x.owed / x.amount, 3) end,
       left(nullif(trim(x.j->>'description'), ''), 120),
       case when x.j->>'category' = 'Rides' then
         coalesce((select id from imp_car where key = x.j->>'car' limit 1), (select id from imp_car where key = lower(trim(x.j->>'car')) limit 1))
       end,
       'import', 'old:tx:' || x.id
from imp_tx x cross join imp i left join imp_cat c on c.old = x.j->>'category'
where x.skip is null
on conflict (household_id, external_ref) where external_ref is not null do update
  set created_by = excluded.created_by, paid_by = excluded.paid_by, other_id = excluded.other_id, amount = excluded.amount,
      spent_on = excluded.spent_on, category = excluded.category, split = excluded.split, payer_share = excluded.payer_share,
      note = excluded.note, car_id = excluded.car_id, updated_at = now();

-- Abastecimentos, oficina e outros dos carros: a Garagem lê-os daqui.
insert into nikki.car_logs (household_id, car_id, logged_on, odometer, litres, full_tank, kind, expense_id, amount, created_by, external_ref)
select e.household_id, e.car_id, e.spent_on,
       case when pg_temp.num(x.j->>'odometer') >= 0 then round(pg_temp.num(x.j->>'odometer'))::int end,
       case when pg_temp.num(x.j->>'litres') > 0 then round(pg_temp.num(x.j->>'litres'), 2) end,
       coalesce((x.j->>'full_tank')::boolean, false),
       case x.j->>'ride_type' when 'Fuel' then 'fuel' when 'Repair' then 'service' else 'other' end,
       e.id, e.amount, e.paid_by, 'old:ride:' || x.id
from imp_tx x join nikki.expenses e on e.external_ref = 'old:tx:' || x.id and e.household_id = (select h from imp)
where x.skip is null and e.car_id is not null
on conflict (household_id, external_ref) where external_ref is not null do update
  set car_id = excluded.car_id, logged_on = excluded.logged_on, odometer = excluded.odometer, litres = excluded.litres,
      full_tank = excluded.full_tank, kind = excluded.kind, expense_id = excluded.expense_id, amount = excluded.amount;

-- ───────── acertos entre os dois ─────────
-- Na app antiga, um acerto positivo é a Inês a pagar ao Rodrigo; negativo, o contrário.
insert into nikki.transfers (household_id, from_id, to_id, amount, made_on, note, created_by, external_ref)
select i.h, case when a > 0 then i.ig else i.ra end, case when a > 0 then i.ra else i.ig end, round(abs(a), 2),
       (s.j->>'date')::date, nullif(trim(s.j->>'note'), ''), case when a > 0 then i.ig else i.ra end, 'old:settle:' || (s.j->>'id')
from old_settle s cross join imp i cross join lateral (select pg_temp.num(s.j->>'amount') as a) v
where coalesce(a, 0) <> 0 and (s.j->>'date') is not null
on conflict (household_id, external_ref) where external_ref is not null do update
  set from_id = excluded.from_id, to_id = excluded.to_id, amount = excluded.amount, made_on = excluded.made_on,
      note = excluded.note, created_by = excluded.created_by;

-- ───────── saldo de abertura ─────────
-- amount_ra > 0 na antiga = a Inês devia ao Rodrigo = o Rodrigo tinha adiantado mais.
insert into nikki.ledger_openings (household_id, profile_a, profile_b, cutover, amount_a)
select i.h, least(i.ra, i.ig), greatest(i.ra, i.ig), (o.j->>'cutover_date')::date,
       round(case when i.ra < i.ig then 1 else -1 end * coalesce(pg_temp.num(o.j->>'amount_ra'), 0), 2)
from imp i cross join lateral (select j from old_open order by j->>'created_at' desc limit 1) o
on conflict (household_id, profile_a, profile_b) do update set cutover = excluded.cutover, amount_a = excluded.amount_a;

-- ───────── rendimentos ─────────
-- A app antiga guardava cada recebimento com data; a nova guarda o rendimento habitual. Fica a média mensal dos
-- últimos 12 meses completos de cada um (12 vezes por ano), para rever na app.
insert into nikki.incomes (household_id, profile_id, kind, label, amount, times_per_year, created_by, external_ref)
select i.h, pg_temp.who(r.j->>'user_id'), 'salario', 'Média de 12 meses (app antiga)',
       round(sum(pg_temp.num(r.j->>'amount')) / 12, 2), 12, pg_temp.who(r.j->>'user_id'), 'old:income:' || (r.j->>'user_id')
from old_inc r cross join imp i
where (r.j->>'date')::date >= date_trunc('month', current_date) - interval '12 months'
  and (r.j->>'date')::date < date_trunc('month', current_date)
  and pg_temp.who(r.j->>'user_id') is not null
group by i.h, r.j->>'user_id'
having sum(pg_temp.num(r.j->>'amount')) > 0
on conflict (household_id, external_ref) where external_ref is not null do update
  set amount = excluded.amount, updated_at = now();

-- ───────── património ─────────
-- property → casa (fora das contas da independência), vehicle → carro (idem), savings → conta remunerada,
-- investment → ETF, other → outro. A taxa anual esperada passa como estava (limitada a −20…30 %).
insert into nikki.assets (household_id, owner_id, name, kind, invested, expected_return, external_ref)
select i.h, pg_temp.who(a.j->>'user_id'), coalesce(nullif(trim(a.j->>'name'), ''), 'Ativo'),
       k.kind, k.kind not in ('casa', 'carro'),
       least(30, greatest(-20, coalesce(round(pg_temp.num(a.j->>'annual_return'), 2), 0))), 'old:asset:' || (a.j->>'id')
from old_assets a cross join imp i
cross join lateral (select case a.j->>'category' when 'property' then 'casa' when 'vehicle' then 'carro'
                                               when 'savings' then 'remunerada' when 'investment' then 'etf' else 'outro' end as kind) k
on conflict (household_id, external_ref) where external_ref is not null do update
  set owner_id = excluded.owner_id, name = excluded.name, kind = excluded.kind, invested = excluded.invested,
      expected_return = excluded.expected_return;

-- Histórico de valores: um valor por ativo e por dia (o último registado nesse dia), mais o valor atual no dia em que
-- foi mexido pela última vez.
insert into nikki.asset_snapshots (asset_id, household_id, on_date, value)
select distinct on (n.id, v.on_date) n.id, n.household_id, v.on_date, round(v.value, 2)
from (
  select s.j->>'asset_id' as old_id, (s.j->>'snapshot_date')::date as on_date, pg_temp.num(s.j->>'value') as value,
         s.j->>'created_at' as at, 0 as pri
  from old_snaps s where s.j->>'asset_id' is not null
  union all
  select a.j->>'id', coalesce((a.j->>'updated_at')::timestamptz, (a.j->>'created_at')::timestamptz)::date,
         pg_temp.num(a.j->>'current_value'), coalesce(a.j->>'updated_at', a.j->>'created_at'), 1
  from old_assets a
) v
join nikki.assets n on n.external_ref = 'old:asset:' || v.old_id and n.household_id = (select h from imp)
where v.value >= 0 and v.on_date is not null
order by n.id, v.on_date, v.pri desc, v.at desc
on conflict (asset_id, on_date) do update set value = excluded.value;

-- ───────── o que foi apagado na app antiga desde a última importação ─────────
delete from nikki.car_logs l using imp i where l.household_id = i.h and l.external_ref like 'old:ride:%'
  and substr(l.external_ref, 10) not in (select x.id from imp_tx x join nikki.expenses e on e.external_ref = 'old:tx:' || x.id
                                         where x.skip is null and e.car_id is not null);
delete from nikki.expenses e using imp i where e.household_id = i.h and e.external_ref like 'old:tx:%'
  and substr(e.external_ref, 8) not in (select id from imp_tx where skip is null);
delete from nikki.transfers t using imp i where t.household_id = i.h and t.external_ref like 'old:settle:%'
  and substr(t.external_ref, 12) not in (select j->>'id' from old_settle);
delete from nikki.assets a using imp i where a.household_id = i.h and a.external_ref like 'old:asset:%'
  and substr(a.external_ref, 11) not in (select j->>'id' from old_assets);
update nikki.cars c set archived = true from imp i where c.household_id = i.h and c.external_ref like 'old:car:%'
  and substr(c.external_ref, 9) not in (select j->>'id' from old_cars);

-- Os módulos que estes dados usam ficam ligados.
insert into nikki.household_modules (household_id, module, enabled_by)
select i.h, m, i.ra from imp i, unnest(array['garagem', 'patrimonio']) m
on conflict do nothing;

-- ───────── conferir ─────────
-- 1. Linhas antigas que não passaram, e porquê.
select 'despesa não importada' as o_que, x.id, x.j->>'date' as data, x.j->>'amount' as valor, x.j->>'description' as nota, x.skip as porque
from imp_tx x where x.skip is not null
union all
select 'despesa do carro sem carro', x.id, x.j->>'date', x.j->>'amount', x.j->>'car', 'carro não encontrado'
from imp_tx x join nikki.expenses e on e.external_ref = 'old:tx:' || x.id
where x.skip is null and x.j->>'category' = 'Rides' and nullif(x.j->>'car', '') is not null and e.car_id is null
order by 1, 3;

-- 2. Contagens e totais: antiga e nova lado a lado.
select 'despesas' as o_que, (select count(*) from imp_tx) as antiga, (select count(*) from imp_tx where skip is null) as importavel,
       (select count(*) from nikki.expenses where household_id = (select h from imp) and external_ref like 'old:tx:%') as nova
union all select 'soma das despesas (€)', (select round(sum(amount)) from imp_tx), (select round(sum(amount)) from imp_tx where skip is null),
       (select round(sum(amount)) from nikki.expenses where household_id = (select h from imp) and external_ref like 'old:tx:%')
union all select 'acertos', (select count(*) from old_settle), null,
       (select count(*) from nikki.transfers where household_id = (select h from imp) and external_ref like 'old:settle:%')
union all select 'carros', (select count(*) from old_cars), null,
       (select count(*) from nikki.cars where household_id = (select h from imp) and external_ref like 'old:car:%')
union all select 'registos de carro', (select count(*) from imp_tx where skip is null and j->>'category' = 'Rides'), null,
       (select count(*) from nikki.car_logs where household_id = (select h from imp) and external_ref like 'old:ride:%')
union all select 'ativos', (select count(*) from old_assets), null,
       (select count(*) from nikki.assets where household_id = (select h from imp) and external_ref like 'old:asset:%');

-- 3. O saldo «Entre nós» do lado do Rodrigo (positivo = o Rodrigo adiantou mais), calculado como a app antiga
--    e como a nova. Têm de bater (diferenças de cêntimos só nas partilhas que não eram 50/50).
with o as (select coalesce((select pg_temp.num(j->>'amount_ra') from old_open order by j->>'created_at' desc limit 1), 0) as v,
                  coalesce((select (j->>'cutover_date')::date from old_open order by j->>'created_at' desc limit 1), '-infinity'::date) as since)
select round(o.v
         + coalesce((select sum(case when x.j->>'paid_by' = 'RA' then x.owed else -x.owed end) from imp_tx x
                     where x.shared and (x.j->>'date')::date >= o.since), 0)
         - coalesce((select sum(pg_temp.num(s.j->>'amount')) from old_settle s where (s.j->>'date')::date >= o.since), 0), 2) as saldo_app_antiga,
       round(nikki.pair_balance((select h from imp), (select ra from imp), (select ig from imp)), 2) as saldo_app_nova
from o;

commit;
