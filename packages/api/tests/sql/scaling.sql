\set ON_ERROR_STOP on
-- Self-contained model of the live schema after 20261011150000_server_owned_group_metadata.
-- The private base migrations are not in the repo, so this restates, verbatim where possible, the parts
-- the scaling migrations touch: chat tables, expiry, access helpers, triggers, RLS, grants, realtime.
-- Then the scaling migrations run from supabase/migrations/ and scaling-assertions.sql checks them.
set client_min_messages = warning;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create schema extensions;
create table auth.users(id uuid primary key, aud text, role text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
grant usage on schema public, auth, private to anon, authenticated, service_role;
create publication supabase_realtime;

-- pg_cron stand-in: same call shape as cron.schedule(job_name, schedule, command).
create schema cron;
create table cron.job(jobid bigserial primary key, jobname text unique, schedule text not null, command text not null);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid;
$$;
create function cron.unschedule(job_name text) returns boolean language sql as $$
  with gone as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from gone);
$$;
insert into cron.job(jobname, schedule, command) values ('expire-qr-memberships', '* * * * *', 'select private.expire_qr_memberships()');

-- Supabase Realtime stand-in: realtime.send stores the broadcast the Realtime server would deliver.
-- realtime.topic() reads the topic the server sets while it authorizes a channel join.
create schema realtime;
create table realtime.messages(
  id bigserial primary key, topic text not null, extension text not null, payload jsonb, event text,
  private boolean default true, inserted_at timestamptz not null default now()
);
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), ''); $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql security definer as $$
  insert into realtime.messages(topic, extension, event, payload, private) values (topic, 'broadcast', event, payload, private);
$$;
grant usage on schema realtime to authenticated, anon;
grant select, insert on realtime.messages to authenticated;
alter table realtime.messages enable row level security;

create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or (char_length(btrim(display_name)) between 1 and 50 and display_name = btrim(display_name))),
  avatar_path text constraint profiles_avatar_path_check check (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and split_part(avatar_path, '/', 1) = id::text),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter publication supabase_realtime add table public.profiles;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  code_key text unique check (char_length(code_key) between 1 and 512 and code_key = btrim(code_key)),
  name text check (name is null or (char_length(btrim(name)) between 1 and 100 and name = btrim(name))),
  created_at timestamptz not null default now(),
  image_path text constraint groups_image_path_check check (image_path ~ '^[0-9a-f-]{36}\.jpg$'),
  metadata_checked_at timestamptz
);
create table public.group_members (
  user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint group_members_pkey primary key (user_id, group_id)
);
create index group_members_group_id_idx on public.group_members(group_id);
create table public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000 and char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index messages_group_id_id_idx on public.messages(group_id, id);
create index messages_sender_id_idx on public.messages(sender_id);
create table public.friendships (
  group_id uuid primary key references public.groups(id) on delete cascade,
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  requested_by_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (user_a_id, user_b_id),
  check (user_a_id < user_b_id),
  check (requested_by_id in (user_a_id, user_b_id)),
  check (accepted_at is null or accepted_at >= requested_at)
);
create index friendships_user_b_id_idx on public.friendships(user_b_id);
create index friendships_requested_by_id_idx on public.friendships(requested_by_id);

create function public.expires_at(public.group_members)
returns timestamptz language sql stable set search_path = '' as $$
  select $1.joined_at + interval '1 day';
$$;
revoke all on function public.expires_at(public.group_members) from public, anon;
grant execute on function public.expires_at(public.group_members) to authenticated;

create function private.is_current_group_member(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id and public.expires_at(m) > now()
  );
