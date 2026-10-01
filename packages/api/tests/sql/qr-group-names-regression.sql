\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_key text NOT NULL UNIQUE,
  display_name text
);
CREATE TABLE public.qr_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id uuid NOT NULL,
  CONSTRAINT qr_groups_qr_code_id_key UNIQUE (qr_code_id),
  CONSTRAINT qr_groups_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES public.qr_codes(id)
);
CREATE TABLE public.group_memberships (
  group_id uuid NOT NULL REFERENCES public.qr_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id)
);
CREATE TABLE public.group_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.qr_groups(id) ON DELETE CASCADE,
  body text NOT NULL
);

CREATE FUNCTION public.delete_empty_qr_group() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.group_memberships AS membership WHERE membership.group_id = OLD.group_id
  ) THEN
    DELETE FROM public.qr_groups AS room WHERE room.id = OLD.group_id;
  END IF;
  RETURN OLD;
END;
$function$;
CREATE TRIGGER delete_empty_qr_group
AFTER DELETE ON public.group_memberships
FOR EACH ROW EXECUTE FUNCTION public.delete_empty_qr_group();

\ir ../../sql/qr-group-names.sql
\ir ../../sql/qr-group-named-join-idempotency.sql

-- Preserve the legacy optional-name RPC contract alongside the new strict RPC.
CREATE FUNCTION public.join_qr_group(p_code_key text, p_display_name text DEFAULT NULL::text)
RETURNS TABLE(group_id uuid, qr_code_id uuid, expires_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT * FROM private.join_qr_group(p_code_key, p_display_name);
$function$;

DO $test$
DECLARE
  first_join record;
  retry_join record;
  other_member_join record;
  old_room uuid;
  old_expiry timestamptz;
  stored_name text;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SELECT * INTO first_join FROM public.join_named_qr_group('table-one', 'Happy Cafe');
  old_room := first_join.group_id;
  old_expiry := first_join.expires_at;
  INSERT INTO public.group_messages (group_id, body) VALUES (old_room, 'keep this message');

  -- Retry after an unknown successful response must keep room, expiry, and messages.
  SELECT * INTO retry_join FROM public.join_named_qr_group('table-one', 'Different name');
  IF retry_join.group_id <> old_room OR retry_join.expires_at <> old_expiry
     OR retry_join.display_name <> 'Happy Cafe'
     OR (SELECT count(*) FROM public.group_messages WHERE group_id = old_room) <> 1 THEN
    RAISE EXCEPTION 'same-QR retry changed its membership, name, expiry, or messages';
  END IF;

  -- A later participant joins the same QR but receives the first shared name.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
  SELECT * INTO other_member_join FROM public.join_named_qr_group('table-one', 'Another Cafe');
  IF other_member_join.group_id <> old_room OR other_member_join.display_name <> 'Happy Cafe'
     OR (SELECT display_name FROM public.qr_codes WHERE code_key = 'table-one') <> 'Happy Cafe' THEN
    RAISE EXCEPTION 'a later join replaced the first shared QR name';
  END IF;

  -- Deleting the room keeps the QR record and its shared name.
  DELETE FROM public.group_memberships WHERE group_id = old_room;
  IF EXISTS (SELECT 1 FROM public.qr_groups WHERE id = old_room)
     OR (SELECT display_name FROM public.qr_codes WHERE code_key = 'table-one') <> 'Happy Cafe' THEN
    RAISE EXCEPTION 'the QR name did not persist after room deletion';
  END IF;

  -- Legacy unnamed active rooms can be named without rejoining or losing messages.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SELECT * INTO first_join FROM public.join_qr_group('legacy-table', NULL);
  old_room := first_join.group_id;
  old_expiry := first_join.expires_at;
  INSERT INTO public.group_messages (group_id, body) VALUES (old_room, 'legacy message');
  stored_name := public.name_current_qr_chat_if_empty('legacy-table', 'Recovered Cafe');
  IF stored_name <> 'Recovered Cafe'
     OR (SELECT id FROM public.qr_groups WHERE qr_code_id = first_join.qr_code_id) <> old_room
     OR (SELECT expires_at FROM public.group_memberships WHERE user_id = '11111111-1111-4111-8111-111111111111') <> old_expiry
     OR (SELECT count(*) FROM public.group_messages WHERE group_id = old_room) <> 1 THEN
    RAISE EXCEPTION 'naming a legacy room changed its membership or messages';
  END IF;

  -- Name validation happens before a QR switch, so failed submission keeps membership.
  BEGIN
    PERFORM * FROM public.join_named_qr_group('must-not-join', '');
    RAISE EXCEPTION 'an empty chat name unexpectedly joined';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  IF (SELECT group_id FROM public.group_memberships WHERE user_id = '11111111-1111-4111-8111-111111111111') <> old_room THEN
    RAISE EXCEPTION 'failed naming removed the previous membership';
  END IF;

  -- Non-members cannot name an active chat.
  BEGIN
    PERFORM public.name_current_qr_chat_if_empty('not-current', 'Invalid access');
    RAISE EXCEPTION 'non-member unexpectedly named a QR chat';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'non-member unexpectedly named a QR chat' THEN RAISE; END IF;
  END;
END;
$test$;

SELECT 'qr group naming SQL regression fixture passed' AS result;
