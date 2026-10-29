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
  assert (select status || '/' || approved_via from nikki.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'active/founder', 'a primeira conta fica ativa';
  assert (select profile_id from nikki.app_admins) = '00000000-0000-0000-0000-00000000000a', 'e administra a app';
  assert (select count(*) from nikki.profiles where status = 'pending') = 2, 'as outras ficam à espera';
  assert (select email from nikki.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'ines@exemplo.pt', 'e-mail guardado';
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
  assert (select status from nikki.profiles where id = auth.uid()) = 'active', 'quem entra com convite fica ativa sem esperar';
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

-- Os dois são iguais: a Inês também muda a taxa; convidar mais alguém não dá (a casa já tem duas pessoas)
do $$ begin
  update nikki.share_ratios set ratio_a = 0.6;
  assert found, 'a Inês também muda a taxa';
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
  assert (select count(*) from nikki.household_modules) = 0, 'estranho: módulos';
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

-- Eventos «só para mim»: os outros só veem a hora («Rodrigo tem planos»), e quem não é da casa não vê nada
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.events (household_id, title, starts_at, owner_id, private, created_by)
  select v::uuid, 'Médico', '2026-10-29 10:00+00', auth.uid(), true, auth.uid() from ctx where k = 'h';
insert into nikki.events (household_id, title, starts_at, created_by)
  select v::uuid, 'Jantar com amigos', '2026-10-30 20:00+00', auth.uid() from ctx where k = 'h';
do $$ begin
  assert (select count(*) from nikki.events) = 2, 'o dono lê os seus «só para mim»';
  assert (select count(*) from nikki.busy_slots((select v::uuid from ctx where k = 'h'), '2026-10-01', '2026-11-30')) = 0, 'os seus não aparecem como «tem planos»';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from nikki.events) = 1, 'a Inês só lê o evento da casa';
  assert (select count(*) from nikki.events where title = 'Médico') = 0, 'o título não sai da base';
  assert (select count(*) from nikki.busy_slots((select v::uuid from ctx where k = 'h'), '2026-10-01', '2026-11-30')) = 1, 'mas vê que o Rodrigo tem planos';
  assert (select owner_id from nikki.busy_slots((select v::uuid from ctx where k = 'h'), '2026-10-01', '2026-11-30')) = '00000000-0000-0000-0000-00000000000a', 'e de quem é';
  assert (select count(*) from nikki.busy_slots((select v::uuid from ctx where k = 'h'), '2026-11-01', '2026-11-30')) = 0, 'só no intervalo pedido';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from nikki.busy_slots((select v::uuid from ctx where k = 'h'), '2026-10-01', '2026-11-30')) = 0, 'quem não é da casa não vê nada';
  assert (select count(*) from nikki.events) = 0, 'nem os eventos';
end $$;
rollback;

