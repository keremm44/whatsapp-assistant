-- 019_fix_order_field_value_parameter_ambiguity.sql
-- Repairs a live PostgreSQL ambiguity in record_order_field_value while
-- preserving the public RPC parameter name used by PostgREST clients.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_order_field_value(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
    target_field_snapshot_id BIGINT,
    value_jsonb JSONB,
    source_message_id BIGINT,
    expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
    snapshot_row public.order_field_snapshots%ROWTYPE;
    existing_row public.order_field_values%ROWTYPE;
    changed boolean := FALSE;
    completed boolean := FALSE;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtext('order:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO order_row
    FROM public.orders
    WHERE id = target_order_id
      AND seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF expected_version IS NOT NULL
       AND order_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'order', public._order_presenter(order_row)
        );
    END IF;

    -- Snapshot gerçekten bu siparişe ait olmalı.
    SELECT *
    INTO snapshot_row
    FROM public.order_field_snapshots
    WHERE id = target_field_snapshot_id
      AND order_id = target_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    -- Kaynak mesaj seller + customer scope'unda olmalı.
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

    -- Idempotency: aynı kaynak mesajdan aynı alana değer daha
    -- önce yazıldıysa ikinci yan etki üretme.
    SELECT *
    INTO existing_row
    FROM public.order_field_values AS existing_value
    WHERE existing_value.order_id = target_order_id
      AND existing_value.field_snapshot_id = target_field_snapshot_id
      AND existing_value.source_message_id = record_order_field_value.source_message_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'idempotent', TRUE,
            'order', public._order_presenter(order_row)
        );
    END IF;

    -- Upsert: aynı sipariş alanı için tek güncel değer.
    INSERT INTO public.order_field_values (
        order_id,
        field_snapshot_id,
        value,
        source_message_id
    )
    VALUES (
        target_order_id,
        target_field_snapshot_id,
        value_jsonb,
        source_message_id
    )
    ON CONFLICT (order_id, field_snapshot_id)
    DO UPDATE SET
        value = EXCLUDED.value,
        source_message_id = EXCLUDED.source_message_id,
        updated_at = NOW();

    changed := TRUE;

    UPDATE public.orders
    SET
        updated_at = NOW(),
        last_source_message_id = source_message_id,
        version = version + 1
    WHERE id = order_row.id
    RETURNING * INTO order_row;

    -- Completion yeniden hesapla.
    SELECT public._recompute_order_completion(
        target_seller_id,
        target_customer_id,
        target_order_id,
        order_row.version
    ) INTO completed;

    SELECT *
    INTO order_row
    FROM public.orders
    WHERE id = target_order_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', changed,
        'completed', completed,
        'order', public._order_presenter(order_row)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_order_field_value(BIGINT,BIGINT,BIGINT,BIGINT,JSONB,BIGINT,BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_field_value(BIGINT,BIGINT,BIGINT,BIGINT,JSONB,BIGINT,BIGINT) TO service_role;

INSERT INTO public.schema_migrations (version,name,checksum,applied_by)
VALUES ('019','fix_order_field_value_parameter_ambiguity','order_field_value_parameter_ambiguity_v1',CURRENT_USER)
ON CONFLICT (version) DO NOTHING;

COMMIT;
