-- Block, unblock and report: run like authorization.sql (Supabase execute_sql or psql). Everything is rolled back.
begin;
set local statement_timeout = '20s';
set local plpgsql.check_asserts = on;
do $test$
declare
  me uuid := gen_random_uuid();
  peer uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  connection uuid;
  denied boolean;
begin
  insert into auth.users(id, aud, role) values (me, 'authenticated', 'authenticated'), (peer, 'authenticated', 'authenticated'), (other, 'authenticated', 'authenticated');
  insert into public.profiles(id, display_name) values (me, 'Me'), (peer, 'Peer'), (other, 'Other');
  insert into public.groups default values returning id into connection;
  insert into public.friendships(group_id, user_a_id, user_b_id, requested_by_id) values (connection, least(me, peer), greatest(me, peer), peer);

  -- A pending request can be blocked by its receiver.
  perform set_config('request.jwt.claim.sub', me::text, true);
  execute 'set local role authenticated';
  assert public.block_friend_connection(connection), 'a pending request can be blocked';
  assert not exists (select 1 from public.friendships where group_id = connection), 'blocking removes the request';
  assert (public.get_chat_overview()->'blocked'->0->>'id')::uuid = peer, 'overview lists blocked users';
  assert public.get_chat_overview()->'blocked'->0->>'display_name' = 'Peer', 'blocked users keep their names';

  perform set_config('request.jwt.claim.sub', peer::text, true);
  assert jsonb_array_length(public.get_chat_overview()->'blocked') = 0, 'the blocked side does not see the block';
  assert not exists (select 1 from public.user_blocks), 'the blocked side cannot read the block';
  delete from public.user_blocks;
  perform set_config('request.jwt.claim.sub', me::text, true);
  assert exists (select 1 from public.user_blocks where blocked_id = peer), 'only the blocker can unblock';

  -- Blocking by user id works without any friendship, and unblocking deletes the row.
  assert public.block_user(other), 'any user can be blocked by id';
  denied := false;
  begin perform public.block_user(me); exception when raise_exception then denied := true; end;
  assert denied, 'you cannot block yourself';
  delete from public.user_blocks where blocked_id = other;
  assert not exists (select 1 from public.user_blocks where blocked_id = other), 'the blocker can unblock';

  -- Reports are insert-only and attributed to the caller.
  insert into public.reports(reported_user_id, reason, details) values (peer, 'harassment', 'Rude');
  insert into public.reports(group_id, reason) values (connection, 'spam');
  denied := false;
  begin perform 1 from public.reports; exception when insufficient_privilege then denied := true; end;
  assert denied, 'reporters cannot read reports';
  denied := false;
  begin insert into public.reports(reporter_id, reported_user_id, reason) values (peer, other, 'spam'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'reports cannot be filed in someone else''s name';
  denied := false;
  begin insert into public.reports(reported_user_id, reason) values (peer, 'boring'); exception when check_violation then denied := true; end;
  assert denied, 'reasons are a fixed list';
  denied := false;
  begin insert into public.reports(reason) values ('spam'); exception when check_violation then denied := true; end;
  assert denied, 'a report names a user or a group';
  execute 'reset role';
  assert (select count(*) = 2 and bool_and(reporter_id = me) from public.reports), 'reports are stored for the reporter';

  execute 'set local role anon';
  denied := false;
  begin insert into public.reports(reported_user_id, reason) values (peer, 'spam'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anonymous reports are denied';
  execute 'reset role';
end;
$test$;
rollback;
