-- Business places: run like authorization.sql (Supabase execute_sql or psql). Everything is rolled back.
begin;
set local statement_timeout = '20s';
set local plpgsql.check_asserts = on;
do $test$
declare
  owner uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  place public.places;
  denied boolean;
  joined record;
begin
  insert into auth.users(id, aud, role) values (owner, 'authenticated', 'authenticated'), (guest, 'authenticated', 'authenticated');
  insert into public.profiles(id, display_name) values (owner, 'Test Owner'), (guest, 'Test Guest');

  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin perform public.create_place('Bar'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'creating a place needs the business role';
  execute 'reset role';
  insert into public.user_roles(user_id, role_id, granted_by) values (owner, 7, null);

  execute 'set local role authenticated';
  place := public.create_place('  Natterium Bar ');
  assert place.name = 'Natterium Bar' and place.code ~ '^[a-z0-9]{10}$', 'place is created with a random code';
  assert (select code_key = 'v:' || place.code and name = 'Natterium Bar' from public.groups where id = place.group_id), 'place group carries the venue code and name';
  assert (select public.expires_at(m) = 'infinity' from public.group_members m where user_id = owner and group_id = place.group_id), 'owner membership is permanent';
  place := public.update_place(place.id, 'Natterium', 'https://natterium.com/menu', null, null);
  assert (select name = 'Natterium' from public.groups where id = place.group_id), 'renaming a place renames its group';
  denied := false;
  begin perform public.update_place(place.id, 'Natterium', 'javascript:alert(1)', null, null); exception when check_violation then denied := true; end;
  assert denied, 'links must be https';
  denied := false;
  begin perform public.update_place(place.id, 'Natterium', null, guest || '/' || gen_random_uuid() || '.pdf', null); exception when check_violation then denied := true; end;
  assert denied, 'menus must live in the owner''s folder';
  denied := false;
  begin perform public.update_place(place.id, 'Natterium', null, null, guest || '/' || gen_random_uuid() || '.jpg'); exception when check_violation then denied := true; end;
  assert denied, 'photos must live in the owner''s folder';
  denied := false;
  begin perform public.update_place(place.id, 'Natterium', 'https://natterium.com/menu', owner || '/' || gen_random_uuid() || '.pdf', null); exception when check_violation then denied := true; end;
  assert denied, 'a place has a menu link or a menu PDF, not both';

  perform set_config('request.jwt.claim.sub', guest::text, true);
  select * into joined from public.join_qr_group('v:' || place.code);
  assert joined.group_id = place.group_id and joined.name = 'Natterium', 'guests join the place group';
  assert joined.expires_at < now() + interval '1 day 1 minute', 'guests keep the 1-day window';
  assert (public.get_chat_overview()->'memberships'->0->'place'->>'owner_id')::uuid = owner, 'overview exposes the active venue';
  assert (public.get_chat_overview()->'memberships'->0->'place'->>'link_url') = 'https://natterium.com/menu', 'overview exposes the venue link';
  assert not exists (select 1 from public.places), 'guests cannot read places';
  denied := false;
  begin perform public.join_qr_group('v:unknown123'); exception when raise_exception then denied := true; end;
  assert denied, 'unknown venue codes are refused';
  assert not exists (select 1 from public.groups where code_key = 'v:unknown123'), 'unknown venue codes create no group';
  denied := false;
  begin perform public.update_place(place.id, 'Taken', null, null, null); exception when insufficient_privilege then denied := true; end;
  assert denied, 'only business accounts edit places';

  -- Lapsed plan: the QR still works as a plain group, the venue extras switch off.
  execute 'reset role';
  update public.user_roles set expires_at = now() - interval '1 second' where user_id = owner;
  execute 'set local role authenticated';
  assert public.get_chat_overview()->'memberships'->0->'place' = 'null'::jsonb, 'lapsed venue shows no extras';
  perform public.join_qr_group('v:' || place.code);
  assert (select public.expires_at(m) < 'infinity' from public.group_members m where user_id = owner and group_id = place.group_id), 'lapsed owner expires like anyone';
  perform set_config('request.jwt.claim.sub', owner::text, true);
  assert (select count(*) = 1 from public.places), 'lapsed owners still see their places';
  denied := false;
  begin perform public.delete_place(place.id); exception when insufficient_privilege then denied := true; end;
  assert denied, 'lapsed owners cannot manage places';

  -- Renewed plan, then a deleted place stops accepting joins.
  execute 'reset role';
  update public.user_roles set expires_at = null where user_id = owner;
  execute 'set local role authenticated';
  perform public.delete_place(place.id);
  perform set_config('request.jwt.claim.sub', guest::text, true);
  denied := false;
  begin perform public.join_qr_group('v:' || place.code); exception when raise_exception then denied := true; end;
  assert denied, 'deleted places refuse joins';

  execute 'reset role';
  execute 'set local role anon';
  denied := false;
  begin perform public.create_place('Anon'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anonymous place RPC must be denied';
  execute 'reset role';
end;
$test$;
rollback;
