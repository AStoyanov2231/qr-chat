-- Run through Supabase execute_sql or psql against the approved schema.
-- Every fixture and mutation is rolled back. No existing users or rooms are touched.
begin;
set local statement_timeout = '20s';
set local plpgsql.check_asserts = on;
do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  room uuid;
  connection uuid;
  room_key text := 'rls-test-' || gen_random_uuid();
  denied boolean;
  row_count integer;
begin
  insert into auth.users(id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated'), (outsider, 'authenticated', 'authenticated');
  insert into public.profiles(id, display_name) values (a, 'Test Alice'), (b, 'Test Bob'), (outsider, 'Test outsider');

  execute 'set local role anon';
  denied := false;
  begin perform public.join_qr_group(room_key); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anonymous RPC must be denied';
  denied := false;
  begin perform * from public.profiles; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anonymous profile reads must be denied';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select group_id into room from public.join_qr_group(room_key);
  insert into public.group_messages(group_id, sender_id, body) values (room, a, 'authorized message');
  denied := false;
  begin insert into public.group_messages(group_id, sender_id, body) values (room, b, 'forged'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'sender spoofing must be denied';
  denied := false;
  begin insert into public.group_messages(group_id, sender_id, body) values (room, null, 'forged'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'null sender must be denied';
  denied := false;
  begin insert into public.group_messages(group_id, sender_id, body) values (room, a, ' '); exception when check_violation then denied := true; end;
  assert denied, 'blank body must be denied';
  denied := false;
  begin insert into public.group_messages(group_id, sender_id, body) values (room, a, repeat('x', 4001)); exception when check_violation then denied := true; end;
  assert denied, 'oversized body must be denied';
  denied := false;
  begin perform public.join_qr_group(repeat('x',513)); exception when raise_exception then denied := true; end;
  assert denied, 'oversized QR key must be denied';
  assert (select group_id = room from public.group_memberships where user_id = a), 'failed join must preserve membership';
  denied := false;
  begin update public.profiles set display_name = repeat('x',51) where id = a; exception when check_violation then denied := true; end;
  assert denied, 'oversized profile must be denied';
  denied := false;
  begin update public.profiles set id = b where id = a; exception when insufficient_privilege then denied := true; end;
  assert denied, 'profile identity cannot be reassigned';
  denied := false;
  begin perform public.send_friend_request(outsider); exception when raise_exception then denied := true; end;
  assert denied, 'request requires shared membership';
  denied := false;
  begin perform public.send_friend_request(a); exception when raise_exception then denied := true; end;
  assert denied, 'self request must fail';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  assert (select count(*) = 0 from public.group_messages where group_id = room), 'outsider cannot read messages';
  assert (select count(*) = 0 from public.group_memberships where group_id = room), 'outsider cannot read memberships';
  assert (select count(*) = 0 from public.qr_groups where id = room), 'outsider cannot read room';
  assert (select count(*) = 0 from public.profiles where id in (a,b)), 'outsider cannot read profiles';
  update public.profiles set display_name = 'forged' where id = a;
  get diagnostics row_count = row_count;
  assert row_count = 0, 'outsider cannot update another profile';
  denied := false;
  begin insert into public.group_messages(group_id, sender_id, body) values (room, outsider, 'outside'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'outsider cannot send';
  denied := false;
  begin insert into public.group_memberships(group_id,user_id) values (room,outsider); exception when insufficient_privilege then denied := true; end;
  assert denied, 'membership writes require RPC';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  perform public.join_qr_group(room_key);
  assert (select count(*) = 1 from public.group_messages where group_id = room), 'member reads shared messages';
  assert (select count(*) = 2 from public.profiles where id in (a,b)), 'members see each other';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  connection := public.send_friend_request(b);
  assert not public.accept_friend_request(connection), 'sender cannot self accept';
  denied := false;
  begin insert into public.direct_messages(friend_connection_id,sender_id,body) values(connection,a,'pending'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'pending request cannot send DMs';
  denied := false;
  begin update public.friend_connections set accepted_at = now() where id = connection; exception when insufficient_privilege then denied := true; end;
  assert denied, 'friend writes require RPC';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  assert not public.accept_friend_request(connection), 'outsider cannot accept';
  assert not public.remove_friend_connection(connection), 'outsider cannot remove';
  assert (select count(*) = 0 from public.friend_connections where id = connection), 'outsider cannot read connection';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  assert public.accept_friend_request(connection), 'recipient accepts';
  insert into public.direct_messages(friend_connection_id,sender_id,body) values(connection,b,'accepted');
  denied := false;
  begin insert into public.direct_messages(friend_connection_id,sender_id,body) values(connection,a,'forged'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'DM sender spoofing must fail';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  assert (select count(*) = 0 from public.direct_messages where friend_connection_id = connection), 'outsider cannot read DMs';
  denied := false;
  begin insert into public.direct_messages(friend_connection_id,sender_id,body) values(connection,outsider,'outside'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'outsider cannot send DMs';
  execute 'reset role';

  -- Expire only this test's membership. Authorization must fail even before cron runs.
  update public.group_memberships set joined_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' where user_id=a;
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  assert (select count(*) = 0 from public.group_messages where group_id=room), 'expired member cannot read';
  assert (select count(*) = 0 from public.group_memberships where user_id=a), 'expired membership is hidden';
  denied := false;
  begin insert into public.group_messages(group_id,sender_id,body) values(room,a,'expired'); exception when insufficient_privilege then denied:=true; end;
  assert denied, 'expired member cannot send';
  assert (select count(*) = 1 from public.direct_messages where friend_connection_id=connection), 'friendship survives expiration';
  insert into public.direct_messages(friend_connection_id,sender_id,body) values(connection,a,'still friends');
  perform public.leave_qr_group();
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  perform public.leave_qr_group();
  assert (select count(*) = 0 from public.group_messages where group_id=room), 'left member cannot read';
  assert public.remove_friend_connection(connection), 'participant can remove';
  denied := false;
  begin insert into public.direct_messages(friend_connection_id,sender_id,body) values(connection,b,'removed'); exception when insufficient_privilege then denied:=true; end;
  assert denied, 'removed friendship cannot send';
  execute 'reset role';
  assert (select count(*) = 0 from public.qr_groups where id=room), 'last leave deletes room';
  assert (select count(*) = 0 from public.group_messages where group_id=room), 'room messages cascade';
  assert (select count(*) = 0 from public.direct_messages where friend_connection_id=connection), 'DMs cascade';
end;
$test$;
rollback;
select 'All authorization, hostile-input, expiration, and cascade assertions passed; fixtures rolled back' as result;
