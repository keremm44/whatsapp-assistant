-- 059_serialize_whatsapp_turn_enqueue.sql
-- Close the concurrent-webhook edge in the turn debounce introduced by 058.
-- Same-sender enqueue transactions serialize before reading/updating the burst
-- window, while different senders remain fully parallel.

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
            -- Signed webhook input reaches this service-role-only RPC. Serialize
            -- only one phone-number/sender pair so two concurrent webhook
            -- requests cannot calculate independent quiet windows.
            PERFORM pg_advisory_xact_lock(
                hashtextextended(
                    'whatsapp-turn:' || normalized_phone_number_id || ':' || sender_id_value,
                    0
                )
            );
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
        SELECT existing.* INTO event_row
        FROM public.whatsapp_inbound_events existing
        WHERE existing.event_key = normalized_key;

        IF NOT FOUND
           OR event_row.event_type <> normalized_type
           OR event_row.phone_number_id <> normalized_phone_number_id THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'event_key_identity_mismatch');
        END IF;
    ELSIF normalized_type = 'inbound_message' AND sender_id_value IS NOT NULL THEN
        SELECT MIN(pending.created_at) INTO turn_started_at
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

        SELECT refreshed.* INTO event_row
        FROM public.whatsapp_inbound_events refreshed
        WHERE refreshed.id = event_row.id;
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

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('059', 'serialize_whatsapp_turn_enqueue', 'serialize_whatsapp_turn_enqueue_v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;

COMMIT;
