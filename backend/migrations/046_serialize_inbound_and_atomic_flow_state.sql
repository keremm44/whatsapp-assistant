-- 046_serialize_inbound_and_atomic_flow_state.sql
--
-- Two related concurrency hardening changes:
-- 1) WhatsApp inbound events for the same seller channel + sender are claimed
--    strictly in FIFO order, with at most one PROCESSING event per sender.
-- 2) Conversation flow-state mutation and its audit insert are performed in
--    one PostgreSQL transaction while holding the conversation_states row lock.
--    A monotonic source-message cursor prevents an older worker from overwriting
--    state produced by a newer inbound message.

ALTER TABLE public.conversation_states
    ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS state_last_message_id BIGINT;

ALTER TABLE public.conversation_states
    DROP CONSTRAINT IF EXISTS conversation_states_state_version_check,
    DROP CONSTRAINT IF EXISTS conversation_states_state_last_message_fk;

ALTER TABLE public.conversation_states
    ADD CONSTRAINT conversation_states_state_version_check
        CHECK (state_version > 0),
    ADD CONSTRAINT conversation_states_state_last_message_fk
        FOREIGN KEY (state_last_message_id)
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;

ALTER TABLE public.state_transitions
    ADD COLUMN IF NOT EXISTS previous_state_version BIGINT,
    ADD COLUMN IF NOT EXISTS new_state_version BIGINT;

ALTER TABLE public.state_transitions
    DROP CONSTRAINT IF EXISTS state_transitions_version_pair_check;

ALTER TABLE public.state_transitions
    ADD CONSTRAINT state_transitions_version_pair_check
        CHECK (
            (previous_state_version IS NULL AND new_state_version IS NULL)
            OR (
                previous_state_version IS NOT NULL
                AND previous_state_version > 0
                AND new_state_version = previous_state_version + 1
            )
        );

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_sender_open_fifo
    ON public.whatsapp_inbound_events(
        phone_number_id,
        ((payload ->> 'sender_id')),
        id
    )
    WHERE event_type = 'inbound_message'
      AND status IN ('PENDING', 'PROCESSING');


