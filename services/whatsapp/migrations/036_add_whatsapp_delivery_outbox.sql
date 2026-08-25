-- ============================================================
-- 036_add_whatsapp_delivery_outbox.sql
-- WhatsApp Cloud API tenant routing and durable outbound delivery foundation.
--
-- Repository-only migration in this implementation pass. It is intentionally
-- NOT applied to the live Supabase project here. Runtime activation must only
-- happen after this migration is applied and verified in the target database.
-- ============================================================

BEGIN;

-- Correlate one generated outgoing assistant message with the inbound message
-- that caused it. Existing rows remain unchanged because the column is nullable.
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_reply_to_message_id_fkey'
          AND conrelid = 'public.messages'::regclass
    ) THEN
        ALTER TABLE public.messages
        ADD CONSTRAINT messages_reply_to_message_id_fkey
        FOREIGN KEY (reply_to_message_id)
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_reply_to_direction_check'
          AND conrelid = 'public.messages'::regclass
    ) THEN
        ALTER TABLE public.messages
        ADD CONSTRAINT messages_reply_to_direction_check
        CHECK (reply_to_message_id IS NULL OR direction = 'outgoing');
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_outgoing_reply_source_unique
    ON public.messages(reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL
      AND direction = 'outgoing';


-- Non-secret routing metadata. Access tokens/app secrets never belong here.
CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
    id BIGSERIAL PRIMARY KEY,
    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    phone_number_id VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT whatsapp_channels_phone_number_id_check
        CHECK (
            phone_number_id = BTRIM(phone_number_id)
            AND char_length(phone_number_id) BETWEEN 1 AND 64
        ),
    CONSTRAINT whatsapp_channels_phone_number_id_unique
        UNIQUE (phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_seller_active
    ON public.whatsapp_channels(seller_id, is_active, id);

DROP TRIGGER IF EXISTS trg_whatsapp_channels_updated_at
    ON public.whatsapp_channels;
CREATE TRIGGER trg_whatsapp_channels_updated_at
BEFORE UPDATE ON public.whatsapp_channels
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE IF NOT EXISTS public.whatsapp_delivery_outbox (
    id BIGSERIAL PRIMARY KEY,
    channel_id BIGINT NOT NULL
        REFERENCES public.whatsapp_channels(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    customer_id BIGINT NOT NULL
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    source_message_id BIGINT NOT NULL
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    message_id BIGINT NOT NULL
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    recipient_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    provider_message_id VARCHAR(150),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    last_error_code VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT whatsapp_delivery_outbox_message_unique
        UNIQUE (message_id),
    CONSTRAINT whatsapp_delivery_outbox_source_unique
        UNIQUE (source_message_id),
    CONSTRAINT whatsapp_delivery_outbox_distinct_message_check
        CHECK (message_id <> source_message_id),
    CONSTRAINT whatsapp_delivery_outbox_recipient_check
        CHECK (
            recipient_id = BTRIM(recipient_id)
            AND char_length(recipient_id) BETWEEN 5 AND 32
        ),
    CONSTRAINT whatsapp_delivery_outbox_status_check
        CHECK (
            status IN (
                'PENDING',
                'SENDING',
                'SENT',
                'DELIVERED',
                'READ',
                'FAILED',
                'UNKNOWN'
            )
        ),
    CONSTRAINT whatsapp_delivery_outbox_attempt_count_check
        CHECK (attempt_count >= 0),
    CONSTRAINT whatsapp_delivery_outbox_provider_message_id_check
        CHECK (
            provider_message_id IS NULL
            OR (
                provider_message_id = BTRIM(provider_message_id)
                AND char_length(provider_message_id) BETWEEN 1 AND 150
            )
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_delivery_provider_message_unique
    ON public.whatsapp_delivery_outbox(provider_message_id)
    WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_delivery_pending
    ON public.whatsapp_delivery_outbox(status, next_attempt_at, id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_delivery_seller_created
    ON public.whatsapp_delivery_outbox(seller_id, created_at DESC, id DESC);

DROP TRIGGER IF EXISTS trg_whatsapp_delivery_outbox_updated_at
    ON public.whatsapp_delivery_outbox;
CREATE TRIGGER trg_whatsapp_delivery_outbox_updated_at
BEFORE UPDATE ON public.whatsapp_delivery_outbox
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- public is an exposed Supabase schema, so these backend-only tables are RLS
-- protected and unavailable to browser roles. service_role is the sole runtime
-- database principal for this transport layer.
ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_delivery_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.whatsapp_channels
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.whatsapp_delivery_outbox
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.whatsapp_channels_id_seq
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.whatsapp_delivery_outbox_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.whatsapp_channels TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.whatsapp_delivery_outbox TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.whatsapp_channels_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.whatsapp_delivery_outbox_id_seq TO service_role;


CREATE OR REPLACE FUNCTION public.ensure_whatsapp_delivery_outbox(
    target_channel_id BIGINT,
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_source_message_id BIGINT,
    target_message_id BIGINT,
    recipient_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    channel_row public.whatsapp_channels%ROWTYPE;
    source_row public.messages%ROWTYPE;
    outgoing_row public.messages%ROWTYPE;
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    normalized_recipient TEXT := BTRIM(recipient_value);
    created_value BOOLEAN := FALSE;
BEGIN
    IF target_channel_id IS NULL OR target_channel_id <= 0
       OR target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0
       OR target_source_message_id IS NULL OR target_source_message_id <= 0
       OR target_message_id IS NULL OR target_message_id <= 0
       OR normalized_recipient IS NULL
       OR char_length(normalized_recipient) NOT BETWEEN 5 AND 32 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz WhatsApp outbox parametreleri.'
        );
    END IF;

    SELECT wc.*
    INTO channel_row
    FROM public.whatsapp_channels wc
    WHERE wc.id = target_channel_id
      AND wc.is_active = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'resource', 'channel');
    END IF;

    IF channel_row.seller_id <> target_seller_id THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'channel_tenant_mismatch');
    END IF;

    SELECT m.*
    INTO source_row
    FROM public.messages m
    WHERE m.id = target_source_message_id
      AND m.seller_id = target_seller_id
      AND m.customer_id = target_customer_id
      AND m.direction = 'incoming';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'resource', 'source_message');
    END IF;

    SELECT m.*
    INTO outgoing_row
    FROM public.messages m
    WHERE m.id = target_message_id
      AND m.seller_id = target_seller_id
      AND m.customer_id = target_customer_id
      AND m.direction = 'outgoing'
      AND m.reply_to_message_id = target_source_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'resource', 'outgoing_message');
    END IF;

    INSERT INTO public.whatsapp_delivery_outbox (
        channel_id,
        seller_id,
        customer_id,
        source_message_id,
        message_id,
        recipient_id
    )
    VALUES (
        target_channel_id,
        target_seller_id,
        target_customer_id,
        target_source_message_id,
        target_message_id,
        normalized_recipient
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO outbox_row;

    created_value := FOUND;

    IF NOT created_value THEN
        SELECT o.*
        INTO outbox_row
        FROM public.whatsapp_delivery_outbox o
        WHERE o.message_id = target_message_id
           OR o.source_message_id = target_source_message_id
        ORDER BY CASE WHEN o.message_id = target_message_id THEN 0 ELSE 1 END
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'outbox_uniqueness_conflict');
        END IF;
    END IF;

    IF outbox_row.channel_id <> target_channel_id
       OR outbox_row.seller_id <> target_seller_id
       OR outbox_row.customer_id <> target_customer_id
       OR outbox_row.source_message_id <> target_source_message_id
       OR outbox_row.message_id <> target_message_id
       OR outbox_row.recipient_id <> normalized_recipient THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'outbox_identity_mismatch');
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'created', created_value,
        'outbox', to_jsonb(outbox_row)
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.claim_whatsapp_delivery_outbox(
    target_outbox_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
BEGIN
    IF target_outbox_id IS NULL OR target_outbox_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz outbox kimliği.');
    END IF;

    SELECT o.*
    INTO outbox_row
    FROM public.whatsapp_delivery_outbox o
    WHERE o.id = target_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF outbox_row.status <> 'PENDING'
       OR (outbox_row.next_attempt_at IS NOT NULL AND outbox_row.next_attempt_at > NOW()) THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'claimed', FALSE,
            'outbox', to_jsonb(outbox_row)
        );
    END IF;

    UPDATE public.whatsapp_delivery_outbox o
    SET status = 'SENDING',
        attempt_count = o.attempt_count + 1,
        last_attempt_at = NOW(),
        next_attempt_at = NULL,
        updated_at = NOW()
    WHERE o.id = target_outbox_id
    RETURNING o.* INTO outbox_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'claimed', TRUE,
        'outbox', to_jsonb(outbox_row)
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.mark_whatsapp_delivery_sent(
    target_outbox_id BIGINT,
    provider_message_id_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    normalized_provider_message_id TEXT := BTRIM(provider_message_id_value);
BEGIN
    IF target_outbox_id IS NULL OR target_outbox_id <= 0
       OR normalized_provider_message_id IS NULL
       OR char_length(normalized_provider_message_id) NOT BETWEEN 1 AND 150 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz gönderim sonucu.');
    END IF;

    SELECT o.*
    INTO outbox_row
    FROM public.whatsapp_delivery_outbox o
    WHERE o.id = target_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF outbox_row.status IN ('SENT', 'DELIVERED', 'READ')
       AND outbox_row.provider_message_id = normalized_provider_message_id THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'outbox', to_jsonb(outbox_row)
        );
    END IF;

    IF outbox_row.status <> 'SENDING' THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'outbox_not_sending');
    END IF;

    UPDATE public.messages m
    SET provider = 'whatsapp_cloud',
        provider_message_id = normalized_provider_message_id
    WHERE m.id = outbox_row.message_id
      AND m.seller_id = outbox_row.seller_id
      AND m.customer_id = outbox_row.customer_id
      AND m.direction = 'outgoing';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'outgoing_message_missing');
    END IF;

    UPDATE public.whatsapp_delivery_outbox o
    SET status = 'SENT',
        provider_message_id = normalized_provider_message_id,
        sent_at = COALESCE(o.sent_at, NOW()),
        failed_at = NULL,
        last_error_code = NULL,
        updated_at = NOW()
    WHERE o.id = target_outbox_id
    RETURNING o.* INTO outbox_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'outbox', to_jsonb(outbox_row)
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.mark_whatsapp_delivery_failed(
    target_outbox_id BIGINT,
    error_code_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    normalized_error_code TEXT := NULLIF(LEFT(BTRIM(error_code_value), 64), '');
BEGIN
    IF target_outbox_id IS NULL OR target_outbox_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz outbox kimliği.');
    END IF;

    SELECT o.*
    INTO outbox_row
    FROM public.whatsapp_delivery_outbox o
    WHERE o.id = target_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF outbox_row.status = 'FAILED' THEN
        RETURN jsonb_build_object('status', 'success', 'changed', FALSE, 'outbox', to_jsonb(outbox_row));
    END IF;

    IF outbox_row.status <> 'SENDING' THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'outbox_not_sending');
    END IF;

    UPDATE public.whatsapp_delivery_outbox o
    SET status = 'FAILED',
        failed_at = COALESCE(o.failed_at, NOW()),
        last_error_code = normalized_error_code,
        updated_at = NOW()
    WHERE o.id = target_outbox_id
    RETURNING o.* INTO outbox_row;

    RETURN jsonb_build_object('status', 'success', 'changed', TRUE, 'outbox', to_jsonb(outbox_row));
