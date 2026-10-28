-- Testes do schema nikki: regras de acesso (RLS), convites, administradores e contas a dois.
-- Correr numa base local com tests/local_stubs.sql e a migração aplicada. Falha com exceção se algo não bater.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'rodrigo@exemplo.pt', '{"name":"Rodrigo"}'),
  ('00000000-0000-0000-0000-00000000000b', 'ines@exemplo.pt', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'estranho@exemplo.pt', '{}');

do $$ begin
  assert (select count(*) from nikki.profiles) = 3, 'perfil criado no registo';
  assert (select name from nikki.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Ines', 'nome a partir do e-mail';
end $$;

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- Rodrigo cria a casa e convida a Inês
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into ctx values ('h', nikki.create_household('A nossa casa'));
insert into nikki.invites (household_id, email, created_by) select v::uuid, 'ines@exemplo.pt', auth.uid() from ctx where k = 'h';
insert into ctx select 'code', code from nikki.invites;

-- Inês aceita pelo código
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert nikki.accept_invite(lower((select v from ctx where k = 'code'))) = (select v::uuid from ctx where k = 'h'), 'aceita pelo código';
  assert (select count(*) from nikki.memberships) = 2, 'a Inês vê os dois membros';
  assert (select role from nikki.memberships where profile_id = auth.uid()) = 'member', 'entra como membro';
end $$;
do $$ begin
  begin perform nikki.accept_invite((select v from ctx where k = 'code')); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'convite já usado', sqlerrm; end;
end $$;

-- Rodrigo (admin) define 60/40 e regista despesas
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.share_ratios (household_id, profile_a, profile_b, ratio_a)
  select v::uuid, '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 0.5 from ctx where k = 'h';
insert into nikki.expenses (household_id, created_by, paid_by, other_id, amount, category, split, payer_share)
  select v::uuid, auth.uid(), auth.uid(), '00000000-0000-0000-0000-00000000000b', 100, 'Supermercado', 'shared', 0.5 from ctx where k = 'h';
insert into nikki.expenses (household_id, created_by, paid_by, other_id, amount, category, split)
  select v::uuid, auth.uid(), auth.uid(), '00000000-0000-0000-0000-00000000000b', 24, 'Saúde', 'other' from ctx where k = 'h';
insert into nikki.expenses (household_id, created_by, paid_by, other_id, amount, category, split, payer_share)
  select v::uuid, auth.uid(), auth.uid(), '00000000-0000-0000-0000-00000000000b', 12.35, 'Supermercado', 'shared', 0.5 from ctx where k = 'h';

-- Inês: uma partilhada e uma só dela
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into nikki.expenses (household_id, created_by, paid_by, other_id, amount, category, split, payer_share)
  select v::uuid, auth.uid(), auth.uid(), '00000000-0000-0000-0000-00000000000a', 46.80, 'Restaurantes', 'shared', 0.5 from ctx where k = 'h';
insert into nikki.expenses (household_id, created_by, paid_by, amount, category)
  select v::uuid, auth.uid(), auth.uid(), 30, 'Lazer' from ctx where k = 'h';

do $$ declare h uuid := (select v::uuid from ctx where k = 'h'); begin
  assert (select count(*) from nikki.expenses) = 5, 'a Inês vê as suas e as que a envolvem';
  -- Rodrigo: 100×0,5 + 24 + 12,35×0,5 − 46,80×0,5 = 50 + 24 + 6,175 − 23,40 = 56,775 (exato, meio cêntimo incluído)
  assert nikki.pair_balance(h, '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a') = -56.775,
    'saldo do lado da Inês: ' || nikki.pair_balance(h, '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare h uuid := (select v::uuid from ctx where k = 'h'); begin
  assert (select count(*) from nikki.expenses) = 4, 'o Rodrigo não vê a despesa só da Inês';
  assert nikki.pair_balance(h, '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b') = 56.775, 'saldo do Rodrigo';
end $$;

-- A Inês transfere 56,78 → fica −0,005 a favor dela (o meio cêntimo não se perde)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into nikki.transfers (household_id, from_id, to_id, amount, created_by)
  select v::uuid, auth.uid(), '00000000-0000-0000-0000-00000000000a', 56.78, auth.uid() from ctx where k = 'h';
do $$ declare h uuid := (select v::uuid from ctx where k = 'h'); begin
  assert nikki.pair_balance(h, '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b') = -0.005, 'depois da transferência';
end $$;

-- Membro não muda a taxa nem convida
do $$ begin
  update nikki.share_ratios set ratio_a = 0.6;
  assert not found, 'membro não altera a taxa';
  begin insert into nikki.invites (household_id, email, created_by) select v::uuid, 'x@y.pt', auth.uid() from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;

-- Ginásio e objetivos pessoais: só o próprio
insert into nikki.gym_assessments (profile_id, values) values (auth.uid(), '{"fat": 25.3}');
insert into nikki.goals (household_id, owner_id, title, metric, target, due_on, created_by)
  select v::uuid, auth.uid(), 'Gordura abaixo de 25%', 'gym:fat', 25, '2026-12-31', auth.uid() from ctx where k = 'h';
insert into nikki.shopping_items (household_id, name, created_by) select v::uuid, 'Leite', auth.uid() from ctx where k = 'h';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from nikki.gym_assessments) = 0, 'ginásio da Inês é só dela';
  assert (select count(*) from nikki.goals) = 0, 'objetivo pessoal da Inês é só dela';
  assert (select count(*) from nikki.shopping_items) = 1, 'compras são da casa';
end $$;

-- Estranho não vê nada
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from nikki.households) = 0, 'estranho: casas';
  assert (select count(*) from nikki.expenses) = 0, 'estranho: despesas';
  assert (select count(*) from nikki.profiles) = 1, 'estranho: só o seu perfil';
  assert (select count(*) from nikki.shopping_items) = 0, 'estranho: compras';
  begin perform nikki.accept_invite('ZZZZZZ'); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'convite inválido', sqlerrm; end;
end $$;
do $$ begin
  insert into nikki.shopping_items (household_id, name, created_by) select v::uuid, 'Intruso', auth.uid() from ctx where k = 'h';
  raise exception 'devia falhar';
exception when insufficient_privilege then null; end $$;

reset role;
commit;

-- O último administrador não pode deixar de o ser
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update nikki.memberships set role = 'member' where profile_id = auth.uid();
do $$ begin
  set constraints all immediate;
  raise exception 'devia falhar';
exception when others then assert sqlerrm = 'a casa precisa de pelo menos um administrador', sqlerrm; end $$;
rollback;

\echo 'rls_test: tudo certo'
