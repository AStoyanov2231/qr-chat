-- Business plan: an app-wide `business` role lets an account create venue places.
-- Each place owns one QR group whose code is `v:<code>` (printed as <web origin>/v/<code>).
-- While the owner holds the role, the place shows its link and menu PDF in the group,
-- the owner is a permanent member with an Owner badge. Without the role the QR still
-- works as a plain group; a deleted place's QR stops accepting joins.

insert into public.permissions (id, key, description) overriding system value values
  (6, 'places.manage', 'Create and edit venue places and their QR codes (business plan).');
insert into public.roles (id, key, assign_permission_id, description) overriding system value values
  (7, 'business', 2, 'Business plan: owns venue places; set expires_at to the end of the billing period.');
insert into public.role_permissions (role_id, permission_id) values (7, 6), (4, 6);
select setval(pg_get_serial_sequence('public.permissions', 'id'), 6);
select setval(pg_get_serial_sequence('public.roles', 'id'), 7);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null unique references public.groups (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{10}$'),
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  link_url text check (char_length(link_url) <= 2048 and link_url ~ '^https://[^[:space:]]+$'),
  menu_path text check (menu_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' and split_part(menu_path, '/', 1) = owner_id::text),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index places_owner_id_idx on public.places (owner_id);
alter table public.places enable row level security;
-- Owners see their places, including lapsed and deleted ones; writes go through the RPCs below.
create policy places_select_own on public.places for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.places from anon, authenticated;
grant select on public.places to authenticated;
grant all on public.places to service_role;

create function private.is_business(p_user_id uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id and ur.group_id is null and p.key = 'places.manage'
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

-- A place is active while it is not deleted and its owner holds the business role.
create function private.is_venue_owner(p_group_id uuid, p_user_id uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.places p
    where p.group_id = p_group_id and p.owner_id = p_user_id and p.deleted_at is null
  ) and private.is_business(p_user_id);
$$;

create function private.venue_info(p_group_id uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('owner_id', p.owner_id, 'link_url', p.link_url, 'menu_path', p.menu_path)
  from public.places p
  where p.group_id = p_group_id and p.deleted_at is null and private.is_business(p.owner_id);
$$;

-- Owners of an active place never expire from its group.
create or replace function public.expires_at(public.group_members) returns timestamptz
  language sql stable set search_path = '' as $_$
  select case when private.is_venue_owner($1.group_id, $1.user_id) then 'infinity'::timestamptz
    else $1.joined_at + interval '1 day' end;
$_$;

create function private.new_place_code() returns text
  language sql volatile set search_path = '' as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', get_byte(b, i) % 31 + 1, 1), '' order by i)
  from extensions.gen_random_bytes(10) b, generate_series(0, 9) i;
$$;

create function private.create_place(p_name text) returns public.places
  language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := private.new_place_code();
  v_group_id uuid;
  v_place public.places;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not private.is_business(v_user_id) then raise exception 'A business plan is required' using errcode = '42501'; end if;
  insert into public.profiles (id) values (v_user_id) on conflict (id) do nothing;
  insert into public.groups (code_key, name) values ('v:' || v_code, pg_catalog.btrim(p_name)) returning id into v_group_id;
  insert into public.group_members (user_id, group_id) values (v_user_id, v_group_id);
  insert into public.places (owner_id, group_id, code, name) values (v_user_id, v_group_id, v_code, pg_catalog.btrim(p_name))
  returning * into v_place;
  return v_place;
end;
$$;

create function private.update_place(p_place_id uuid, p_name text, p_link_url text, p_menu_path text) returns public.places
  language plpgsql security definer set search_path = '' as $$
declare
  v_place public.places;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_business(auth.uid()) then raise exception 'A business plan is required' using errcode = '42501'; end if;
  update public.places p
  set name = pg_catalog.btrim(p_name), link_url = nullif(pg_catalog.btrim(p_link_url), ''), menu_path = p_menu_path
  where p.id = p_place_id and p.owner_id = auth.uid() and p.deleted_at is null
  returning * into v_place;
  if not found then raise exception 'This place is no longer available'; end if;
  update public.groups set name = v_place.name where id = v_place.group_id;
  return v_place;
end;
$$;

create function private.delete_place(p_place_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_business(auth.uid()) then raise exception 'A business plan is required' using errcode = '42501'; end if;
  update public.places set deleted_at = now()
  where id = p_place_id and owner_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'This place is no longer available'; end if;
end;
$$;

-- Unchanged except: `v:` venue codes join only while their place exists, and never create a group.
create or replace function private.join_qr_group(p_code_key text) returns table(group_id uuid, expires_at timestamptz, name text)
  language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_code_key text := private.normalize_code(pg_catalog.btrim(p_code_key));
  v_group_id uuid;
  v_name text;
  v_expires_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if v_code_key is null or pg_catalog.char_length(v_code_key) not between 1 and 512 then
    raise exception 'Invalid QR code key';
  end if;
  if pg_catalog.starts_with(v_code_key, 'v:') and not exists (
    select 1 from public.places p where p.code = pg_catalog.substr(v_code_key, 3) and p.deleted_at is null
  ) then
    raise exception 'This venue code isn''t active';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  insert into public.profiles(id) values (v_user_id) on conflict (id) do nothing;

  -- The no-op update makes RETURNING yield the existing row's id.
  insert into public.groups(code_key) values (v_code_key)
  on conflict (code_key) do update set code_key = excluded.code_key
  returning groups.id, groups.name into v_group_id, v_name;

  -- Rejoining renews this group's 1-day window; other memberships are untouched.
  -- Named constraint: the output column "group_id" would make a column list ambiguous.
  insert into public.group_members as m (user_id, group_id) values (v_user_id, v_group_id)
  on conflict on constraint group_members_pkey do update set joined_at = now()
  returning public.expires_at(m) into v_expires_at;

  return query select v_group_id, v_expires_at, v_name;
end;
$$;

-- Unchanged except each membership carries `place`: the active venue's owner, link and menu, or null.
create or replace function public.get_chat_overview() returns jsonb
  language sql stable set search_path = '' as $$
  with connections as (
    select f.*, to_jsonb(a) as user_a, to_jsonb(b) as user_b, to_jsonb(message) as preview
    from public.friendships f
    left join public.profiles a on a.id = f.user_a_id
    left join public.profiles b on b.id = f.user_b_id
    left join lateral (
      select d.* from public.messages d
      where d.group_id = f.group_id and f.accepted_at is not null
      order by d.id desc limit 1
    ) message on true
    where f.user_a_id = (select auth.uid()) or f.user_b_id = (select auth.uid())
  )
  select jsonb_build_object(
    'userId', (select auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'memberships', coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object(
        'expires_at', public.expires_at(m),
        'groups', to_jsonb(g),
        'place', private.venue_info(m.group_id),
        'members', coalesce((select jsonb_agg(to_jsonb(gm) || jsonb_build_object('expires_at', public.expires_at(gm), 'profiles', to_jsonb(p)) order by gm.joined_at, gm.user_id)
          from public.group_members gm left join public.profiles p on p.id = gm.user_id
          where gm.group_id = m.group_id), '[]'::jsonb),
        'preview', (select to_jsonb(gm) || jsonb_build_object('profiles',
          jsonb_build_object('display_name', p.display_name, 'avatar_path', p.avatar_path))
          from public.messages gm left join public.profiles p on p.id = gm.sender_id
          where gm.group_id = m.group_id order by gm.id desc limit 1),
        -- An overlapping head detects inserts below a previously observed maximum ID.
        'headIds', coalesce((select jsonb_agg(head.id order by head.id desc) from (
          select gm.id from public.messages gm where gm.group_id = m.group_id
          order by gm.id desc limit 50
        ) head), '[]'::jsonb)
      ) order by m.joined_at desc, m.group_id)
      from public.group_members m join public.groups g on g.id = m.group_id
      where m.user_id = (select auth.uid())), '[]'::jsonb),
    'friends', coalesce((select jsonb_agg(to_jsonb(f) - 'preview' || jsonb_build_object('id', f.group_id) order by f.requested_at desc, f.group_id) from connections f), '[]'::jsonb),
    'directPreviews', coalesce((select jsonb_object_agg(f.group_id, f.preview) from connections f where f.accepted_at is not null), '{}'::jsonb)
  ) where (select auth.uid()) is not null;
$$;

create function public.create_place(p_name text) returns public.places
  language sql set search_path = '' as $$ select * from private.create_place(p_name); $$;
create function public.update_place(p_place_id uuid, p_name text, p_link_url text, p_menu_path text) returns public.places
  language sql set search_path = '' as $$ select * from private.update_place(p_place_id, p_name, p_link_url, p_menu_path); $$;
create function public.delete_place(p_place_id uuid) returns void
  language sql set search_path = '' as $$ select private.delete_place(p_place_id); $$;

revoke all on function private.is_business(uuid), private.is_venue_owner(uuid, uuid), private.venue_info(uuid),
  private.new_place_code(), private.create_place(text), private.update_place(uuid, text, text, text), private.delete_place(uuid) from public;
grant execute on function private.is_business(uuid), private.is_venue_owner(uuid, uuid), private.venue_info(uuid),
  private.new_place_code(), private.create_place(text), private.update_place(uuid, text, text, text), private.delete_place(uuid) to authenticated;
revoke all on function public.create_place(text), public.update_place(uuid, text, text, text), public.delete_place(uuid) from public, anon;
grant execute on function public.create_place(text), public.update_place(uuid, text, text, text), public.delete_place(uuid) to authenticated, service_role;

-- Menus are public like the QR itself; owners write only under their own folder while on the plan.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('venue-menus', 'venue-menus', true, 10485760, array['application/pdf']);
create policy venue_menus_insert_business on storage.objects for insert to authenticated with check (
  bucket_id = 'venue-menus' and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) = 'pdf' and (select private.is_business((select auth.uid())))
);
create policy venue_menus_select_self on storage.objects for select to authenticated using (
  bucket_id = 'venue-menus' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy venue_menus_delete_self on storage.objects for delete to authenticated using (
  bucket_id = 'venue-menus' and (storage.foldername(name))[1] = (select auth.uid())::text
);
