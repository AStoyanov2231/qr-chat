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
  other_room uuid;
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
  denied := false;
  begin perform * from public.messages; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anonymous message reads must be denied';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select group_id into room from public.join_qr_group(room_key);
  insert into public.messages(group_id, sender_id, body) values (room, a, 'authorized message');
  denied := false;
  begin insert into public.messages(group_id, sender_id, body) values (room, b, 'forged'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'sender spoofing must be denied';
  denied := false;
  begin insert into public.messages(group_id, sender_id, body) values (room, null, 'forged'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'null sender must be denied';
  denied := false;
  begin insert into public.messages(group_id, sender_id, body) values (room, a, ' '); exception when check_violation then denied := true; end;
  assert denied, 'blank body must be denied';
  denied := false;
  begin insert into public.messages(group_id, sender_id, body) values (room, a, repeat('x', 4001)); exception when check_violation then denied := true; end;
  assert denied, 'oversized body must be denied';
  denied := false;
  begin perform public.join_qr_group(repeat('x',513)); exception when raise_exception then denied := true; end;
  assert denied, 'oversized QR key must be denied';
  assert (select group_id = room from public.group_members where user_id = a), 'failed join must preserve membership';
  denied := false;
  begin insert into public.groups(code_key) values ('forged-room'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'groups are created only through RPCs';
  denied := false;
  begin update public.profiles set display_name = repeat('x',51) where id = a; exception when check_violation then denied := true; end;
  assert denied, 'oversized profile must be denied';
  denied := false;
  begin update public.profiles set id = b where id = a; exception when insufficient_privilege then denied := true; end;
  assert denied, 'profile identity cannot be reassigned';
  denied := false;
  begin update public.profiles set avatar_path = b::text || '/' || gen_random_uuid() || '.jpg' where id = a; exception when check_violation then denied := true; end;
  assert denied, 'avatar paths must stay in the owner folder';
  denied := false;
  begin perform public.send_friend_request(outsider); exception when raise_exception then denied := true; end;
  assert denied, 'request requires shared membership';
  denied := false;
  begin perform public.send_friend_request(a); exception when raise_exception then denied := true; end;
  assert denied, 'self request must fail';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  assert (select count(*) = 0 from public.messages where group_id = room), 'outsider cannot read messages';
  assert (select count(*) = 0 from public.group_members where group_id = room), 'outsider cannot read memberships';
  assert (select count(*) = 0 from public.groups where id = room), 'outsider cannot read room';
  assert (select count(*) = 0 from public.profiles where id in (a,b)), 'outsider cannot read profiles';
  update public.profiles set display_name = 'forged' where id = a;
  get diagnostics row_count = row_count;
  assert row_count = 0, 'outsider cannot update another profile';
  denied := false;
  begin insert into public.messages(group_id, sender_id, body) values (room, outsider, 'outside'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'outsider cannot send';
  denied := false;
  begin insert into public.group_members(group_id,user_id) values (room,outsider); exception when insufficient_privilege then denied := true; end;
  assert denied, 'membership writes require RPC';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  perform public.join_qr_group(room_key);
  assert (select count(*) = 1 from public.messages where group_id = room), 'member reads shared messages';
  assert public.get_chat_overview()->'membership'->>'group_id' = room::text, 'overview is scoped to authorized membership';
  assert public.get_chat_overview()->'membership'->'groups'->>'code_key' = room_key, 'overview includes the QR code';
  assert jsonb_array_length(public.get_chat_overview()->'groupHeadIds') = 1, 'overview recovers authorized message heads';
  assert (select count(*) = 2 from public.profiles where id in (a,b)), 'members see each other';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  assert (select display_name from public.join_named_qr_group(room_key, 'Named room')) = 'Named room', 'active members can name an unnamed chat';
  assert public.name_current_qr_chat_if_empty(room_key, 'Other name') = 'Named room', 'the first name wins';
  assert public.get_qr_chat_name(room_key) = 'Named room', 'saved names are readable';
  connection := public.send_friend_request(b);
  assert not public.accept_friend_request(connection), 'sender cannot self accept';
  denied := false;
  begin insert into public.messages(group_id,sender_id,body) values(connection,a,'pending'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'pending request cannot send DMs';
  denied := false;
  begin update public.friendships set accepted_at = now() where group_id = connection; exception when insufficient_privilege then denied := true; end;
  assert denied, 'friend writes require RPC';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  assert not public.accept_friend_request(connection), 'outsider cannot accept';
  assert not public.remove_friend_connection(connection), 'outsider cannot remove';
  assert not public.block_friend_connection(connection), 'outsider cannot block';
  assert (select count(*) = 0 from public.friendships where group_id = connection), 'outsider cannot read connection';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  assert public.accept_friend_request(connection), 'recipient accepts';
  insert into public.messages(group_id,sender_id,body) values(connection,b,'accepted');
  denied := false;
  begin insert into public.messages(group_id,sender_id,body) values(connection,a,'forged'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'DM sender spoofing must fail';
  assert public.get_chat_overview()->'friends'->0->>'id' = connection::text, 'friends expose their DM group as id';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  assert (select count(*) = 0 from public.messages where group_id = connection), 'outsider cannot read DMs';
  assert public.get_chat_overview()->'directPreviews' = '{}'::jsonb, 'overview cannot leak outsider previews';
  denied := false;
  begin insert into public.messages(group_id,sender_id,body) values(connection,outsider,'outside'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'outsider cannot send DMs';
  execute 'reset role';

  -- Expire only this test's membership. Authorization must fail even before cron runs.
  update public.group_members set joined_at=now()-interval '25 hours' where user_id=a;
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  assert (select count(*) = 0 from public.messages where group_id=room), 'expired member cannot read';
  assert (select count(*) = 0 from public.group_members where user_id=a), 'expired membership is hidden';
  denied := false;
  begin insert into public.messages(group_id,sender_id,body) values(room,a,'expired'); exception when insufficient_privilege then denied:=true; end;
  assert denied, 'expired member cannot send';
  assert (select count(*) = 1 from public.messages where group_id=connection), 'friendship survives expiration';
  assert public.get_chat_access()->'membership' = 'null'::jsonb, 'access RPC rejects expiration before cleanup';
  assert public.get_chat_overview()->'membership' = 'null'::jsonb, 'overview rejects expiration before cleanup';
  assert public.get_chat_overview()->'directPreviews'->connection::text->>'body' = 'accepted', 'batched DM previews survive group expiry';
  insert into public.messages(group_id,sender_id,body) values(connection,a,'still friends');
  select group_id into other_room from public.join_qr_group(room_key || '-other');
  assert other_room <> room, 'switching chats moves the membership';
  perform public.leave_qr_group();
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  perform public.leave_qr_group();
  assert (select count(*) = 0 from public.messages where group_id=room), 'left member cannot read';
  execute 'reset role';
  assert (select count(*) = 0 from public.messages where group_id=room), 'last leave clears the chat';
  assert (select count(*) = 1 from public.groups where id=room and name = 'Named room'), 'the QR chat and its name persist';

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  assert public.block_friend_connection(connection), 'participant can block';
  execute 'reset role';
  assert (select count(*) = 0 from public.groups where id=connection), 'blocking removes the DM group';
  assert (select count(*) = 0 from public.messages where group_id=connection), 'DMs cascade';
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  perform public.join_qr_group(room_key);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  perform public.join_qr_group(room_key);
  denied := false;
  begin perform public.send_friend_request(a); exception when insufficient_privilege then denied := true; end;
  assert denied, 'blocked pairs cannot reconnect';
  execute 'reset role';
end;
$test$;

-- RBAC: roles and permissions are rows; grants and revokes are RLS-checked writes on user_roles.
do $test$
declare
  u_admin uuid := gen_random_uuid();
  u_moderator uuid := gen_random_uuid();
  u_owner uuid := gen_random_uuid();
  u_helper uuid := gen_random_uuid();
  u_member uuid := gen_random_uuid();
  room uuid;
  other_room uuid;
  denied boolean;
  row_count integer;
begin
  insert into auth.users(id, aud, role) select id, 'authenticated', 'authenticated' from unnest(array[u_admin, u_moderator, u_owner, u_helper, u_member]) id;
  insert into public.groups(code_key) values ('rbac-' || gen_random_uuid()) returning id into room;
  insert into public.groups(code_key) values ('rbac-' || gen_random_uuid()) returning id into other_room;
  -- Bootstrap: the first admin is inserted with elevated SQL.
  insert into public.user_roles(user_id, role_id) select u_admin, id from public.roles where key = 'admin';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u_member::text, true);
  assert (select count(*) = 0 from public.my_permissions()), 'users without roles have no permissions';
  denied := false;
  begin insert into public.user_roles(user_id, role_id) select u_member, id from public.roles where key = 'admin'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'users cannot grant themselves roles';
  assert (select count(*) = 5 from public.roles), 'the role catalog is readable';

  perform set_config('request.jwt.claim.sub', u_admin::text, true);
  assert (select count(*) = (select count(*) from public.permissions) from public.my_permissions()), 'admins hold every permission';
  insert into public.user_roles(user_id, role_id) select u_moderator, id from public.roles where key = 'moderator';
  insert into public.user_roles(user_id, role_id, expires_at) select u_member, id, now() + interval '30 days' from public.roles where key = 'subscriber';
  assert (select granted_by = u_admin from public.user_roles where user_id = u_moderator), 'grants record the granter';
  denied := false;
  begin insert into public.user_roles(user_id, role_id, granted_by) select u_member, id, u_member from public.roles where key = 'moderator'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'the granter cannot be forged';

  perform set_config('request.jwt.claim.sub', u_moderator::text, true);
  insert into public.user_roles(user_id, role_id, group_id) select u_owner, id, room from public.roles where key = 'group_owner';
  denied := false;
  begin insert into public.user_roles(user_id, role_id) select u_member, id from public.roles where key = 'admin'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'moderators cannot grant staff roles';
  denied := false;
  begin insert into public.user_roles(user_id, role_id) select u_moderator, id from public.roles where key = 'subscriber'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'moderators cannot grant plans';

  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  insert into public.user_roles(user_id, role_id, group_id) select u_helper, id, room from public.roles where key = 'group_moderator';
  denied := false;
  begin insert into public.user_roles(user_id, role_id, group_id) select u_helper, id, other_room from public.roles where key = 'group_moderator'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'group owners cannot act in other groups';
  denied := false;
  begin insert into public.user_roles(user_id, role_id) select u_helper, id from public.roles where key = 'group_moderator'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'group owners cannot grant app-wide';
  denied := false;
  begin insert into public.user_roles(user_id, role_id, group_id) select u_helper, id, room from public.roles where key = 'group_owner'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'group owners cannot create other owners';
  assert (select count(*) = 2 from public.user_roles where group_id = room), 'group owners see their group''s assignments';
  assert (select count(*) = 0 from public.user_roles where user_id in (u_admin, u_moderator)), 'group owners cannot see staff assignments';
  assert (select count(*) = 0 from public.my_permissions()), 'group permissions do not apply app-wide';
  assert (select count(*) = 2 from public.my_permissions(room)), 'group permissions apply in the owned group';
  delete from public.user_roles where user_id = u_helper and group_id = room;
  get diagnostics row_count = row_count;
  assert row_count = 1, 'group owners revoke group moderators';

  perform set_config('request.jwt.claim.sub', u_member::text, true);
  delete from public.user_roles where user_id = u_owner;
  get diagnostics row_count = row_count;
  assert row_count = 0, 'users cannot revoke other assignments';
  delete from public.user_roles where user_id = u_member;
  get diagnostics row_count = row_count;
  assert row_count = 0, 'users cannot revoke their own plan';
  execute 'reset role';

  update public.user_roles set expires_at = now() - interval '1 second' where user_id = u_owner;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  denied := false;
  begin insert into public.user_roles(user_id, role_id, group_id) select u_helper, id, room from public.roles where key = 'group_moderator'; exception when insufficient_privilege then denied := true; end;
  assert denied, 'expired roles grant nothing';
  execute 'reset role';

  delete from auth.users where id = u_member;
  assert (select count(*) = 0 from public.user_roles where user_id = u_member), 'deleting a user removes assignments';
end;
$test$;
rollback;
select 'All authorization, RBAC, hostile-input, expiration, and cascade assertions passed; fixtures rolled back' as result;
