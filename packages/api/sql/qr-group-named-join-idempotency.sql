-- Applied as qr_group_named_join_idempotency after qr_group_shared_names.
-- The signature and generated database types do not change.
-- Replace only the private implementation; public invoker wrapper and grants stay intact.
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

  -- A separate statement returns the first name saved by the row-locked upsert.
  SELECT code.display_name INTO v_saved_name
  FROM public.qr_codes AS code
  WHERE code.id = v_qr_code_id;

  RETURN QUERY
  SELECT v_group_id, v_qr_code_id, v_expires_at, v_saved_name;
END;
$function$;
