-- ============================================================
-- 034_add_quantity_limit_review_requests.sql
-- Seller-defined min/max quantity runtime enforcement support.
--
-- QUANTITY_LIMIT_REQUEST is an operational seller-review item shown in the
-- existing return / issue queue. It is intentionally NOT a commercial order
-- and NOT a return-collection flow. Quantity reviews never transition
-- conversation control and never collect order fields.
--
-- This migration is repository-only. Do not apply it to live Supabase as part
-- of this change.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Structured quantity snapshot on the existing seller-review domain
-- ------------------------------------------------------------

ALTER TABLE public.return_issue_requests
    ADD COLUMN IF NOT EXISTS requested_quantity INTEGER,
    ADD COLUMN IF NOT EXISTS min_quantity_snapshot INTEGER,
    ADD COLUMN IF NOT EXISTS max_quantity_snapshot INTEGER,
    ADD COLUMN IF NOT EXISTS quantity_limit_direction VARCHAR(16);

ALTER TABLE public.return_issue_requests
    DROP CONSTRAINT IF EXISTS return_issue_requests_issue_type_check,
    DROP CONSTRAINT IF EXISTS return_issue_requests_quantity_metadata_check,
    DROP CONSTRAINT IF EXISTS return_issue_requests_quantity_type_check;

ALTER TABLE public.return_issue_requests
    ADD CONSTRAINT return_issue_requests_issue_type_check
        CHECK (
            issue_type IN (
                'RETURN_REQUEST',
                'DAMAGED_ITEM',
                'WRONG_ITEM',
                'PRINT_OR_PERSONALIZATION_ISSUE',
                'DELIVERY_ISSUE',
                'OTHER_ORDER_ISSUE',
                'QUANTITY_LIMIT_REQUEST'
            )
        ),
    ADD CONSTRAINT return_issue_requests_quantity_metadata_check
        CHECK (
            (
                requested_quantity IS NULL
                AND min_quantity_snapshot IS NULL
                AND max_quantity_snapshot IS NULL
                AND quantity_limit_direction IS NULL
            )
            OR
            (
                requested_quantity IS NOT NULL
                AND requested_quantity >= 0
                AND min_quantity_snapshot IS NOT NULL
                AND min_quantity_snapshot > 0
                AND (
                    max_quantity_snapshot IS NULL
                    OR max_quantity_snapshot >= min_quantity_snapshot
                )
                AND quantity_limit_direction IN ('below_min', 'above_max')
                AND (
                    (
                        quantity_limit_direction = 'below_min'
                        AND requested_quantity < min_quantity_snapshot
                    )
                    OR
                    (
                        quantity_limit_direction = 'above_max'
                        AND max_quantity_snapshot IS NOT NULL
                        AND requested_quantity > max_quantity_snapshot
                    )
                )
            )
        ),
    ADD CONSTRAINT return_issue_requests_quantity_type_check
        CHECK (
            (
                issue_type = 'QUANTITY_LIMIT_REQUEST'
                AND requested_quantity IS NOT NULL
                AND min_quantity_snapshot IS NOT NULL
                AND quantity_limit_direction IS NOT NULL
                AND status IN ('SELLER_REVIEW_REQUIRED', 'HANDLED')
                AND image_requirement_snapshot = 'NOT_REQUESTED'
            )
            OR
            (
                issue_type <> 'QUANTITY_LIMIT_REQUEST'
                AND requested_quantity IS NULL
                AND min_quantity_snapshot IS NULL
                AND max_quantity_snapshot IS NULL
                AND quantity_limit_direction IS NULL
            )
        );

-- Quantity review and a genuine return/issue may coexist for the same customer.
-- Each domain still permits only one open item of its own kind.
DROP INDEX IF EXISTS public.uq_return_issue_requests_one_open_per_customer;
DROP INDEX IF EXISTS public.uq_return_issue_requests_created_source;

CREATE UNIQUE INDEX uq_return_issue_requests_one_open_regular_per_customer
ON public.return_issue_requests(seller_id, customer_id)
WHERE status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
  AND issue_type <> 'QUANTITY_LIMIT_REQUEST';

CREATE UNIQUE INDEX uq_return_issue_requests_one_open_quantity_per_customer
ON public.return_issue_requests(seller_id, customer_id)
WHERE status = 'SELLER_REVIEW_REQUIRED'
  AND issue_type = 'QUANTITY_LIMIT_REQUEST';

CREATE UNIQUE INDEX uq_return_issue_requests_regular_created_source
ON public.return_issue_requests(seller_id, customer_id, created_from_message_id)
WHERE issue_type <> 'QUANTITY_LIMIT_REQUEST';

