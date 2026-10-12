-- Scaling migration checks. Runs in a throwaway cluster (tests/run-sql.mjs), after scaling-migrations.sql.
set plpgsql.check_asserts = on;

-- Fixture helper: a signed-up user with a profile.
create function pg_temp.new_user() returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users(id, aud, role) values (v, 'authenticated', 'authenticated');
  insert into public.profiles(id) values (v);
  return v;
end;
$$;

-- Phase 1: join_qr_group returns the server-resolved name so clients can skip /api/qr-name.
do $test$
declare
  u uuid := pg_temp.new_user();
  joined record;
begin
  insert into public.groups(code_key, name) values ('named-room', 'Fanta Orange');
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
  select * into joined from public.join_qr_group('named-room');
  assert joined.name = 'Fanta Orange', 'join returns the group name';
  select * into joined from public.join_qr_group('unnamed-room');
  assert joined.name is null and joined.group_id is not null, 'an unnamed group returns a null name';
  execute 'reset role';
end;
$test$;

-- Phase 2: 30 messages per user per minute.
do $test$
declare
  u uuid := pg_temp.new_user();
  room uuid;
  denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
  select group_id into room from public.join_qr_group('rate-room');
  for i in 1..30 loop
    insert into public.messages(group_id, sender_id, body) values (room, u, 'message ' || i);
  end loop;
  begin
    insert into public.messages(group_id, sender_id, body) values (room, u, 'message 31');
  exception when sqlstate 'PT429' then denied := true;
  end;
  assert denied, 'the 31st message in a minute is rejected with PT429';
  execute 'reset role';
  assert (select count(*) = 30 from public.messages where sender_id = u), 'the first 30 messages are stored';
end;
$test$;

-- Phase 2: 60 joins per user per hour; leaving does not reset the count.
do $test$
declare
  u uuid := pg_temp.new_user();
  room uuid;
  denied boolean := false;
  message text;
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
  for i in 1..59 loop
    perform public.join_qr_group('join-room-' || i);
  end loop;
  select group_id into room from public.join_qr_group('join-room-60');
  perform public.leave_qr_group(room);
  begin
    perform public.join_qr_group('join-room-61');
  exception when sqlstate 'PT429' then denied := true; get stacked diagnostics message = message_text;
  end;
  assert denied, 'the 61st join in an hour is rejected, even after leaving a group';
  assert message = 'You have joined a lot of chats this hour. Try again later.', 'the join limit has a short notice';
  execute 'reset role';
  update private.qr_join_log set joined_at = now() - interval '61 minutes' where user_id = u;
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
  perform public.join_qr_group('join-room-61');
  execute 'reset role';
  assert (select count(*) = 1 from private.qr_join_log where user_id = u), 'joins older than an hour are pruned and stop counting';
end;
$test$;

do $test$
declare
  denied boolean := false;
begin
  execute 'set local role authenticated';
  begin perform * from private.qr_join_log; exception when insufficient_privilege then denied := true; end;
  assert denied, 'clients cannot read or reset the join log';
  execute 'reset role';
end;
$test$;

-- Phase 2: slow mode (1 message per 5 seconds) applies only above 300 members.
do $test$
declare
  busy uuid;
  calm uuid;
  speaker uuid := pg_temp.new_user();
  denied boolean := false;
  message text;
begin
  insert into public.groups(code_key) values ('busy-room') returning id into busy;
  insert into public.groups(code_key) values ('calm-room') returning id into calm;
  insert into public.group_members(user_id, group_id) values (speaker, busy), (speaker, calm);
  -- 301 members in busy-room, exactly 300 in calm-room.
  insert into public.group_members(user_id, group_id) select pg_temp.new_user(), busy from generate_series(1, 300);
  insert into public.group_members(user_id, group_id) select pg_temp.new_user(), calm from generate_series(1, 299);
  perform set_config('request.jwt.claim.sub', speaker::text, true);
  execute 'set local role authenticated';
  insert into public.messages(group_id, sender_id, body) values (calm, speaker, 'one'), (calm, speaker, 'two');
  insert into public.messages(group_id, sender_id, body) values (busy, speaker, 'first');
  begin
    insert into public.messages(group_id, sender_id, body) values (busy, speaker, 'too soon');
  exception when sqlstate 'PT429' then denied := true; get stacked diagnostics message = message_text;
  end;
  assert denied, 'slow mode rejects a second message within 5 seconds above 300 members';
  assert message like 'Slow mode is on%', 'slow mode has its own notice';
  execute 'reset role';
  assert (select count(*) = 2 from public.messages where group_id = calm), 'a 300-member group has no slow mode';
  update public.messages set created_at = now() - interval '6 seconds' where group_id = busy;
  perform set_config('request.jwt.claim.sub', speaker::text, true);
  execute 'set local role authenticated';
  insert into public.messages(group_id, sender_id, body) values (busy, speaker, 'after the wait');
  execute 'reset role';
end;
$test$;

-- Phase 2: retention keeps 30 days of QR group history and never touches direct messages.
do $test$
declare
  a uuid := pg_temp.new_user();
  b uuid := pg_temp.new_user();
  room uuid;
  dm uuid;
  deleted bigint;
begin
  insert into public.groups(code_key) values ('retention-room') returning id into room;
  insert into public.groups(code_key) values (null) returning id into dm;
  insert into public.friendships(group_id, user_a_id, user_b_id, requested_by_id, accepted_at)
  select dm, least(a, b), greatest(a, b), a, now();
  insert into public.group_members(user_id, group_id) values (a, room);
  insert into public.messages(group_id, sender_id, body, created_at) values
    (room, a, 'old group', now() - interval '31 days'),
    (room, a, 'recent group', now() - interval '29 days'),
    (dm, a, 'old direct', now() - interval '400 days'),
    (dm, b, 'recent direct', now());
  deleted := private.delete_old_group_messages();
  assert deleted >= 1, 'the job reports deleted rows';
  assert not exists (select 1 from public.messages where body = 'old group'), 'QR group messages older than 30 days are deleted';
  assert exists (select 1 from public.messages where body = 'recent group'), 'QR group messages inside the window are kept';
  assert (select count(*) = 2 from public.messages where group_id = dm), 'direct messages are never deleted';
  assert exists (select 1 from public.friendships where group_id = dm), 'friendships are kept';
  assert exists (select 1 from public.groups where id = room), 'groups are kept';
  assert (select count(*) = 1 from cron.job where jobname = 'delete-old-group-messages' and schedule = '17 3 * * *'
    and command = 'select private.delete_old_group_messages()'), 'the daily retention job is registered once';
  assert exists (select 1 from cron.job where jobname = 'expire-qr-memberships'), 'the existing expiry job is untouched';
end;
$test$;

do $test$
declare
  denied boolean := false;
begin
  execute 'set local role authenticated';
  begin perform private.delete_old_group_messages(); exception when insufficient_privilege then denied := true; end;
  assert denied, 'clients cannot run the retention job';
  execute 'reset role';
end;
$test$;

select 'All scaling assertions passed' as result;
