-- Applied as qr_group_shared_names and amended by qr_group_named_join_idempotency;
-- retained as a reviewable schema fixture.
-- Production-backed behavior tests were not run.
-- Existing clients keep using join_qr_group(code, optional_name); updated clients
-- use join_named_qr_group(code, required_name) and the authenticated name helpers.

CREATE OR REPLACE FUNCTION private.join_qr_group(
  p_code_key text,
  p_display_name text DEFAULT NULL::text
)
RETURNS TABLE(group_id uuid, qr_code_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_code_key text := pg_catalog.btrim(p_code_key);
  v_display_name text := NULLIF(pg_catalog.btrim(p_display_name), '');
  v_qr_code_id uuid;
  v_group_id uuid;
  v_expires_at timestamptz := pg_catalog.now() + interval '1 day';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_code_key IS NULL OR pg_catalog.char_length(v_code_key) NOT BETWEEN 1 AND 512 THEN
    RAISE EXCEPTION 'Invalid QR code key';
  END IF;

  IF v_display_name IS NOT NULL AND (
    pg_catalog.char_length(v_display_name) > 100
    OR v_display_name ~ U&'[\0001-\001F\007F-\009F]'
  ) THEN
    RAISE EXCEPTION 'Invalid QR display name' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  INSERT INTO public.profiles (id)
  VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- The row lock and COALESCE make the first non-null name win across joins.
  INSERT INTO public.qr_codes (code_key, display_name)
  VALUES (v_code_key, v_display_name)
  ON CONFLICT (code_key) DO UPDATE
    SET display_name = COALESCE(qr_codes.display_name, EXCLUDED.display_name)
  RETURNING id INTO v_qr_code_id;

  DELETE FROM public.group_memberships AS membership
  WHERE membership.user_id = v_user_id;

  INSERT INTO public.qr_groups (qr_code_id)
  VALUES (v_qr_code_id)
  ON CONFLICT ON CONSTRAINT qr_groups_qr_code_id_key DO UPDATE
    SET qr_code_id = EXCLUDED.qr_code_id
  RETURNING qr_groups.id INTO v_group_id;

  INSERT INTO public.group_memberships (
    group_id,
    user_id,
    joined_at,
    expires_at
  )
  VALUES (
    v_group_id,
    v_user_id,
    pg_catalog.now(),
    v_expires_at
  );

  RETURN QUERY
  SELECT v_group_id, v_qr_code_id, v_expires_at;
END;
$function$;

CREATE OR REPLACE FUNCTION private.join_named_qr_group(
  p_code_key text,
  p_display_name text
)
RETURNS TABLE(
  group_id uuid,
  qr_code_id uuid,
  expires_at timestamptz,
  display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_code_key text := pg_catalog.btrim(p_code_key);
  v_display_name text := NULLIF(pg_catalog.btrim(p_display_name), '');
  v_group_id uuid;
  v_qr_code_id uuid;
  v_expires_at timestamptz;
  v_saved_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_code_key IS NULL OR pg_catalog.char_length(v_code_key) NOT BETWEEN 1 AND 512 THEN
    RAISE EXCEPTION 'Invalid QR code key';
  END IF;

  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'A chat name is required' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_display_name) > 100
     OR v_display_name ~ U&'[\0001-\001F\007F-\009F]' THEN
    RAISE EXCEPTION 'Invalid chat name' USING ERRCODE = '22023';
  END IF;

  -- Serialize retries with joins and return the existing room before the
  -- legacy helper can replace membership or delete a sole-member room.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  SELECT room.id, code.id, membership.expires_at, code.display_name
  INTO v_group_id, v_qr_code_id, v_expires_at, v_saved_name
  FROM public.qr_codes AS code
  JOIN public.qr_groups AS room ON room.qr_code_id = code.id
  JOIN public.group_memberships AS membership ON membership.group_id = room.id
  WHERE code.code_key = v_code_key
    AND membership.user_id = v_user_id
    AND membership.expires_at > pg_catalog.now()
  FOR UPDATE OF code, room, membership;

  IF FOUND THEN
    IF v_saved_name IS NULL THEN
      UPDATE public.qr_codes AS code
      SET display_name = v_display_name
      WHERE code.id = v_qr_code_id
        AND code.display_name IS NULL
      RETURNING code.display_name INTO v_saved_name;

      IF v_saved_name IS NULL THEN
        SELECT code.display_name INTO v_saved_name
        FROM public.qr_codes AS code
        WHERE code.id = v_qr_code_id;
      END IF;
    END IF;

    RETURN QUERY
    SELECT v_group_id, v_qr_code_id, v_expires_at, v_saved_name;
    RETURN;
  END IF;

  SELECT joined.group_id, joined.qr_code_id, joined.expires_at
  INTO v_group_id, v_qr_code_id, v_expires_at
  FROM private.join_qr_group(v_code_key, v_display_name) AS joined;

  IF v_qr_code_id IS NULL THEN
    RAISE EXCEPTION 'Unable to join this chat';
  END IF;

  -- This separate statement sees the canonical winner after the upsert.
  SELECT code.display_name INTO v_saved_name
  FROM public.qr_codes AS code
  WHERE code.id = v_qr_code_id;

  RETURN QUERY
  SELECT v_group_id, v_qr_code_id, v_expires_at, v_saved_name;
END;
$function$;

CREATE OR REPLACE FUNCTION private.get_qr_chat_name(p_code_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_code_key text := pg_catalog.btrim(p_code_key);
  v_display_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_code_key IS NULL OR pg_catalog.char_length(v_code_key) NOT BETWEEN 1 AND 512 THEN
    RAISE EXCEPTION 'Invalid QR code key';
  END IF;

  SELECT code.display_name INTO v_display_name
  FROM public.qr_codes AS code
  WHERE code.code_key = v_code_key;

  RETURN v_display_name;
END;
$function$;

CREATE OR REPLACE FUNCTION private.name_current_qr_chat_if_empty(
  p_code_key text,
  p_display_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_code_key text := pg_catalog.btrim(p_code_key);
  v_display_name text := NULLIF(pg_catalog.btrim(p_display_name), '');
  v_qr_code_id uuid;
  v_saved_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_code_key IS NULL OR pg_catalog.char_length(v_code_key) NOT BETWEEN 1 AND 512 THEN
    RAISE EXCEPTION 'Invalid QR code key';
  END IF;

  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'A chat name is required' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_display_name) > 100
     OR v_display_name ~ U&'[\0001-\001F\007F-\009F]' THEN
    RAISE EXCEPTION 'Invalid chat name' USING ERRCODE = '22023';
  END IF;

  -- Follow join_qr_group's user lock order, then serialize first-name writes.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  SELECT code.id, code.display_name INTO v_qr_code_id, v_saved_name
  FROM public.qr_codes AS code
  JOIN public.qr_groups AS room ON room.qr_code_id = code.id
  JOIN public.group_memberships AS membership ON membership.group_id = room.id
  WHERE code.code_key = v_code_key
    AND membership.user_id = v_user_id
    AND membership.expires_at > pg_catalog.now()
  FOR UPDATE OF code, membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active membership is required to name this chat';
  END IF;

  IF v_saved_name IS NOT NULL THEN
    RETURN v_saved_name;
  END IF;

  UPDATE public.qr_codes AS code
  SET display_name = v_display_name
  WHERE code.id = v_qr_code_id
    AND code.display_name IS NULL
  RETURNING code.display_name INTO v_saved_name;

  IF v_saved_name IS NULL THEN
    SELECT code.display_name INTO v_saved_name
    FROM public.qr_codes AS code
    WHERE code.id = v_qr_code_id;
  END IF;

  RETURN v_saved_name;
END;
$function$;

-- Keep REST-facing wrappers as invoker functions. The private helpers own access checks.
CREATE OR REPLACE FUNCTION public.join_named_qr_group(
  p_code_key text,
  p_display_name text
)
RETURNS TABLE(
  group_id uuid,
  qr_code_id uuid,
  expires_at timestamptz,
  display_name text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.join_named_qr_group(p_code_key, p_display_name);
$function$;

CREATE OR REPLACE FUNCTION public.get_qr_chat_name(p_code_key text)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.get_qr_chat_name(p_code_key);
$function$;

CREATE OR REPLACE FUNCTION public.name_current_qr_chat_if_empty(
  p_code_key text,
  p_display_name text
)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.name_current_qr_chat_if_empty(p_code_key, p_display_name);
$function$;

REVOKE ALL ON FUNCTION private.join_named_qr_group(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_qr_chat_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.name_current_qr_chat_if_empty(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_named_qr_group(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_qr_chat_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.name_current_qr_chat_if_empty(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.join_named_qr_group(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_qr_chat_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.name_current_qr_chat_if_empty(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_named_qr_group(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qr_chat_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.name_current_qr_chat_if_empty(text, text) TO authenticated;
