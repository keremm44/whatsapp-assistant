-- ============================================================
-- 033_add_cursor_pagination_read_models.sql
-- High-churn seller queues için backward-compatible keyset/cursor read models.
--
-- Legacy offset RPC/route sözleşmelerini değiştirmez. Yeni v2 cursor yüzeyi
-- bu read-only RPC'leri kullanır. Migration yalnız repo dosyasıdır; canlıya
-- bu görev sırasında uygulanmaz.
-- ============================================================

BEGIN;

-- Direct keyset listeleri için deterministic (timestamp, id) sırasını destekle.
CREATE INDEX IF NOT EXISTS idx_orders_seller_updated_id
ON public.orders(seller_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_orders_seller_status_updated_id
ON public.orders(seller_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_return_issue_requests_seller_updated_id
ON public.return_issue_requests(seller_id, updated_at DESC, id DESC);

-- ------------------------------------------------------------
-- 1. Conversation / Paused cursor read model
-- Sort contract:
--   ASSISTANT_PAUSED: has_active_order DESC
--   all queues:       needs_attention DESC, sort_at DESC, customer_id DESC
-- Cursor ranks turn booleans into 0/1 so keyset comparison is explicit.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_seller_conversation_list_cursor(
    target_seller_id BIGINT,
    result_limit INTEGER DEFAULT 20,
    attention_only BOOLEAN DEFAULT FALSE,
    target_control_state TEXT DEFAULT NULL,
    cursor_paused_rank INTEGER DEFAULT NULL,
    cursor_attention_rank INTEGER DEFAULT NULL,
    cursor_sort_at TIMESTAMPTZ DEFAULT NULL,
    cursor_customer_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    has_cursor BOOLEAN;
    payload JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error', 'message', 'Geçersiz seller kimliği.'
        );
    END IF;

    IF result_limit IS NULL OR result_limit < 1 OR result_limit > 100 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'result_limit 1 ile 100 arasında olmalıdır.'
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
            'status', 'error', 'message', 'Geçersiz control_state.'
        );
    END IF;

    has_cursor := (
        cursor_paused_rank IS NOT NULL
        OR cursor_attention_rank IS NOT NULL
        OR cursor_sort_at IS NOT NULL
        OR cursor_customer_id IS NOT NULL
    );

    IF has_cursor AND NOT (
        cursor_paused_rank IS NOT NULL
        AND cursor_attention_rank IS NOT NULL
        AND cursor_sort_at IS NOT NULL
        AND cursor_customer_id IS NOT NULL
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Cursor alanları birlikte gönderilmelidir.'
        );
    END IF;

    IF has_cursor AND (
        cursor_paused_rank NOT IN (0, 1)
        OR cursor_attention_rank NOT IN (0, 1)
        OR cursor_customer_id <= 0
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error', 'message', 'Cursor alanları geçersiz.'
        );
    END IF;

    WITH base AS (
        SELECT
            c.id AS customer_id,
            c.name AS customer_name,
            c.whatsapp_number,
            c.is_blocked,
            c.muted_until,
            (
                c.muted_until IS NOT NULL
                AND c.muted_until > CURRENT_TIMESTAMP
            ) AS is_muted,
            c.total_messages,
            c.last_message_at AS customer_last_message_at,

            lm.id AS last_message_id,
            lm.direction AS last_message_direction,
            LEFT(lm.content, 500) AS last_message_content,
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
    ranked AS (
        SELECT
            base.*,
            CASE
                WHEN target_control_state = 'ASSISTANT_PAUSED'
                     AND has_active_order
                    THEN 1
                ELSE 0
            END AS paused_rank,
            CASE WHEN needs_attention THEN 1 ELSE 0 END AS attention_rank
        FROM base
        WHERE (NOT attention_only OR needs_attention)
          AND (
              target_control_state IS NULL
              OR control_state = target_control_state
          )
    ),
    cursor_filtered AS (
        SELECT *
        FROM ranked
        WHERE NOT has_cursor
           OR paused_rank < cursor_paused_rank
           OR (
                paused_rank = cursor_paused_rank
                AND attention_rank < cursor_attention_rank
           )
           OR (
                paused_rank = cursor_paused_rank
                AND attention_rank = cursor_attention_rank
                AND sort_at < cursor_sort_at
           )
           OR (
                paused_rank = cursor_paused_rank
                AND attention_rank = cursor_attention_rank
                AND sort_at = cursor_sort_at
                AND customer_id < cursor_customer_id
           )
    ),
    windowed AS (
        SELECT *
        FROM cursor_filtered
        ORDER BY
            paused_rank DESC,
            attention_rank DESC,
            sort_at DESC,
            customer_id DESC
        LIMIT (result_limit + 1)
    ),
    visible AS (
        SELECT *
        FROM windowed
        ORDER BY
            paused_rank DESC,
            attention_rank DESC,
            sort_at DESC,
            customer_id DESC
        LIMIT result_limit
    ),
    page_meta AS (
        SELECT COUNT(*) > result_limit AS has_more
        FROM windowed
    ),
    last_visible AS (
        SELECT paused_rank, attention_rank, sort_at, customer_id
        FROM visible
        ORDER BY
            paused_rank ASC,
            attention_rank ASC,
            sort_at ASC,
            customer_id ASC
        LIMIT 1
    )
    SELECT jsonb_build_object(
        'status', 'success',
        'has_more', (SELECT has_more FROM page_meta),
        'next_position', CASE
            WHEN (SELECT has_more FROM page_meta) THEN (
                SELECT jsonb_build_object(
                    'paused_rank', paused_rank,
                    'attention_rank', attention_rank,
                    'sort_at', sort_at,
                    'customer_id', customer_id
                )
                FROM last_visible
            )
            ELSE NULL
        END,
        'conversations', COALESCE(
            (
                SELECT jsonb_agg(
                    to_jsonb(v)
                        - 'paused_rank'
                        - 'attention_rank'
                        - 'sort_at'
                    ORDER BY
                        v.paused_rank DESC,
                        v.attention_rank DESC,
                        v.sort_at DESC,
                        v.customer_id DESC
                )
                FROM visible AS v
            ),
            '[]'::jsonb
        )
    ) INTO payload;

    RETURN payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_seller_conversation_list_cursor(
    BIGINT, INTEGER, BOOLEAN, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_conversation_list_cursor(
    BIGINT, INTEGER, BOOLEAN, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, BIGINT
) TO service_role;

-- ------------------------------------------------------------
-- 2. Dashboard task cursor read model
-- Sort contract:
--   priority_rank ASC, updated_at DESC, related_entity_id DESC
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_seller_dashboard_tasks_cursor(
    target_seller_id BIGINT,
    task_type_value TEXT DEFAULT NULL,
    result_limit INTEGER DEFAULT 50,
    cursor_priority_rank INTEGER DEFAULT NULL,
    cursor_updated_at TIMESTAMPTZ DEFAULT NULL,
    cursor_entity_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    has_cursor BOOLEAN;
    payload JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error', 'message', 'Geçersiz seller kimliği.'
        );
    END IF;

    IF task_type_value IS NOT NULL
       AND task_type_value NOT IN (
           'return_review', 'order_review', 'unanswered_question'
       ) THEN
        RETURN jsonb_build_object(
            'status', 'error', 'message', 'Geçersiz task type.'
        );
    END IF;

    IF result_limit IS NULL OR result_limit < 1 OR result_limit > 100 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'result_limit 1 ile 100 arasında olmalıdır.'
        );
    END IF;

    has_cursor := (
        cursor_priority_rank IS NOT NULL
        OR cursor_updated_at IS NOT NULL
        OR cursor_entity_id IS NOT NULL
    );

    IF has_cursor AND NOT (
        cursor_priority_rank IS NOT NULL
        AND cursor_updated_at IS NOT NULL
        AND cursor_entity_id IS NOT NULL
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Cursor alanları birlikte gönderilmelidir.'
        );
    END IF;

    IF has_cursor AND (
        cursor_priority_rank NOT IN (1, 2, 3)
        OR cursor_entity_id <= 0
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error', 'message', 'Cursor alanları geçersiz.'
        );
    END IF;

    WITH tasks AS (
        SELECT
            ('return_review:' || r.id)::TEXT AS task_id,
            'return_review'::TEXT AS task_type,
            'high'::TEXT AS priority,
            1::INTEGER AS priority_rank,
            r.customer_id,
            c.name AS customer_name,
            c.whatsapp_number,
            'İade / sorun talebi inceleme bekliyor'::TEXT AS title,
            LEFT(
                COALESCE(
                    NULLIF(BTRIM(r.reason_text), ''),
                    r.issue_type::TEXT,
                    'Müşteri talebi satıcı incelemesi bekliyor.'
                ),
                300
            ) AS summary,
            r.id AS related_entity_id,
            r.version AS entity_version,
            COALESCE(r.review_required_at, r.created_at) AS created_at,
            r.updated_at,
            jsonb_build_object(
                'kind', 'return_issue_request',
                'id', r.id,
                'customer_id', r.customer_id
            ) AS action_target
        FROM public.return_issue_requests AS r
        JOIN public.customers AS c
          ON c.id = r.customer_id
         AND c.seller_id = r.seller_id
        WHERE r.seller_id = target_seller_id
          AND r.status = 'SELLER_REVIEW_REQUIRED'

        UNION ALL

        SELECT
            ('order_review:' || o.id)::TEXT AS task_id,
            'order_review'::TEXT AS task_type,
            'high'::TEXT AS priority,
            2::INTEGER AS priority_rank,
            o.customer_id,
            c.name AS customer_name,
            c.whatsapp_number,
            'Sipariş satıcı incelemesi bekliyor'::TEXT AS title,
            LEFT(
                COALESCE(
                    NULLIF(BTRIM(o.review_reason_note), ''),
                    NULLIF(BTRIM(o.product_name_snapshot), ''),
                    NULLIF(BTRIM(o.external_order_number), ''),
                    'Sipariş satıcı incelemesi gerektiriyor.'
                ),
                300
            ) AS summary,
            o.id AS related_entity_id,
            o.version AS entity_version,
            o.created_at,
            o.updated_at,
            jsonb_build_object(
                'kind', 'order',
                'id', o.id,
                'customer_id', o.customer_id
            ) AS action_target
        FROM public.orders AS o
        JOIN public.customers AS c
          ON c.id = o.customer_id
         AND c.seller_id = o.seller_id
        WHERE o.seller_id = target_seller_id
          AND o.status = 'SELLER_REVIEW_REQUIRED'

        UNION ALL

        SELECT
            ('unanswered_question:' || g.id)::TEXT AS task_id,
            'unanswered_question'::TEXT AS task_type,
            'normal'::TEXT AS priority,
            3::INTEGER AS priority_rank,
            latest_occ.customer_id,
            c.name AS customer_name,
            c.whatsapp_number,
            'Cevaplanamayan müşteri sorusu'::TEXT AS title,
            LEFT(g.canonical_question, 300) AS summary,
            g.id AS related_entity_id,
            g.version AS entity_version,
            g.first_seen_at AS created_at,
            g.last_seen_at AS updated_at,
            jsonb_build_object(
                'kind', 'unanswered_question_group',
                'id', g.id,
                'customer_id', latest_occ.customer_id
            ) AS action_target
        FROM public.unanswered_question_groups AS g
        LEFT JOIN LATERAL (
            SELECT occ.customer_id
            FROM public.unanswered_question_occurrences AS occ
            WHERE occ.seller_id = g.seller_id
              AND occ.group_id = g.id
              AND occ.customer_id IS NOT NULL
            ORDER BY occ.occurred_at DESC, occ.id DESC
            LIMIT 1
        ) AS latest_occ ON TRUE
        LEFT JOIN public.customers AS c
          ON c.id = latest_occ.customer_id
         AND c.seller_id = g.seller_id
        WHERE g.seller_id = target_seller_id
          AND g.status = 'OPEN'
    ),
    filtered AS (
        SELECT *
        FROM tasks
        WHERE task_type_value IS NULL OR task_type = task_type_value
    ),
    cursor_filtered AS (
        SELECT *
        FROM filtered
        WHERE NOT has_cursor
           OR priority_rank > cursor_priority_rank
           OR (
                priority_rank = cursor_priority_rank
                AND updated_at < cursor_updated_at
           )
           OR (
                priority_rank = cursor_priority_rank
                AND updated_at = cursor_updated_at
                AND related_entity_id < cursor_entity_id
           )
    ),
    windowed AS (
        SELECT *
        FROM cursor_filtered
        ORDER BY
            priority_rank ASC,
            updated_at DESC,
            related_entity_id DESC
        LIMIT (result_limit + 1)
    ),
    visible AS (
        SELECT *
        FROM windowed
        ORDER BY
            priority_rank ASC,
            updated_at DESC,
            related_entity_id DESC
        LIMIT result_limit
    ),
    page_meta AS (
        SELECT COUNT(*) > result_limit AS has_more
        FROM windowed
    ),
    last_visible AS (
        SELECT priority_rank, updated_at, related_entity_id
        FROM visible
        ORDER BY
            priority_rank DESC,
            updated_at ASC,
            related_entity_id ASC
        LIMIT 1
    )
    SELECT jsonb_build_object(
        'status', 'success',
        'has_more', (SELECT has_more FROM page_meta),
        'next_position', CASE
            WHEN (SELECT has_more FROM page_meta) THEN (
                SELECT jsonb_build_object(
                    'priority_rank', priority_rank,
                    'updated_at', updated_at,
                    'related_entity_id', related_entity_id
                )
                FROM last_visible
            )
            ELSE NULL
        END,
        'tasks', COALESCE(
            (
                SELECT jsonb_agg(
                    to_jsonb(v)
                    ORDER BY
                        v.priority_rank ASC,
                        v.updated_at DESC,
                        v.related_entity_id DESC
                )
                FROM visible AS v
            ),
            '[]'::jsonb
        )
    ) INTO payload;

    RETURN payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_seller_dashboard_tasks_cursor(
    BIGINT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_dashboard_tasks_cursor(
    BIGINT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, BIGINT
) TO service_role;

INSERT INTO public.schema_migrations(version, name, checksum, applied_by)
VALUES (
    '033',
    'add_cursor_pagination_read_models',
    'seller_cursor_pagination_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