END;
$$;


CREATE OR REPLACE FUNCTION public.mark_whatsapp_delivery_unknown(
    target_outbox_id BIGINT,
    error_code_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    normalized_error_code TEXT := NULLIF(LEFT(BTRIM(error_code_value), 64), '');
BEGIN
    IF target_outbox_id IS NULL OR target_outbox_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz outbox kimliği.');
    END IF;

    SELECT o.*
    INTO outbox_row
    FROM public.whatsapp_delivery_outbox o
    WHERE o.id = target_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF outbox_row.status = 'UNKNOWN' THEN
        RETURN jsonb_build_object('status', 'success', 'changed', FALSE, 'outbox', to_jsonb(outbox_row));
    END IF;

    IF outbox_row.status <> 'SENDING' THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'outbox_not_sending');
    END IF;

    UPDATE public.whatsapp_delivery_outbox o
    SET status = 'UNKNOWN',
        last_error_code = normalized_error_code,
        updated_at = NOW()
    WHERE o.id = target_outbox_id
    RETURNING o.* INTO outbox_row;

    RETURN jsonb_build_object('status', 'success', 'changed', TRUE, 'outbox', to_jsonb(outbox_row));
END;
$$;


CREATE OR REPLACE FUNCTION public.schedule_whatsapp_delivery_retry(
    target_outbox_id BIGINT,
    retry_at_value TIMESTAMPTZ,
    error_code_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    normalized_error_code TEXT := NULLIF(LEFT(BTRIM(error_code_value), 64), '');
BEGIN
    IF target_outbox_id IS NULL OR target_outbox_id <= 0
       OR retry_at_value IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz retry parametreleri.');
    END IF;

    SELECT o.*
    INTO outbox_row
    FROM public.whatsapp_delivery_outbox o
    WHERE o.id = target_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF outbox_row.status <> 'SENDING' THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'outbox_not_sending');
    END IF;

    UPDATE public.whatsapp_delivery_outbox o
    SET status = 'PENDING',
        next_attempt_at = GREATEST(retry_at_value, NOW()),
        last_error_code = normalized_error_code,
        updated_at = NOW()
    WHERE o.id = target_outbox_id
    RETURNING o.* INTO outbox_row;

    RETURN jsonb_build_object('status', 'success', 'changed', TRUE, 'outbox', to_jsonb(outbox_row));
