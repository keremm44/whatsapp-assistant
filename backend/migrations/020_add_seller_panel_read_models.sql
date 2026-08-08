-- ============================================================
-- 020_add_seller_panel_read_models.sql
-- Seller panel conversation list/detail ve "bugün ilgilenmeniz gerekenler"
-- read model'ları.
--
-- Bu migration yalnız read-only RPC + sorgu odaklı index ekler.
-- Mevcut veri akışlarını, conversation control davranışını veya RLS
-- mimarisini değiştirmez.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Query-driven indexes
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_customers_seller_last_message
ON public.customers(seller_id, last_message_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_seller_customer_id_desc
ON public.messages(seller_id, customer_id, id DESC);

-- ------------------------------------------------------------
-- 2. Seller conversation list read model
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_seller_conversation_list(
    target_seller_id BIGINT,
    result_limit INTEGER DEFAULT 20,
    result_offset INTEGER DEFAULT 0,
    attention_only BOOLEAN DEFAULT FALSE
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
        WHERE NOT attention_only OR needs_attention
    ),
    paged AS (
        SELECT *
        FROM filtered
        ORDER BY needs_attention DESC, sort_at DESC, customer_id DESC
        LIMIT result_limit
        OFFSET result_offset
    )
    SELECT jsonb_build_object(
        'status', 'success',
        'total', (SELECT COUNT(*) FROM filtered),
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
                    ORDER BY p.needs_attention DESC, p.sort_at DESC, p.customer_id DESC
                )
                FROM paged AS p
            ),
            '[]'::jsonb
        )
    ) INTO payload;

    RETURN payload;
END;
$$;

-- ------------------------------------------------------------
-- 3. Seller conversation detail read model
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_seller_conversation_detail(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    message_limit INTEGER DEFAULT 50,
    before_message_id BIGINT DEFAULT NULL,
    control_history_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    customer_row public.customers%ROWTYPE;
    state_row public.conversation_states%ROWTYPE;
    state_found BOOLEAN := FALSE;
    messages_json JSONB := '[]'::jsonb;
    control_history_json JSONB := '[]'::jsonb;
    active_order_json JSONB;
    active_return_json JSONB;
    unanswered_json JSONB := '[]'::jsonb;
    has_more BOOLEAN := FALSE;
    oldest_visible_message_id BIGINT;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz seller veya customer kimliği.'
        );
    END IF;

    IF message_limit IS NULL OR message_limit < 1 OR message_limit > 100 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'message_limit 1 ile 100 arasında olmalıdır.'
        );
    END IF;

    IF before_message_id IS NOT NULL AND before_message_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'before_message_id pozitif olmalıdır.'
        );
    END IF;

    IF control_history_limit IS NULL
       OR control_history_limit < 1
       OR control_history_limit > 100 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'control_history_limit 1 ile 100 arasında olmalıdır.'
        );
    END IF;

    SELECT *
    INTO customer_row
    FROM public.customers
    WHERE id = target_customer_id
      AND seller_id = target_seller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT *
    INTO state_row
    FROM public.conversation_states
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id;
    state_found := FOUND;

    WITH recent AS (
        SELECT
            m.id,
            m.direction,
            m.content,
            m.message_type,
            m.was_auto_replied,
            (m.media_url IS NOT NULL) AS media_available,
            m.created_at
        FROM public.messages AS m
        WHERE m.seller_id = target_seller_id
          AND m.customer_id = target_customer_id
          AND (before_message_id IS NULL OR m.id < before_message_id)
        ORDER BY m.id DESC
        LIMIT message_limit + 1
    ),
    visible AS (
        SELECT *
        FROM recent
        ORDER BY id DESC
        LIMIT message_limit
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', v.id,
                        'direction', v.direction,
                        'content', v.content,
                        'message_type', v.message_type,
                        'was_auto_replied', v.was_auto_replied,
                        'media_available', v.media_available,
                        'created_at', v.created_at
                    )
                    ORDER BY v.id ASC
                )
                FROM visible AS v
            ),
            '[]'::jsonb
        ),
        (SELECT COUNT(*) > message_limit FROM recent),
        (SELECT MIN(id) FROM visible)
    INTO messages_json, has_more, oldest_visible_message_id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', h.id,
                'from_state', h.from_control_state,
                'to_state', h.to_control_state,
                'reason_code', h.reason_code,
                'reason_note', h.reason_note,
                'changed_by_profile_id', h.changed_by_profile_id,
                'trigger_message_id', h.trigger_message_id,
                'resume_after_message_id', h.new_resume_after_message_id,
                'previous_version', h.previous_version,
                'new_version', h.new_version,
                'created_at', h.created_at
            )
            ORDER BY h.created_at DESC, h.id DESC
        ),
        '[]'::jsonb
    )
    INTO control_history_json
    FROM (
        SELECT *
        FROM public.conversation_control_transitions
        WHERE seller_id = target_seller_id
          AND customer_id = target_customer_id
        ORDER BY created_at DESC, id DESC
        LIMIT control_history_limit
    ) AS h;

    SELECT jsonb_build_object(
        'id', o.id,
        'status', o.status,
        'external_order_number', o.external_order_number,
        'product_id', o.product_id,
        'product_name_snapshot', o.product_name_snapshot,
        'customer_phone_snapshot', o.customer_phone_snapshot,
        'image_message_id', o.image_message_id,
        'custom_text', o.custom_text,
        'review_reason_code', o.review_reason_code,
        'review_reason_note', o.review_reason_note,
        'version', o.version,
        'created_at', o.created_at,
        'updated_at', o.updated_at
    )
    INTO active_order_json
    FROM public.orders AS o
    WHERE o.seller_id = target_seller_id
      AND o.customer_id = target_customer_id
      AND o.status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
    ORDER BY o.updated_at DESC, o.id DESC
    LIMIT 1;

    SELECT jsonb_build_object(
        'id', r.id,
        'issue_type', r.issue_type,
        'status', r.status,
        'order_id', r.order_id,
        'external_order_number_snapshot', r.external_order_number_snapshot,
        'product_name_snapshot', r.product_name_snapshot,
        'reason_text', r.reason_text,
        'image_requirement_snapshot', r.image_requirement_snapshot,
        'review_reason_code', r.review_reason_code,
        'review_note', r.review_note,
        'version', r.version,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'review_required_at', r.review_required_at
    )
    INTO active_return_json
    FROM public.return_issue_requests AS r
    WHERE r.seller_id = target_seller_id
      AND r.customer_id = target_customer_id
      AND r.status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
    ORDER BY r.updated_at DESC, r.id DESC
    LIMIT 1;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'question', q.canonical_question,
                'occurrence_count', q.occurrence_count,
                'first_seen_at', q.first_seen_at,
                'last_seen_at', q.last_seen_at,
                'version', q.version
            )
            ORDER BY q.last_seen_at DESC, q.id DESC
        ),
        '[]'::jsonb
    )
    INTO unanswered_json
    FROM (
        SELECT g.*
        FROM public.unanswered_question_groups AS g
        WHERE g.seller_id = target_seller_id
          AND g.status = 'OPEN'
          AND EXISTS (
              SELECT 1
              FROM public.unanswered_question_occurrences AS occ
              WHERE occ.seller_id = target_seller_id
                AND occ.group_id = g.id
                AND occ.customer_id = target_customer_id
          )
        ORDER BY g.last_seen_at DESC, g.id DESC
        LIMIT 10
    ) AS q;

    RETURN jsonb_build_object(
        'status', 'success',
        'customer', jsonb_build_object(
            'id', customer_row.id,
            'name', customer_row.name,
            'whatsapp_number', customer_row.whatsapp_number,
            'is_blocked', customer_row.is_blocked,
            'muted_until', customer_row.muted_until,
            'is_muted', (
                customer_row.muted_until IS NOT NULL
                AND customer_row.muted_until > CURRENT_TIMESTAMP
            ),
            'blocked_reason', customer_row.blocked_reason,
            'blocked_at', customer_row.blocked_at,
            'last_message_at', customer_row.last_message_at,
            'total_messages', customer_row.total_messages
        ),
        'conversation_state', CASE
            WHEN NOT state_found THEN NULL
            ELSE jsonb_build_object(
                'state', state_row.current_state,
                'state_type', state_row.state_type,
                'updated_at', state_row.updated_at
            )
        END,
        'control', CASE
            WHEN NOT state_found THEN NULL
            ELSE jsonb_build_object(
                'state', state_row.control_state,
                'changed_at', state_row.control_changed_at,
                'changed_by_profile_id', state_row.control_changed_by_profile_id,
                'reason_code', state_row.control_reason_code,
                'reason_note', state_row.control_reason_note,
                'resume_after_message_id', state_row.resume_after_message_id,
                'version', state_row.control_version
            )
        END,
        'messages', messages_json,
        'message_page', jsonb_build_object(
            'limit', message_limit,
            'has_more', has_more,
            'next_before_message_id', CASE
                WHEN has_more THEN oldest_visible_message_id
                ELSE NULL
            END
        ),
        'control_history', control_history_json,
        'active_order', active_order_json,
        'active_return_issue', active_return_json,
        'open_unanswered', unanswered_json
    );
