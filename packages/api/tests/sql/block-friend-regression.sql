\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create table public.profiles(id uuid primary key);
create table public.friend_connections(id uuid primary key, user_a_id uuid references public.profiles, user_b_id uuid references public.profiles, accepted_at timestamptz);
create table public.direct_messages(id bigint generated always as identity, friend_connection_id uuid references public.friend_connections on delete cascade, body text);
grant usage on schema public, auth to authenticated;
\ir ../../../../supabase/migrations/20261004234413_block_friend_connection.sql
insert into public.profiles values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222'), ('33333333-3333-4333-8333-333333333333');
insert into public.friend_connections values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', now());
insert into public.direct_messages(friend_connection_id, body) values ('44444444-4444-4444-8444-444444444444', 'private message');
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
do $$ begin assert not public.block_friend_connection('44444444-4444-4444-8444-444444444444'), 'An outsider cannot block another friendship'; end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$ begin assert public.block_friend_connection('44444444-4444-4444-8444-444444444444'); assert (select count(*) = 1 from public.user_blocks); end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$ begin assert (select count(*) = 0 from public.user_blocks), 'The blocked user cannot read private block records'; end $$;
reset role;
do $$
declare denied boolean := false;
begin
 assert (select count(*) = 0 from public.friend_connections), 'Blocking removes the connection';
 assert (select count(*) = 0 from public.direct_messages), 'Blocking removes DM access/history';
 begin insert into public.friend_connections values(gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', null); exception when insufficient_privilege then denied := true; end;
 assert denied, 'The blocker cannot recreate a friendship';
 denied := false;
 begin insert into public.friend_connections values(gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', null); exception when insufficient_privilege then denied := true; end;
 assert denied, 'The blocked user cannot recreate a friendship';
 insert into public.friend_connections values(gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', now());
 assert (select count(*) = 1 from public.friend_connections), 'Other friendships are unaffected';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare denied boolean := false;
begin
 begin perform public.block_friend_connection('44444444-4444-4444-8444-444444444444'); exception when insufficient_privilege then denied := true; end;
 assert denied, 'Signed out callers are rejected';
end $$;
