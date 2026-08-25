-- 058_add_whatsapp_turn_buffer.sql
-- Debounce ordinary customer text before worker claim so rapid WhatsApp
-- messages behave like one conversational turn. Direct questions/greetings/
-- common critical phrases carry a zero debounce marker from the application.
-- The existing RPC signature stays unchanged for rolling-deploy safety.

BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_inbound_event(
    event_type_value TEXT,
    event_key_value TEXT,
    phone_number_id_value TEXT,
    payload_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    event_row public.whatsapp_inbound_events%ROWTYPE;
    normalized_type TEXT := BTRIM(event_type_value);
    normalized_key TEXT := BTRIM(event_key_value);
    normalized_phone_number_id TEXT := BTRIM(phone_number_id_value);
    sender_id_value TEXT;
    raw_debounce TEXT;
    raw_max_turn TEXT;
    debounce_seconds INTEGER := 0;
    max_turn_seconds INTEGER := 12;
    initial_available_at TIMESTAMPTZ := NOW();
    turn_started_at TIMESTAMPTZ;
    turn_due_at TIMESTAMPTZ;
    created_value BOOLEAN := FALSE;
BEGIN
    IF normalized_type NOT IN ('inbound_message', 'message_status')
       OR normalized_key IS NULL
       OR char_length(normalized_key) NOT BETWEEN 1 AND 240
       OR normalized_phone_number_id IS NULL
       OR char_length(normalized_phone_number_id) NOT BETWEEN 1 AND 64
       OR payload_value IS NULL
       OR jsonb_typeof(payload_value) <> 'object' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz WhatsApp inbox eventi.');
    END IF;

    IF normalized_type = 'inbound_message' THEN
        sender_id_value := NULLIF(BTRIM(payload_value ->> 'sender_id'), '');
        raw_debounce := payload_value ->> '_turn_debounce_seconds';
        raw_max_turn := payload_value ->> '_turn_max_seconds';

        IF raw_debounce ~ '^[0-9]{1,2}$' THEN
            debounce_seconds := raw_debounce::INTEGER;
        END IF;
        IF raw_max_turn ~ '^[0-9]{1,2}$' THEN
            max_turn_seconds := raw_max_turn::INTEGER;
        END IF;

        IF debounce_seconds NOT BETWEEN 0 AND 10 THEN
            debounce_seconds := 0;
        END IF;
        IF max_turn_seconds NOT BETWEEN 4 AND 30 THEN
            max_turn_seconds := 12;
        END IF;
        IF max_turn_seconds < debounce_seconds THEN
            max_turn_seconds := GREATEST(12, debounce_seconds);
        END IF;

        IF sender_id_value IS NOT NULL THEN
            initial_available_at := NOW() + make_interval(secs => debounce_seconds);
        END IF;
    END IF;

    INSERT INTO public.whatsapp_inbound_events (
        event_type,
        event_key,
        phone_number_id,
        payload,
        available_at
    )
    VALUES (
        normalized_type,
        normalized_key,
        normalized_phone_number_id,
        payload_value,
        initial_available_at
    )
    ON CONFLICT (event_key) DO NOTHING
    RETURNING * INTO event_row;

    created_value := FOUND;
    IF NOT created_value THEN
        SELECT * INTO event_row
        FROM public.whatsapp_inbound_events
        WHERE event_key = normalized_key;

        IF NOT FOUND
           OR event_row.event_type <> normalized_type
           OR event_row.phone_number_id <> normalized_phone_number_id THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'event_key_identity_mismatch');
        END IF;
    ELSIF normalized_type = 'inbound_message' AND sender_id_value IS NOT NULL THEN
        -- Only first-attempt PENDING rows participate. A retry is a separate
        -- reliability concern and must never be pulled into a fresh chat burst.
        SELECT MIN(created_at) INTO turn_started_at
        FROM public.whatsapp_inbound_events pending
        WHERE pending.event_type = 'inbound_message'
          AND pending.phone_number_id = normalized_phone_number_id
          AND COALESCE(pending.payload ->> 'sender_id', '') = sender_id_value
          AND pending.status = 'PENDING'
          AND pending.attempt_count = 0;

        IF debounce_seconds = 0 THEN
            turn_due_at := NOW();
        ELSE
            turn_due_at := LEAST(
                NOW() + make_interval(secs => debounce_seconds),
                COALESCE(turn_started_at, NOW()) + make_interval(secs => max_turn_seconds)
            );
        END IF;

        UPDATE public.whatsapp_inbound_events pending
        SET available_at = turn_due_at,
            updated_at = NOW()
        WHERE pending.event_type = 'inbound_message'
          AND pending.phone_number_id = normalized_phone_number_id
          AND COALESCE(pending.payload ->> 'sender_id', '') = sender_id_value
          AND pending.status = 'PENDING'
          AND pending.attempt_count = 0;

        SELECT * INTO event_row
        FROM public.whatsapp_inbound_events
        WHERE id = event_row.id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'created', created_value,
        'event', to_jsonb(event_row)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_whatsapp_inbound_event(TEXT, TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_whatsapp_inbound_event(TEXT, TEXT, TEXT, JSONB)
    TO service_role;

CREATE OR REPLACE FUNCTION public.claim_next_whatsapp_inbound_event(worker_id_value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    event_row public.whatsapp_inbound_events%ROWTYPE;
    normalized_worker TEXT := BTRIM(worker_id_value);
    turn_has_more BOOLEAN := FALSE;
BEGIN
    IF normalized_worker IS NULL OR char_length(normalized_worker) NOT BETWEEN 1 AND 120 THEN
        RETURN jsonb_build_object('status', 'error');
    END IF;

    UPDATE public.whatsapp_inbound_events
    SET status = 'PENDING', claimed_at = NULL, claimed_by = NULL,
        available_at = NOW(), updated_at = NOW()
    WHERE status = 'PROCESSING'
      AND claimed_at < NOW() - INTERVAL '5 minutes';

    SELECT candidate.* INTO event_row
    FROM public.whatsapp_inbound_events candidate
    WHERE candidate.status = 'PENDING'
      AND candidate.available_at <= NOW()
      AND (
          candidate.event_type <> 'inbound_message'
          OR NOT EXISTS (
              SELECT 1 FROM public.whatsapp_inbound_events earlier
              WHERE earlier.event_type = 'inbound_message'
                AND earlier.phone_number_id = candidate.phone_number_id
                AND COALESCE(earlier.payload ->> 'sender_id', '') = COALESCE(candidate.payload ->> 'sender_id', '')
                AND earlier.id < candidate.id
                AND earlier.status IN ('PENDING', 'PROCESSING')
          )
      )
    ORDER BY candidate.available_at, candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'success', 'event', NULL);
    END IF;

    IF event_row.event_type = 'inbound_message' AND event_row.attempt_count = 0 THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.whatsapp_inbound_events newer
            WHERE newer.event_type = 'inbound_message'
              AND newer.phone_number_id = event_row.phone_number_id
              AND COALESCE(newer.payload ->> 'sender_id', '') = COALESCE(event_row.payload ->> 'sender_id', '')
              AND newer.id > event_row.id
              AND newer.status = 'PENDING'
              AND newer.attempt_count = 0
              AND newer.available_at <= NOW()
        ) INTO turn_has_more;
    END IF;

    UPDATE public.whatsapp_inbound_events
    SET status = 'PROCESSING', attempt_count = attempt_count + 1,
        claim_version = claim_version + 1,
        claimed_at = NOW(), claimed_by = normalized_worker, updated_at = NOW()
    WHERE id = event_row.id
    RETURNING * INTO event_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'event', to_jsonb(event_row) || jsonb_build_object('turn_has_more', turn_has_more)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_whatsapp_inbound_event(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_whatsapp_inbound_event(TEXT)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('058', 'add_whatsapp_turn_buffer', 'whatsapp_turn_buffer_v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;

COMMIT;
