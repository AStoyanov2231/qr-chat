-- Baseline: full schema, grants, reference data, buckets and cron jobs of production as of 2026-10-17



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."accept_friend_request"("p_connection_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  update public.friendships f set accepted_at = now()
  where f.group_id = p_connection_id and f.accepted_at is null
    and f.requested_by_id <> v_user_id and v_user_id in (f.user_a_id, f.user_b_id);
  return found;
end;
$$;


ALTER FUNCTION "private"."accept_friend_request"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."block_friend_connection"("p_connection_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_peer uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select case when f.user_a_id = v_user_id then f.user_b_id else f.user_a_id end into v_peer
  from public.friendships f
  where f.group_id = p_connection_id and f.accepted_at is not null and v_user_id in (f.user_a_id, f.user_b_id);
  if v_peer is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(v_user_id, v_peer)::text || greatest(v_user_id, v_peer)::text, 0));
  insert into public.user_blocks(blocker_id, blocked_id) values (v_user_id, v_peer) on conflict do nothing;
  delete from public.friendships f where f.group_id = p_connection_id;
  return true;
end;
$$;


ALTER FUNCTION "private"."block_friend_connection"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."broadcast"("p_topic" "text", "p_payload" "jsonb") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select realtime.send(p_payload, 'change', p_topic, true);
$$;


