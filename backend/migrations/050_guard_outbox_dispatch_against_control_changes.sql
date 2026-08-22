-- ============================================================
-- 050_guard_outbox_dispatch_against_control_changes.sql
-- Close the delivery-boundary race between a persisted assistant reply and
-- a later seller takeover/pause/review transition.
--
-- Linearization rule:
--   * conversation control is always locked before an outbox row;
--   * a due assistant reply may enter SENDING only while the exact control
--     version that authorized persistence is still ASSISTANT_ACTIVE;
--   * a transition away from ASSISTANT_ACTIVE suppresses pending replies and
--     refuses to commit while a recent SENDING attempt is still in flight.
--
-- The sender HTTP timeout is bounded well below the 60 second stale threshold.
-- A SENDING row older than that threshold is conservatively UNKNOWN, never
-- retried or labelled as unsent.
-- ============================================================

BEGIN;

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS auto_reply_control_version BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_auto_reply_control_version_check'
          AND conrelid = 'public.messages'::regclass
    ) THEN
        ALTER TABLE public.messages
        ADD CONSTRAINT messages_auto_reply_control_version_check
        CHECK (
            auto_reply_control_version IS NULL
            OR (
                auto_reply_control_version > 0
                AND direction = 'outgoing'
                AND was_auto_replied IS TRUE
                AND reply_to_message_id IS NOT NULL
            )
        );
    END IF;
END
$$;

ALTER TABLE public.whatsapp_delivery_outbox
ADD COLUMN IF NOT EXISTS expected_control_version BIGINT;

ALTER TABLE public.whatsapp_delivery_outbox
ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'whatsapp_delivery_expected_control_version_check'
          AND conrelid = 'public.whatsapp_delivery_outbox'::regclass
    ) THEN
        ALTER TABLE public.whatsapp_delivery_outbox
        ADD CONSTRAINT whatsapp_delivery_expected_control_version_check
        CHECK (
            expected_control_version IS NULL
            OR expected_control_version > 0
        );
    END IF;
END
$$;

ALTER TABLE public.whatsapp_delivery_outbox
DROP CONSTRAINT IF EXISTS whatsapp_delivery_outbox_status_check;

ALTER TABLE public.whatsapp_delivery_outbox
ADD CONSTRAINT whatsapp_delivery_outbox_status_check
CHECK (
    status IN (
        'PENDING',
        'SENDING',
        'SENT',
        'DELIVERED',
        'READ',
        'FAILED',
        'UNKNOWN',
        'SUPPRESSED'
    )
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'whatsapp_delivery_suppressed_at_check'
          AND conrelid = 'public.whatsapp_delivery_outbox'::regclass
    ) THEN
        ALTER TABLE public.whatsapp_delivery_outbox
        ADD CONSTRAINT whatsapp_delivery_suppressed_at_check
        CHECK (
            (status = 'SUPPRESSED' AND suppressed_at IS NOT NULL)
            OR (status <> 'SUPPRESSED' AND suppressed_at IS NULL)
        );
    END IF;
END
$$;