-- Contas: à espera não entra; pedido; a administração aprova (cria a casa pedida) ou recusa; casas de duas pessoas;
-- suspensão. A administração vê contas, casas, módulos e números, nunca o que está dentro das casas.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'dora@exemplo.pt', '{}'), ('00000000-0000-0000-0000-00000000000e', 'eva@exemplo.pt', '{}'), ('00000000-0000-0000-0000-00000000000f', 'fausto@exemplo.pt', '{}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  begin perform nikki.create_household('Casa do Carlos'); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'conta à espera de aprovação', sqlerrm; end;
  begin perform nikki.admin_people(); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'só para a administração da app', sqlerrm; end;
  begin update nikki.profiles set status = 'active' where id = auth.uid(); raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  begin insert into nikki.tickets (kind, body) values ('ideia', 'Quero entrar'); raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  perform nikki.request_account('  Casa do Carlos ', 'Somos dois');
  update nikki.profiles set name = 'Carlos' where id = auth.uid();
  assert (select request ->> 'house' from nikki.profiles where id = auth.uid()) = 'Casa do Carlos', 'pedido guardado';
  assert (select name from nikki.profiles where id = auth.uid()) = 'Carlos', 'o nome muda-se';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin perform nikki.admin_kpis(); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'só para a administração da app', sqlerrm; end;
  begin perform email from nikki.profiles where id = '00000000-0000-0000-0000-00000000000a'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from nikki.profiles) = 2, 'a Inês vê-se a ela e ao Rodrigo, não quem está à espera';
  perform nikki.touch();
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare people jsonb := nikki.admin_people(); k jsonb := nikki.admin_kpis(); h uuid; begin
  assert jsonb_array_length(people) = 6, 'a administração vê todas as contas';
  assert (select x ->> 'email' from jsonb_array_elements(people) x where x ->> 'id' = '00000000-0000-0000-0000-00000000000c') = 'estranho@exemplo.pt', 'com o e-mail';
  assert (select x -> 'request' ->> 'house' from jsonb_array_elements(people) x where x ->> 'id' = '00000000-0000-0000-0000-00000000000c') = 'Casa do Carlos', 'e o pedido';
  assert (k -> 'accounts' ->> 'pending')::int = 4 and (k -> 'accounts' ->> 'active')::int = 2, 'contas por estado: ' || k;
  assert (k ->> 'houses')::int = 1 and (k ->> 'houses_two')::int = 1, 'uma casa com duas pessoas';
  assert (k ->> 'seen_7d')::int = 1, 'quem abriu a app';
  assert (select count(*) from jsonb_array_elements(nikki.admin_houses() -> 0 -> 'modules')) = 4, 'módulos de origem';
  assert (nikki.admin_people() || nikki.admin_houses() || jsonb_build_array(k))::text !~* 'amount|title|Leite|Supermercado|Lazer|56\.77', 'nada de dentro das casas';
  h := nikki.admin_decide('00000000-0000-0000-0000-00000000000c', true);
  assert h is not null, 'aprovar cria a casa pedida';
  assert (select count(*) from nikki.households) = 1, 'e a administração não entra nela';
  insert into ctx values ('hc', h);
  perform nikki.admin_decide('00000000-0000-0000-0000-00000000000f', false);
  begin perform nikki.admin_decide('00000000-0000-0000-0000-00000000000f', true); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'pedido não encontrado', sqlerrm; end;
  begin perform nikki.admin_pause(auth.uid(), true); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'não podes suspender a tua conta', sqlerrm; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select name from nikki.households) = 'Casa do Carlos', 'o Carlos entra na casa que pediu';
  assert (select role from nikki.memberships where profile_id = auth.uid()) = 'admin', 'a administrar a casa';
  assert (select count(*) from nikki.household_modules) = 4, 'com os módulos de origem';
  assert (select count(*) from nikki.shopping_items) = 0, 'e sem ver a casa do Rodrigo';
end $$;
insert into nikki.shopping_items (household_id, name, created_by) select v::uuid, 'Pão', auth.uid() from ctx where k = 'hc';
insert into nikki.invites (household_id, email, created_by) select v::uuid, 'dora@exemplo.pt', auth.uid() from ctx where k = 'hc';
insert into nikki.invites (household_id, email, created_by) select v::uuid, 'eva@exemplo.pt', auth.uid() from ctx where k = 'hc';
insert into ctx select email, code from nikki.invites where household_id = (select v::uuid from ctx where k = 'hc');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  perform nikki.accept_invite((select v from ctx where k = 'dora@exemplo.pt'));
  assert (select status from nikki.profiles where id = auth.uid()) = 'active', 'a segunda pessoa entra sem esperar';
  assert (select count(*) from nikki.shopping_items) = 1, 'e vê a casa';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  begin perform nikki.accept_invite((select v from ctx where k = 'eva@exemplo.pt')); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'a casa já tem duas pessoas', sqlerrm; end;
  assert (select status from nikki.profiles where id = auth.uid()) = 'pending', 'e a Eva continua à espera';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  insert into nikki.invites (household_id, email, created_by) select v::uuid, 'x@y.pt', auth.uid() from ctx where k = 'hc';
  raise exception 'devia falhar';