ALTER FUNCTION "private"."broadcast"("p_topic" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."broadcast_friendship"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_row public.friendships := coalesce(new, old);
  v_payload jsonb := pg_catalog.jsonb_build_object('table', 'friendships', 'type', tg_op, 'group_id', v_row.group_id);
begin
  perform private.broadcast('user:' || v_row.user_a_id, v_payload);
  perform private.broadcast('user:' || v_row.user_b_id, v_payload);
  return null;
end;
$$;


ALTER FUNCTION "private"."broadcast_friendship"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."broadcast_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  c_busy_room_members constant integer := 300;  -- above this, member lists refresh on the clients' safety timer
  v_row public.group_members := coalesce(new, old);
  v_payload jsonb := pg_catalog.jsonb_build_object('table', 'group_members', 'type', tg_op, 'group_id', v_row.group_id);
begin
  if tg_op = 'DELETE' and public.expires_at(old) <= pg_catalog.now() then return null; end if;
  perform private.broadcast('user:' || v_row.user_id, v_payload);
  -- Every member event makes every member refetch the overview, so busy rooms skip it.
  if not exists (select 1 from public.group_members m where m.group_id = v_row.group_id offset c_busy_room_members) then
    perform private.broadcast('group:' || v_row.group_id, v_payload);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "private"."broadcast_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."broadcast_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_payload jsonb := pg_catalog.jsonb_build_object('table', 'messages', 'type', tg_op, 'id', new.id, 'group_id', new.group_id);
  v_friendship record;
begin
  if exists (select 1 from public.groups g where g.id = new.group_id and g.code_key is not null) then
    perform private.broadcast('group:' || new.group_id, v_payload);
  else
    for v_friendship in select f.user_a_id, f.user_b_id from public.friendships f where f.group_id = new.group_id loop
      perform private.broadcast('user:' || v_friendship.user_a_id, v_payload);
      perform private.broadcast('user:' || v_friendship.user_b_id, v_payload);
    end loop;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "private"."broadcast_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."broadcast_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_payload jsonb := pg_catalog.jsonb_build_object('table', 'profiles', 'type', tg_op, 'user_id', new.id);
  v_topic text;
begin
  if old.display_name is not distinct from new.display_name and old.avatar_path is not distinct from new.avatar_path then
    return null;
  end if;
  for v_topic in
    select 'user:' || new.id
    union select 'group:' || m.group_id from public.group_members m where m.user_id = new.id and public.expires_at(m) > pg_catalog.now()
    union select 'user:' || case when f.user_a_id = new.id then f.user_b_id else f.user_a_id end
      from public.friendships f where new.id in (f.user_a_id, f.user_b_id)
  loop
    perform private.broadcast(v_topic, v_payload);
  end loop;
  return null;
end;
$$;


ALTER FUNCTION "private"."broadcast_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_group"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.is_current_group_member(p_group_id, p_user_id)
    or exists (
      select 1 from public.friendships f
      where f.group_id = p_group_id and f.accepted_at is not null and p_user_id in (f.user_a_id, f.user_b_id)
    );
$$;


ALTER FUNCTION "private"."can_access_group"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_assign_role"("p_role_id" smallint, "p_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((
    select private.has_permission(p.key, p_group_id)
    from public.roles r join public.permissions p on p.id = r.assign_permission_id
    where r.id = p_role_id
  ), false);
$$;


ALTER FUNCTION "private"."can_assign_role"("p_role_id" smallint, "p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_receive_topic"("p_topic" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null or p_topic is null
    or p_topic !~ '^(group|user):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := pg_catalog.split_part(p_topic, ':', 2)::uuid;
  if pg_catalog.starts_with(p_topic, 'user:') then return v_id = v_user_id; end if;
  return private.is_current_group_member(v_id, v_user_id);
end;
$_$;


ALTER FUNCTION "private"."can_receive_topic"("p_topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_view_profile"("p_target_user_id" "uuid", "p_viewer_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."can_view_profile"("p_target_user_id" "uuid", "p_viewer_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."clear_empty_group"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and old.group_id = new.group_id then return null; end if;
  delete from public.messages
  where group_id = old.group_id
    and not exists (select 1 from public.group_members where group_id = old.group_id);
  return null;
end;
$$;


ALTER FUNCTION "private"."clear_empty_group"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."delete_friendship_group"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  delete from public.groups where id = old.group_id;
  return null;
end;
$$;


ALTER FUNCTION "private"."delete_friendship_group"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."delete_old_group_messages"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  c_group_message_retention constant interval := interval '30 days';
  v_deleted bigint;
begin
  delete from public.messages m
  using public.groups g
  where g.id = m.group_id and g.code_key is not null
    and m.created_at < pg_catalog.now() - c_group_message_retention;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "private"."delete_old_group_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."expire_qr_memberships"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_deleted_count bigint;
begin
  delete from public.group_members m where public.expires_at(m) <= now();
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;


ALTER FUNCTION "private"."expire_qr_memberships"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_permission"("p_permission" "text", "p_group_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = (select auth.uid())
      and p.key = p_permission
      and (ur.expires_at is null or ur.expires_at > now())
      and (ur.group_id is null or ur.group_id = p_group_id)
  );
$$;


ALTER FUNCTION "private"."has_permission"("p_permission" "text", "p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_current_group_member"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id and public.expires_at(m) > now()
  );
$$;


ALTER FUNCTION "private"."is_current_group_member"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."join_qr_group"("p_code_key" "text") RETURNS TABLE("group_id" "uuid", "expires_at" timestamp with time zone, "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."join_qr_group"("p_code_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."leave_qr_group"("p_group_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  delete from public.group_members m where m.user_id = v_user_id and m.group_id = p_group_id
  returning m.group_id into v_group_id;
  return v_group_id;
end;
$$;


ALTER FUNCTION "private"."leave_qr_group"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."limit_message_rate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  c_messages_per_minute constant integer := 30;
  c_slow_mode_min_members constant integer := 300;  -- slow mode applies above this many members
  c_slow_mode_interval constant interval := interval '5 seconds';
begin
  if new.sender_id is null then return new; end if;
  -- Serializes one sender's inserts so concurrent requests cannot both pass the count.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('message-rate:' || new.sender_id::text, 0));
  if (select pg_catalog.count(*) from (
        select 1 from public.messages m
        where m.sender_id = new.sender_id and m.created_at > pg_catalog.now() - interval '1 minute'
        limit c_messages_per_minute) recent) >= c_messages_per_minute then
    raise exception 'You are sending messages too fast. Wait a moment and try again.' using errcode = 'PT429';
  end if;
  if exists (select 1 from public.group_members gm where gm.group_id = new.group_id offset c_slow_mode_min_members)
    and exists (select 1 from public.messages m
      where m.sender_id = new.sender_id and m.group_id = new.group_id
        and m.created_at > pg_catalog.now() - c_slow_mode_interval) then
    raise exception 'Slow mode is on in this busy chat. Wait a few seconds between messages.' using errcode = 'PT429';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."limit_message_rate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."name_product_group"("p_group_id" "uuid", "p_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_name text := pg_catalog.btrim(p_name);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if pg_catalog.char_length(v_name) not between 1 and 100 or v_name ~ '[[:cntrl:]]' then
    raise exception 'Invalid product name';
  end if;
  update public.groups g set name = v_name
  where g.id = p_group_id and g.name is null and g.code_key ~ '^gtin:[0-9]{13}$'
    and exists (select 1 from public.group_members m
      where m.group_id = g.id and m.user_id = auth.uid() and public.expires_at(m) > pg_catalog.now());
  if not found then raise exception 'This group cannot be named'; end if;
end;
$_$;


ALTER FUNCTION "private"."name_product_group"("p_group_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_code"("p_code" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select case
    when p_code ~* '^https?://' then
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(p_code, '[?#].*$', ''),
        '^(https?://)[^/@]*@', '\1', 'i'), '/+$', '')
    when p_code ~ '^gtin:[0-9]{13}$' then p_code
    when p_code ~* '^(wifi|mecard|bizcard|begin|vcard|mailto|matmsg|tel|sms|smsto|mms|geo|otpauth|upi|payto|sepa|bitcoin|ethereum|litecoin|monero|webcal|facetime|skype|whatsapp|javascript|data|file|ftp|vbscript|intent):'
      or p_code ~ '[;\r\n]' then null
    else p_code
  end
$_$;


ALTER FUNCTION "private"."normalize_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reject_blocked_friendship"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_a_id::text || new.user_b_id::text, 0));
  if exists (select 1 from public.user_blocks
    where (blocker_id = new.user_a_id and blocked_id = new.user_b_id)
       or (blocker_id = new.user_b_id and blocked_id = new.user_a_id)) then
    raise exception 'This friendship is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."reject_blocked_friendship"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."remove_friend_connection"("p_connection_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  delete from public.friendships f where f.group_id = p_connection_id and v_user_id in (f.user_a_id, f.user_b_id);
  return found;
end;
$$;


ALTER FUNCTION "private"."remove_friend_connection"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."send_friend_request"("p_receiver_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_sender_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_sender_id is null then raise exception 'Authentication required'; end if;
  if p_receiver_id is null or p_receiver_id = v_sender_id then
    raise exception 'Invalid friend request recipient';
  end if;
  if not exists (
    select 1
    from public.group_members sender join public.group_members receiver on receiver.group_id = sender.group_id
    where sender.user_id = v_sender_id and receiver.user_id = p_receiver_id
      and public.expires_at(sender) > now() and public.expires_at(receiver) > now()
  ) then
    raise exception 'Friend requests require a shared active QR group';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(least(v_sender_id, p_receiver_id)::text || greatest(v_sender_id, p_receiver_id)::text, 0));
  if exists (select 1 from public.friendships f
    where f.user_a_id = least(v_sender_id, p_receiver_id) and f.user_b_id = greatest(v_sender_id, p_receiver_id)) then
    raise exception 'A friend request or friendship already exists';
  end if;

  insert into public.groups default values returning id into v_group_id;
  insert into public.friendships(group_id, user_a_id, user_b_id, requested_by_id)
  values (v_group_id, least(v_sender_id, p_receiver_id), greatest(v_sender_id, p_receiver_id), v_sender_id);
  return v_group_id;
end;
$$;


ALTER FUNCTION "private"."send_friend_request"("p_receiver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_friend_request"("p_connection_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.accept_friend_request(p_connection_id); $$;


ALTER FUNCTION "public"."accept_friend_request"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_friend_connection"("p_connection_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.block_friend_connection(p_connection_id); $$;


ALTER FUNCTION "public"."block_friend_connection"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."erase_user_messages"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ delete from public.messages where sender_id = p_user_id; $$;


ALTER FUNCTION "public"."erase_user_messages"("p_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "user_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expires_at"("public"."group_members") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $_$
  select $1.joined_at + interval '1 day';
$_$;


ALTER FUNCTION "public"."expires_at"("public"."group_members") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_access"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'userId', (select auth.uid()),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('group_id', m.group_id, 'expires_at', public.expires_at(m)) order by m.group_id)
      from public.group_members m where m.user_id = (select auth.uid())), '[]'::jsonb),
    'acceptedConnectionIds', coalesce((select jsonb_agg(f.group_id order by f.group_id)
      from public.friendships f where f.accepted_at is not null
        and (f.user_a_id = (select auth.uid()) or f.user_b_id = (select auth.uid()))), '[]'::jsonb)
  ) where (select auth.uid()) is not null;
$$;


ALTER FUNCTION "public"."get_chat_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_overview"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_chat_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_qr_group"("p_code_key" "text") RETURNS TABLE("group_id" "uuid", "expires_at" timestamp with time zone, "name" "text")
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select * from private.join_qr_group(p_code_key); $$;


ALTER FUNCTION "public"."join_qr_group"("p_code_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_qr_group"("p_group_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.leave_qr_group(p_group_id); $$;


ALTER FUNCTION "public"."leave_qr_group"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_permissions"("p_group_id" "uuid" DEFAULT NULL::"uuid") RETURNS SETOF "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select distinct p.key
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = (select auth.uid())
    and (ur.expires_at is null or ur.expires_at > now())
    and (ur.group_id is null or ur.group_id = p_group_id)
  order by p.key;
$$;


ALTER FUNCTION "public"."my_permissions"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."name_product_group"("p_group_id" "uuid", "p_name" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.name_product_group(p_group_id, p_name); $$;


ALTER FUNCTION "public"."name_product_group"("p_group_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_friend_connection"("p_connection_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.remove_friend_connection(p_connection_id); $$;


ALTER FUNCTION "public"."remove_friend_connection"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_friend_request"("p_receiver_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.send_friend_request(p_receiver_id); $$;


ALTER FUNCTION "public"."send_friend_request"("p_receiver_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."qr_join_log" (
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."qr_join_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "group_id" "uuid" NOT NULL,
    "user_a_id" "uuid" NOT NULL,
    "user_b_id" "uuid" NOT NULL,
    "requested_by_id" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "friendships_check" CHECK (("user_a_id" < "user_b_id")),
    CONSTRAINT "friendships_check1" CHECK ((("requested_by_id" = "user_a_id") OR ("requested_by_id" = "user_b_id"))),
    CONSTRAINT "friendships_check2" CHECK ((("accepted_at" IS NULL) OR ("accepted_at" >= "requested_at")))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code_key" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_path" "text",
    "metadata_checked_at" timestamp with time zone,
    CONSTRAINT "groups_code_key_check" CHECK (((("char_length"("code_key") >= 1) AND ("char_length"("code_key") <= 512)) AND ("code_key" = "btrim"("code_key")))),
    CONSTRAINT "groups_image_path_check" CHECK (("image_path" ~ '^([0-9a-f-]{36}|p/[0-9]{8,14})\.jpg$'::"text")),
    CONSTRAINT "groups_name_check" CHECK ((("name" IS NULL) OR ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 100)) AND ("name" = "btrim"("name")))))
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" bigint NOT NULL,
    "group_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_body_check" CHECK (((("char_length"("body") >= 1) AND ("char_length"("body") <= 4000)) AND ("char_length"("btrim"("body")) > 0)))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


ALTER TABLE "public"."messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" smallint NOT NULL,
    "key" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "permissions_key_check" CHECK (("key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::"text"))
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


ALTER TABLE "public"."permissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."permissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."products" (
    "gtin" "text" NOT NULL,
    "name" "text",
    "image_path" "text",
    "not_found" boolean DEFAULT false NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_check" CHECK (("not_found" = ("name" IS NULL))),
    CONSTRAINT "products_gtin_check" CHECK (("gtin" ~ '^[0-9]{8,14}$'::"text")),
    CONSTRAINT "products_image_path_check" CHECK (("image_path" ~ '^p/[0-9]{8,14}\.jpg$'::"text")),
    CONSTRAINT "products_name_check" CHECK ((("name" IS NULL) OR (("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 100) AND ("name" = "btrim"("name")))))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_avatar_path_check" CHECK ((("avatar_path" ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'::"text") AND ("split_part"("avatar_path", '/'::"text", 1) = ("id")::"text"))),
    CONSTRAINT "profiles_display_name_check" CHECK ((("display_name" IS NULL) OR ((("char_length"("btrim"("display_name")) >= 1) AND ("char_length"("btrim"("display_name")) <= 50)) AND ("display_name" = "btrim"("display_name")))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" smallint NOT NULL,
    "permission_id" smallint NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" smallint NOT NULL,
    "key" "text" NOT NULL,
    "assign_permission_id" smallint,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "roles_key_check" CHECK (("key" ~ '^[a-z][a-z0-9_]*$'::"text"))
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


ALTER TABLE "public"."roles" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_check" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" smallint NOT NULL,
    "group_id" "uuid",
    "granted_by" "uuid" DEFAULT "auth"."uid"(),
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE "public"."user_roles" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("group_id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_a_id_user_b_id_key" UNIQUE ("user_a_id", "user_b_id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("user_id", "group_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_code_key_key" UNIQUE ("code_key");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("gtin");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_assignment_key" UNIQUE NULLS NOT DISTINCT ("user_id", "role_id", "group_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



CREATE INDEX "qr_join_log_user_id_joined_at_idx" ON "private"."qr_join_log" USING "btree" ("user_id", "joined_at");



CREATE INDEX "friendships_requested_by_id_idx" ON "public"."friendships" USING "btree" ("requested_by_id");



CREATE INDEX "friendships_user_b_id_idx" ON "public"."friendships" USING "btree" ("user_b_id");



CREATE INDEX "group_members_group_id_idx" ON "public"."group_members" USING "btree" ("group_id");



CREATE INDEX "messages_group_id_id_idx" ON "public"."messages" USING "btree" ("group_id", "id");



CREATE INDEX "messages_sender_id_created_at_idx" ON "public"."messages" USING "btree" ("sender_id", "created_at");



CREATE INDEX "role_permissions_permission_id_idx" ON "public"."role_permissions" USING "btree" ("permission_id");



CREATE INDEX "user_blocks_blocked_id_idx" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "user_roles_granted_by_idx" ON "public"."user_roles" USING "btree" ("granted_by") WHERE ("granted_by" IS NOT NULL);



CREATE INDEX "user_roles_group_id_idx" ON "public"."user_roles" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);



CREATE INDEX "user_roles_role_id_idx" ON "public"."user_roles" USING "btree" ("role_id");



CREATE OR REPLACE TRIGGER "broadcast_friendship" AFTER INSERT OR DELETE OR UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "private"."broadcast_friendship"();



CREATE OR REPLACE TRIGGER "broadcast_membership" AFTER INSERT OR DELETE OR UPDATE ON "public"."group_members" FOR EACH ROW EXECUTE FUNCTION "private"."broadcast_membership"();



CREATE OR REPLACE TRIGGER "broadcast_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."broadcast_message"();



CREATE OR REPLACE TRIGGER "broadcast_profile" AFTER UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."broadcast_profile"();



CREATE OR REPLACE TRIGGER "clear_empty_group" AFTER DELETE OR UPDATE OF "group_id" ON "public"."group_members" FOR EACH ROW EXECUTE FUNCTION "private"."clear_empty_group"();



CREATE OR REPLACE TRIGGER "delete_friendship_group" AFTER DELETE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "private"."delete_friendship_group"();



CREATE OR REPLACE TRIGGER "limit_message_rate" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."limit_message_rate"();



CREATE OR REPLACE TRIGGER "reject_blocked_friendship" BEFORE INSERT ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "private"."reject_blocked_friendship"();



ALTER TABLE ONLY "private"."qr_join_log"
    ADD CONSTRAINT "qr_join_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_assign_permission_id_fkey" FOREIGN KEY ("assign_permission_id") REFERENCES "public"."permissions"("id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "private"."qr_join_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "catalog_read" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "catalog_read" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "catalog_read" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_select" ON "public"."friendships" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_a_id") OR (( SELECT "auth"."uid"() AS "uid") = "user_b_id")));



ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_select" ON "public"."group_members" FOR SELECT TO "authenticated" USING ((("public"."expires_at"("group_members".*) > "now"()) AND ( SELECT "private"."is_current_group_member"("group_members"."group_id", ( SELECT "auth"."uid"() AS "uid")) AS "is_current_group_member")));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_select" ON "public"."groups" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_access_group"("groups"."id", ( SELECT "auth"."uid"() AS "uid")) AS "can_access_group"));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."can_access_group"("messages"."group_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_access_group")));



CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_access_group"("messages"."group_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_access_group"));



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select_visible" ON "public"."profiles" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_view_profile"("profiles"."id", ( SELECT "auth"."uid"() AS "uid")) AS "can_view_profile"));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks_select" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING (("blocker_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_delete" ON "public"."user_roles" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_assign_role"("user_roles"."role_id", "user_roles"."group_id") AS "can_assign_role"));



CREATE POLICY "user_roles_insert" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."can_assign_role"("user_roles"."role_id", "user_roles"."group_id") AS "can_assign_role"));



CREATE POLICY "user_roles_select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."has_permission"('roles.view_any'::"text", "user_roles"."group_id") AS "has_permission")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "private"."accept_friend_request"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."accept_friend_request"("p_connection_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."block_friend_connection"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."block_friend_connection"("p_connection_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."broadcast"("p_topic" "text", "p_payload" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."broadcast_friendship"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."broadcast_membership"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."broadcast_message"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."broadcast_profile"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."can_access_group"("p_group_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_group"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_assign_role"("p_role_id" smallint, "p_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_assign_role"("p_role_id" smallint, "p_group_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_receive_topic"("p_topic" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_receive_topic"("p_topic" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_view_profile"("p_target_user_id" "uuid", "p_viewer_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_view_profile"("p_target_user_id" "uuid", "p_viewer_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."clear_empty_group"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."delete_friendship_group"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."delete_old_group_messages"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."expire_qr_memberships"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."has_permission"("p_permission" "text", "p_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_permission"("p_permission" "text", "p_group_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_current_group_member"("p_group_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_current_group_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."join_qr_group"("p_code_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."join_qr_group"("p_code_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."leave_qr_group"("p_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."leave_qr_group"("p_group_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."limit_message_rate"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."name_product_group"("p_group_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."name_product_group"("p_group_id" "uuid", "p_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."reject_blocked_friendship"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."remove_friend_connection"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."remove_friend_connection"("p_connection_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."send_friend_request"("p_receiver_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."send_friend_request"("p_receiver_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."accept_friend_request"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_connection_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_connection_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."block_friend_connection"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_friend_connection"("p_connection_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_friend_connection"("p_connection_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."erase_user_messages"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."erase_user_messages"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "service_role";
GRANT SELECT ON TABLE "public"."group_members" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."expires_at"("public"."group_members") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expires_at"("public"."group_members") TO "authenticated";
GRANT ALL ON FUNCTION "public"."expires_at"("public"."group_members") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_chat_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_chat_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_access"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_chat_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_chat_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_overview"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_qr_group"("p_code_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_qr_group"("p_code_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_qr_group"("p_code_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_qr_group"("p_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_qr_group"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_qr_group"("p_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_permissions"("p_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_permissions"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_permissions"("p_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."name_product_group"("p_group_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."name_product_group"("p_group_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."name_product_group"("p_group_id" "uuid", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_friend_connection"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_friend_connection"("p_connection_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_friend_connection"("p_connection_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_friend_request"("p_receiver_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_receiver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_receiver_id" "uuid") TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;









GRANT ALL ON TABLE "public"."friendships" TO "service_role";
GRANT SELECT ON TABLE "public"."friendships" TO "authenticated";



GRANT ALL ON TABLE "public"."groups" TO "service_role";
GRANT SELECT ON TABLE "public"."groups" TO "authenticated";



GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT SELECT ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("group_id") ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("sender_id") ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("body") ON TABLE "public"."messages" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."permissions" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."permissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."permissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."permissions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT INSERT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT INSERT("display_name"),UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT INSERT("avatar_path"),UPDATE("avatar_path") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."role_permissions" TO "authenticated";



GRANT ALL ON TABLE "public"."roles" TO "service_role";
GRANT SELECT ON TABLE "public"."roles" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";
GRANT SELECT ON TABLE "public"."user_blocks" TO "authenticated";



GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."user_roles" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."user_roles" TO "authenticated";



GRANT INSERT("role_id") ON TABLE "public"."user_roles" TO "authenticated";



GRANT INSERT("group_id") ON TABLE "public"."user_roles" TO "authenticated";



GRANT INSERT("expires_at") ON TABLE "public"."user_roles" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE POLICY "avatars_delete_self" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "avatars_insert_self" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text") AND ("storage"."extension"("name") = 'jpg'::"text")));



CREATE POLICY "avatars_select_self" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));





-- ===== Added after squash: things pg_dump does not capture =====

-- Grants: the dump only emits GRANTs, so default privileges left anon/authenticated with ALL. Restore production's least-privilege set.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_connection_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_friend_connection"("p_connection_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."expires_at"("public"."group_members") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_qr_group"("p_code_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_qr_group"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_permissions"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."name_product_group"("p_group_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_friend_connection"("p_connection_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_receiver_id" "uuid") TO "authenticated";
GRANT INSERT("avatar_path"),UPDATE("avatar_path") ON TABLE "public"."profiles" TO "authenticated";
GRANT INSERT("body") ON TABLE "public"."messages" TO "authenticated";
GRANT INSERT("display_name"),UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";
GRANT INSERT("expires_at") ON TABLE "public"."user_roles" TO "authenticated";
GRANT INSERT("group_id") ON TABLE "public"."messages" TO "authenticated";
GRANT INSERT("group_id") ON TABLE "public"."user_roles" TO "authenticated";
GRANT INSERT("id") ON TABLE "public"."profiles" TO "authenticated";
GRANT INSERT("role_id") ON TABLE "public"."user_roles" TO "authenticated";
GRANT INSERT("sender_id") ON TABLE "public"."messages" TO "authenticated";
GRANT INSERT("user_id") ON TABLE "public"."user_roles" TO "authenticated";
GRANT SELECT ON TABLE "public"."friendships" TO "authenticated";
GRANT SELECT ON TABLE "public"."group_members" TO "authenticated";
GRANT SELECT ON TABLE "public"."groups" TO "authenticated";
GRANT SELECT ON TABLE "public"."messages" TO "authenticated";
GRANT SELECT ON TABLE "public"."permissions" TO "authenticated";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT ON TABLE "public"."role_permissions" TO "authenticated";
GRANT SELECT ON TABLE "public"."roles" TO "authenticated";
GRANT SELECT ON TABLE "public"."user_blocks" TO "authenticated";
GRANT SELECT,DELETE ON TABLE "public"."user_roles" TO "authenticated";

-- Reference data (ids are explicit because production's role id 1, 'free', was removed)
INSERT INTO "public"."permissions" ("id", "key", "description") OVERRIDING SYSTEM VALUE VALUES
  (1, 'roles.view_any', 'See role assignments and their history (app-wide, or within a group for group roles).'),
  (2, 'roles.assign_plan', 'Grant or revoke plan roles such as subscriber.'),
  (3, 'roles.assign_staff', 'Grant or revoke staff roles (moderator, admin).'),
  (4, 'roles.assign_group_owner', 'Grant or revoke group_owner on a QR group.'),
  (5, 'roles.assign_group_moderator', 'Grant or revoke group_moderator on a QR group.');

INSERT INTO "public"."roles" ("id", "key", "assign_permission_id", "description") OVERRIDING SYSTEM VALUE VALUES
  (2, 'subscriber', 2, 'Paid plan; set expires_at to the end of the billing period.'),
  (3, 'moderator', 3, 'App-wide moderation staff.'),
  (4, 'admin', 3, 'Holds every permission, including future ones.'),
  (5, 'group_owner', 4, 'Owns one QR group, e.g. the venue behind a code.'),
  (6, 'group_moderator', 5, 'Moderates one QR group.');

INSERT INTO "public"."role_permissions" ("role_id", "permission_id") VALUES
  (3, 1), (3, 4), (3, 5),
  (4, 1), (4, 2), (4, 3), (4, 4), (4, 5),
  (5, 1), (5, 5);

SELECT setval(pg_get_serial_sequence('public.permissions', 'id'), 5);
SELECT setval(pg_get_serial_sequence('public.roles', 'id'), 6);

-- Storage buckets
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types") VALUES
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg']),
  ('group-images', 'group-images', true, 1048576, ARRAY['image/jpeg']);

-- Cron jobs
SELECT cron.schedule('delete-old-group-messages', '17 3 * * *', 'select private.delete_old_group_messages()');
SELECT cron.schedule('expire-qr-group-memberships', '* * * * *', 'select private.expire_qr_memberships()');
