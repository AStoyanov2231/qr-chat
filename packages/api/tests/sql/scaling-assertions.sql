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

-- Phase 3: Broadcast triggers send id-only events to private topics.
do $test$
declare
  a uuid := pg_temp.new_user();
  b uuid := pg_temp.new_user();
  room uuid;
  busy uuid;
  dm uuid;
  message_id bigint;
  sent jsonb;
begin
  delete from realtime.messages;
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select group_id into room from public.join_qr_group('broadcast-room');
  execute 'reset role';
  assert (select count(*) = 1 from realtime.messages where topic = 'user:' || a and payload->>'table' = 'group_members'), 'a join reaches the joiner''s user topic';
  assert (select count(*) = 1 from realtime.messages where topic = 'group:' || room and payload->>'table' = 'group_members'), 'a join reaches the group topic';

  delete from realtime.messages;
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  insert into public.messages(group_id, sender_id, body) values (room, a, 'secret body') returning id into message_id;
  execute 'reset role';
  select payload into sent from realtime.messages where topic = 'group:' || room;
  assert sent = jsonb_build_object('table', 'messages', 'type', 'INSERT', 'id', message_id, 'group_id', room), 'a group message broadcasts its ids to group:<id>';
  assert (select count(*) = 1 from realtime.messages), 'a group message sends exactly one broadcast';
  assert not exists (select 1 from realtime.messages where payload::text like '%secret body%'), 'payloads never carry message bodies';
  assert (select bool_and(event = 'change' and private and extension = 'broadcast') from realtime.messages), 'broadcasts are private change events';

  insert into public.groups(code_key) values (null) returning id into dm;
  delete from realtime.messages;
  insert into public.friendships(group_id, user_a_id, user_b_id, requested_by_id) select dm, least(a, b), greatest(a, b), a;
  assert (select array_agg(topic order by topic) = array['user:' || least(a, b), 'user:' || greatest(a, b)] from realtime.messages), 'a friendship change reaches both users';
  update public.friendships set accepted_at = now() where group_id = dm;
  delete from realtime.messages;
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  insert into public.messages(group_id, sender_id, body) values (dm, b, 'direct');
  execute 'reset role';
  assert (select array_agg(topic order by topic) = array['user:' || least(a, b), 'user:' || greatest(a, b)] from realtime.messages), 'a direct message reaches both user topics only';

  delete from realtime.messages;
  update public.profiles set display_name = 'Alice' where id = a;
  assert (select array_agg(topic order by topic) = array(select unnest(array['group:' || room, 'user:' || a, 'user:' || b]) order by 1) from realtime.messages), 'a profile edit reaches the user, their groups and their friends';
  delete from realtime.messages;
  update public.profiles set created_at = created_at where id = a;
  assert (select count(*) = 0 from realtime.messages), 'a profile write that changes nothing visible is silent';

  insert into public.groups(code_key) values ('busy-broadcast') returning id into busy;
  insert into public.group_members(user_id, group_id) select pg_temp.new_user(), busy from generate_series(1, 301);
  delete from realtime.messages;
  insert into public.group_members(user_id, group_id) values (b, busy);
  assert (select array_agg(topic) = array['user:' || b] from realtime.messages), 'busy rooms skip the member-change fan-out';
end;
$test$;

-- Phase 3: topic authorization (the Realtime server checks SELECT on realtime.messages at channel join).
create function pg_temp.can_join(p_user uuid, p_topic text) returns boolean language plpgsql as $$
declare visible boolean;
begin
  insert into realtime.messages(topic, extension, event, payload) values (p_topic, 'broadcast', 'probe', '{}');
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('realtime.topic', p_topic, true);
  execute 'set local role authenticated';
  select exists (select 1 from realtime.messages where topic = p_topic) into visible;
  execute 'reset role';
  delete from realtime.messages where event = 'probe';
  return visible;