exception when insufficient_privilege then null; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
do $$ begin
  assert (select status from nikki.profiles where id = auth.uid()) = 'declined', 'pedido recusado';
  begin perform nikki.accept_invite((select v from ctx where k = 'eva@exemplo.pt')); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'conta sem acesso', sqlerrm; end;
  begin perform nikki.create_household('Casa'); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'conta sem acesso', sqlerrm; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform nikki.admin_pause('00000000-0000-0000-0000-00000000000d', true); end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  assert (select count(*) from nikki.households) = 0, 'suspensa não vê a casa';
  assert (select count(*) from nikki.shopping_items) = 0, 'nem as compras';
  begin insert into nikki.shopping_items (household_id, name, created_by) select v::uuid, 'X', auth.uid() from ctx where k = 'hc'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare k jsonb; begin
  perform nikki.admin_pause('00000000-0000-0000-0000-00000000000d', false);
  k := nikki.admin_kpis();
  assert (k -> 'accounts' ->> 'active')::int = 4, 'Rodrigo, Inês, Carlos e Dora: ' || k;
  assert (k -> 'accounts' ->> 'declined')::int = 1 and (k -> 'accounts' ->> 'pending')::int = 1, 'Fausto recusado, Eva à espera';
  assert (k ->> 'houses_two')::int = 2, 'duas casas com duas pessoas';
  assert (k ->> 'approval_hours') is not null, 'tempo até aprovar';
  assert (select count(*) from jsonb_array_elements(k -> 'modules')) = 4 and (k -> 'modules' -> 0 ->> 'houses')::int = 2, 'módulos por casa';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin assert (select count(*) from nikki.shopping_items) = 1, 'reativada volta a ver'; end $$;
rollback;

-- Módulos: os dois ligam e desligam (são iguais)
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from nikki.household_modules) = 4, 'a Inês vê os módulos da casa';
end $$;
insert into nikki.household_modules (household_id, module, enabled_by) select v::uuid, 'garagem', auth.uid() from ctx where k = 'h';
delete from nikki.household_modules where module = 'compras';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select string_agg(module, ',' order by module) from nikki.household_modules) = 'agenda,casa,contas,garagem', 'garagem ligada, compras desligada';
  begin insert into nikki.household_modules (household_id, module, enabled_by) select v::uuid, 'casino', auth.uid() from ctx where k = 'h'; raise exception 'devia falhar';
  exception when check_violation then null; end;
end $$;
rollback;

-- Tickets com captura: cada um vê os seus; a administração vê todos, muda o estado e responde
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into nikki.tickets (kind, body, screen, shot) values ('ideia', 'Lembrar a renda no dia 1', '/inicio', '00000000-0000-0000-0000-00000000000b/renda.png');
insert into storage.objects (bucket_id, name) values ('tickets', '00000000-0000-0000-0000-00000000000b/renda.png');
do $$ begin
  assert (select count(*) from nikki.tickets) = 1, 'a Inês vê o seu ticket';
  begin update nikki.tickets set status = 'feito'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('tickets', '00000000-0000-0000-0000-00000000000a/x.png'); raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  begin insert into nikki.tickets (kind, body) values ('problema', 'ok'); raise exception 'devia falhar';
  exception when check_violation then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare t jsonb := nikki.admin_tickets(); begin
  assert (select count(*) from nikki.tickets) = 0, 'diretamente, o Rodrigo só lê os seus';
  assert jsonb_array_length(t) = 1 and t -> 0 ->> 'by' = 'Ines', 'pela administração vê todos';
  assert (select count(*) from storage.objects where bucket_id = 'tickets') = 1, 'e as capturas';
  perform nikki.admin_ticket((t -> 0 ->> 'id')::uuid, 'feito', 'Já está! ');
  assert (nikki.admin_kpis() -> 'tickets' ->> 'feito')::int = 1, 'conta nos números';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin assert (select status || ' — ' || reply from nikki.tickets) = 'feito — Já está!', 'a Inês vê a resposta'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin assert (select count(*) from storage.objects) = 0, 'as capturas dos outros não'; end $$;
rollback;

