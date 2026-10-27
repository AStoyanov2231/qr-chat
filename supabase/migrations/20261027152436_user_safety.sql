-- User safety (App Store 1.2): block anyone you can see, unblock, and report users or groups.

-- Blocks a user and ends any friendship or request between you.
create function private.block_user(p_user_id uuid) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id = v_user_id then raise exception 'Invalid user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(v_user_id, p_user_id)::text || greatest(v_user_id, p_user_id)::text, 0));
  insert into public.user_blocks(blocker_id, blocked_id) values (v_user_id, p_user_id) on conflict do nothing;
  delete from public.friendships f where f.user_a_id = least(v_user_id, p_user_id) and f.user_b_id = greatest(v_user_id, p_user_id);
  return true;
end;
$$;

create function public.block_user(p_user_id uuid) returns boolean
  language sql set search_path = '' as $$ select private.block_user(p_user_id); $$;

-- Unchanged from the baseline except a pending request can be blocked too (Block answers repeat requests).
create or replace function private.block_friend_connection(p_connection_id uuid) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_peer uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select case when f.user_a_id = v_user_id then f.user_b_id else f.user_a_id end into v_peer
  from public.friendships f
  where f.group_id = p_connection_id and v_user_id in (f.user_a_id, f.user_b_id);
  if v_peer is null then return false; end if;
  return private.block_user(v_peer);
end;
$$;

-- Unblocking is deleting your own row.
create policy user_blocks_delete_own on public.user_blocks for delete to authenticated using (blocker_id = (select auth.uid()));
grant delete on public.user_blocks to authenticated;

-- The people you blocked, with names: they may no longer share a group or friendship with you,
-- so profile RLS would hide them.
create function private.blocked_users() returns jsonb
  language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path) order by b.created_at desc), '[]'::jsonb)
  from public.user_blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid());
$$;

revoke all on function private.block_user(uuid), public.block_user(uuid), private.blocked_users() from public, anon;
grant execute on function private.block_user(uuid), public.block_user(uuid), private.blocked_users() to authenticated, service_role;

-- Reports are insert-only for the reporter; nobody else can read them (no select policy).
-- Targets carry no foreign key so a report outlives the reported account or group.
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reported_user_id uuid,
  group_id uuid,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  details text check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  check (num_nonnulls(reported_user_id, group_id) = 1)
);
create index reports_reporter_id_idx on public.reports (reporter_id);
alter table public.reports enable row level security;
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
revoke all on public.reports from anon, authenticated;
grant insert (reported_user_id, group_id, reason, details) on public.reports to authenticated;
grant all on public.reports to service_role;

-- Unchanged from 20261019211909_chat_reads except the top-level `blocked` list.
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
    'directPreviews', coalesce((select jsonb_object_agg(f.group_id, f.preview) from connections f where f.accepted_at is not null), '{}'::jsonb),
    'unread', coalesce((select jsonb_object_agg(c.group_id, c.unread) from (
        select m.group_id, private.unread_count(m.group_id, m.joined_at) as unread
        from public.group_members m where m.user_id = (select auth.uid())
        union all
        select f.group_id, private.unread_count(f.group_id, '-infinity') from connections f where f.accepted_at is not null
      ) c where c.unread > 0), '{}'::jsonb),
    'blocked', private.blocked_users()
  ) where (select auth.uid()) is not null;
$$;
