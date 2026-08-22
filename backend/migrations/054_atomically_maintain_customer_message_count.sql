-- 054_atomically_maintain_customer_message_count.sql
--
-- Makes customers.total_messages a transactionally maintained projection of
-- successfully inserted incoming messages. This removes both the read/modify/
-- write lost-update race and the crash window between message persistence and
-- counter persistence. Existing drift is repaired from messages as source of
-- truth while writes are blocked by the migration transaction.

-- Match the production write order (messages first, customers second) so an
-- in-flight legacy save_message transaction cannot deadlock with this repair.
LOCK TABLE public.messages IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.customers IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public._maintain_customer_message_metrics_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- The trigger itself is filtered to incoming rows; keep this guard as
    -- defense in depth if the function is ever attached elsewhere.
    IF NEW.direction <> 'incoming' THEN
        RETURN NEW;
    END IF;

    UPDATE public.customers AS c
    SET total_messages = c.total_messages + 1,
        last_message_at = GREATEST(
            COALESCE(c.last_message_at, NEW.created_at),
            NEW.created_at
        )
    WHERE c.id = NEW.customer_id
      AND c.seller_id = NEW.seller_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'incoming message customer tenant mismatch'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._maintain_customer_message_metrics_after_insert()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_messages_maintain_customer_message_metrics
    ON public.messages;

CREATE TRIGGER trg_messages_maintain_customer_message_metrics
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.direction = 'incoming')
EXECUTE FUNCTION public._maintain_customer_message_metrics_after_insert();

-- Repair historical drift from the durable incoming-message ledger. The
-- seller predicate also makes the projection tenant-consistent. Preflight
-- confirmed there are no tenant-mismatched message rows in production.
WITH incoming_counts AS (
    SELECT
        c.id AS customer_id,
        COUNT(m.id)::INTEGER AS incoming_message_count
    FROM public.customers c
    LEFT JOIN public.messages m
      ON m.customer_id = c.id
     AND m.seller_id = c.seller_id
     AND m.direction = 'incoming'
    GROUP BY c.id
)
UPDATE public.customers AS c
SET total_messages = incoming_counts.incoming_message_count
FROM incoming_counts
WHERE c.id = incoming_counts.customer_id
  AND c.total_messages IS DISTINCT FROM incoming_counts.incoming_message_count;

ALTER TABLE public.customers
    DROP CONSTRAINT IF EXISTS customers_total_messages_nonnegative;
ALTER TABLE public.customers
    ADD CONSTRAINT customers_total_messages_nonnegative
    CHECK (total_messages >= 0);

-- Keep the historical Python helper safe for any direct caller. Normal message
-- persistence no longer calls this RPC; the INSERT trigger owns that path.
CREATE OR REPLACE FUNCTION public.increment_customer_message_count_atomic(
    target_customer_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    customer_row public.customers%ROWTYPE;
    observed_at TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF target_customer_id IS NULL OR target_customer_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_customer');
    END IF;

    UPDATE public.customers AS c
    SET total_messages = c.total_messages + 1,
        last_message_at = GREATEST(
            COALESCE(c.last_message_at, observed_at),
            observed_at
        )
    WHERE c.id = target_customer_id
    RETURNING c.* INTO customer_row;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'reason', 'customer_not_found');
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'customer', to_jsonb(customer_row)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_customer_message_count_atomic(BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_customer_message_count_atomic(BIGINT)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '054',
    'atomically_maintain_customer_message_count',
    'atomically_maintain_customer_message_count_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