-- Património: tipos e papéis dos ativos, rendimentos dos dois e a despesa do casal só em totais por mês
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.assets (household_id, owner_id, name, kind, role, expected_return) select v::uuid, null, 'Certificados de Aforro', 'aforro', 'emergency', 2.5 from ctx where k = 'h';
insert into nikki.incomes (household_id, profile_id, kind, amount, times_per_year) select v::uuid, auth.uid(), 'salario', 1500, 14 from ctx where k = 'h';
insert into nikki.incomes (household_id, profile_id, kind, amount, times_per_year) select v::uuid, '00000000-0000-0000-0000-00000000000b', 'alimentacao', 165, 11 from ctx where k = 'h';
do $$ begin
  begin insert into nikki.assets (household_id, name, kind) select v::uuid, 'Casino', 'casino' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when check_violation then null; end;
  begin insert into nikki.assets (household_id, name, kind, role) select v::uuid, 'X', 'etf', 'reforma' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when check_violation then null; end;
  begin insert into nikki.incomes (household_id, profile_id, kind, amount) select v::uuid, '00000000-0000-0000-0000-00000000000c', 'salario', 900 from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  -- 100 + 24 + 12,35 + 46,80 + 30: inclui a despesa só da Inês, que o Rodrigo não vê uma a uma
  assert (select count(*) from nikki.expenses) = 4, 'o Rodrigo continua sem ver a despesa só da Inês';
  assert (select total from nikki.house_month_totals((select v::uuid from ctx where k = 'h'), date_trunc('month', current_date)::date)) = 213.15, 'total do casal no mês';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from nikki.incomes) = 2, 'a Inês vê os rendimentos dos dois';
  assert (select count(*) from nikki.assets where role = 'emergency') = 1, 'e o fundo de emergência da casa';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from nikki.incomes) = 0, 'quem não é da casa não vê rendimentos';
  assert (select count(*) from nikki.house_month_totals((select v::uuid from ctx where k = 'h'), '2000-01-01')) = 0, 'nem os totais';
end $$;
rollback;

-- Garagem: os dois juntam carros; quem não é da casa não; os registos (com o valor) são de toda a casa
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.cars (household_id, owner_id, name, annual_insurance) select v::uuid, '00000000-0000-0000-0000-00000000000b', 'Mini', 320 from ctx where k = 'h';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  begin insert into nikki.cars (household_id, name) select v::uuid, 'Intruso' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into nikki.car_logs (household_id, car_id, odometer, litres, amount, created_by) select (select v::uuid from ctx where k = 'h'), id, 18300, 33.1, 58.30, auth.uid() from nikki.cars where name = 'Mini';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select amount from nikki.car_logs) = 58.30, 'o Rodrigo vê o valor do abastecimento da Inês na Garagem';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin assert (select count(*) from nikki.car_logs) = 0, 'quem não é da casa não vê'; end $$;
rollback;

-- Casa: contas fixas e faturas são de toda a casa; uma despesa já perguntada (não é conta fixa) não mostra o valor
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into nikki.homes (household_id, tenure, imi) select v::uuid, 'credito', 320 from ctx where k = 'h';
insert into nikki.homes (household_id, name, tenure) select v::uuid, 'Praia', 'propria' from ctx where k = 'h';
insert into nikki.bills (household_id, home_id, kind, name, provider, keywords, unit) select v::uuid, (select id from nikki.homes where name = 'Casa'), 'luz', 'Luz', 'EDP', 'edp', 'kWh' from ctx where k = 'h';
insert into nikki.bill_payments (household_id, bill_id, amount, period_from, period_to, usage)
  select (select v::uuid from ctx where k = 'h'), id, 61.40, '2026-09-01', '2026-09-30', 248 from nikki.bills;
-- Uma fatura lida de um PDF, ainda por pagar (débito direto): sem despesa, com a data limite.
insert into nikki.bill_payments (household_id, bill_id, amount, period_from, period_to, usage, due_on, source)
  select (select v::uuid from ctx where k = 'h'), id, 58.10, '2026-10-01', '2026-10-31', 231, '2026-11-20', 'pdf' from nikki.bills;