CREATE OR REPLACE FUNCTION public.persist_guarded_auto_reply(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_source_message_id BIGINT,
    expected_control_version BIGINT,
    content_value TEXT,
    message_type_value TEXT DEFAULT 'text',
    media_url_value TEXT DEFAULT NULL,
    ai_confidence_value DOUBLE PRECISION DEFAULT NULL,
    provider_value TEXT DEFAULT 'internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    control_row public.conversation_states%ROWTYPE;
    source_row public.messages%ROWTYPE;
    outgoing_row public.messages%ROWTYPE;
    normalized_provider TEXT := BTRIM(provider_value);
    normalized_message_type TEXT := BTRIM(message_type_value);
    created_value BOOLEAN := FALSE;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0
       OR target_source_message_id IS NULL OR target_source_message_id <= 0
       OR expected_control_version IS NULL OR expected_control_version <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz otomatik yanıt kimliği veya kontrol sürümü.'
        );
    END IF;

    IF normalized_provider IS NULL
       OR normalized_provider NOT IN ('internal', 'whatsapp_cloud_pending') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz otomatik yanıt sağlayıcısı.'
        );
    END IF;

    IF normalized_message_type IS NULL
       OR char_length(normalized_message_type) NOT BETWEEN 1 AND 64 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz otomatik yanıt mesaj tipi.'
        );
    END IF;

    IF content_value IS NULL AND media_url_value IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Otomatik yanıt içerik veya medya içermelidir.'
        );
    END IF;

    IF ai_confidence_value IS NOT NULL
       AND (ai_confidence_value < 0 OR ai_confidence_value > 1) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz otomatik yanıt güven değeri.'
        );
    END IF;

    SELECT cs.*
    INTO control_row
    FROM public.conversation_states AS cs
    WHERE cs.seller_id = target_seller_id
      AND cs.customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'suppressed',
            'reason', 'control_unavailable'
        );
    END IF;

    IF control_row.control_state <> 'ASSISTANT_ACTIVE'
       OR control_row.control_version <> expected_control_version THEN
        RETURN jsonb_build_object(
            'status', 'suppressed',
            'reason', 'control_changed',
            'current_control_state', control_row.control_state,
            'current_control_version', control_row.control_version
        );
    END IF;

    SELECT m.*
    INTO source_row
    FROM public.messages AS m
    WHERE m.id = target_source_message_id
      AND m.seller_id = target_seller_id
      AND m.customer_id = target_customer_id
      AND m.direction = 'incoming';

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'source_message_unavailable'
        );
    END IF;

    IF control_row.resume_after_message_id IS NOT NULL
       AND target_source_message_id <= control_row.resume_after_message_id THEN
        RETURN jsonb_build_object(
            'status', 'suppressed',
            'reason', 'before_resume_cursor'
        );
    END IF;

    SELECT m.*
    INTO outgoing_row
    FROM public.messages AS m
    WHERE m.reply_to_message_id = target_source_message_id
      AND m.direction = 'outgoing'
    LIMIT 1;

    IF FOUND THEN
        IF outgoing_row.seller_id <> target_seller_id
           OR outgoing_row.customer_id <> target_customer_id
           OR outgoing_row.provider <> normalized_provider
           OR outgoing_row.was_auto_replied IS NOT TRUE
           OR outgoing_row.auto_reply_control_version IS DISTINCT FROM expected_control_version THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'reason', 'existing_reply_identity_mismatch'
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'success',
            'created', FALSE,
            'idempotent', TRUE,
            'message', to_jsonb(outgoing_row)
        );
    END IF;

    INSERT INTO public.messages (
        seller_id,
        customer_id,
        direction,
        content,
        message_type,
        media_url,
        was_auto_replied,
        ai_confidence,
        provider,
        provider_message_id,
        reply_to_message_id,
        auto_reply_control_version
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        'outgoing',
        content_value,
        normalized_message_type,
        media_url_value,
        TRUE,
        ai_confidence_value,
        normalized_provider,
        NULL,
        target_source_message_id,
        expected_control_version
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO outgoing_row;

    created_value := FOUND;

    IF NOT created_value THEN
        SELECT m.*
        INTO outgoing_row
        FROM public.messages AS m
        WHERE m.reply_to_message_id = target_source_message_id
          AND m.direction = 'outgoing'
        LIMIT 1;

        IF NOT FOUND
           OR outgoing_row.seller_id <> target_seller_id
           OR outgoing_row.customer_id <> target_customer_id
           OR outgoing_row.provider <> normalized_provider
           OR outgoing_row.was_auto_replied IS NOT TRUE
           OR outgoing_row.auto_reply_control_version IS DISTINCT FROM expected_control_version THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'reason', 'reply_uniqueness_conflict'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'created', created_value,
        'idempotent', NOT created_value,
        'message', to_jsonb(outgoing_row)
    );
