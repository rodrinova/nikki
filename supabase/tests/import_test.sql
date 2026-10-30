-- Testes da importação: correr depois de local_stubs.sql, da migração, de import_seed.sql e de import_from_public.sql
-- (com os e-mails rodrigo@exemplo.pt / ines@exemplo.pt). Falha com exceção se algo não bater.
\set ON_ERROR_STOP on
do $$
declare ra uuid := '00000000-0000-0000-0000-00000000000a'; ig uuid := '00000000-0000-0000-0000-00000000000b';
        h uuid := '00000000-0000-0000-0000-0000000000f1'; golf uuid; zoe uuid;
begin
  select id into golf from nikki.cars where name = 'Golf'; select id into zoe from nikki.cars where name = 'Zoe';
  assert (select owner_id from nikki.cars where id = golf) = ra and (select owner_id from nikki.cars where id = zoe) = ig, 'donos dos carros';
  assert (select annual_insurance from nikki.cars where id = golf) = 320, 'seguro do carro';
  assert (select count(*) from nikki.expenses where split = 'shared' and payer_share = 0.5) = 4, 'meias partilhas';
  assert (select other_id from nikki.expenses where note = 'Jantar do Rodrigo' and split = 'other') = ra, 'paga para o outro';
  assert (select category || '/' || split from nikki.expenses where note = 'Cabeleireiro') = 'Beleza/mine', 'categoria e só minha';
  assert (select category from nikki.expenses where note = 'ETF') = 'Future Me', 'investir mantém-se';
  assert (select car_id from nikki.expenses where note = 'Revisão') = zoe, 'carro pelo nome';
  assert (select kind || '/' || odometer || '/' || litres || '/' || full_tank || '/' || amount from nikki.car_logs where car_id = golf) = 'fuel/42130/38.20/true/60.00', 'abastecimento';
  assert (select kind from nikki.car_logs where car_id = zoe) = 'service', 'oficina';
  assert (select from_id from nikki.transfers where amount = 20) = ig and (select from_id from nikki.transfers where amount = 5) = ra, 'sentido dos acertos';
  assert (select cutover from nikki.ledger_openings) = '2026-01-01', 'data de corte';
  assert nikki.pair_balance(h, ra, ig) = -539.25 and nikki.pair_balance(h, ig, ra) = 539.25, 'saldo entre nós';
  assert (select archived and kind = 'casamento' and on_date = '2026-02-14' from nikki.occasions where name = 'Casamento'), 'o casamento é um evento arquivado';
  assert (select o.name || '/' || e.category from nikki.expenses e join nikki.occasions o on o.id = e.occasion_id where e.note = 'Fotógrafo') = 'Casamento/Outros', 'despesa ligada ao evento';
  assert (select amount || '/' || times_per_year from nikki.incomes where profile_id = ra) = '1800.00/12', 'rendimento médio de 12 meses';
  assert not exists (select 1 from nikki.incomes where profile_id = ig), 'o mês corrente não conta';
  assert (select kind || '/' || invested || '/' || expected_return from nikki.assets where name = 'Casa') = 'casa/false/30.00', 'casa fora da independência, taxa limitada';
  assert (select string_agg(on_date || '=' || value, ',' order by on_date) from nikki.asset_snapshots s join nikki.assets a on a.id = s.asset_id where a.name = 'VWCE')
         = '2026-06-01=10500.00,2026-10-20=12000.00', 'histórico: o último do dia e o valor atual';
  assert (select count(*) from nikki.household_modules where household_id = h and module in ('garagem', 'patrimonio', 'eventos')) = 3, 'módulos ligados';
  assert (select count(*) from public.transactions) = 9, 'a app antiga fica igual';
end $$;
select 'import_test: tudo certo' as resultado;