$$;
create function private.can_access_group(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_current_group_member(p_group_id, p_user_id)
    or exists (
      select 1 from public.friendships f
      where f.group_id = p_group_id and f.accepted_at is not null and p_user_id in (f.user_a_id, f.user_b_id)
    );
$$;
revoke all on function private.can_access_group(uuid, uuid) from public, anon;
grant execute on function private.can_access_group(uuid, uuid) to authenticated;
create function private.can_view_profile(p_target_user_id uuid, p_viewer_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_target_user_id = p_viewer_user_id
    or exists (
      select 1
      from public.group_members viewer
      join public.group_members target on target.group_id = viewer.group_id
      where viewer.user_id = p_viewer_user_id and target.user_id = p_target_user_id
        and public.expires_at(viewer) > now() and public.expires_at(target) > now()
    )
    or exists (
      select 1 from public.friendships f
      where (f.user_a_id = p_viewer_user_id and f.user_b_id = p_target_user_id)
         or (f.user_b_id = p_viewer_user_id and f.user_a_id = p_target_user_id)
    );
$$;

create function private.clear_empty_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.group_id = new.group_id then return null; end if;
  delete from public.messages
  where group_id = old.group_id
    and not exists (select 1 from public.group_members where group_id = old.group_id);
  return null;
end;
$$;
revoke all on function private.clear_empty_group() from public, anon, authenticated;
create trigger clear_empty_group after delete or update of group_id on public.group_members
  for each row execute function private.clear_empty_group();
create function private.delete_friendship_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.groups where id = old.group_id;
  return null;
end;
$$;
revoke all on function private.delete_friendship_group() from public, anon, authenticated;
create trigger delete_friendship_group after delete on public.friendships
  for each row execute function private.delete_friendship_group();
create function private.expire_qr_memberships()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_deleted_count bigint;
begin
  delete from public.group_members m where public.expires_at(m) <= now();
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- join_qr_group as of 20261011150000_server_owned_group_metadata.
create function private.join_qr_group(p_code_key text)
 returns table(group_id uuid, expires_at timestamp with time zone)
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_code_key text := pg_catalog.btrim(p_code_key);
  v_group_id uuid;
  v_expires_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if v_code_key is null or pg_catalog.char_length(v_code_key) not between 1 and 512 then
    raise exception 'Invalid QR code key';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  insert into public.profiles(id) values (v_user_id) on conflict (id) do nothing;
  insert into public.groups(code_key) values (v_code_key)
  on conflict (code_key) do update set code_key = excluded.code_key
  returning id into v_group_id;
  insert into public.group_members as m (user_id, group_id) values (v_user_id, v_group_id)
  on conflict on constraint group_members_pkey do update set joined_at = now()
  returning public.expires_at(m) into v_expires_at;
  return query select v_group_id, v_expires_at;
end;
$function$;
create function public.join_qr_group(p_code_key text)
 returns table(group_id uuid, expires_at timestamp with time zone)
 language sql set search_path to ''
as $function$ select * from private.join_qr_group(p_code_key); $function$;
revoke all on function private.join_qr_group(text) from public, anon;
revoke all on function public.join_qr_group(text) from public, anon;
grant execute on function private.join_qr_group(text) to authenticated;
grant execute on function public.join_qr_group(text) to authenticated, service_role;

create function private.leave_qr_group(p_group_id uuid)
 returns uuid
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  delete from public.group_members m where m.user_id = v_user_id and m.group_id = p_group_id
  returning m.group_id into v_group_id;
  return v_group_id;
end;
$function$;
create function public.leave_qr_group(p_group_id uuid)
 returns uuid language sql set search_path to ''
as $function$ select private.leave_qr_group(p_group_id); $function$;
revoke all on function private.leave_qr_group(uuid) from public, anon;
revoke all on function public.leave_qr_group(uuid) from public, anon;
grant execute on function private.leave_qr_group(uuid) to authenticated;
grant execute on function public.leave_qr_group(uuid) to authenticated, service_role;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.friendships enable row level security;
revoke all on public.groups, public.group_members, public.messages, public.friendships from public, anon, authenticated;
grant select on public.groups, public.group_members, public.messages, public.friendships to authenticated;
grant insert (group_id, sender_id, body) on public.messages to authenticated;
grant all on public.groups, public.group_members, public.messages, public.friendships, public.profiles to service_role;
create policy groups_select on public.groups for select to authenticated
  using ((select private.can_access_group(id, (select auth.uid()))));
create policy group_members_select on public.group_members for select to authenticated
  using (public.expires_at(group_members) > now()
    and (select private.is_current_group_member(group_id, (select auth.uid()))));
create policy messages_select on public.messages for select to authenticated
  using ((select private.can_access_group(group_id, (select auth.uid()))));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select private.can_access_group(group_id, (select auth.uid()))));
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a_id, user_b_id));
create policy profiles_select_visible on public.profiles for select to authenticated
  using ((select private.can_view_profile(id, (select auth.uid()))));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
revoke all on public.profiles from public, anon, authenticated;
grant select, insert (id, display_name, avatar_path), update (display_name, avatar_path) on public.profiles to authenticated;
alter publication supabase_realtime add table public.group_members, public.messages, public.friendships;
reset client_min_messages;

\ir scaling-migrations.sql
\ir scaling-assertions.sql