CREATE UNIQUE INDEX uq_return_issue_requests_quantity_created_source
ON public.return_issue_requests(seller_id, customer_id, created_from_message_id)
WHERE issue_type = 'QUANTITY_LIMIT_REQUEST';

CREATE INDEX IF NOT EXISTS idx_return_issue_quantity_review
ON public.return_issue_requests(seller_id, updated_at DESC, id DESC)
WHERE issue_type = 'QUANTITY_LIMIT_REQUEST'
  AND status = 'SELLER_REVIEW_REQUIRED';

-- ------------------------------------------------------------
-- 2. Presenter: expose structured quantity data to seller list/detail reads
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._return_issue_request_presenter(
    p_request public.return_issue_requests
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', p_request.id,
        'seller_id', p_request.seller_id,
        'customer_id', p_request.customer_id,
        'order_id', p_request.order_id,
        'issue_type', p_request.issue_type,
        'external_order_number_snapshot', p_request.external_order_number_snapshot,
        'product_name_snapshot', p_request.product_name_snapshot,
        'reason_text', p_request.reason_text,
        'requested_quantity', p_request.requested_quantity,
        'min_quantity_snapshot', p_request.min_quantity_snapshot,
        'max_quantity_snapshot', p_request.max_quantity_snapshot,
        'quantity_limit_direction', p_request.quantity_limit_direction,
        'image_requirement_snapshot', p_request.image_requirement_snapshot,
        'status', p_request.status,
        'review_reason_code', p_request.review_reason_code,
        'review_note', p_request.review_note,
        'created_from_message_id', p_request.created_from_message_id,
        'last_source_message_id', p_request.last_source_message_id,
        'version', p_request.version,
        'created_at', p_request.created_at,
        'updated_at', p_request.updated_at,
        'review_required_at', p_request.review_required_at,
        'handled_at', p_request.handled_at,
        'handled_by_profile_id', p_request.handled_by_profile_id,
        'seller_note', p_request.seller_note
    );
$$;

-- ------------------------------------------------------------
-- 3. Keep the normal return/issue create RPC collection-only.
--    Quantity seller-review rows must never be returned as an active
--    collection request.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_or_get_return_issue_request(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    source_message_id BIGINT,
    target_issue_type TEXT,
    initial_reason_text TEXT DEFAULT NULL,
    target_order_id BIGINT DEFAULT NULL,
    external_order_number_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    request_row public.return_issue_requests%ROWTYPE;
    order_row public.orders%ROWTYPE;
    image_requirement_value TEXT := 'OPTIONAL';
    normalized_reason TEXT;
    normalized_external_order_number TEXT;
BEGIN
    IF target_issue_type NOT IN (
        'RETURN_REQUEST',
        'DAMAGED_ITEM',
        'WRONG_ITEM',
        'PRINT_OR_PERSONALIZATION_ISSUE',
        'DELIVERY_ISSUE',
        'OTHER_ORDER_ISSUE'
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz iade/sorun tipi.'
        );
    END IF;

    normalized_reason := NULLIF(BTRIM(initial_reason_text), '');
    normalized_external_order_number := NULLIF(BTRIM(external_order_number_text), '');

    IF normalized_reason IS NOT NULL
       AND char_length(normalized_reason) > 2000 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Sorun açıklaması çok uzun.'
        );
    END IF;

    IF normalized_external_order_number IS NOT NULL
       AND char_length(normalized_external_order_number) > 100 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Sipariş numarası çok uzun.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.customers
        WHERE id = target_customer_id
          AND seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.messages
        WHERE id = source_message_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id
          AND direction = 'incoming'
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('return_issue:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND created_from_message_id = source_message_id
      AND issue_type <> 'QUANTITY_LIMIT_REQUEST'
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'created', FALSE,
            'idempotent', TRUE,
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
      AND issue_type <> 'QUANTITY_LIMIT_REQUEST'
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'created', FALSE,
            'idempotent', FALSE,
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF target_order_id IS NOT NULL THEN
        SELECT *
        INTO order_row
        FROM public.orders
        WHERE id = target_order_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'forbidden');
        END IF;

        normalized_external_order_number := COALESCE(
            NULLIF(BTRIM(order_row.external_order_number), ''),
            normalized_external_order_number
        );
    END IF;

    SELECT image_requirement
    INTO image_requirement_value
    FROM public.return_issue_type_settings
    WHERE seller_id = target_seller_id
      AND issue_type = target_issue_type;

    image_requirement_value := COALESCE(image_requirement_value, 'OPTIONAL');

    INSERT INTO public.return_issue_requests (
        seller_id,
        customer_id,
        order_id,
        issue_type,
        external_order_number_snapshot,
        product_name_snapshot,
        reason_text,
        image_requirement_snapshot,
        created_from_message_id,
        last_source_message_id
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        target_order_id,
        target_issue_type,
        normalized_external_order_number,
        CASE
            WHEN target_order_id IS NOT NULL THEN order_row.product_name_snapshot
            ELSE NULL
        END,
        normalized_reason,
        image_requirement_value,
        source_message_id,
        source_message_id
    )
    RETURNING * INTO request_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'created', TRUE,
        'idempotent', FALSE,
        'request', public._return_issue_request_presenter(request_row)
    );

