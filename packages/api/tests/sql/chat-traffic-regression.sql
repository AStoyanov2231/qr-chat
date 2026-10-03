\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.profiles(id uuid primary key, display_name text, avatar_url text, created_at timestamptz default now());
create table public.qr_codes(id uuid primary key, code_key text, display_name text, created_at timestamptz default now());
create table public.qr_groups(id uuid primary key, qr_code_id uuid references public.qr_codes, created_at timestamptz default now());
create table public.group_memberships(group_id uuid references public.qr_groups, user_id uuid references public.profiles unique, joined_at timestamptz default now(), expires_at timestamptz, primary key(group_id,user_id));
create table public.friend_connections(id uuid primary key, user_a_id uuid references public.profiles, user_b_id uuid references public.profiles, requested_by_id uuid references public.profiles, requested_at timestamptz default now(), accepted_at timestamptz);
create table public.group_messages(id bigint generated always as identity primary key, group_id uuid references public.qr_groups, sender_id uuid references public.profiles, body text, created_at timestamptz default now());
create table public.direct_messages(id bigint generated always as identity primary key, friend_connection_id uuid references public.friend_connections on delete cascade, sender_id uuid references public.profiles, body text, created_at timestamptz default now());
create function private.current_group_id() returns uuid language sql stable security definer set search_path = '' as $$
 select group_id from public.group_memberships where user_id = (select auth.uid()) and expires_at > now();