do $$ begin
  begin insert into nikki.bill_payments (household_id, bill_id, amount, period_from, period_to) select (select v::uuid from ctx where k = 'h'), null, 10, '2026-09-01', '2026-09-30';
    raise exception 'devia falhar';
  exception when check_violation then null; end;
  begin insert into nikki.deadlines (household_id, title, due_on, kind, created_by) select v::uuid, 'IMI', '2027-05-31', 'imi', auth.uid() from ctx where k = 'h';
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select usage from nikki.bill_payments where source = 'manual') = 248, 'o Rodrigo vê a fatura da luz que a Inês registou';
  assert (select due_on from nikki.bill_payments where source = 'pdf') = '2026-11-20', 'e a lida do PDF, por pagar';
  assert (select count(*) from nikki.homes) = 2, 'e as duas casas';
  assert (select tenure from nikki.homes where name = 'Casa') = 'credito', 'e como é cada casa';
  assert (select count(*) from nikki.deadlines where kind = 'imi') = 1, 'e o prazo do IMI';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from nikki.bills) + (select count(*) from nikki.bill_payments) + (select count(*) from nikki.homes) = 0, 'quem não é da casa não vê';
  begin insert into nikki.bills (household_id, kind, name) select v::uuid, 'luz', 'Intrusa' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Casa, fase 2: tarefas, a fazer e garantias são da casa; o talão da garantia só o lê quem é da casa
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.chores (household_id, title, every_n, every_unit, next_on, assign, turn_id)
  select v::uuid, 'Mudar os lençóis', 2, 'week', '2026-11-01', 'rotate', auth.uid() from ctx where k = 'h';
insert into nikki.todos (household_id, title, owner_id, due_on) select v::uuid, 'Ligar ao canalizador', '00000000-0000-0000-0000-00000000000b', '2026-10-30' from ctx where k = 'h';
insert into nikki.warranties (household_id, item, store, bought_on, price, receipt_path)
  select v::uuid, 'Máquina de lavar', 'Worten', '2025-03-14', 429, v || '/talao.jpg' from ctx where k = 'h';
insert into storage.objects (bucket_id, name) select 'receipts', v || '/talao.jpg' from ctx where k = 'h';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into nikki.chore_logs (household_id, chore_id, done_on, done_by) select household_id, id, '2026-11-01', auth.uid() from nikki.chores;
do $$ begin
  assert (select count(*) from nikki.chores) = 1, 'a Inês vê as tarefas da casa';
  assert (select title from nikki.todos) = 'Ligar ao canalizador', 'e o que tem a fazer';
  assert (select item from nikki.warranties) = 'Máquina de lavar', 'e as garantias';
  assert (select count(*) from storage.objects where bucket_id = 'receipts') = 1, 'e o talão';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from nikki.chores) + (select count(*) from nikki.chore_logs) + (select count(*) from nikki.todos) + (select count(*) from nikki.warranties) = 0, 'quem não é da casa não vê';
  assert (select count(*) from storage.objects where bucket_id = 'receipts') = 0, 'nem o talão';
  begin insert into storage.objects (bucket_id, name) select 'receipts', v || '/meu.jpg' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('receipts', 'nao-e-uma-casa/x.jpg'); raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
-- A administração da app (o Rodrigo, fora da casa) não lê talões de casas de que não é membro: já coberto acima com
-- quem não é da casa; a política dos talões não tem exceção para administradores.
rollback;

-- Agenda: o «só para mim» que se repete chega ao outro só como horas e repetição; a ligação do calendário é pessoal
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into nikki.events (household_id, title, starts_at, ends_at, owner_id, private, repeat, weekdays, location, created_by)
  select v::uuid, 'Pilates', '2025-01-07 18:45+00', '2025-01-07 19:45+00', auth.uid(), true, 'weekly', '{2,4}', 'Estúdio Graça', auth.uid() from ctx where k = 'h';
