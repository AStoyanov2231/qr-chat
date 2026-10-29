-- Idempotent sends: run like chat-reads.sql (Supabase execute_sql or psql). Everything is rolled back.
begin;
set local statement_timeout = '20s';
set local plpgsql.check_asserts = on;
do $test$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  room uuid;
  retried uuid := gen_random_uuid();
  first_id bigint;
  again bigint;
  limited boolean;
begin
  insert into auth.users(id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated');
  insert into public.profiles(id, display_name) values (a, 'Ana'), (b, 'Ben');
  insert into public.groups(code_key) values ('cafe') returning id into room;
  insert into public.group_members(user_id, group_id, joined_at) values (a, room, now()), (b, room, now());

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  insert into public.messages(group_id, sender_id, body, client_id) values (room, a, 'hello', retried) returning id into first_id;
  -- What the client's upsert(..., { onConflict: 'sender_id,client_id', ignoreDuplicates: true }) runs.
  insert into public.messages(group_id, sender_id, body, client_id) values (room, a, 'hello', retried)
    on conflict (sender_id, client_id) do nothing returning id into again;
  assert again is null, 'a retry with the same client id inserts nothing';
  assert (select count(*) from public.messages where client_id = retried) = 1, 'the message is stored once';
  assert (select id from public.messages where sender_id = a and client_id = retried) = first_id, 'the retry reads the first row back';
  insert into public.messages(group_id, sender_id, body) values (room, a, 'no id'), (room, a, 'no id');
  assert (select count(*) from public.messages where body = 'no id') = 2, 'sends without a client id never collide';

  -- Fill the 30-per-minute budget: a new message is limited, a retry of a stored one is not.
  insert into public.messages(group_id, sender_id, body) select room, a, 'filler' from generate_series(1, 27);
  limited := false;
  begin insert into public.messages(group_id, sender_id, body) values (room, a, 'one too many');
  exception when sqlstate 'PT429' then limited := true; end;
  assert limited, 'the rate limit still applies to new messages';
  insert into public.messages(group_id, sender_id, body, client_id) values (room, a, 'hello', retried)
    on conflict (sender_id, client_id) do nothing returning id into again;
  assert again is null, 'a retry of a stored message is skipped before the rate limit';

  perform set_config('request.jwt.claim.sub', b::text, true);
  insert into public.messages(group_id, sender_id, body, client_id) values (room, b, 'same id, other sender', retried) returning id into again;
  assert again is not null, 'client ids are scoped to their sender';
  execute 'reset role';
end;
$test$;
rollback;
