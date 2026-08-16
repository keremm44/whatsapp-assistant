-- ============================================================
-- 031_prioritize_paused_conversations_with_orders.sql
-- Explicit active-order semantic and stable order priority for the
-- ASSISTANT_PAUSED seller conversation queue.
--
-- The active-order definition is preserved exactly from the existing
-- read model: orders in COLLECTING or SELLER_REVIEW_REQUIRED. The
-- existing recency/id ordering remains the secondary ordering. The
-- LATERAL order lookup remains in the single database query, so this
-- adds neither duplicate rows nor application-side N+1 reads.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_seller_conversation_list(
    BIGINT, INTEGER, INTEGER, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.get_seller_conversation_list(
    target_seller_id BIGINT,
    result_limit INTEGER DEFAULT 20,
    result_offset INTEGER DEFAULT 0,
    attention_only BOOLEAN DEFAULT FALSE,
    target_control_state TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    payload JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz seller kimliği.'
        );
    END IF;

    IF result_limit IS NULL OR result_limit < 1 OR result_limit > 100 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'result_limit 1 ile 100 arasında olmalıdır.'
        );
    END IF;

    IF result_offset IS NULL OR result_offset < 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'result_offset negatif olamaz.'
        );
    END IF;

    IF target_control_state IS NOT NULL
       AND target_control_state NOT IN (
           'ASSISTANT_ACTIVE',
           'SELLER_TAKEN_OVER',
           'RETURN_REVIEW',
           'ASSISTANT_PAUSED'
       ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz control_state.'
        );
    END IF;

    WITH base AS (
        SELECT
            c.id AS customer_id,
            c.name AS customer_name,
            c.whatsapp_number,
            c.is_blocked,
            c.muted_until,
            c.total_messages,
            c.last_message_at AS customer_last_message_at,
            c.created_at AS customer_created_at,

            lm.id AS last_message_id,
            lm.direction AS last_message_direction,
            lm.content AS last_message_content,
            lm.message_type AS last_message_type,
            lm.was_auto_replied AS last_message_was_auto_replied,
            lm.media_available AS last_message_media_available,
            lm.created_at AS last_message_created_at,

            cs.current_state,
            cs.state_type,
            cs.updated_at AS state_updated_at,
            cs.control_state,
            cs.control_changed_at,
            cs.control_changed_by_profile_id,
            cs.control_reason_code,
            cs.control_reason_note,
            cs.resume_after_message_id,
            cs.control_version,

            (ao.id IS NOT NULL) AS has_active_order,
            ao.id AS active_order_id,
            ao.status AS active_order_status,
            ao.external_order_number AS active_order_external_order_number,
            ao.product_name_snapshot AS active_order_product_name,
            ao.version AS active_order_version,
            ao.updated_at AS active_order_updated_at,

            ar.id AS active_return_issue_id,
            ar.issue_type AS active_return_issue_type,
            ar.status AS active_return_issue_status,
            ar.version AS active_return_issue_version,
            ar.updated_at AS active_return_issue_updated_at,

            uq.id AS open_unanswered_group_id,
            uq.canonical_question AS open_unanswered_question,
            uq.occurrence_count AS open_unanswered_occurrence_count,
            uq.last_seen_at AS open_unanswered_last_seen_at,
            uq.version AS open_unanswered_version,

            COALESCE(lm.created_at, c.last_message_at, c.created_at) AS sort_at,

            COALESCE(
                (
                    cs.control_state IN (
                        'SELLER_TAKEN_OVER',
                        'RETURN_REVIEW',
                        'ASSISTANT_PAUSED'
                    )
                    OR ar.status = 'SELLER_REVIEW_REQUIRED'
                    OR ao.status = 'SELLER_REVIEW_REQUIRED'
                    OR uq.id IS NOT NULL
                ),
                FALSE
            ) AS needs_attention,

            CASE
                WHEN cs.control_state = 'RETURN_REVIEW'
                    THEN 'return_review'
                WHEN cs.control_state = 'SELLER_TAKEN_OVER'
                    THEN 'seller_taken_over'
                WHEN cs.control_state = 'ASSISTANT_PAUSED'
                    THEN 'assistant_paused'
                WHEN ar.status = 'SELLER_REVIEW_REQUIRED'
                    THEN 'return_review'
                WHEN ao.status = 'SELLER_REVIEW_REQUIRED'
                    THEN 'order_review'
                WHEN uq.id IS NOT NULL
                    THEN 'unanswered_question'
                ELSE NULL
            END AS attention_reason
        FROM public.customers AS c
        LEFT JOIN public.conversation_states AS cs
          ON cs.seller_id = c.seller_id
         AND cs.customer_id = c.id

        LEFT JOIN LATERAL (
            SELECT
                m.id,
                m.direction,
                m.content,
                m.message_type,
                m.was_auto_replied,
                (m.media_url IS NOT NULL) AS media_available,
                m.created_at
            FROM public.messages AS m
            WHERE m.seller_id = c.seller_id
              AND m.customer_id = c.id
            ORDER BY m.id DESC
            LIMIT 1
        ) AS lm ON TRUE

        LEFT JOIN LATERAL (
            SELECT
                o.id,
                o.status,
                o.external_order_number,
                o.product_name_snapshot,
                o.version,
                o.updated_at
            FROM public.orders AS o
            WHERE o.seller_id = c.seller_id
              AND o.customer_id = c.id
              AND o.status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
            ORDER BY o.updated_at DESC, o.id DESC
            LIMIT 1
        ) AS ao ON TRUE

        LEFT JOIN LATERAL (
            SELECT
                r.id,
                r.issue_type,
                r.status,
                r.version,
                r.updated_at
            FROM public.return_issue_requests AS r
            WHERE r.seller_id = c.seller_id
              AND r.customer_id = c.id
              AND r.status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
            ORDER BY r.updated_at DESC, r.id DESC
            LIMIT 1
        ) AS ar ON TRUE

        LEFT JOIN LATERAL (
            SELECT
                g.id,
                g.canonical_question,
                g.occurrence_count,
                g.last_seen_at,
                g.version
            FROM public.unanswered_question_occurrences AS occ
            JOIN public.unanswered_question_groups AS g
              ON g.id = occ.group_id
             AND g.seller_id = occ.seller_id
            WHERE occ.seller_id = c.seller_id
              AND occ.customer_id = c.id
              AND g.status = 'OPEN'
            ORDER BY occ.occurred_at DESC, occ.id DESC
            LIMIT 1
        ) AS uq ON TRUE

        WHERE c.seller_id = target_seller_id
    ),
    filtered AS (
        SELECT *
        FROM base
        WHERE (NOT attention_only OR needs_attention)
          AND (
            target_control_state IS NULL
            OR control_state = target_control_state
          )
    ),
    paged AS (
        SELECT *
        FROM filtered
        ORDER BY
            CASE
                WHEN target_control_state = 'ASSISTANT_PAUSED'
                    THEN has_active_order
                ELSE FALSE
            END DESC,
            needs_attention DESC,
            sort_at DESC,
            customer_id DESC
        LIMIT result_limit
        OFFSET result_offset
    )
    SELECT jsonb_build_object(
        'status', 'success',
        'total', (SELECT COUNT(*) FROM filtered),
        'control_state', target_control_state,
        'conversations', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'customer', jsonb_build_object(
                            'id', p.customer_id,
                            'name', p.customer_name,
                            'whatsapp_number', p.whatsapp_number,
                            'is_blocked', p.is_blocked,
                            'muted_until', p.muted_until,
                            'is_muted', (
                                p.muted_until IS NOT NULL
                                AND p.muted_until > CURRENT_TIMESTAMP
                            ),
                            'total_messages', p.total_messages,
                            'last_message_at', p.customer_last_message_at
                        ),
                        'last_message', CASE
                            WHEN p.last_message_id IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                'id', p.last_message_id,
                                'direction', p.last_message_direction,
                                'content', LEFT(p.last_message_content, 500),
                                'message_type', p.last_message_type,
                                'was_auto_replied', p.last_message_was_auto_replied,
                                'media_available', p.last_message_media_available,
                                'created_at', p.last_message_created_at
                            )
                        END,
                        'conversation_state', CASE
                            WHEN p.current_state IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                'state', p.current_state,
                                'state_type', p.state_type,
                                'updated_at', p.state_updated_at
                            )
                        END,
                        'control', CASE
                            WHEN p.control_state IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                'state', p.control_state,
                                'changed_at', p.control_changed_at,
                                'changed_by_profile_id', p.control_changed_by_profile_id,
                                'reason_code', p.control_reason_code,
                                'reason_note', p.control_reason_note,
                                'resume_after_message_id', p.resume_after_message_id,
                                'version', p.control_version
                            )
                        END,
                        'has_active_order', p.has_active_order,
                        'active_order', CASE
                            WHEN p.active_order_id IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                'id', p.active_order_id,
                                'status', p.active_order_status,
                                'external_order_number', p.active_order_external_order_number,
                                'product_name_snapshot', p.active_order_product_name,
                                'version', p.active_order_version,
                                'updated_at', p.active_order_updated_at
                            )
                        END,
                        'active_return_issue', CASE
                            WHEN p.active_return_issue_id IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                'id', p.active_return_issue_id,
                                'issue_type', p.active_return_issue_type,
                                'status', p.active_return_issue_status,
                                'version', p.active_return_issue_version,
                                'updated_at', p.active_return_issue_updated_at
                            )
                        END,
                        'open_unanswered', CASE
                            WHEN p.open_unanswered_group_id IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                'id', p.open_unanswered_group_id,
                                'question', p.open_unanswered_question,
                                'occurrence_count', p.open_unanswered_occurrence_count,
                                'last_seen_at', p.open_unanswered_last_seen_at,
                                'version', p.open_unanswered_version
                            )
                        END,
                        'needs_attention', p.needs_attention,
                        'attention_reason', p.attention_reason
                    )
                    ORDER BY
                        CASE
                            WHEN target_control_state = 'ASSISTANT_PAUSED'
                                THEN p.has_active_order
                            ELSE FALSE
                        END DESC,
                        p.needs_attention DESC,
                        p.sort_at DESC,
                        p.customer_id DESC
                )
                FROM paged AS p
            ),
            '[]'::jsonb
        )
    ) INTO payload;

    RETURN payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_seller_conversation_list(
    BIGINT, INTEGER, INTEGER, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_conversation_list(
    BIGINT, INTEGER, INTEGER, BOOLEAN, TEXT
) TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '031',
    'prioritize_paused_conversations_with_orders',
    'paused_conversation_order_priority_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