insert into ctx select 'tok_b', nikki.calendar_token((select v::uuid from ctx where k = 'h'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare r record;
begin
  select * into r from nikki.busy_slots((select v::uuid from ctx where k = 'h'), '2026-10-01', '2026-11-01');
  assert r.repeat = 'weekly' and r.weekdays = '{2,4}', 'o Rodrigo vê as horas e a repetição do pilates da Inês (começou em 2025)';
  assert (select count(*) from nikki.events where title = 'Pilates') = 0, 'mas não o título';
  assert nikki.calendar_token((select v::uuid from ctx where k = 'h')) = nikki.calendar_token((select v::uuid from ctx where k = 'h')), 'a ligação mantém-se';
  assert nikki.calendar_token((select v::uuid from ctx where k = 'h')) <> (select v from ctx where k = 'tok_b'), 'e é só dele';
  assert length(nikki.calendar_token((select v::uuid from ctx where k = 'h'))) = 48, 'longa e aleatória';
end $$;
do $$ begin
  begin perform * from nikki.calendar_tokens; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare old text := (select v from ctx where k = 'tok_b');
begin
  assert nikki.calendar_token((select v::uuid from ctx where k = 'h'), true) <> old, 'trocar a ligação dá outra';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  begin perform nikki.calendar_token((select v::uuid from ctx where k = 'h')); raise exception 'devia falhar';
  exception when others then assert sqlerrm = 'sem acesso', sqlerrm; end;
end $$;
rollback;

-- Calendário na hora: cada um vê só o estado das suas ligações, nunca o acesso guardado
begin;
insert into nikki.calendar_links (profile_id, household_id, provider, account_hint, calendar_ref, secret_enc)
  select '00000000-0000-0000-0000-00000000000a', v::uuid, 'icloud', 'r•••@icloud.com', 'https://p1-caldav.icloud.com/1/calendars/nikki/', 'segredo' from ctx where k = 'h';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select account_hint from nikki.calendar_links) = 'r•••@icloud.com', 'o Rodrigo vê a sua ligação';
  begin perform secret_enc from nikki.calendar_links; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  begin insert into nikki.calendar_links (profile_id, household_id, provider) select auth.uid(), v::uuid, 'google' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin assert (select count(*) from nikki.calendar_links) = 0, 'a Inês não vê a ligação do Rodrigo'; end $$;
rollback;

-- Housekeeping: entra por convite (mesmo com a casa cheia), não conta como pessoa da casa e vê só as tarefas das
-- visitas, as mensagens e as compras; nunca dinheiro, agenda, casa ou garagem
begin;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000d', 'maria@exemplo.pt', '{"name":"Maria"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.housekeeping (household_id, name, weekdays, monthly_pay, pay_day) select v::uuid, 'Maria', '{2,5}', 320, 28 from ctx where k = 'h';
insert into nikki.hk_tasks (household_id, title, repeat) select v::uuid, 'Casas de banho', 'visit' from ctx where k = 'h';
-- Uma manutenção da casa pedida ao housekeeping (fica ligada à tarefa)
insert into nikki.chores (household_id, kind, title, every_n, every_unit, next_on, assign, created_by) select v::uuid, 'maintenance', 'Lavar o filtro do exaustor', 3, 'month', current_date, 'anyone', auth.uid() from ctx where k = 'h';
insert into nikki.hk_tasks (household_id, title, repeat, due_on, chore_id) select v::uuid, 'Lavar o filtro do exaustor', 'once', current_date, (select id from nikki.chores where title = 'Lavar o filtro do exaustor') from ctx where k = 'h';
insert into nikki.invites (household_id, email, role, created_by) select v::uuid, 'maria@exemplo.pt', 'staff', auth.uid() from ctx where k = 'h';
insert into ctx select 'code_m', code from nikki.invites where role = 'staff';
insert into nikki.events (household_id, title, starts_at, created_by) select v::uuid, 'Jantar', now(), auth.uid() from ctx where k = 'h';
insert into ctx select 'shop_n', count(*)::text from nikki.shopping_items;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  assert nikki.accept_invite((select v from ctx where k = 'code_m')) = (select v::uuid from ctx where k = 'h'), 'a Maria entra com a casa cheia';
  assert (select role from nikki.memberships where profile_id = auth.uid()) = 'staff', 'como housekeeping';
  assert (select profile_id from nikki.housekeeping) = auth.uid(), 'ligada à ficha dela';
  assert (select count(*) from nikki.hk_tasks) = 2, 'vê as tarefas';
  assert (select count(*) from nikki.shopping_items) = (select v::int from ctx where k = 'shop_n') and (select v::int from ctx where k = 'shop_n') > 0, 'e as compras';
  assert (select count(*) from nikki.memberships) = 3, 'e quem é da casa (nomes)';
  assert (select count(*) from nikki.events) + (select count(*) from nikki.expenses) + (select count(*) from nikki.deadlines) + (select count(*) from nikki.bills) + (select count(*) from nikki.cars) + (select count(*) from nikki.household_modules) = 0, 'mas nada do resto da casa';
end $$;
insert into nikki.hk_log (household_id, task_id, done_on) select household_id, id, current_date from nikki.hk_tasks;
insert into nikki.hk_messages (household_id, body) select v::uuid, 'Falta detergente da loiça.' from ctx where k = 'h';
-- Uma fotografia: põe-a na pasta da casa e manda-a sem texto
insert into storage.objects (bucket_id, name, owner) select 'hk', v || '/torneira.jpg', auth.uid() from ctx where k = 'h';
insert into nikki.hk_messages (household_id, body, photo_path) select v::uuid, '', v || '/torneira.jpg' from ctx where k = 'h';
do $$ begin
  begin insert into nikki.hk_messages (household_id, body) select v::uuid, '  ' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when check_violation then null; end;
end $$;
insert into nikki.shopping_items (household_id, name, aisle, created_by) select v::uuid, 'Detergente da loiça', 'Limpeza', auth.uid() from ctx where k = 'h';
do $$ begin
  begin insert into nikki.hk_tasks (household_id, title) select v::uuid, 'Inventada' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  begin update nikki.housekeeping set monthly_pay = 999; exception when insufficient_privilege then null; end;
  begin insert into nikki.expenses (household_id, created_by, paid_by, amount, category, split) select v::uuid, auth.uid(), auth.uid(), 10, 'Casa', 'mine' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select monthly_pay from nikki.housekeeping) = 320, 'o valor não mudou';
  assert (select count(*) from nikki.hk_log) = 2, 'o Rodrigo vê o que ela fez';
  assert (select count(*) from nikki.hk_messages) = 2, 'e as mensagens (uma com fotografia)';
  assert (select count(*) from storage.objects where bucket_id = 'hk') = 1, 'e vê a fotografia';
  assert (select next_on from nikki.chores where title = 'Lavar o filtro do exaustor') = (current_date + interval '3 months')::date, 'a manutenção avançou 3 meses';
  assert (select count(*) from nikki.chore_logs where note = 'Housekeeping') = 1, 'e ficou registada como feita pelo housekeeping';
  assert (select count(*) from nikki.shopping_items where created_by = '00000000-0000-0000-0000-00000000000d') = 1, 'e o que ela pediu';
  assert nikki.has_room((select v::uuid from ctx where k = 'h')) = false, 'a casa continua com duas pessoas (o housekeeping não conta)';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'hk') = 0, 'quem é de fora não vê as fotografias'; end $$;
