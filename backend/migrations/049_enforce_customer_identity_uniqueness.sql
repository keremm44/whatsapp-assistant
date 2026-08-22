-- 049_enforce_customer_identity_uniqueness.sql
--
-- Repairs existing duplicate customer identities, fences pre-merge state/control
-- versions, adds a hard seller+WhatsApp uniqueness invariant, and exposes one
-- atomic get-or-create RPC for backend workers.

LOCK TABLE
    public.customers,
    public.conversation_states,
    public.conversation_control_transitions,
    public.customer_violations,
    public.messages,
    public.orders,
    public.return_issue_requests,
    public.seller_notifications,
    public.state_transitions,
    public.unanswered_question_occurrences,
    public.unanswered_questions,
    public.whatsapp_delivery_outbox,
    public.whatsapp_inbound_outcomes
IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _customer_identity_merge ON COMMIT DROP AS
WITH ranked AS (
    SELECT
        c.id AS customer_id,
        MIN(c.id) OVER (
            PARTITION BY c.seller_id, c.whatsapp_number
        ) AS canonical_id
    FROM public.customers c
)
SELECT customer_id AS duplicate_id, canonical_id
FROM ranked
WHERE customer_id <> canonical_id;

CREATE UNIQUE INDEX _customer_identity_merge_duplicate_idx
    ON _customer_identity_merge(duplicate_id);

