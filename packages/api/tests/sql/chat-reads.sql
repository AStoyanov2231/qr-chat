-- Unread counts and read markers: run like business.sql (Supabase execute_sql or psql). Everything is rolled back.
begin;
set local statement_timeout = '20s';
set local plpgsql.check_asserts = on;
do $test$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  outsider uuid := gen_random_uuid();
  room uuid;
  dm uuid;
  latest bigint;
  overview jsonb;
  denied boolean;
begin
  insert into auth.users(id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated'), (outsider, 'authenticated', 'authenticated');
  insert into public.profiles(id, display_name) values (a, 'Ana'), (b, 'Ben'), (outsider, 'Out');
  insert into public.groups(code_key) values ('cafe') returning id into room;
  insert into public.groups(code_key) values (null) returning id into dm;
  insert into public.group_members(user_id, group_id, joined_at) values (a, room, now() - interval '1 hour'), (b, room, now() - interval '1 hour');
  insert into public.friendships(group_id, user_a_id, user_b_id, requested_by_id, accepted_at) values (dm, a, b, a, now());
  insert into public.messages(group_id, sender_id, body, created_at) values
    (room, b, 'before Ana joined', now() - interval '2 hours'),
    (room, b, 'hi', now()), (room, a, 'own message', now()), (room, b, 'there', now()),
    (dm, b, 'dm one', now());

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  overview := public.get_chat_overview();
  assert (overview->'unread'->>room::text)::int = 2, 'others'' messages since joining are unread, own ones are not';
  assert (overview->'unread'->>dm::text)::int = 1, 'DM messages from the friend are unread';

  select max(id) into latest from public.messages where group_id = room;
  perform public.mark_chat_read(room, latest);
  perform public.mark_chat_read(room, latest - 1);
  assert (select last_read_id = latest from public.chat_reads where group_id = room), 'the read marker never moves back';
  overview := public.get_chat_overview();
  assert not (overview->'unread' ? room::text), 'opening a chat clears its unread count';
  assert (overview->'unread'->>dm::text)::int = 1, 'reading one chat leaves the others unread';

  perform set_config('request.jwt.claim.sub', b::text, true);
  assert not exists (select 1 from public.chat_reads), 'read markers are private';
  assert (public.get_chat_overview()->'unread'->>room::text)::int = 1, 'each member has their own count';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  denied := false;
  begin perform public.mark_chat_read(room, latest); exception when insufficient_privilege then denied := true; end;
  assert denied, 'only members mark a chat read';

  execute 'reset role';
  execute 'set local role anon';
  denied := false;
  begin perform public.mark_chat_read(room, latest); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anonymous read markers must be denied';
  execute 'reset role';
end;
$test$;
rollback;