END;
$$;

-- ------------------------------------------------------------
-- 4. Dashboard task read model
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_seller_dashboard_tasks(
    target_seller_id BIGINT,
    task_type_value TEXT DEFAULT NULL,
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0
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

    IF task_type_value IS NOT NULL
       AND task_type_value NOT IN (
           'return_review',
           'order_review',
           'unanswered_question'
       ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz task type.'
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
    paged AS (
        SELECT *
        FROM filtered
        ORDER BY priority_rank ASC, updated_at DESC, related_entity_id DESC
        LIMIT result_limit
        OFFSET result_offset
    )
    SELECT jsonb_build_object(
        'status', 'success',
        'total', (SELECT COUNT(*) FROM filtered),
        'tasks', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', p.task_id,
                        'type', p.task_type,
                        'priority', p.priority,
                        'customer', CASE
                            WHEN p.customer_id IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                'id', p.customer_id,
                                'name', p.customer_name,
                                'whatsapp_number', p.whatsapp_number
                            )
                        END,
                        'title', p.title,
                        'summary', p.summary,
                        'related_entity_id', p.related_entity_id,
                        'entity_version', p.entity_version,
                        'created_at', p.created_at,
                        'updated_at', p.updated_at,
                        'action_target', p.action_target
                    )
                    ORDER BY p.priority_rank ASC, p.updated_at DESC, p.related_entity_id DESC
                )
                FROM paged AS p
            ),
            '[]'::jsonb
        )
    ) INTO payload;

    RETURN payload;
END;
$$;

-- ------------------------------------------------------------
-- 5. Backend-only permissions
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_seller_conversation_list(
    BIGINT, INTEGER, INTEGER, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_conversation_list(
    BIGINT, INTEGER, INTEGER, BOOLEAN
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_seller_conversation_detail(
    BIGINT, BIGINT, INTEGER, BIGINT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_conversation_detail(
    BIGINT, BIGINT, INTEGER, BIGINT, INTEGER
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_seller_dashboard_tasks(
    BIGINT, TEXT, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_dashboard_tasks(
    BIGINT, TEXT, INTEGER, INTEGER
) TO service_role;

-- ------------------------------------------------------------
-- 6. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '020',
    'add_seller_panel_read_models',
    'seller_panel_read_models_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
