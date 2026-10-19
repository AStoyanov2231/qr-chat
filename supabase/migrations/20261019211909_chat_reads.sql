-- Unread tracking for the chats list. One row per user and chat (a QR group or a DM, both keyed by
-- messages.group_id) holds the newest message id the user has seen. Unread = other people's messages
-- above it, capped at 100; in a QR group only messages since the user (re)joined count.

create table public.chat_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  last_read_id bigint not null,
  primary key (user_id, group_id)
);
create index chat_reads_group_id_idx on public.chat_reads (group_id);
alter table public.chat_reads enable row level security;
create policy chat_reads_select_own on public.chat_reads for select to authenticated using (user_id = (select auth.uid()));
create policy chat_reads_insert_own on public.chat_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_access_group(group_id, (select auth.uid()))));
create policy chat_reads_update_own on public.chat_reads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.can_access_group(group_id, (select auth.uid()))));
revoke all on public.chat_reads from anon, authenticated;
grant select, insert (user_id, group_id, last_read_id), update (last_read_id) on public.chat_reads to authenticated;
grant all on public.chat_reads to service_role;

-- Moves the caller's read marker forward; it never moves back.
create function public.mark_chat_read(p_group_id uuid, p_message_id bigint) returns void
  language sql set search_path = '' as $$
  insert into public.chat_reads as r (user_id, group_id, last_read_id)
  values ((select auth.uid()), p_group_id, p_message_id)
  on conflict (user_id, group_id) do update set last_read_id = greatest(r.last_read_id, excluded.last_read_id);
$$;

create function private.unread_count(p_group_id uuid, p_since timestamptz) returns integer
  language sql stable set search_path = '' as $$
  select count(*)::integer from (
    select 1 from public.messages m
    where m.group_id = p_group_id and m.created_at > p_since
      and m.sender_id is distinct from (select auth.uid())
      and m.id > coalesce((select r.last_read_id from public.chat_reads r
        where r.user_id = (select auth.uid()) and r.group_id = p_group_id), 0)
    limit 100
  ) unread;
$$;

revoke all on function public.mark_chat_read(uuid, bigint), private.unread_count(uuid, timestamptz) from public, anon;
grant execute on function public.mark_chat_read(uuid, bigint), private.unread_count(uuid, timestamptz) to authenticated, service_role;

-- Unchanged from 20261018163857_business_places except the top-level `unread` map: chat id -> count, nonzero only.
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
      ) c where c.unread > 0), '{}'::jsonb)
  ) where (select auth.uid()) is not null;
$$;
