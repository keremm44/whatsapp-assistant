-- 060_add_conversation_ai_memory.sql
-- Durable, bounded conversational memory for AI intent context.
-- This memory is advisory only: transactional order/return/control state remains
-- authoritative in its existing tables. The RPCs are service-role only and the
-- update path is CAS-fenced by memory version and, when present, worker lease.

BEGIN;

CREATE TABLE IF NOT EXISTS public.conversation_ai_memories (
    seller_id BIGINT NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL DEFAULT '',
    covered_through_message_id BIGINT REFERENCES public.messages(id) ON DELETE SET NULL,
    last_intent VARCHAR(64),
    version BIGINT NOT NULL DEFAULT 1,
    memory_incomplete BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (seller_id, customer_id),
    CONSTRAINT conversation_ai_memories_summary_length_check
        CHECK (char_length(summary_text) <= 1600),
    CONSTRAINT conversation_ai_memories_last_intent_check
        CHECK (last_intent IS NULL OR char_length(BTRIM(last_intent)) BETWEEN 1 AND 64),
    CONSTRAINT conversation_ai_memories_version_check
        CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_conversation_ai_memories_customer
    ON public.conversation_ai_memories(customer_id);

ALTER TABLE public.conversation_ai_memories ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.conversation_ai_memories
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_ai_memories
    TO service_role;


CREATE OR REPLACE FUNCTION public.get_conversation_ai_context(
    current_message_id_value BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    current_message RECORD;
    memory_row public.conversation_ai_memories%ROWTYPE;
    covered_message_id BIGINT := 0;
    uncovered_count INTEGER := 0;
    recent_messages JSONB := '[]'::JSONB;
    recent_count INTEGER := 0;
BEGIN
    IF current_message_id_value IS NULL OR current_message_id_value <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_message_id');
    END IF;

    SELECT m.id, m.seller_id, m.customer_id, m.direction
    INTO current_message
    FROM public.messages m
    WHERE m.id = current_message_id_value;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF current_message.direction <> 'incoming' THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'message_not_incoming');
    END IF;

    SELECT memory.*
    INTO memory_row
    FROM public.conversation_ai_memories memory
    WHERE memory.seller_id = current_message.seller_id
      AND memory.customer_id = current_message.customer_id;

    IF FOUND THEN
        covered_message_id := COALESCE(memory_row.covered_through_message_id, 0);
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO uncovered_count
    FROM public.messages m
    WHERE m.seller_id = current_message.seller_id
      AND m.customer_id = current_message.customer_id
      AND m.id > covered_message_id
      AND m.id < current_message_id_value;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', recent.id,
                'direction', recent.direction,
                'content', recent.content,
                'message_type', recent.message_type,
                'was_auto_replied', recent.was_auto_replied
            )
            ORDER BY recent.id
        ),
        '[]'::JSONB
    )
    INTO recent_messages
    FROM (
        SELECT
            m.id,
            m.direction,
            LEFT(COALESCE(m.content, ''), 600) AS content,
            m.message_type,
            m.was_auto_replied
        FROM public.messages m
        WHERE m.seller_id = current_message.seller_id
          AND m.customer_id = current_message.customer_id
          AND m.id > covered_message_id
          AND m.id < current_message_id_value
        ORDER BY m.id DESC
        LIMIT 12
    ) recent;

    recent_count := jsonb_array_length(recent_messages);

    RETURN jsonb_build_object(
        'status', 'success',
        'memory', CASE
            WHEN memory_row.seller_id IS NULL THEN jsonb_build_object(
                'summary_text', '',
                'covered_through_message_id', NULL,
                'last_intent', NULL,
                'version', 0,
                'memory_incomplete', FALSE
            )
            ELSE jsonb_build_object(
                'summary_text', memory_row.summary_text,
                'covered_through_message_id', memory_row.covered_through_message_id,
                'last_intent', memory_row.last_intent,
                'version', memory_row.version,
                'memory_incomplete', memory_row.memory_incomplete
            )
        END,
        'recent_messages', recent_messages,
        'uncovered_count', uncovered_count,
        'context_truncated', uncovered_count > recent_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_ai_context(BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_ai_context(BIGINT)
    TO service_role;


CREATE OR REPLACE FUNCTION public.advance_conversation_ai_memory(
    current_message_id_value BIGINT,
    expected_version_value BIGINT,
    summary_text_value TEXT,
    last_intent_value TEXT,
    context_truncated_value BOOLEAN,
    worker_event_id_value BIGINT,
    worker_id_value TEXT,
    claim_version_value BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    current_message RECORD;
    memory_row public.conversation_ai_memories%ROWTYPE;
    claim_row RECORD;
    normalized_summary TEXT := COALESCE(BTRIM(summary_text_value), '');
    normalized_intent TEXT := NULLIF(BTRIM(last_intent_value), '');
    normalized_worker TEXT := NULLIF(BTRIM(worker_id_value), '');
    claim_supplied BOOLEAN := FALSE;
    claim_piece_count INTEGER := 0;
BEGIN
    IF current_message_id_value IS NULL OR current_message_id_value <= 0
       OR expected_version_value IS NULL OR expected_version_value < 0
       OR summary_text_value IS NULL
       OR char_length(normalized_summary) > 1600
       OR context_truncated_value IS NULL
       OR (normalized_intent IS NOT NULL AND char_length(normalized_intent) > 64) THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_memory_update');
    END IF;

    claim_piece_count :=
        (CASE WHEN worker_event_id_value IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN normalized_worker IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN claim_version_value IS NOT NULL THEN 1 ELSE 0 END);
    IF claim_piece_count NOT IN (0, 3) THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_claim_context');
    END IF;
    claim_supplied := claim_piece_count = 3;
    IF claim_supplied AND (
        worker_event_id_value <= 0
        OR claim_version_value <= 0
        OR char_length(normalized_worker) > 120
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_claim_context');
    END IF;

    SELECT m.id, m.seller_id, m.customer_id, m.direction
    INTO current_message
    FROM public.messages m
    WHERE m.id = current_message_id_value;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'reason', 'message_not_found');
    END IF;
    IF current_message.direction <> 'incoming' THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'message_not_incoming');
    END IF;

    IF claim_supplied THEN
        SELECT e.status, e.claimed_by, e.claim_version
        INTO claim_row
        FROM public.whatsapp_inbound_events e
        WHERE e.id = worker_event_id_value
        FOR SHARE;

        IF NOT FOUND
           OR claim_row.status <> 'PROCESSING'
           OR claim_row.claimed_by IS DISTINCT FROM normalized_worker
           OR claim_row.claim_version IS DISTINCT FROM claim_version_value THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'claim_lost');
        END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'conversation-ai-memory:' || current_message.seller_id::TEXT || ':' || current_message.customer_id::TEXT,
            0
        )
    );

    SELECT memory.*
    INTO memory_row
    FROM public.conversation_ai_memories memory
    WHERE memory.seller_id = current_message.seller_id
      AND memory.customer_id = current_message.customer_id
    FOR UPDATE;

    IF FOUND THEN
        IF memory_row.version <> expected_version_value THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'memory_version_changed');
        END IF;
        IF memory_row.covered_through_message_id IS NOT NULL
           AND current_message_id_value <= memory_row.covered_through_message_id THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'memory_already_advanced');
        END IF;

        UPDATE public.conversation_ai_memories
        SET summary_text = normalized_summary,
            covered_through_message_id = current_message_id_value,
            last_intent = normalized_intent,
            version = version + 1,
            memory_incomplete = memory_incomplete OR context_truncated_value,
            updated_at = NOW()
        WHERE seller_id = current_message.seller_id
          AND customer_id = current_message.customer_id
        RETURNING * INTO memory_row;
    ELSE
        IF expected_version_value <> 0 THEN
            RETURN jsonb_build_object('status', 'conflict', 'reason', 'memory_version_changed');
        END IF;

        INSERT INTO public.conversation_ai_memories (
            seller_id,
            customer_id,
            summary_text,
            covered_through_message_id,
            last_intent,
            version,
            memory_incomplete
        )
        VALUES (
            current_message.seller_id,
            current_message.customer_id,
            normalized_summary,
            current_message_id_value,
            normalized_intent,
            1,
            context_truncated_value
        )
        RETURNING * INTO memory_row;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'memory', jsonb_build_object(
            'summary_text', memory_row.summary_text,
            'covered_through_message_id', memory_row.covered_through_message_id,
            'last_intent', memory_row.last_intent,
            'version', memory_row.version,
            'memory_incomplete', memory_row.memory_incomplete
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_conversation_ai_memory(
    BIGINT, BIGINT, TEXT, TEXT, BOOLEAN, BIGINT, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_conversation_ai_memory(
    BIGINT, BIGINT, TEXT, TEXT, BOOLEAN, BIGINT, TEXT, BIGINT
) TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '060',
    'add_conversation_ai_memory',
    'conversation_ai_memory_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
