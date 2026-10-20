-- An optional photo per place, shown to its owner in the places list and editor.
alter table public.places add column photo_path text
  check (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and split_part(photo_path, '/', 1) = owner_id::text);

-- update_place gains p_photo_path; the old signature is replaced.
drop function public.update_place(uuid, text, text, text);
drop function private.update_place(uuid, text, text, text);

create function private.update_place(p_place_id uuid, p_name text, p_link_url text, p_menu_path text, p_photo_path text) returns public.places
  language plpgsql security definer set search_path = '' as $$
declare
  v_place public.places;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_business(auth.uid()) then raise exception 'A business plan is required' using errcode = '42501'; end if;
  update public.places p
  set name = pg_catalog.btrim(p_name), link_url = nullif(pg_catalog.btrim(p_link_url), ''), menu_path = p_menu_path, photo_path = p_photo_path
  where p.id = p_place_id and p.owner_id = auth.uid() and p.deleted_at is null
  returning * into v_place;
  if not found then raise exception 'This place is no longer available'; end if;
  update public.groups set name = v_place.name where id = v_place.group_id;
  return v_place;
end;
$$;

create function public.update_place(p_place_id uuid, p_name text, p_link_url text, p_menu_path text, p_photo_path text) returns public.places
  language sql set search_path = '' as $$ select * from private.update_place(p_place_id, p_name, p_link_url, p_menu_path, p_photo_path); $$;

revoke all on function private.update_place(uuid, text, text, text, text) from public;
grant execute on function private.update_place(uuid, text, text, text, text) to authenticated;
revoke all on function public.update_place(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_place(uuid, text, text, text, text) to authenticated, service_role;

-- Photos are public like menus; owners write only under their own folder while on the plan.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('venue-photos', 'venue-photos', true, 2097152, array['image/jpeg']);
create policy venue_photos_insert_business on storage.objects for insert to authenticated with check (
  bucket_id = 'venue-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) = 'jpg' and (select private.is_business((select auth.uid())))
);
create policy venue_photos_select_self on storage.objects for select to authenticated using (
  bucket_id = 'venue-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy venue_photos_delete_self on storage.objects for delete to authenticated using (
  bucket_id = 'venue-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
);
