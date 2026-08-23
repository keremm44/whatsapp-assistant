-- ============================================================
-- 061_honor_order_number_requirement.sql
-- Seller-controlled post-order collection now decides whether an
-- external order number is required. Missing/null preserves the
-- historical TRUE behavior. image_required/custom_text_required keep
-- the same strict parsing semantics introduced by migration 027.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._recompute_order_completion(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
    expected_version BIGINT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
    seller_info JSONB;
    order_config JSONB;
    raw_flag JSONB;
    normalized_flag TEXT;
    core_ready BOOLEAN := TRUE;
    order_number_required BOOLEAN := TRUE;
    image_required BOOLEAN := TRUE;
    custom_text_required BOOLEAN := FALSE;
    required_missing BIGINT := 0;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
        hashtext('order:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO order_row
    FROM public.orders
    WHERE id = target_order_id
      AND seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND OR order_row.status = 'COMPLETE' THEN
        RETURN FALSE;
    END IF;

    IF expected_version IS NOT NULL
       AND order_row.version <> expected_version THEN
        RETURN FALSE;
    END IF;

    SELECT product_info
    INTO seller_info
    FROM public.sellers
    WHERE id = target_seller_id;

    order_config := seller_info -> 'order';

    -- order_number_required: missing/null => TRUE for backward compatibility.
    raw_flag := order_config -> 'order_number_required';
    IF raw_flag IS NULL OR jsonb_typeof(raw_flag) = 'null' THEN
        order_number_required := TRUE;
    ELSIF jsonb_typeof(raw_flag) = 'boolean' THEN
        order_number_required := (raw_flag = 'true'::jsonb);
    ELSIF jsonb_typeof(raw_flag) = 'string' THEN
        normalized_flag := lower(btrim(raw_flag #>> '{}'));
        IF normalized_flag = 'true' THEN
            order_number_required := TRUE;
        ELSIF normalized_flag = 'false' THEN
            order_number_required := FALSE;
        ELSE
            core_ready := FALSE;
        END IF;
    ELSE
        core_ready := FALSE;
    END IF;

    IF order_number_required
       AND (
           order_row.external_order_number IS NULL
           OR char_length(BTRIM(order_row.external_order_number)) = 0
       ) THEN
        core_ready := FALSE;
    END IF;

    -- image_required: missing/null => TRUE (legacy behavior).
    raw_flag := order_config -> 'image_required';
    IF raw_flag IS NULL OR jsonb_typeof(raw_flag) = 'null' THEN
        image_required := TRUE;
    ELSIF jsonb_typeof(raw_flag) = 'boolean' THEN
        image_required := (raw_flag = 'true'::jsonb);
    ELSIF jsonb_typeof(raw_flag) = 'string' THEN
        normalized_flag := lower(btrim(raw_flag #>> '{}'));
        IF normalized_flag = 'true' THEN
            image_required := TRUE;
        ELSIF normalized_flag = 'false' THEN
            image_required := FALSE;
        ELSE
            core_ready := FALSE;
        END IF;
    ELSE
        core_ready := FALSE;
    END IF;

    IF image_required AND order_row.image_message_id IS NULL THEN
        core_ready := FALSE;
    END IF;

    -- custom_text_required: missing/null => FALSE (legacy behavior).
    raw_flag := order_config -> 'custom_text_required';
    IF raw_flag IS NULL OR jsonb_typeof(raw_flag) = 'null' THEN
        custom_text_required := FALSE;
    ELSIF jsonb_typeof(raw_flag) = 'boolean' THEN
        custom_text_required := (raw_flag = 'true'::jsonb);
    ELSIF jsonb_typeof(raw_flag) = 'string' THEN
        normalized_flag := lower(btrim(raw_flag #>> '{}'));
        IF normalized_flag = 'true' THEN
            custom_text_required := TRUE;
        ELSIF normalized_flag = 'false' THEN
            custom_text_required := FALSE;
        ELSE
            core_ready := FALSE;
        END IF;
    ELSE
        core_ready := FALSE;
    END IF;

    IF custom_text_required
       AND (
           order_row.custom_text IS NULL
           OR char_length(BTRIM(order_row.custom_text)) = 0
       ) THEN
        core_ready := FALSE;
    END IF;

    IF core_ready THEN
        SELECT COUNT(*)
        INTO required_missing
        FROM public.order_field_snapshots s
        WHERE s.order_id = target_order_id
          AND s.is_required_snapshot = TRUE
          AND NOT EXISTS (
              SELECT 1
              FROM public.order_field_values v
              WHERE v.field_snapshot_id = s.id
                AND v.order_id = s.order_id
          );

        IF required_missing > 0 THEN
            core_ready := FALSE;
        END IF;
    END IF;

    IF core_ready THEN
        UPDATE public.orders
        SET
            status = 'COMPLETE',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW(),
            version = version + 1
        WHERE id = target_order_id
        RETURNING * INTO order_row;

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._recompute_order_completion(
    BIGINT, BIGINT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._recompute_order_completion(
    BIGINT, BIGINT, BIGINT, BIGINT
)
TO service_role;

INSERT INTO public.schema_migrations(version, name, checksum, applied_by)
VALUES (
    '061',
    'honor_order_number_requirement',
    'order_number_requirement_completion_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