CREATE OR REPLACE FUNCTION public.transition_conversation_state(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_state TEXT,
    transition_reason_code TEXT,
    transition_trigger_message_id BIGINT DEFAULT NULL,
    target_state_data JSONB DEFAULT '{}'::JSONB,
    target_expires_at TIMESTAMPTZ DEFAULT NULL,
    transition_metadata JSONB DEFAULT '{}'::JSONB,
    expected_state_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    state_row public.conversation_states%ROWTYPE;
    trigger_row public.messages%ROWTYPE;
    transition_row public.state_transitions%ROWTYPE;
    previous_state TEXT;
    previous_version BIGINT;
    next_state_type TEXT;
    next_last_message_id BIGINT;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_identity');
    END IF;

    IF target_state NOT IN (
        'NORMAL',
        'AWAITING_ORDER_CONFIRMATION',
        'AWAITING_ORDER_PRODUCT',
        'AWAITING_ORDER_NUMBER',
        'AWAITING_IMAGE',
        'AWAITING_CUSTOM_TEXT',
        'AWAITING_ORDER_FIELD',
        'AWAITING_SELLER'
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_state');
    END IF;

    IF transition_reason_code NOT IN (
        'user_action',
        'timeout',
        'admin_override',
        'escalation',
        'violation',
        'system'
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_reason');
    END IF;

    IF target_state_data IS NULL OR jsonb_typeof(target_state_data) <> 'object'
       OR transition_metadata IS NULL OR jsonb_typeof(transition_metadata) <> 'object' THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_json');
    END IF;

    IF expected_state_version IS NOT NULL AND expected_state_version <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_version');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = target_customer_id
          AND c.seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF transition_trigger_message_id IS NOT NULL THEN
        IF transition_trigger_message_id <= 0 THEN
            RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_trigger');
        END IF;

        SELECT m.*
        INTO trigger_row
        FROM public.messages m
        WHERE m.id = transition_trigger_message_id
          AND m.seller_id = target_seller_id
          AND m.customer_id = target_customer_id
          AND m.direction = 'incoming';

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'forbidden', 'reason', 'trigger_tenant_mismatch');
        END IF;
    END IF;

    -- Ensure the row exists without overwriting control-state columns. Defaults
    -- create the canonical NORMAL/ASSISTANT_ACTIVE record for first mutation.
    INSERT INTO public.conversation_states (seller_id, customer_id)
    VALUES (target_seller_id, target_customer_id)
    ON CONFLICT (seller_id, customer_id) DO NOTHING;

    SELECT cs.*
    INTO state_row
    FROM public.conversation_states cs
    WHERE cs.seller_id = target_seller_id
      AND cs.customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF expected_state_version IS NOT NULL
       AND state_row.state_version <> expected_state_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'state_version_conflict',
            'state', jsonb_build_object(
                'seller_id', state_row.seller_id,
                'customer_id', state_row.customer_id,
                'current_state', state_row.current_state,
                'state_type', state_row.state_type,
                'state_data', state_row.state_data,
                'expires_at', state_row.expires_at,
                'state_version', state_row.state_version,
                'state_last_message_id', state_row.state_last_message_id
            )
        );
    END IF;

    -- Equal source IDs are allowed because one inbound message can legitimately
    -- advance through more than one internal order-flow step. Strictly older
    -- sources are rejected so a delayed worker cannot roll state backward.
    IF transition_trigger_message_id IS NOT NULL
       AND state_row.state_last_message_id IS NOT NULL
       AND transition_trigger_message_id < state_row.state_last_message_id THEN
        RETURN jsonb_build_object(
            'status', 'stale',
            'reason', 'older_source_message',
            'state', jsonb_build_object(
                'seller_id', state_row.seller_id,
                'customer_id', state_row.customer_id,
                'current_state', state_row.current_state,
                'state_type', state_row.state_type,
                'state_data', state_row.state_data,
                'expires_at', state_row.expires_at,
                'state_version', state_row.state_version,
                'state_last_message_id', state_row.state_last_message_id
            )
        );
    END IF;

    next_state_type := CASE target_state
        WHEN 'NORMAL' THEN 'no_lock'
        WHEN 'AWAITING_SELLER' THEN 'informational'
        ELSE 'soft_lock'
    END;

    next_last_message_id := CASE
        WHEN transition_trigger_message_id IS NULL THEN state_row.state_last_message_id
        WHEN state_row.state_last_message_id IS NULL THEN transition_trigger_message_id
        ELSE GREATEST(state_row.state_last_message_id, transition_trigger_message_id)
    END;

    IF state_row.current_state = target_state
       AND state_row.state_type = next_state_type
       AND state_row.state_data = target_state_data
       AND state_row.expires_at IS NOT DISTINCT FROM target_expires_at
       AND state_row.state_last_message_id IS NOT DISTINCT FROM next_last_message_id THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'state', jsonb_build_object(
                'seller_id', state_row.seller_id,
                'customer_id', state_row.customer_id,
                'current_state', state_row.current_state,
                'state_type', state_row.state_type,
                'state_data', state_row.state_data,
                'expires_at', state_row.expires_at,
                'state_version', state_row.state_version,
                'state_last_message_id', state_row.state_last_message_id
            )
        );
    END IF;

    previous_state := state_row.current_state;
    previous_version := state_row.state_version;

    UPDATE public.conversation_states cs
    SET current_state = target_state,
        state_type = next_state_type,
        state_data = target_state_data,
        expires_at = target_expires_at,
        state_last_message_id = next_last_message_id,
        state_version = cs.state_version + 1,
        updated_at = NOW()
    WHERE cs.id = state_row.id
    RETURNING cs.* INTO state_row;

    INSERT INTO public.state_transitions (
        seller_id,
        customer_id,
        from_state,
        to_state,
        trigger_message_id,
        reason_code,
        metadata,
        previous_state_version,
        new_state_version
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        previous_state,
        target_state,
        transition_trigger_message_id,
        transition_reason_code,
        transition_metadata,
        previous_version,
        state_row.state_version
    )
    RETURNING * INTO transition_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'state', jsonb_build_object(
            'seller_id', state_row.seller_id,
            'customer_id', state_row.customer_id,
            'current_state', state_row.current_state,
            'state_type', state_row.state_type,
            'state_data', state_row.state_data,
            'expires_at', state_row.expires_at,
            'state_version', state_row.state_version,
            'state_last_message_id', state_row.state_last_message_id
        ),
        'transition', jsonb_build_object(
            'id', transition_row.id,
            'from_state', transition_row.from_state,
            'to_state', transition_row.to_state,
            'trigger_message_id', transition_row.trigger_message_id,
            'reason_code', transition_row.reason_code,
            'metadata', transition_row.metadata,
            'previous_state_version', transition_row.previous_state_version,
            'new_state_version', transition_row.new_state_version,
            'created_at', transition_row.created_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_conversation_state(
    BIGINT, BIGINT, TEXT, TEXT, BIGINT, JSONB, TIMESTAMPTZ, JSONB, BIGINT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transition_conversation_state(
    BIGINT, BIGINT, TEXT, TEXT, BIGINT, JSONB, TIMESTAMPTZ, JSONB, BIGINT
) TO service_role;


CREATE OR REPLACE FUNCTION public.claim_next_whatsapp_inbound_event(
    worker_id_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    event_row public.whatsapp_inbound_events%ROWTYPE;
    normalized_worker TEXT := BTRIM(worker_id_value);
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
                AND COALESCE(earlier.payload ->> 'sender_id', '') =
                    COALESCE(candidate.payload ->> 'sender_id', '')
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

    UPDATE public.whatsapp_inbound_events
    SET status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        claimed_at = NOW(),
        claimed_by = normalized_worker,
        updated_at = NOW()
    WHERE id = event_row.id
    RETURNING * INTO event_row;

    RETURN jsonb_build_object('status', 'success', 'event', to_jsonb(event_row));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_whatsapp_inbound_event(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_whatsapp_inbound_event(TEXT)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '046',
    'serialize_inbound_and_atomic_flow_state',
    'serialize_inbound_and_atomic_flow_state_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
