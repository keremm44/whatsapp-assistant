-- 063_harden_whatsapp_turn_finalization.sql
-- Preserve the 058/059 turn buffer while making an event's own timing policy
-- authoritative for reply suppression.
--
-- A direct question, greeting, critical return/complaint phrase, or non-text event
-- is enqueued with _turn_debounce_seconds = 0. Such an event must never be marked
-- turn_has_more merely because a newer message from the same sender is already
-- pending; otherwise an explicitly immediate customer message could be processed
-- but have its reply silently suppressed.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_next_whatsapp_inbound_event(worker_id_value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    event_row public.whatsapp_inbound_events%ROWTYPE;
    normalized_worker TEXT := BTRIM(worker_id_value);
    turn_has_more BOOLEAN := FALSE;
    raw_debounce TEXT;
    event_debounce_seconds INTEGER := 0;
BEGIN
    IF normalized_worker IS NULL OR char_length(normalized_worker) NOT BETWEEN 1 AND 120 THEN
        RETURN jsonb_build_object('status', 'error');
    END IF;

    UPDATE public.whatsapp_inbound_events
    SET status = 'PENDING',
        claimed_at = NULL,
        claimed_by = NULL,
        available_at = NOW(),
        updated_at = NOW()
    WHERE status = 'PROCESSING'
      AND claimed_at < NOW() - INTERVAL '5 minutes';

    SELECT candidate.*
    INTO event_row
    FROM public.whatsapp_inbound_events candidate
    WHERE candidate.status = 'PENDING'
      AND candidate.available_at <= NOW()
      AND (
          candidate.event_type <> 'inbound_message'
          OR NOT EXISTS (
              SELECT 1
              FROM public.whatsapp_inbound_events earlier
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
        raw_debounce := event_row.payload ->> '_turn_debounce_seconds';
        IF raw_debounce ~ '^[0-9]{1,2}$' THEN
            event_debounce_seconds := raw_debounce::INTEGER;
        END IF;

        -- Only a message that was itself eligible for conversational debounce
        -- may become an intermediate, reply-suppressed event. Zero-debounce
        -- events remain final/immediate even when newer messages already exist.
        IF event_debounce_seconds > 0 THEN
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
            )
            INTO turn_has_more;
        END IF;
    END IF;

    UPDATE public.whatsapp_inbound_events
    SET status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        claim_version = claim_version + 1,
        claimed_at = NOW(),
        claimed_by = normalized_worker,
        updated_at = NOW()
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

INSERT INTO public.schema_migrations(version, name, checksum, applied_by)
VALUES (
    '063',
    'harden_whatsapp_turn_finalization',
    'whatsapp_turn_finalization_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
