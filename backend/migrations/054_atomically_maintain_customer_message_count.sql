-- 054_atomically_maintain_customer_message_count.sql
--
-- Makes incoming message persistence and customer message metrics one atomic
-- transaction for the new runtime without double-counting older deployed
-- runtimes during a rolling deployment. Existing drift is repaired from the
-- durable messages ledger while writes are blocked by this migration.

-- Match the legacy production write order (messages first, customers second)
-- so an in-flight save_message transaction cannot deadlock with the repair.
LOCK TABLE public.messages IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.customers IN SHARE ROW EXCLUSIVE MODE;

-- Repair historical under-counting from the durable incoming-message ledger.
-- Preserve a last_message_at that is already later than the latest persisted
-- incoming message because the legacy runtime wrote processing time just after
-- INSERT; only stale timestamps are moved forward.
WITH incoming_metrics AS (
    SELECT
        c.id AS customer_id,
        COUNT(m.id) AS incoming_message_count,
        MAX(m.created_at) AS latest_incoming_at
    FROM public.customers c
    LEFT JOIN public.messages m
      ON m.customer_id = c.id
     AND m.seller_id = c.seller_id
     AND m.direction = 'incoming'
    GROUP BY c.id
)
UPDATE public.customers AS c
SET total_messages = incoming_metrics.incoming_message_count,
    last_message_at = CASE
        WHEN incoming_metrics.latest_incoming_at IS NULL THEN c.last_message_at
        WHEN c.last_message_at IS NULL THEN incoming_metrics.latest_incoming_at
        ELSE GREATEST(c.last_message_at, incoming_metrics.latest_incoming_at)
    END
FROM incoming_metrics
WHERE c.id = incoming_metrics.customer_id
  AND (
      c.total_messages IS DISTINCT FROM incoming_metrics.incoming_message_count
      OR (
          incoming_metrics.latest_incoming_at IS NOT NULL
          AND (
              c.last_message_at IS NULL
              OR c.last_message_at < incoming_metrics.latest_incoming_at
          )
      )
  );

ALTER TABLE public.customers
    DROP CONSTRAINT IF EXISTS customers_total_messages_nonnegative;
ALTER TABLE public.customers
    ADD CONSTRAINT customers_total_messages_nonnegative
    CHECK (total_messages >= 0);

-- New runtime path: message INSERT and incoming customer metric update commit or
-- roll back together. There is deliberately no table trigger: an older runtime
-- may still perform its historical follow-up customer UPDATE until deployment,
-- and a trigger would double-count during that overlap.
CREATE OR REPLACE FUNCTION public.persist_message_with_customer_metrics(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    direction_value TEXT,
    content_value TEXT,
    message_type_value TEXT,
    media_url_value TEXT,
    was_auto_replied_value BOOLEAN,
    ai_confidence_value REAL,
    provider_value TEXT,
    provider_message_id_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    inserted_message public.messages%ROWTYPE;
    updated_customer public.customers%ROWTYPE;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_identity');
    END IF;

    IF direction_value IS NULL OR btrim(direction_value) = ''
       OR message_type_value IS NULL OR btrim(message_type_value) = ''
       OR provider_value IS NULL OR btrim(provider_value) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_message');
    END IF;

    BEGIN
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
            provider_message_id
        )
        VALUES (
            target_seller_id,
            target_customer_id,
            direction_value,
            content_value,
            message_type_value,
            media_url_value,
            COALESCE(was_auto_replied_value, FALSE),
            ai_confidence_value,
            provider_value,
            provider_message_id_value
        )
        RETURNING * INTO inserted_message;

        IF direction_value = 'incoming' THEN
            UPDATE public.customers AS c
            SET total_messages = c.total_messages + 1,
                last_message_at = GREATEST(
                    COALESCE(c.last_message_at, inserted_message.created_at),
                    inserted_message.created_at
                )
            WHERE c.id = target_customer_id
              AND c.seller_id = target_seller_id
            RETURNING c.* INTO updated_customer;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'incoming message customer tenant mismatch'
                    USING ERRCODE = '23503';
            END IF;
        END IF;

        RETURN jsonb_build_object(
            'status', 'success',
            'message', to_jsonb(inserted_message)
        );
    EXCEPTION
        WHEN unique_violation THEN
            IF provider_message_id_value IS NOT NULL THEN
                SELECT m.*
                INTO inserted_message
                FROM public.messages AS m
                WHERE m.provider = provider_value
                  AND m.provider_message_id = provider_message_id_value
                LIMIT 1;

                IF FOUND THEN
                    RETURN jsonb_build_object(
                        'status', 'duplicate',
                        'message', to_jsonb(inserted_message)
                    );
                END IF;
            END IF;
            RAISE;
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_message_with_customer_metrics(
    BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, REAL, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_message_with_customer_metrics(
    BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, REAL, TEXT, TEXT
) TO service_role;

-- Legacy compatibility surface for any direct helper caller in the new code.
-- Reconcile from messages rather than blindly incrementing, so it cannot create
-- a counter that is larger than the durable incoming-message ledger.
CREATE OR REPLACE FUNCTION public.reconcile_customer_message_metrics(
    target_customer_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    customer_row public.customers%ROWTYPE;
    incoming_message_count BIGINT;
    latest_incoming_at TIMESTAMPTZ;
BEGIN
    IF target_customer_id IS NULL OR target_customer_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_customer');
    END IF;

    SELECT c.*
    INTO customer_row
    FROM public.customers AS c
    WHERE c.id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'reason', 'customer_not_found');
    END IF;

    SELECT COUNT(m.id), MAX(m.created_at)
    INTO incoming_message_count, latest_incoming_at
    FROM public.messages AS m
    WHERE m.customer_id = customer_row.id
      AND m.seller_id = customer_row.seller_id
      AND m.direction = 'incoming';

    UPDATE public.customers AS c
    SET total_messages = incoming_message_count,
        last_message_at = CASE
            WHEN latest_incoming_at IS NULL THEN c.last_message_at
            WHEN c.last_message_at IS NULL THEN latest_incoming_at
            ELSE GREATEST(c.last_message_at, latest_incoming_at)
        END
    WHERE c.id = customer_row.id
    RETURNING c.* INTO customer_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'customer', to_jsonb(customer_row)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_customer_message_metrics(BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_customer_message_metrics(BIGINT)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '054',
    'atomically_maintain_customer_message_count',
    'atomically_maintain_customer_message_count_v2',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