EXCEPTION
    WHEN unique_violation THEN
        SELECT *
        INTO request_row
        FROM public.return_issue_requests
        WHERE seller_id = target_seller_id
          AND customer_id = target_customer_id
          AND issue_type <> 'QUANTITY_LIMIT_REQUEST'
          AND (
              created_from_message_id = source_message_id
              OR status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
          )
        ORDER BY
            CASE WHEN created_from_message_id = source_message_id THEN 0 ELSE 1 END,
            id
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'success',
                'changed', FALSE,
                'created', FALSE,
                'idempotent', request_row.created_from_message_id = source_message_id,
                'race_resolved', TRUE,
                'request', public._return_issue_request_presenter(request_row)
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'İade/sorun talebi eşzamanlı işlem nedeniyle oluşturulamadı.'
        );
END;
$$;

-- ------------------------------------------------------------
-- 4. Dedicated quantity-limit evaluation / review upsert.
--    Seller settings are read inside PostgreSQL; caller cannot forge snapshots.
--    Within-range calls are read-only. Out-of-range calls create/update the
--    quantity review and notification without changing conversation control.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_quantity_limit_request(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    source_message_id BIGINT,
    requested_quantity_value INTEGER,
    reason_text_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    request_row public.return_issue_requests%ROWTYPE;
    seller_product_info JSONB;
    min_text TEXT;
    max_text TEXT;
    min_value INTEGER;
    max_value INTEGER;
    direction_value TEXT;
    normalized_reason TEXT;
    notification_count INTEGER := 0;
BEGIN
    IF requested_quantity_value IS NULL OR requested_quantity_value < 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Talep edilen adet negatif olmayan tam sayı olmalıdır.'
        );
    END IF;

    normalized_reason := NULLIF(BTRIM(reason_text_value), '');
    IF normalized_reason IS NOT NULL
       AND char_length(normalized_reason) > 2000 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Adet talebi açıklaması çok uzun.'
        );
    END IF;

    SELECT product_info
    INTO seller_product_info
    FROM public.sellers
    WHERE id = target_seller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.customers
        WHERE id = target_customer_id
          AND seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.messages
        WHERE id = source_message_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id
          AND direction = 'incoming'
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    min_text := seller_product_info -> 'order' ->> 'min_quantity';
    max_text := seller_product_info -> 'order' ->> 'max_quantity';

    IF min_text IS NULL OR min_text !~ '^[0-9]+$' THEN
        RETURN jsonb_build_object(
            'status', 'limits_unavailable',
            'message', 'Minimum sipariş adedi yapılandırılmamış.'
        );
    END IF;

    min_value := min_text::INTEGER;
    IF min_value <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'limits_unavailable',
            'message', 'Minimum sipariş adedi geçersiz.'
        );
    END IF;

    IF max_text IS NULL OR BTRIM(max_text) = '' THEN
        max_value := NULL;
    ELSIF max_text !~ '^[0-9]+$' THEN
        RETURN jsonb_build_object(
            'status', 'limits_unavailable',
            'message', 'Maksimum sipariş adedi geçersiz.'
        );
    ELSE
        max_value := max_text::INTEGER;
        IF max_value < min_value THEN
            RETURN jsonb_build_object(
                'status', 'limits_unavailable',
                'message', 'Sipariş adet sınırları tutarsız.'
            );
        END IF;
    END IF;

    IF requested_quantity_value < min_value THEN
        direction_value := 'below_min';
    ELSIF max_value IS NOT NULL AND requested_quantity_value > max_value THEN
        direction_value := 'above_max';
    ELSE
        RETURN jsonb_build_object(
            'status', 'within_limit',
            'requested_quantity', requested_quantity_value,
            'min_quantity', min_value,
            'max_quantity', max_value
        );
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('return_issue:' || target_seller_id || ':' || target_customer_id)
    );

    -- Same incoming quantity message is idempotent even if a newer quantity
    -- review exists for the customer.
    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND issue_type = 'QUANTITY_LIMIT_REQUEST'
      AND created_from_message_id = source_message_id
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'review_required',
            'changed', FALSE,
            'created', FALSE,
            'idempotent', TRUE,
            'notification_created', FALSE,
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND issue_type = 'QUANTITY_LIMIT_REQUEST'
      AND status = 'SELLER_REVIEW_REQUIRED'
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.return_issue_requests
        SET
            requested_quantity = requested_quantity_value,
            min_quantity_snapshot = min_value,
            max_quantity_snapshot = max_value,
            quantity_limit_direction = direction_value,
            reason_text = COALESCE(normalized_reason, reason_text),
            review_reason_code = 'quantity_limit_request',
            review_note = LEFT(
                CASE
                    WHEN direction_value = 'below_min' THEN
                        requested_quantity_value || ' adet, minimum ' || min_value || ' sınırının altında.'
                    ELSE
                        requested_quantity_value || ' adet, maksimum ' || max_value || ' sınırının üzerinde.'
                END,
                500
            ),
            last_source_message_id = source_message_id,
            updated_at = NOW(),
            version = version + 1
        WHERE id = request_row.id
        RETURNING * INTO request_row;

        INSERT INTO public.seller_notifications (
            seller_id,
            customer_id,
            type,
            severity,
            title,
            message,
            related_entity_type,
            related_entity_id
        )
        VALUES (
            target_seller_id,
            target_customer_id,
            'return_request',
            'warning',
            'Adet sınırı talebi',
            'Müşteri mağazanın sipariş adet sınırları dışında bir adet sordu.',
            'return_issue_request',
            request_row.id
        )
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS notification_count = ROW_COUNT;

        RETURN jsonb_build_object(
            'status', 'review_required',
            'changed', TRUE,
            'created', FALSE,
            'idempotent', FALSE,
            'notification_created', notification_count = 1,
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    INSERT INTO public.return_issue_requests (
        seller_id,
        customer_id,
        issue_type,
        reason_text,
        requested_quantity,
        min_quantity_snapshot,
        max_quantity_snapshot,
        quantity_limit_direction,
        image_requirement_snapshot,
        status,
        review_reason_code,
        review_note,
        created_from_message_id,
        last_source_message_id,
        review_required_at
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        'QUANTITY_LIMIT_REQUEST',
        normalized_reason,
        requested_quantity_value,
        min_value,
        max_value,
        direction_value,
        'NOT_REQUESTED',
        'SELLER_REVIEW_REQUIRED',
        'quantity_limit_request',
        LEFT(
            CASE
                WHEN direction_value = 'below_min' THEN
                    requested_quantity_value || ' adet, minimum ' || min_value || ' sınırının altında.'
                ELSE
                    requested_quantity_value || ' adet, maksimum ' || max_value || ' sınırının üzerinde.'
            END,
            500
        ),
        source_message_id,
        source_message_id,
        NOW()
    )
    RETURNING * INTO request_row;

    INSERT INTO public.seller_notifications (
        seller_id,
        customer_id,
        type,
        severity,
        title,
        message,
        related_entity_type,
        related_entity_id
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        'return_request',
        'warning',
        'Adet sınırı talebi',
        'Müşteri mağazanın sipariş adet sınırları dışında bir adet sordu.',
        'return_issue_request',
        request_row.id
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS notification_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'review_required',
        'changed', TRUE,
        'created', TRUE,
        'idempotent', FALSE,
        'notification_created', notification_count = 1,
        'request', public._return_issue_request_presenter(request_row)
    );

EXCEPTION
    WHEN unique_violation THEN
        SELECT *
        INTO request_row
        FROM public.return_issue_requests
        WHERE seller_id = target_seller_id
          AND customer_id = target_customer_id
          AND issue_type = 'QUANTITY_LIMIT_REQUEST'
          AND (
              created_from_message_id = source_message_id
              OR status = 'SELLER_REVIEW_REQUIRED'
          )
        ORDER BY
            CASE WHEN created_from_message_id = source_message_id THEN 0 ELSE 1 END,
            id
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'review_required',
                'changed', FALSE,
                'created', FALSE,
                'idempotent', request_row.created_from_message_id = source_message_id,
                'race_resolved', TRUE,
                'notification_created', FALSE,
                'request', public._return_issue_request_presenter(request_row)
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Adet sınırı talebi eşzamanlı işlem nedeniyle kaydedilemedi.'
        );
END;
$$;

-- ------------------------------------------------------------
-- 5. Backend-only function permissions
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public._return_issue_request_presenter(
    public.return_issue_requests
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._return_issue_request_presenter(
    public.return_issue_requests
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_or_get_return_issue_request(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_get_return_issue_request(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, TEXT
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.evaluate_quantity_limit_request(
    BIGINT, BIGINT, BIGINT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_quantity_limit_request(
    BIGINT, BIGINT, BIGINT, INTEGER, TEXT
) TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '034',
    'add_quantity_limit_review_requests',
    'quantity_limit_review_requests_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