$$;
create function private.profile_visible(profile_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select profile_id = (select auth.uid()) or exists(select 1 from public.group_memberships where user_id=profile_id and group_id=private.current_group_id() and expires_at>now())
 or exists(select 1 from public.friend_connections where accepted_at is not null and ((user_a_id=(select auth.uid()) and user_b_id=profile_id) or (user_b_id=(select auth.uid()) and user_a_id=profile_id)));
$$;
alter table public.profiles enable row level security;
alter table public.qr_codes enable row level security;
alter table public.qr_groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.friend_connections enable row level security;
alter table public.group_messages enable row level security;
alter table public.direct_messages enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(private.profile_visible(id));
create policy groups_read on public.qr_groups for select to authenticated using(id=private.current_group_id());
create policy codes_read on public.qr_codes for select to authenticated using(exists(select 1 from public.qr_groups where qr_code_id=qr_codes.id));
create policy memberships_read on public.group_memberships for select to authenticated using(group_id=private.current_group_id() and expires_at>now());
create policy friends_read on public.friend_connections for select to authenticated using(user_a_id=(select auth.uid()) or user_b_id=(select auth.uid()));
create policy group_messages_read on public.group_messages for select to authenticated using(group_id=private.current_group_id());
create policy direct_messages_read on public.direct_messages for select to authenticated using(exists(select 1 from public.friend_connections f where f.id=direct_messages.friend_connection_id and f.accepted_at is not null));
grant usage on schema public,auth,private to authenticated;
grant select on all tables in schema public to authenticated;
\ir ../../../../supabase/migrations/20261002170940_chat_traffic_optimization.sql
\ir ../../../../supabase/migrations/20261002174918_chat_overview_preview.sql

do $test$
declare
 self_id uuid := gen_random_uuid();
 peer_id uuid := gen_random_uuid();
 outside_id uuid := gen_random_uuid();
 room_id uuid := gen_random_uuid();
 code_id uuid := gen_random_uuid();
 connection_id uuid := gen_random_uuid();
 pending_id uuid := gen_random_uuid();
 result jsonb;
 i integer;
 another uuid;
begin
 insert into public.profiles(id,display_name) values(self_id,'Self'),(peer_id,'Peer'),(outside_id,'Outsider');
 insert into public.qr_codes(id,code_key,display_name) values(code_id,'test-cafe','Cafe');
 insert into public.qr_groups(id,qr_code_id) values(room_id,code_id);
 insert into public.group_memberships(group_id,user_id,expires_at) values(room_id,self_id,now()+interval '1 hour'),(room_id,peer_id,now()+interval '1 hour');
 insert into public.friend_connections(id,user_a_id,user_b_id,requested_by_id,accepted_at) values(connection_id,self_id,peer_id,self_id,now()),(pending_id,self_id,outside_id,self_id,null);
 insert into public.group_messages(group_id,sender_id,body) select room_id,self_id,'message '||s from generate_series(1,60) s;
 insert into public.direct_messages(friend_connection_id,sender_id,body) values(connection_id,peer_id,'older'),(connection_id,peer_id,'latest'),(pending_id,outside_id,'must not leak');
 assert not has_function_privilege('anon','public.get_chat_overview()','execute');
 assert not has_function_privilege('anon','public.get_chat_access()','execute');
 assert not exists(select 1 from pg_proc where oid in('public.get_chat_overview()'::regprocedure,'public.get_chat_access()'::regprocedure) and prosecdef);
 perform set_config('request.jwt.claim.sub',self_id::text,true);
 execute 'set local role authenticated';
 result:=public.get_chat_overview();
 assert result->>'userId'=self_id::text;
 assert result->'profile'->>'display_name'='Self';
 assert jsonb_array_length(result->'members')=2;
 assert jsonb_array_length(result->'friends')=2;
 assert result->'directPreviews'->connection_id::text->>'body'='latest';
 assert not (result->'directPreviews' ? pending_id::text);
 assert jsonb_array_length(result->'groupHeadIds')=50;
 assert (result->'groupHeadIds'->>0)::integer=60;
 assert result->'groupPreview'->>'body'='message 60';
 assert result->'groupPreview'->'profiles'->>'display_name'='Self';
 assert jsonb_array_length(public.get_chat_access()->'acceptedConnectionIds')=1;
 execute 'reset role';
 -- 100 accepted connections include empty conversations without N HTTP queries.
 for i in 1..99 loop
  another:=gen_random_uuid();insert into public.profiles(id) values(another);
  insert into public.friend_connections(id,user_a_id,user_b_id,requested_by_id,accepted_at) values(gen_random_uuid(),self_id,another,self_id,now());
 end loop;
 execute 'set local role authenticated';
 result:=public.get_chat_overview();
 assert jsonb_array_length(public.get_chat_access()->'acceptedConnectionIds')=100;
 assert (select count(*)=100 from jsonb_object_keys(result->'directPreviews'));
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',outside_id::text,true);
 execute 'set local role authenticated';
 result:=public.get_chat_overview();
 assert result->'membership'='null'::jsonb;
 assert jsonb_array_length(result->'members')=0;
 assert jsonb_array_length(result->'groupHeadIds')=0;
 assert result->'groupPreview'='null'::jsonb;
 assert result->'directPreviews'='{}'::jsonb;
 assert not exists(select 1 from public.direct_messages);
 execute 'reset role';
 update public.group_memberships set expires_at=now()-interval '1 minute' where user_id=self_id;
 perform set_config('request.jwt.claim.sub',self_id::text,true);
 execute 'set local role authenticated';
 result:=public.get_chat_overview();
 assert result->'membership'='null'::jsonb;
 assert public.get_chat_access()->'membership'='null'::jsonb;
 assert jsonb_array_length(result->'groupHeadIds')=0;
 assert result->'directPreviews'->connection_id::text->>'body'='latest';
 execute 'reset role';
 delete from public.friend_connections where id=connection_id;
 execute 'set local role authenticated';
 assert not (public.get_chat_overview()->'directPreviews' ? connection_id::text);
 assert not ((public.get_chat_access()->'acceptedConnectionIds') ? connection_id::text);
 execute 'reset role';
end;
$test$;
select 'Chat RPC batching, RLS, expiry, revocation and head overlap assertions passed' as result;

-- Representative history stays in this disposable local cluster, never production.
do $plans$
declare
 self_id uuid := gen_random_uuid(); peer_id uuid := gen_random_uuid();
 code_id uuid := gen_random_uuid(); room_id uuid := gen_random_uuid(); connection_id uuid := gen_random_uuid();
 plan jsonb;
begin
 insert into public.profiles(id,display_name) values(self_id,'Plan self'),(peer_id,'Plan peer');
 insert into public.qr_codes(id,code_key) values(code_id,'plan-room');
 insert into public.qr_groups(id,qr_code_id) values(room_id,code_id);
 insert into public.group_memberships(group_id,user_id,expires_at) values(room_id,self_id,now()+interval '1 hour');
 insert into public.friend_connections(id,user_a_id,user_b_id,requested_by_id,accepted_at) values(connection_id,self_id,peer_id,self_id,now());
 insert into public.group_messages(group_id,sender_id,body) select room_id,self_id,'plan fixture' from generate_series(1,10000);
 insert into public.direct_messages(friend_connection_id,sender_id,body) select connection_id,self_id,'plan fixture' from generate_series(1,10000);
 -- Add unrelated history so conversation selectivity represents shared storage.
 insert into public.group_messages(group_id,sender_id,body) select (select id from public.qr_groups where id<>room_id limit 1),self_id,'unrelated fixture' from generate_series(1,10000);
 insert into public.direct_messages(friend_connection_id,sender_id,body) select (select id from public.friend_connections where id<>connection_id limit 1),self_id,'unrelated fixture' from generate_series(1,10000);
 analyze public.group_messages;
 analyze public.direct_messages;
 perform set_config('request.jwt.claim.sub',self_id::text,true);
 execute 'set local role authenticated';
 execute format('explain (analyze,buffers,format json) select * from public.group_messages where group_id=%L order by id desc limit 51',room_id) into plan;
 assert plan::text ~ '"Index Name": "(group_messages_group_id_idx|group_messages_pkey)"', 'group pagination must retain an indexed ordered plan';
 assert strpos(plan::text,'"Node Type": "Sort"')=0, 'group page must not sort its full history';
 raise notice 'Authenticated group plan with 10,000 rows: % ms',plan->0->>'Execution Time';
 execute format('explain (analyze,buffers,format json) select * from public.direct_messages where friend_connection_id=%L order by id desc limit 51',connection_id) into plan;
 assert plan::text ~ '"Index Name": "(direct_messages_connection_id_idx|direct_messages_pkey)"', 'DM pagination must retain an indexed ordered plan';
 assert strpos(plan::text,'"Node Type": "Sort"')=0, 'DM page must not sort its full history';
 raise notice 'Authenticated DM plan with 10,000 rows: % ms',plan->0->>'Execution Time';
 execute 'reset role';
end $plans$;
