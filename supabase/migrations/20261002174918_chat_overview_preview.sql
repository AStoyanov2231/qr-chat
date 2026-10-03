-- Preserve the group overview preview without loading a message-history page.
create or replace function public.get_chat_overview()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with mine as (
    select m.* from public.group_memberships m where m.user_id = (select auth.uid())
  ), connections as (
    select f.*, to_jsonb(a) as user_a, to_jsonb(b) as user_b, to_jsonb(message) as preview
    from public.friend_connections f
    left join public.profiles a on a.id = f.user_a_id
    left join public.profiles b on b.id = f.user_b_id
    left join lateral (
      select d.* from public.direct_messages d
      where d.friend_connection_id = f.id and f.accepted_at is not null
      order by d.id desc limit 1
    ) message on true
    where f.user_a_id = (select auth.uid()) or f.user_b_id = (select auth.uid())
  )
  select jsonb_build_object(
    'userId', (select auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'membership', (select to_jsonb(m) || jsonb_build_object('qr_groups',
      to_jsonb(g) || jsonb_build_object('qr_codes', to_jsonb(c)))
      from mine m join public.qr_groups g on g.id = m.group_id
      join public.qr_codes c on c.id = g.qr_code_id),
    'members', coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('profiles', to_jsonb(p)) order by m.joined_at, m.user_id)
      from public.group_memberships m left join public.profiles p on p.id = m.user_id
      where m.group_id = (select group_id from mine)), '[]'::jsonb),
    'friends', coalesce((select jsonb_agg(to_jsonb(f) - 'preview' order by f.requested_at desc, f.id) from connections f), '[]'::jsonb),
    'directPreviews', coalesce((select jsonb_object_agg(f.id, f.preview) from connections f where f.accepted_at is not null), '{}'::jsonb),
    'groupPreview', (select to_jsonb(gm) || jsonb_build_object('profiles',
      jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url))
      from public.group_messages gm left join public.profiles p on p.id = gm.sender_id
      where gm.group_id = (select group_id from mine) order by gm.id desc limit 1),
    -- An overlapping head detects inserts below a previously observed maximum ID.
    'groupHeadIds', coalesce((select jsonb_agg(head.id order by head.id desc) from (
      select gm.id from public.group_messages gm where gm.group_id = (select group_id from mine)
      order by gm.id desc limit 50
    ) head), '[]'::jsonb)
  ) where (select auth.uid()) is not null;
$$;
