-- ============================================================
-- 038_add_whatsapp_inbound_event_queue.sql
-- Durable, idempotent inbox for signed WhatsApp webhook events.
--
-- The public webhook only persists normalized provider events and acknowledges
-- Meta. A separate worker must claim and process PENDING rows; this migration
-- deliberately does not activate runtime dispatch by itself.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL,
    event_key VARCHAR(240) NOT NULL,
    phone_number_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    claimed_by VARCHAR(120),
    last_error_code VARCHAR(64),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT whatsapp_inbound_events_event_key_unique UNIQUE (event_key),
    CONSTRAINT whatsapp_inbound_events_type_check
        CHECK (event_type IN ('inbound_message', 'message_status')),
    CONSTRAINT whatsapp_inbound_events_phone_number_id_check
        CHECK (
            phone_number_id = BTRIM(phone_number_id)
            AND char_length(phone_number_id) BETWEEN 1 AND 64
        ),
    CONSTRAINT whatsapp_inbound_events_payload_check
        CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT whatsapp_inbound_events_status_check
        CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'UNKNOWN')),
    CONSTRAINT whatsapp_inbound_events_attempt_count_check
        CHECK (attempt_count >= 0),
    CONSTRAINT whatsapp_inbound_events_claim_shape_check
        CHECK (
            (status = 'PROCESSING' AND claimed_at IS NOT NULL AND claimed_by IS NOT NULL)
            OR status <> 'PROCESSING'
        )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_events_pending
    ON public.whatsapp_inbound_events(status, available_at, id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_events_processing
    ON public.whatsapp_inbound_events(status, claimed_at, id)
    WHERE status = 'PROCESSING';

DROP TRIGGER IF EXISTS trg_whatsapp_inbound_events_updated_at
    ON public.whatsapp_inbound_events;
CREATE TRIGGER trg_whatsapp_inbound_events_updated_at
BEFORE UPDATE ON public.whatsapp_inbound_events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_inbound_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.whatsapp_inbound_events
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.whatsapp_inbound_events_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.whatsapp_inbound_events TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.whatsapp_inbound_events_id_seq TO service_role;


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

    INSERT INTO public.whatsapp_inbound_events (
        event_type,
        event_key,
        phone_number_id,
        payload
    )
    VALUES (
        normalized_type,
        normalized_key,
        normalized_phone_number_id,
        payload_value
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
VALUES (
    '038',
    'add_whatsapp_inbound_event_queue',
    'whatsapp_inbound_event_queue_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
