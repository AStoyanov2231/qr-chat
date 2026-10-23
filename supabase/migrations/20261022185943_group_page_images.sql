-- Website QR groups use the page's og:image, which is often PNG or WebP.
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'group-images';

alter table public.groups drop constraint groups_image_path_check;
alter table public.groups add constraint groups_image_path_check
  check (image_path ~ '^([0-9a-f-]{36}|p/[0-9]{8,14})\.jpg$' or image_path ~ '^u/[0-9a-f]{64}\.(jpg|png|webp)$');

-- Server-side cache of scanned website titles and images, one row per scanned address.
create table public.pages (
  url text primary key check (char_length(url) between 1 and 512),
  name text check (name is null or (char_length(btrim(name)) between 1 and 100 and name = btrim(name))),
  image_path text check (image_path ~ '^u/[0-9a-f]{64}\.(jpg|png|webp)$'),
  failed boolean not null default false,
  fetched_at timestamptz not null default now()
);
alter table public.pages enable row level security;
revoke all on public.pages from anon, authenticated;
grant all on public.pages to service_role;