rollback;

-- Notificações: cada um vê e gere só os seus aparelhos; o que já foi enviado não se lê da app
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.push_subs (endpoint, profile_id, household_id, p256dh, auth) select 'https://push/r', auth.uid(), v::uuid, 'k', 'a' from ctx where k = 'h';
do $$ begin
  begin insert into nikki.push_subs (endpoint, profile_id, household_id, p256dh, auth) select 'https://push/x', '00000000-0000-0000-0000-00000000000b', v::uuid, 'k', 'a' from ctx where k = 'h'; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
  begin perform 1 from nikki.push_sent; raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin assert (select count(*) from nikki.push_subs) = 0, 'a Inês não vê os aparelhos do Rodrigo'; end $$;
rollback;

-- Ginásio: as avaliações e as escolhas são só do próprio (nem a outra pessoa da casa as vê)
begin;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into nikki.gym_prefs (profile_id, fields) values (auth.uid(), '{weight,fat,meta_age}');
insert into nikki.gym_assessments (profile_id, measured_on, values) values (auth.uid(), current_date, '{"weight": 78.4, "meta_age": 31}');
do $$ begin
  assert (select count(*) from nikki.gym_fields where key = 'meta_age') = 1, 'idade metabólica existe';
  begin insert into nikki.gym_assessments (profile_id, values) values ('00000000-0000-0000-0000-00000000000b', '{}'); raise exception 'devia falhar';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from nikki.gym_assessments where profile_id <> auth.uid()) + (select count(*) from nikki.gym_prefs where profile_id <> auth.uid()) = 0, 'a Inês não vê o ginásio do Rodrigo';
end $$;
rollback;

\echo 'rls_test: tudo certo'