END;
$$;


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
    control_row public.conversation_states%ROWTYPE;
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    normalized_recipient TEXT := BTRIM(recipient_value);
    created_value BOOLEAN := FALSE;
    initial_status TEXT := 'PENDING';
    suppression_reason TEXT := NULL;
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
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'channel_tenant_mismatch'
        );
    END IF;

    SELECT m.*
    INTO source_row
    FROM public.messages m
    WHERE m.id = target_source_message_id
      AND m.seller_id = target_seller_id
      AND m.customer_id = target_customer_id
      AND m.direction = 'incoming';

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'resource', 'source_message'
        );
    END IF;

    SELECT m.*
    INTO outgoing_row
    FROM public.messages m
    WHERE m.id = target_message_id
      AND m.seller_id = target_seller_id
      AND m.customer_id = target_customer_id
      AND m.direction = 'outgoing'
      AND m.reply_to_message_id = target_source_message_id
      AND m.was_auto_replied IS TRUE
      AND m.provider = 'whatsapp_cloud_pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'resource', 'outgoing_message'
        );
    END IF;

    -- Same first lock as conversation-control transitions and delivery claims.
    SELECT cs.*
    INTO control_row
    FROM public.conversation_states cs
    WHERE cs.seller_id = target_seller_id
      AND cs.customer_id = target_customer_id
    FOR UPDATE;

    IF outgoing_row.auto_reply_control_version IS NULL THEN
        initial_status := 'SUPPRESSED';
        suppression_reason := 'control_snapshot_unavailable';
    ELSIF NOT FOUND THEN
        initial_status := 'SUPPRESSED';
        suppression_reason := 'control_unavailable';
    ELSIF control_row.control_state <> 'ASSISTANT_ACTIVE'
       OR control_row.control_version <> outgoing_row.auto_reply_control_version THEN
        initial_status := 'SUPPRESSED';
        suppression_reason := 'control_changed_before_outbox';
    ELSIF control_row.resume_after_message_id IS NOT NULL
       AND target_source_message_id <= control_row.resume_after_message_id THEN
        initial_status := 'SUPPRESSED';
        suppression_reason := 'before_resume_cursor';
    END IF;

    INSERT INTO public.whatsapp_delivery_outbox (
        channel_id,
        seller_id,
        customer_id,
        source_message_id,
        message_id,
        recipient_id,
        expected_control_version,
        status,
        suppressed_at,
        last_error_code
    )
    VALUES (
        target_channel_id,
        target_seller_id,
        target_customer_id,
        target_source_message_id,
        target_message_id,
        normalized_recipient,
        outgoing_row.auto_reply_control_version,
        initial_status,
        CASE WHEN initial_status = 'SUPPRESSED' THEN NOW() ELSE NULL END,
        suppression_reason
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
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'reason', 'outbox_uniqueness_conflict'
            );
        END IF;
    END IF;

    IF outbox_row.channel_id <> target_channel_id
       OR outbox_row.seller_id <> target_seller_id
       OR outbox_row.customer_id <> target_customer_id
       OR outbox_row.source_message_id <> target_source_message_id
       OR outbox_row.message_id <> target_message_id
       OR outbox_row.recipient_id <> normalized_recipient
       OR outbox_row.expected_control_version IS DISTINCT FROM outgoing_row.auto_reply_control_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'outbox_identity_mismatch'
        );
    END IF;

    -- Duplicate recovery may reach an old PENDING row after control changed.
    IF outbox_row.status = 'PENDING' AND initial_status = 'SUPPRESSED' THEN
        UPDATE public.whatsapp_delivery_outbox o
        SET status = 'SUPPRESSED',
            suppressed_at = COALESCE(o.suppressed_at, NOW()),
            next_attempt_at = NULL,
            last_error_code = suppression_reason,
            updated_at = NOW()
        WHERE o.id = outbox_row.id
        RETURNING o.* INTO outbox_row;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'created', created_value,
        'changed', outbox_row.status = 'SUPPRESSED',
        'reason', CASE
            WHEN outbox_row.status = 'SUPPRESSED' THEN outbox_row.last_error_code
            ELSE NULL
        END,
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
    identity_seller_id BIGINT;
    identity_customer_id BIGINT;
    control_row public.conversation_states%ROWTYPE;
    outbox_row public.whatsapp_delivery_outbox%ROWTYPE;
    suppression_reason TEXT := NULL;