DO $$
BEGIN
    -- A duplicate active flow state cannot be guessed safely during identity
    -- repair. Expired/non-locking duplicate states are safe to collapse.
    IF EXISTS (
        SELECT 1
        FROM public.conversation_states cs
        JOIN _customer_identity_merge m ON m.duplicate_id = cs.customer_id
        WHERE cs.current_state <> 'NORMAL'
          AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
    ) THEN
        RAISE EXCEPTION 'customer identity repair blocked: active duplicate flow state';
    END IF;

    -- Never silently reactivate the assistant while one duplicate identity is
    -- seller-controlled, paused, or in return review.
    IF EXISTS (
        SELECT 1
        FROM public.conversation_states cs
        JOIN _customer_identity_merge m ON m.duplicate_id = cs.customer_id
        WHERE cs.control_state <> 'ASSISTANT_ACTIVE'
    ) THEN
        RAISE EXCEPTION 'customer identity repair blocked: duplicate control state is not assistant-active';
    END IF;

    -- When duplicate state rows exist, keep the canonical row. If the canonical
    -- row is missing, abort rather than inventing flow/control semantics.
    IF EXISTS (
        SELECT 1
        FROM _customer_identity_merge m
        JOIN public.conversation_states duplicate_state
          ON duplicate_state.customer_id = m.duplicate_id
        LEFT JOIN public.conversation_states canonical_state
          ON canonical_state.customer_id = m.canonical_id
         AND canonical_state.seller_id = duplicate_state.seller_id
        WHERE canonical_state.id IS NULL
    ) THEN
        RAISE EXCEPTION 'customer identity repair blocked: canonical conversation state missing';
    END IF;

    -- Re-pointing two live orders to one canonical identity would violate the
    -- existing one-active-order invariant and needs a business decision.
    IF EXISTS (
        SELECT 1
        FROM public.orders o
        JOIN public.customers c ON c.id = o.customer_id
        LEFT JOIN _customer_identity_merge m ON m.duplicate_id = c.id
        WHERE COALESCE(m.canonical_id, c.id) IN (
            SELECT canonical_id FROM _customer_identity_merge
        )
          AND o.status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
        GROUP BY o.seller_id, COALESCE(m.canonical_id, c.id)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'customer identity repair blocked: multiple active orders';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.return_issue_requests r
        JOIN public.customers c ON c.id = r.customer_id
        LEFT JOIN _customer_identity_merge m ON m.duplicate_id = c.id
        WHERE COALESCE(m.canonical_id, c.id) IN (
            SELECT canonical_id FROM _customer_identity_merge
        )
          AND r.status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
          AND r.issue_type <> 'QUANTITY_LIMIT_REQUEST'
        GROUP BY r.seller_id, COALESCE(m.canonical_id, c.id)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'customer identity repair blocked: multiple open return issues';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.return_issue_requests r
        JOIN public.customers c ON c.id = r.customer_id
        LEFT JOIN _customer_identity_merge m ON m.duplicate_id = c.id
        WHERE COALESCE(m.canonical_id, c.id) IN (
            SELECT canonical_id FROM _customer_identity_merge
        )
          AND r.status = 'SELLER_REVIEW_REQUIRED'
          AND r.issue_type = 'QUANTITY_LIMIT_REQUEST'
        GROUP BY r.seller_id, COALESCE(m.canonical_id, c.id)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'customer identity repair blocked: multiple quantity reviews';
    END IF;
END;
$$;

-- Merge scalar customer facts into the canonical identity. The most recently
-- active non-empty contact name wins; counters and security timestamps merge
-- conservatively instead of being discarded with duplicate rows.
WITH member_rows AS (
    SELECT
        COALESCE(m.canonical_id, c.id) AS canonical_id,
        c.*
    FROM public.customers c
    LEFT JOIN _customer_identity_merge m ON m.duplicate_id = c.id
    WHERE c.id IN (
        SELECT canonical_id FROM _customer_identity_merge
        UNION
        SELECT duplicate_id FROM _customer_identity_merge
    )
),
aggregated AS (
    SELECT
        canonical_id,
        MAX(last_message_at) AS last_message_at,
        SUM(total_messages)::INTEGER AS total_messages,
        BOOL_OR(is_blocked) AS is_blocked,
        MAX(muted_until) AS muted_until,
        MAX(blocked_at) AS blocked_at,
        MAX(last_violation_at) AS last_violation_at
    FROM member_rows
    GROUP BY canonical_id
),
latest_name AS (
    SELECT DISTINCT ON (canonical_id)
        canonical_id,
        name
    FROM member_rows
    WHERE name IS NOT NULL AND BTRIM(name) <> ''
    ORDER BY canonical_id, last_message_at DESC NULLS LAST, created_at DESC, id DESC
),
latest_block_reason AS (
    SELECT DISTINCT ON (canonical_id)
        canonical_id,
        blocked_reason
    FROM member_rows
    WHERE blocked_reason IS NOT NULL AND BTRIM(blocked_reason) <> ''
    ORDER BY canonical_id, blocked_at DESC NULLS LAST, created_at DESC, id DESC
)
UPDATE public.customers target
SET name = COALESCE(latest_name.name, target.name),
    last_message_at = aggregated.last_message_at,
    total_messages = aggregated.total_messages,
    is_blocked = aggregated.is_blocked,
    muted_until = aggregated.muted_until,
    blocked_reason = CASE
        WHEN aggregated.is_blocked THEN COALESCE(latest_block_reason.blocked_reason, target.blocked_reason)
        ELSE NULL
    END,
    blocked_at = CASE WHEN aggregated.is_blocked THEN aggregated.blocked_at ELSE NULL END,
    last_violation_at = aggregated.last_violation_at
FROM aggregated
LEFT JOIN latest_name USING (canonical_id)
LEFT JOIN latest_block_reason USING (canonical_id)
WHERE target.id = aggregated.canonical_id;

-- Keep the canonical conversation state, normalize expired flow locks, and bump
-- both optimistic versions above every pre-merge version so stale requests from
-- either former identity cannot match after the repair.
WITH state_members AS (
    SELECT
        COALESCE(m.canonical_id, cs.customer_id) AS canonical_id,
        cs.*
    FROM public.conversation_states cs
    LEFT JOIN _customer_identity_merge m ON m.duplicate_id = cs.customer_id
    WHERE cs.customer_id IN (
        SELECT canonical_id FROM _customer_identity_merge
        UNION
        SELECT duplicate_id FROM _customer_identity_merge
    )
),
state_aggregate AS (
    SELECT
        canonical_id,
        MAX(control_version) + 1 AS next_control_version,
        MAX(state_version) + 1 AS next_state_version,
        MAX(resume_after_message_id) AS max_resume_after_message_id,
        MAX(state_last_message_id) AS max_state_last_message_id
    FROM state_members
    GROUP BY canonical_id
)
UPDATE public.conversation_states target
SET current_state = CASE
        WHEN target.expires_at IS NOT NULL AND target.expires_at <= NOW() THEN 'NORMAL'
        ELSE target.current_state
    END,
    state_type = CASE
        WHEN target.expires_at IS NOT NULL AND target.expires_at <= NOW() THEN 'no_lock'
        ELSE target.state_type
    END,
    state_data = CASE
        WHEN target.expires_at IS NOT NULL AND target.expires_at <= NOW() THEN '{}'::JSONB
        ELSE target.state_data
    END,
    expires_at = CASE
        WHEN target.expires_at IS NOT NULL AND target.expires_at <= NOW() THEN NULL
        ELSE target.expires_at
    END,
    resume_after_message_id = state_aggregate.max_resume_after_message_id,
    state_last_message_id = state_aggregate.max_state_last_message_id,
    control_version = state_aggregate.next_control_version,
    state_version = state_aggregate.next_state_version,
    updated_at = NOW()
FROM state_aggregate
WHERE target.customer_id = state_aggregate.canonical_id;

DELETE FROM public.conversation_states cs
USING _customer_identity_merge m
WHERE cs.customer_id = m.duplicate_id;

UPDATE public.conversation_control_transitions t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.customer_violations t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.messages t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.orders t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.return_issue_requests t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.seller_notifications t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.state_transitions t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.unanswered_question_occurrences t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.unanswered_questions t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.whatsapp_delivery_outbox t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

UPDATE public.whatsapp_inbound_outcomes t
SET customer_id = m.canonical_id
FROM _customer_identity_merge m
WHERE t.customer_id = m.duplicate_id;

DELETE FROM public.customers c
USING _customer_identity_merge m
WHERE c.id = m.duplicate_id;

ALTER TABLE public.customers
    ADD CONSTRAINT customers_seller_whatsapp_unique
    UNIQUE (seller_id, whatsapp_number);

CREATE OR REPLACE FUNCTION public.get_or_create_customer_identity(
    target_seller_id BIGINT,
    whatsapp_number_value TEXT,
    name_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    customer_row public.customers%ROWTYPE;
    normalized_number TEXT := BTRIM(whatsapp_number_value);
    normalized_name TEXT := NULLIF(BTRIM(name_value), '');
    created_value BOOLEAN := FALSE;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR normalized_number IS NULL
       OR char_length(normalized_number) NOT BETWEEN 1 AND 64 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_identity');
    END IF;

    IF normalized_name IS NOT NULL AND char_length(normalized_name) > 255 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_name');
    END IF;

    INSERT INTO public.customers (
        seller_id,
        whatsapp_number,
        name,
        total_messages,
        is_blocked
    )
    VALUES (
        target_seller_id,
        normalized_number,
        normalized_name,
        0,
        FALSE
    )
    ON CONFLICT (seller_id, whatsapp_number) DO NOTHING
    RETURNING * INTO customer_row;

    created_value := FOUND;

    IF NOT created_value THEN
        SELECT c.*
        INTO customer_row
        FROM public.customers c
        WHERE c.seller_id = target_seller_id
          AND c.whatsapp_number = normalized_number
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'error', 'reason', 'identity_unavailable');
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'created', created_value,
        'customer', to_jsonb(customer_row)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_customer_identity(BIGINT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_customer_identity(BIGINT, TEXT, TEXT)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '049',
    'enforce_customer_identity_uniqueness',
    'enforce_customer_identity_uniqueness_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
