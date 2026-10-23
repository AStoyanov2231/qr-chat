-- Members get the owner's place photo with the venue, so it can stand in for the group's image.
create or replace function private.venue_info(p_group_id uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('owner_id', p.owner_id, 'link_url', p.link_url, 'menu_path', p.menu_path, 'photo_path', p.photo_path)
  from public.places p
  where p.group_id = p_group_id and p.deleted_at is null and private.is_business(p.owner_id);
$$;
