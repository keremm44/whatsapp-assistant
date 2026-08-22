-- 062_add_confirmed_changes_and_ai_usage.sql
-- Round 5: customer-confirmed personalization changes + bounded AI usage accounting.
--
-- Business guarantees:
--   * a previously recorded personalization text is never replaced from a mere
--     correction utterance; a separate customer confirmation message is required.
--   * the confirmed write is source-message scoped and OCC/version fenced.
--   * changing a COMPLETE order reopens it as SELLER_REVIEW_REQUIRED so production
--     cannot continue silently after customer-visible data changed.
--   * AI token accounting stores counts only; no message/customer content is copied.
--
-- The pending change reuses the existing AWAITING_ORDER_CONFIRMATION state with a
-- typed state_data marker. No new conversation-state enum is introduced.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Source-aware, OCC-fenced confirmed custom-text change.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_confirmed_order_custom_text_change(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
    source_message_id BIGINT,
    new_custom_text TEXT,
    expected_version BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
    normalized_text TEXT := NULLIF(BTRIM(new_custom_text), '');
    previous_text TEXT;
    previous_status TEXT;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0
       OR target_order_id IS NULL OR target_order_id <= 0
       OR source_message_id IS NULL OR source_message_id <= 0
       OR expected_version IS NULL OR expected_version <= 0
       OR normalized_text IS NULL
       OR char_length(normalized_text) > 1000 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_arguments');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.id = source_message_id
          AND m.seller_id = target_seller_id
          AND m.customer_id = target_customer_id
          AND m.direction = 'incoming'
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('order:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO order_row
    FROM public.orders o
    WHERE o.id = target_order_id
      AND o.seller_id = target_seller_id
      AND o.customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF order_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'version_changed',
            'order', public._order_presenter(order_row)
        );
    END IF;

    IF order_row.status NOT IN ('COLLECTING', 'COMPLETE') THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'order_not_changeable',
            'order', public._order_presenter(order_row)
        );
    END IF;

    IF order_row.custom_text IS NOT DISTINCT FROM normalized_text THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'seller_review_required', order_row.status = 'SELLER_REVIEW_REQUIRED',
            'order', public._order_presenter(order_row)
        );
    END IF;

    previous_text := order_row.custom_text;
    previous_status := order_row.status;

    UPDATE public.orders
    SET
        custom_text = normalized_text,
        status = CASE
            WHEN previous_status = 'COMPLETE' THEN 'SELLER_REVIEW_REQUIRED'
            ELSE status
        END,
        review_reason_code = CASE
            WHEN previous_status = 'COMPLETE' THEN 'customer_confirmed_personalization_change'
            ELSE review_reason_code
        END,
        review_reason_note = CASE
            WHEN previous_status = 'COMPLETE' THEN
                'Müşteri kişiselleştirme yazısı değişikliğini açıkça onayladı.'
            ELSE review_reason_note
        END,
        last_source_message_id = source_message_id,
        updated_at = NOW(),
        version = version + 1
    WHERE id = order_row.id
    RETURNING * INTO order_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'previous_custom_text', previous_text,
        'new_custom_text', normalized_text,
        'seller_review_required', order_row.status = 'SELLER_REVIEW_REQUIRED',
        'order', public._order_presenter(order_row)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_confirmed_order_custom_text_change(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_confirmed_order_custom_text_change(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Privacy-minimized per-conversation daily AI usage counters.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_ai_usage_daily (
    seller_id BIGINT NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    call_count BIGINT NOT NULL DEFAULT 0,
    prompt_tokens BIGINT NOT NULL DEFAULT 0,
    completion_tokens BIGINT NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (seller_id, customer_id, usage_date),
    CONSTRAINT conversation_ai_usage_daily_nonnegative CHECK (
        call_count >= 0 AND prompt_tokens >= 0 AND completion_tokens >= 0 AND total_tokens >= 0
    )
);

ALTER TABLE public.conversation_ai_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.conversation_ai_usage_daily
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversation_ai_usage_daily
    TO service_role;

CREATE OR REPLACE FUNCTION public.record_conversation_ai_usage(
    current_message_id_value BIGINT,
    prompt_tokens_value BIGINT,
    completion_tokens_value BIGINT,
    total_tokens_value BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    message_row RECORD;
BEGIN
    IF current_message_id_value IS NULL OR current_message_id_value <= 0
       OR prompt_tokens_value IS NULL OR prompt_tokens_value < 0
       OR completion_tokens_value IS NULL OR completion_tokens_value < 0
       OR total_tokens_value IS NULL OR total_tokens_value < 0
       OR total_tokens_value > 1000000
       OR prompt_tokens_value > total_tokens_value
       OR completion_tokens_value > total_tokens_value THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_usage');
    END IF;

    SELECT m.seller_id, m.customer_id, m.direction
    INTO message_row
    FROM public.messages m
    WHERE m.id = current_message_id_value;

    IF NOT FOUND OR message_row.direction <> 'incoming' THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    INSERT INTO public.conversation_ai_usage_daily (
        seller_id, customer_id, usage_date,
        call_count, prompt_tokens, completion_tokens, total_tokens, updated_at
    )
    VALUES (
        message_row.seller_id, message_row.customer_id, CURRENT_DATE,
        1, prompt_tokens_value, completion_tokens_value, total_tokens_value, NOW()
    )
    ON CONFLICT (seller_id, customer_id, usage_date)
    DO UPDATE SET
        call_count = public.conversation_ai_usage_daily.call_count + 1,
        prompt_tokens = public.conversation_ai_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
        completion_tokens = public.conversation_ai_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
        total_tokens = public.conversation_ai_usage_daily.total_tokens + EXCLUDED.total_tokens,
        updated_at = NOW();

    RETURN jsonb_build_object('status', 'success');
END;
$$;

REVOKE ALL ON FUNCTION public.record_conversation_ai_usage(BIGINT, BIGINT, BIGINT, BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_conversation_ai_usage(BIGINT, BIGINT, BIGINT, BIGINT)
    TO service_role;

COMMIT;