END;
$$;


CREATE OR REPLACE FUNCTION public.apply_whatsapp_delivery_status(
    phone_number_id_value TEXT,
    provider_message_id_value TEXT,
    status_value TEXT,
    error_code_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    channel_row public.whatsapp_channels%ROWTYPE;
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    normalized_phone_number_id TEXT := BTRIM(phone_number_id_value);
    normalized_provider_message_id TEXT := BTRIM(provider_message_id_value);
    normalized_status TEXT := UPPER(BTRIM(status_value));
    normalized_error_code TEXT := NULLIF(LEFT(BTRIM(error_code_value), 64), '');
    changed_value BOOLEAN := FALSE;
BEGIN
    IF normalized_phone_number_id IS NULL OR normalized_phone_number_id = ''
       OR normalized_provider_message_id IS NULL OR normalized_provider_message_id = ''
       OR normalized_status NOT IN ('SENT', 'DELIVERED', 'READ', 'FAILED') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz status callback parametreleri.');
    END IF;

    SELECT wc.*
    INTO channel_row
    FROM public.whatsapp_channels wc
    WHERE wc.phone_number_id = normalized_phone_number_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'resource', 'channel');
    END IF;

    SELECT o.*
    INTO outbox_row
    FROM public.whatsapp_delivery_outbox o
    WHERE o.channel_id = channel_row.id
      AND o.provider_message_id = normalized_provider_message_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'resource', 'outbox');
    END IF;

    IF outbox_row.status = 'READ' THEN
        RETURN jsonb_build_object('status', 'success', 'changed', FALSE, 'outbox', to_jsonb(outbox_row));
    END IF;

    IF normalized_status = 'FAILED' THEN
        IF outbox_row.status = 'DELIVERED' THEN
            RETURN jsonb_build_object('status', 'success', 'changed', FALSE, 'outbox', to_jsonb(outbox_row));
        END IF;
        IF outbox_row.status <> 'FAILED' THEN
            UPDATE public.whatsapp_delivery_outbox o
            SET status = 'FAILED',
                failed_at = COALESCE(o.failed_at, NOW()),
                last_error_code = normalized_error_code,
                updated_at = NOW()
            WHERE o.id = outbox_row.id
            RETURNING o.* INTO outbox_row;
            changed_value := TRUE;
        END IF;
    ELSIF normalized_status = 'READ' THEN
        UPDATE public.whatsapp_delivery_outbox o
        SET status = 'READ',
            sent_at = COALESCE(o.sent_at, NOW()),
            delivered_at = COALESCE(o.delivered_at, NOW()),
            read_at = COALESCE(o.read_at, NOW()),
            failed_at = NULL,
            last_error_code = NULL,
            updated_at = NOW()
        WHERE o.id = outbox_row.id
          AND o.status <> 'READ'
        RETURNING o.* INTO outbox_row;
        changed_value := FOUND;
    ELSIF normalized_status = 'DELIVERED' THEN
        IF outbox_row.status NOT IN ('DELIVERED', 'READ') THEN
            UPDATE public.whatsapp_delivery_outbox o
            SET status = 'DELIVERED',
                sent_at = COALESCE(o.sent_at, NOW()),
                delivered_at = COALESCE(o.delivered_at, NOW()),
                failed_at = NULL,
                last_error_code = NULL,
                updated_at = NOW()
            WHERE o.id = outbox_row.id
            RETURNING o.* INTO outbox_row;
            changed_value := TRUE;
        END IF;
    ELSIF normalized_status = 'SENT' THEN
        IF outbox_row.status NOT IN ('SENT', 'DELIVERED', 'READ', 'FAILED') THEN
            UPDATE public.whatsapp_delivery_outbox o
            SET status = 'SENT',
                sent_at = COALESCE(o.sent_at, NOW()),
                updated_at = NOW()
            WHERE o.id = outbox_row.id
            RETURNING o.* INTO outbox_row;
            changed_value := TRUE;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', changed_value,
        'outbox', to_jsonb(outbox_row)
    );
END;
$$;


REVOKE ALL ON FUNCTION public.ensure_whatsapp_delivery_outbox(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_whatsapp_delivery_outbox(BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_whatsapp_delivery_sent(BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_whatsapp_delivery_failed(BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_whatsapp_delivery_unknown(BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_whatsapp_delivery_retry(BIGINT, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_whatsapp_delivery_status(TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_whatsapp_delivery_outbox(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_delivery_outbox(BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_delivery_sent(BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_delivery_failed(BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_delivery_unknown(BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_whatsapp_delivery_retry(BIGINT, TIMESTAMPTZ, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_delivery_status(TEXT, TEXT, TEXT, TEXT)
    TO service_role;


INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '036',
    'add_whatsapp_delivery_outbox',
    'whatsapp_delivery_outbox_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