BEGIN
    IF target_outbox_id IS NULL OR target_outbox_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz outbox kimliği.'
        );
    END IF;

    -- Read identity without taking the outbox lock. All participating writers
    -- then acquire conversation control first, outbox second.
    SELECT o.seller_id, o.customer_id
    INTO identity_seller_id, identity_customer_id
    FROM public.whatsapp_delivery_outbox o
    WHERE o.id = target_outbox_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT cs.*
    INTO control_row
    FROM public.conversation_states cs
    WHERE cs.seller_id = identity_seller_id
      AND cs.customer_id = identity_customer_id
    FOR UPDATE;

    SELECT o.*
    INTO outbox_row
    FROM public.whatsapp_delivery_outbox o
    WHERE o.id = target_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF outbox_row.seller_id <> identity_seller_id
       OR outbox_row.customer_id <> identity_customer_id THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'outbox_identity_changed'
        );
    END IF;

    IF outbox_row.status <> 'PENDING'
       OR (
            outbox_row.next_attempt_at IS NOT NULL
            AND outbox_row.next_attempt_at > NOW()
       ) THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'claimed', FALSE,
            'outbox', to_jsonb(outbox_row)
        );
    END IF;

    IF control_row.id IS NULL THEN
        suppression_reason := 'control_unavailable';
    ELSIF outbox_row.expected_control_version IS NULL THEN
        suppression_reason := 'control_snapshot_unavailable';
    ELSIF control_row.control_state <> 'ASSISTANT_ACTIVE'
       OR control_row.control_version <> outbox_row.expected_control_version THEN
        suppression_reason := 'control_changed_before_dispatch';
    ELSIF control_row.resume_after_message_id IS NOT NULL
       AND outbox_row.source_message_id <= control_row.resume_after_message_id THEN
        suppression_reason := 'before_resume_cursor';
    END IF;

    IF suppression_reason IS NOT NULL THEN
        UPDATE public.whatsapp_delivery_outbox o
        SET status = 'SUPPRESSED',
            suppressed_at = NOW(),
            next_attempt_at = NULL,
            last_error_code = suppression_reason,
            updated_at = NOW()
        WHERE o.id = target_outbox_id
        RETURNING o.* INTO outbox_row;

        RETURN jsonb_build_object(
            'status', 'success',
            'claimed', FALSE,
            'changed', TRUE,
            'reason', suppression_reason,
            'outbox', to_jsonb(outbox_row)
        );
    END IF;

    UPDATE public.whatsapp_delivery_outbox o
    SET status = 'SENDING',
        attempt_count = o.attempt_count + 1,
        last_attempt_at = NOW(),
        next_attempt_at = NULL,
        last_error_code = NULL,
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


