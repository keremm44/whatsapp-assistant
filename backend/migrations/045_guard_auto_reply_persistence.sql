-- 045_guard_auto_reply_persistence.sql
-- Linearizes the final auto-reply permission check and outgoing message insert
-- on the same conversation-control row lock. This closes the TOCTOU window
-- where a seller takeover could land after an application-level control read
-- but before the assistant reply was persisted.

CREATE OR REPLACE FUNCTION public.persist_guarded_auto_reply(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_source_message_id BIGINT,
    expected_control_version BIGINT,
    content_value TEXT,
    message_type_value TEXT DEFAULT 'text',
    media_url_value TEXT DEFAULT NULL,
    ai_confidence_value REAL DEFAULT NULL,
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

    -- This is the shared serialization point with seller takeover/resume.
    -- transition_conversation_control and resume_conversation_assistant lock
    -- this same row before changing control_state/control_version.
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

    -- First committed reply wins for one inbound source. The existing partial
    -- unique index on messages(reply_to_message_id) remains the final safety net.
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
           OR outgoing_row.was_auto_replied IS NOT TRUE THEN
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
        reply_to_message_id
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
        target_source_message_id
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
           OR outgoing_row.was_auto_replied IS NOT TRUE THEN
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

REVOKE ALL ON FUNCTION public.persist_guarded_auto_reply(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, REAL, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.persist_guarded_auto_reply(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, REAL, TEXT
) TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('045', 'guard_auto_reply_persistence', 'guard_auto_reply_persistence_v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;