end;
$$;
do $test$
declare
  member uuid := pg_temp.new_user();
  expired uuid := pg_temp.new_user();
  outsider uuid := pg_temp.new_user();
  room uuid;
  denied boolean := false;
begin
  insert into public.groups(code_key) values ('auth-room') returning id into room;
  insert into public.group_members(user_id, group_id, joined_at) values (member, room, now()), (expired, room, now() - interval '25 hours');
  assert pg_temp.can_join(member, 'group:' || room), 'a current member can join the group topic';
  assert not pg_temp.can_join(expired, 'group:' || room), 'an expired member is denied before cleanup runs';
  assert not pg_temp.can_join(outsider, 'group:' || room), 'a non-member is denied';
  assert pg_temp.can_join(member, 'user:' || member), 'a user can join their own topic';
  assert not pg_temp.can_join(outsider, 'user:' || member), 'a user cannot join another user''s topic';
  assert not pg_temp.can_join(member, 'group:not-a-uuid'), 'malformed topics are denied';
  assert not pg_temp.can_join(member, 'chat:' || room), 'unknown topic kinds are denied';
  perform set_config('request.jwt.claim.sub', member::text, true);
  perform set_config('realtime.topic', 'group:' || room, true);
  execute 'set local role authenticated';
  begin
    insert into realtime.messages(topic, extension, event, payload) values ('group:' || room, 'broadcast', 'change', '{}');
  exception when insufficient_privilege then denied := true;
  end;
  execute 'reset role';
  assert denied, 'clients cannot send on chat topics';
end;
$test$;

do $test$
begin
  assert (select count(*) = 4 from pg_publication_tables where pubname = 'supabase_realtime'), 'Phase 3 keeps the publication for installed apps';
end;
$test$;
\ir ../../../../supabase/deferred/20261012140000_drop_postgres_changes_publication.sql
\ir ../../../../supabase/deferred/20261012140000_drop_postgres_changes_publication.sql
do $test$
begin
  assert (select count(*) = 0 from pg_publication_tables where pubname = 'supabase_realtime'), 'the deferred cleanup empties the publication and is re-runnable';
end;
$test$;

-- Phase 4: the products cache is server-only; groups can point at a shared product photo.
do $test$
declare
  u uuid := pg_temp.new_user();
  denied boolean;
begin
  execute 'set local role service_role';
  insert into public.products(gtin, name, image_path) values ('5449000006271', 'Fanta Orange', 'p/5449000006271.jpg');
  insert into public.products(gtin, not_found) values ('0000096385074', true);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin perform * from public.products; exception when insufficient_privilege then denied := true; end;
  assert denied, 'clients cannot read the products cache';
  denied := false;
  begin insert into public.products(gtin, name) values ('4006381333931', 'Forged'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'clients cannot write the products cache';
  denied := false;
  begin update public.products set name = 'Forged' where gtin = '5449000006271'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'clients cannot change cached products';
  execute 'reset role';
  execute 'set local role anon';
  denied := false;
  begin perform * from public.products; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anonymous clients cannot read the products cache';
  execute 'reset role';
  denied := false;
  begin insert into public.products(gtin, name, not_found) values ('4006381333932', 'Named', true); exception when check_violation then denied := true; end;
  assert denied, 'a not-found row cannot carry a name';
  insert into public.groups(code_key, name, image_path) values ('gtin:5449000006271', 'Fanta Orange', 'p/5449000006271.jpg'), ('gtin-copy', 'Fanta Orange', 'p/5449000006271.jpg');
  insert into public.groups(code_key, image_path) values ('legacy-photo', gen_random_uuid() || '.jpg');
  denied := false;
  begin insert into public.groups(code_key, image_path) values ('bad-photo', '../avatars/x.jpg'); exception when check_violation then denied := true; end;
  assert denied, 'group photos stay in the two allowed shapes';
end;
$test$;

select 'All scaling assertions passed' as result;