CREATE OR REPLACE FUNCTION public.transition_conversation_control(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_control_state TEXT,
    transition_reason_code TEXT,
    transition_reason_note TEXT DEFAULT NULL,
    actor_profile_id BIGINT DEFAULT NULL,
    transition_trigger_message_id BIGINT DEFAULT NULL,
    target_resume_after_message_id BIGINT DEFAULT NULL,
    expected_control_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    control_row public.conversation_states%ROWTYPE;
    previous_control_state TEXT;
    previous_resume_after_message_id BIGINT;
    next_resume_after_message_id BIGINT;
    transition_id BIGINT;
    in_flight_outbox_id BIGINT;
BEGIN
    IF target_control_state NOT IN (
        'ASSISTANT_ACTIVE',
        'SELLER_TAKEN_OVER',
        'RETURN_REVIEW',
        'ASSISTANT_PAUSED'
    ) THEN
        RAISE EXCEPTION 'Geçersiz konuşma kontrol durumu.';
    END IF;

    IF transition_reason_code IS NULL
       OR transition_reason_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
        RAISE EXCEPTION 'Geçersiz konuşma kontrol neden kodu.';
    END IF;

    IF transition_reason_note IS NOT NULL
       AND char_length(transition_reason_note) > 500 THEN
        RAISE EXCEPTION 'Konuşma kontrol neden notu çok uzun.';
    END IF;

    -- First lock in both control transition and outbound dispatch paths.
    SELECT *
    INTO control_row
    FROM public.conversation_states
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF expected_control_version IS NOT NULL
       AND control_row.control_version <> expected_control_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'control_version_conflict',
            'control', jsonb_build_object(
                'control_state', control_row.control_state,
                'control_changed_at', control_row.control_changed_at,
                'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
                'control_reason_code', control_row.control_reason_code,
                'control_reason_note', control_row.control_reason_note,
                'resume_after_message_id', control_row.resume_after_message_id,
                'control_version', control_row.control_version
            )
        );
    END IF;

    IF actor_profile_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM public.user_profiles
            WHERE id = actor_profile_id
              AND seller_id = target_seller_id
       ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF transition_trigger_message_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM public.messages
            WHERE id = transition_trigger_message_id
              AND seller_id = target_seller_id
              AND customer_id = target_customer_id
       ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF target_resume_after_message_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM public.messages
            WHERE id = target_resume_after_message_id
              AND seller_id = target_seller_id
              AND customer_id = target_customer_id
       ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    -- A non-active state is a hard delivery barrier for assistant replies.
    IF target_control_state <> 'ASSISTANT_ACTIVE' THEN
        -- A worker that lost its process after claiming cannot block seller
        -- control forever. Older SENDING attempts are delivery-ambiguous and
        -- therefore become UNKNOWN, never PENDING/retryable.
        UPDATE public.whatsapp_delivery_outbox o
        SET status = 'UNKNOWN',
            next_attempt_at = NULL,
            last_error_code = 'stale_sending_during_control_change',
            updated_at = NOW()
        WHERE o.seller_id = target_seller_id
          AND o.customer_id = target_customer_id
          AND o.status = 'SENDING'
          AND (
                o.last_attempt_at IS NULL
                OR o.last_attempt_at <= NOW() - INTERVAL '60 seconds'
          );

        SELECT o.id
        INTO in_flight_outbox_id
        FROM public.whatsapp_delivery_outbox o
        WHERE o.seller_id = target_seller_id
          AND o.customer_id = target_customer_id
          AND o.status = 'SENDING'
          AND o.last_attempt_at > NOW() - INTERVAL '60 seconds'
        ORDER BY o.id
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'reason', 'outbound_dispatch_in_flight',
                'control', jsonb_build_object(
                    'control_state', control_row.control_state,
                    'control_changed_at', control_row.control_changed_at,
                    'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
                    'control_reason_code', control_row.control_reason_code,
                    'control_reason_note', control_row.control_reason_note,
                    'resume_after_message_id', control_row.resume_after_message_id,
                    'control_version', control_row.control_version
                )
            );
        END IF;

        UPDATE public.whatsapp_delivery_outbox o
        SET status = 'SUPPRESSED',
            suppressed_at = NOW(),
            next_attempt_at = NULL,
            last_error_code = 'control_changed_before_dispatch',
            updated_at = NOW()
        WHERE o.seller_id = target_seller_id
          AND o.customer_id = target_customer_id
          AND o.status = 'PENDING';
    END IF;

    IF control_row.control_state = target_control_state THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'control', jsonb_build_object(
                'control_state', control_row.control_state,
                'control_changed_at', control_row.control_changed_at,
                'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
                'control_reason_code', control_row.control_reason_code,
                'control_reason_note', control_row.control_reason_note,
                'resume_after_message_id', control_row.resume_after_message_id,
                'control_version', control_row.control_version
            )
        );
    END IF;

    next_resume_after_message_id := COALESCE(
        target_resume_after_message_id,
        control_row.resume_after_message_id
    );
    previous_control_state := control_row.control_state;
    previous_resume_after_message_id := control_row.resume_after_message_id;

    UPDATE public.conversation_states
    SET control_state = target_control_state,
        control_changed_at = NOW(),
        control_changed_by_profile_id = actor_profile_id,
        control_reason_code = transition_reason_code,
        control_reason_note = transition_reason_note,
        resume_after_message_id = next_resume_after_message_id,
        control_version = control_version + 1
    WHERE id = control_row.id
    RETURNING * INTO control_row;

    INSERT INTO public.conversation_control_transitions (
        seller_id,
        customer_id,
        from_control_state,
        to_control_state,
        changed_by_profile_id,
        reason_code,
        reason_note,
        trigger_message_id,
        previous_resume_after_message_id,
        new_resume_after_message_id,
        previous_version,
        new_version
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        previous_control_state,
        target_control_state,
        actor_profile_id,
        transition_reason_code,
        transition_reason_note,
        transition_trigger_message_id,
        previous_resume_after_message_id,
        next_resume_after_message_id,
        control_row.control_version - 1,
        control_row.control_version
    )
    RETURNING id INTO transition_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'transition_id', transition_id,
        'control', jsonb_build_object(
            'control_state', control_row.control_state,
            'control_changed_at', control_row.control_changed_at,
            'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
            'control_reason_code', control_row.control_reason_code,
            'control_reason_note', control_row.control_reason_note,
            'resume_after_message_id', control_row.resume_after_message_id,
            'control_version', control_row.control_version
        )
    );
END;
$$;


REVOKE ALL ON FUNCTION public.persist_guarded_auto_reply(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, DOUBLE PRECISION, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_guarded_auto_reply(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, DOUBLE PRECISION, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_whatsapp_delivery_outbox(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_whatsapp_delivery_outbox(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_whatsapp_delivery_outbox(BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_delivery_outbox(BIGINT)
    TO service_role;

REVOKE ALL ON FUNCTION public.transition_conversation_control(
    BIGINT, BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_conversation_control(
    BIGINT, BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT
) TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '050',
    'guard_outbox_dispatch_against_control_changes',
    'guard_outbox_dispatch_against_control_changes_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
