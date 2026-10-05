\set ON_ERROR_STOP on
-- Local stand-in for the live database just before 20261006120000_reduce_schema: Supabase auth
-- stubs, the pre-reduction chat tables with sample data, and the RBAC migrations. Then the
-- reduction runs, its data move is checked, and the live authorization suite runs on the result.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create table auth.users(id uuid primary key, aud text, role text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
grant usage on schema public, auth, private to anon, authenticated;
create publication supabase_realtime;

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or (char_length(btrim(display_name)) between 1 and 50 and display_name = btrim(display_name))),
  avatar_path text constraint profiles_avatar_path_check check (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and split_part(avatar_path, '/', 1) = id::text),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter publication supabase_realtime add table public.profiles;
create table public.qr_codes(id uuid primary key default gen_random_uuid(), code_key text not null unique, display_name text, created_at timestamptz not null default now());
create table public.qr_groups(id uuid primary key default gen_random_uuid(), qr_code_id uuid not null unique references public.qr_codes, created_at timestamptz not null default now());
create table public.group_memberships(group_id uuid not null references public.qr_groups on delete cascade, user_id uuid not null unique references public.profiles on delete cascade, joined_at timestamptz not null default now());
create table public.group_messages(id bigint generated always as identity primary key, group_id uuid not null references public.qr_groups on delete cascade, sender_id uuid references public.profiles on delete set null, body text not null, created_at timestamptz not null default now());
create table public.friend_connections(id uuid primary key default gen_random_uuid(), user_a_id uuid not null references public.profiles, user_b_id uuid not null references public.profiles, requested_by_id uuid not null references public.profiles, requested_at timestamptz not null default now(), accepted_at timestamptz);
create table public.direct_messages(id bigint generated always as identity primary key, friend_connection_id uuid not null references public.friend_connections on delete cascade, sender_id uuid references public.profiles on delete set null, body text not null, created_at timestamptz not null default now());

insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.profiles(id) select id from auth.users;
insert into public.qr_codes(id, code_key, display_name) values ('11111111-1111-4111-8111-111111111111', 'cafe', 'Cafe'), ('22222222-2222-4222-8222-222222222222', 'park', null);
insert into public.qr_groups(id, qr_code_id) values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
insert into public.group_memberships(group_id, user_id) select '33333333-3333-4333-8333-333333333333', id from public.profiles;
insert into public.friend_connections(id, user_a_id, user_b_id, requested_by_id, accepted_at)
values ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now());
insert into public.direct_messages(friend_connection_id, sender_id, body, created_at)
values ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dm 2', now() - interval '2 minutes');
insert into public.group_messages(group_id, sender_id, body, created_at) values
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'group 1', now() - interval '3 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'group 3', now() - interval '1 minute');

\ir ../../../../supabase/migrations/20261005153316_rbac_roles_permissions.sql
\ir ../../../../supabase/migrations/20261005190000_normalize_user_roles.sql
insert into public.user_roles(user_id, role_id) select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id from public.roles where key = 'admin';
\ir ../../../../supabase/migrations/20261006120000_reduce_schema.sql

do $$ begin
  assert (select array_agg(body order by id) = array['group 1', 'dm 2', 'group 3'] from public.messages), 'messages keep their chronological order';
  assert (select count(*) = 2 from public.messages where group_id = '11111111-1111-4111-8111-111111111111'), 'QR messages move to the code''s group';
  assert (select count(*) = 1 from public.messages where group_id = '44444444-4444-4444-8444-444444444444'), 'DMs move to the friendship''s group';
  assert (select count(*) = 2 from public.group_members where group_id = '11111111-1111-4111-8111-111111111111'), 'memberships move to the code''s group';
  assert (select name = 'Cafe' from public.groups where code_key = 'cafe'), 'chat names are kept';
  assert (select count(*) = 1 from public.groups where code_key = 'park'), 'codes without an open chat are kept';
  assert (select count(*) = 1 from public.friendships where group_id = '44444444-4444-4444-8444-444444444444' and accepted_at is not null), 'friendships are kept';
  assert (select count(*) = 0 from public.roles where key = 'free'), 'the implicit free role is gone';
  assert (select count(*) = 1 from public.user_roles), 'only meaningful assignments remain';
  assert (select count(*) = 3 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('group_members', 'messages', 'friendships')), 'new tables publish changes';
end $$;

\ir authorization.sql
