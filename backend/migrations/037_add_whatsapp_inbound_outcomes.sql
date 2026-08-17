-- ============================================================
-- 037_add_whatsapp_inbound_outcomes.sql
-- Durable completion marker for WhatsApp inbound processing.
--
-- This migration is repository-only in this implementation pass and is not
-- applied to the live Supabase project here.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_outcomes (
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
    incoming_message_id BIGINT NOT NULL
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    outcome VARCHAR(16) NOT NULL,
    outgoing_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    reason_code VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT whatsapp_inbound_outcomes_incoming_unique
        UNIQUE (incoming_message_id),
    CONSTRAINT whatsapp_inbound_outcomes_outgoing_unique
        UNIQUE (outgoing_message_id),
    CONSTRAINT whatsapp_inbound_outcomes_outcome_check
        CHECK (outcome IN ('NO_REPLY', 'REPLY')),
    CONSTRAINT whatsapp_inbound_outcomes_shape_check
        CHECK (
            (outcome = 'NO_REPLY' AND outgoing_message_id IS NULL)
            OR
            (outcome = 'REPLY' AND outgoing_message_id IS NOT NULL)
        ),
    CONSTRAINT whatsapp_inbound_outcomes_reason_check
        CHECK (
            reason_code IS NULL
            OR (
                reason_code = BTRIM(reason_code)
                AND char_length(reason_code) BETWEEN 1 AND 64
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_outcomes_seller_created
    ON public.whatsapp_inbound_outcomes(seller_id, created_at DESC, id DESC);

DROP TRIGGER IF EXISTS trg_whatsapp_inbound_outcomes_updated_at
    ON public.whatsapp_inbound_outcomes;
CREATE TRIGGER trg_whatsapp_inbound_outcomes_updated_at
BEFORE UPDATE ON public.whatsapp_inbound_outcomes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_inbound_outcomes ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.whatsapp_inbound_outcomes
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.whatsapp_inbound_outcomes_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.whatsapp_inbound_outcomes TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.whatsapp_inbound_outcomes_id_seq TO service_role;


CREATE OR REPLACE FUNCTION public.ensure_whatsapp_inbound_outcome(
    target_channel_id BIGINT,
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_incoming_message_id BIGINT,
    outcome_value TEXT,
    target_outgoing_message_id BIGINT DEFAULT NULL,
    reason_code_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    channel_row public.whatsapp_channels%ROWTYPE;
    incoming_row public.messages%ROWTYPE;
    outgoing_row public.messages%ROWTYPE;
    outcome_row public.whatsapp_inbound_outcomes%ROWTYPE;
    normalized_outcome TEXT := UPPER(BTRIM(outcome_value));
    normalized_reason TEXT := NULLIF(LEFT(BTRIM(reason_code_value), 64), '');
    created_value BOOLEAN := FALSE;
BEGIN
    IF target_channel_id IS NULL OR target_channel_id <= 0
       OR target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0
       OR target_incoming_message_id IS NULL OR target_incoming_message_id <= 0
       OR normalized_outcome NOT IN ('NO_REPLY', 'REPLY') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz WhatsApp inbound outcome parametreleri.'
        );
    END IF;

    IF (normalized_outcome = 'NO_REPLY' AND target_outgoing_message_id IS NOT NULL)
       OR (normalized_outcome = 'REPLY' AND (
            target_outgoing_message_id IS NULL OR target_outgoing_message_id <= 0
       )) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz outcome şekli.');
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
    INTO incoming_row
    FROM public.messages m
    WHERE m.id = target_incoming_message_id
      AND m.seller_id = target_seller_id
      AND m.customer_id = target_customer_id
      AND m.direction = 'incoming'
      AND m.provider = 'whatsapp_cloud';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'resource', 'incoming_message');
    END IF;

    IF normalized_outcome = 'REPLY' THEN
        SELECT m.*
        INTO outgoing_row
        FROM public.messages m
        WHERE m.id = target_outgoing_message_id
          AND m.seller_id = target_seller_id
          AND m.customer_id = target_customer_id
          AND m.direction = 'outgoing'
          AND m.reply_to_message_id = target_incoming_message_id
          AND m.provider IN ('whatsapp_cloud_pending', 'whatsapp_cloud');

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'not_found', 'resource', 'outgoing_message');
        END IF;
    END IF;

    INSERT INTO public.whatsapp_inbound_outcomes (
        channel_id,
        seller_id,
        customer_id,
        incoming_message_id,
        outcome,
        outgoing_message_id,
        reason_code
    )
    VALUES (
        target_channel_id,
        target_seller_id,
        target_customer_id,
        target_incoming_message_id,
        normalized_outcome,
        target_outgoing_message_id,
        normalized_reason
    )
    ON CONFLICT (incoming_message_id) DO NOTHING
    RETURNING * INTO outcome_row;

    created_value := FOUND;

    IF NOT created_value THEN
        SELECT o.*
        INTO outcome_row
        FROM public.whatsapp_inbound_outcomes o
        WHERE o.incoming_message_id = target_incoming_message_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'outcome_uniqueness_conflict');
        END IF;
    END IF;

    IF outcome_row.channel_id <> target_channel_id
       OR outcome_row.seller_id <> target_seller_id
       OR outcome_row.customer_id <> target_customer_id
       OR outcome_row.incoming_message_id <> target_incoming_message_id
       OR outcome_row.outcome <> normalized_outcome
       OR outcome_row.outgoing_message_id IS DISTINCT FROM target_outgoing_message_id THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'outcome_identity_mismatch');
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'created', created_value,
        'outcome', to_jsonb(outcome_row)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_whatsapp_inbound_outcome(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_whatsapp_inbound_outcome(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, TEXT
) TO service_role;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '037',
    'add_whatsapp_inbound_outcomes',
    'whatsapp_inbound_outcomes_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
