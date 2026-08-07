-- ============================================================
-- 015_finalize_order_collection_flow.sql
-- Sipariş toplama akışını dinamik alan sistemiyle hizalar.
--
-- Amaç:
--   - AWAITING_ORDER_FIELD konuşma state'ini kalıcı şemaya eklemek.
--   - Sipariş başlatmayı; telefon snapshot'ı ve mağaza-geneli alan
--     snapshot'larıyla tek atomik RPC içinde yapmak.
--   - Core sipariş alanı mutasyonlarını kaynak incoming mesajla
--     ilişkilendirip tenant scope + idempotency güvenliği sağlamak.
--   - Sipariş görselini canonical olarak zorunlu hale getirmek.
--
-- Bu migration yalnızca migration dosyasıdır; doğrudan uygulanmaz.
-- 013 ve 014 migration dosyalarını değiştirmez.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Conversation-state CHECK constraint'lerini genişlet
-- ------------------------------------------------------------

ALTER TABLE public.conversation_states
    DROP CONSTRAINT IF EXISTS conversation_states_current_state_check;

ALTER TABLE public.conversation_states
    ADD CONSTRAINT conversation_states_current_state_check
        CHECK (
            current_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_ORDER_FIELD',
                'AWAITING_SELLER'
            )
        );

ALTER TABLE public.state_transitions
    DROP CONSTRAINT IF EXISTS state_transitions_from_state_check;

ALTER TABLE public.state_transitions
    ADD CONSTRAINT state_transitions_from_state_check
        CHECK (
            from_state IS NULL OR
            from_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_ORDER_FIELD',
                'AWAITING_SELLER'
            )
        );

ALTER TABLE public.state_transitions
    DROP CONSTRAINT IF EXISTS state_transitions_to_state_check;

ALTER TABLE public.state_transitions
    ADD CONSTRAINT state_transitions_to_state_check
        CHECK (
            to_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_ORDER_FIELD',
                'AWAITING_SELLER'
            )
        );

-- ------------------------------------------------------------
-- 2. initialize_order_collection
--
-- Sipariş toplama başlangıcını tek transaction içinde yapar:
--   - customer ve source incoming mesaj tenant scope doğrulaması
--   - seller+customer advisory lock
--   - aktif order get/create
--   - customer.whatsapp_number -> phone snapshot
--   - yalnız mağaza-geneli aktif alanları ilk oluşturma anında
--     snapshot olarak sabitleme
--
-- Ürün seçildiğinde ürün bazlı alanlar mevcut 014 RPC'si
-- set_order_product_and_snapshot_fields ile sonradan eklenebilir.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initialize_order_collection(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    source_message_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    customer_row public.customers%ROWTYPE;
    order_row public.orders%ROWTYPE;
    phone_snapshot TEXT;
    snapshot_count INTEGER := 0;
BEGIN
    SELECT *
    INTO customer_row
    FROM public.customers
    WHERE id = target_customer_id
      AND seller_id = target_seller_id;

    IF NOT FOUND THEN
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

    phone_snapshot := NULLIF(BTRIM(customer_row.whatsapp_number), '');

    IF phone_snapshot IS NOT NULL
       AND char_length(phone_snapshot) > 32 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Müşteri telefon snapshot değeri çok uzun.'
        );
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('order:' || target_seller_id || ':' || target_customer_id)
    );

    -- Aynı konuşmadaki mevcut açık sipariş yeni bir siparişe
    -- dönüştürülmez veya yeni alan tanımlarıyla geriye dönük
    -- genişletilmez. Snapshot, sipariş başlangıç anını temsil eder.
    SELECT *
    INTO order_row
    FROM public.orders
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'created', FALSE,
            'idempotent', order_row.created_from_message_id = source_message_id,
            'snapshot_count', 0,
            'order', public._order_presenter(order_row)
        );
    END IF;

    -- Aynı source message daha önce sipariş oluşturmuşsa yeni kayıt açma.
    SELECT *
    INTO order_row
    FROM public.orders
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND created_from_message_id = source_message_id
    ORDER BY id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'created', FALSE,
            'idempotent', TRUE,
            'snapshot_count', 0,
            'order', public._order_presenter(order_row)
        );
    END IF;

    INSERT INTO public.orders (
        seller_id,
        customer_id,
        customer_phone_snapshot,
        created_from_message_id,
        last_source_message_id
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        phone_snapshot,
        source_message_id,
        source_message_id
    )
    RETURNING * INTO order_row;

    -- Sipariş oluşturulduğu anda aktif mağaza-geneli alanları
    -- snapshot'a sabitle. Sonraki definition değişiklikleri bu
    -- siparişi etkilemez.
    INSERT INTO public.order_field_snapshots (
        order_id,
        source_definition_id,
        definition_version,
        field_key,
        label_snapshot,
        field_type_snapshot,
        is_required_snapshot,
        sort_order_snapshot,
        options_snapshot,
        validation_snapshot
    )
    SELECT
        order_row.id,
        df.id,
        df.version,
        df.field_key,
        df.label,
        df.field_type,
        df.is_required,
        df.sort_order,
        COALESCE(df.options, '[]'::jsonb),
        df.validation_config
    FROM public.order_field_definitions df
    WHERE df.seller_id = target_seller_id
      AND df.product_id IS NULL
      AND df.is_active = TRUE
    ORDER BY df.sort_order, df.id
    ON CONFLICT (order_id, field_key) DO NOTHING;

    GET DIAGNOSTICS snapshot_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'created', TRUE,
        'idempotent', FALSE,
        'snapshot_count', snapshot_count,
        'order', public._order_presenter(order_row)
    );

EXCEPTION
    WHEN unique_violation THEN
        -- Partial unique index ikinci açık siparişi engeller. Yarış
        -- durumunda tenant-scope açık siparişi güvenle geri döndür.
        SELECT *
        INTO order_row
        FROM public.orders
        WHERE seller_id = target_seller_id
          AND customer_id = target_customer_id
          AND status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
        ORDER BY id
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'success',
                'changed', FALSE,
                'created', FALSE,
                'idempotent', order_row.created_from_message_id = source_message_id,
                'snapshot_count', 0,
                'race_resolved', TRUE,
                'order', public._order_presenter(order_row)
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Sipariş başlatma çakışması çözülemedi.'
        );
END;
$$;

-- ------------------------------------------------------------
-- 3. update_order_core_from_message
--
-- Core sipariş mutasyonunu açık bir incoming source message ile
-- ilişkilendirir. Mevcut 014 update_order_core korunur; chat akışı
-- sonraki aşamada bu source-aware RPC'ye taşınacaktır.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_order_core_from_message(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
    source_message_id BIGINT,
    new_external_order_number TEXT DEFAULT NULL,
    new_customer_phone_snapshot TEXT DEFAULT NULL,
    new_customer_note TEXT DEFAULT NULL,
    new_image_message_id BIGINT DEFAULT NULL,
    new_custom_text TEXT DEFAULT NULL,
    clear_custom_text BOOLEAN DEFAULT FALSE,
    expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
    changed BOOLEAN := FALSE;
    completed BOOLEAN := FALSE;
BEGIN
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

    -- Chat collection yalnız COLLECTING siparişte core alan yazar.
    IF order_row.status <> 'COLLECTING' THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Sipariş artık bilgi toplama durumunda değil.',
            'order', public._order_presenter(order_row)
        );
    END IF;

    -- Aynı incoming mesajın hemen tekrar işlenmesinde ikinci version
    -- artışı veya ikinci side effect üretme.
    IF order_row.last_source_message_id = source_message_id THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'completed', FALSE,
            'idempotent', TRUE,
            'order', public._order_presenter(order_row)
        );
    END IF;

    IF new_image_message_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.messages
            WHERE id = new_image_message_id
              AND seller_id = target_seller_id
              AND customer_id = target_customer_id
              AND direction = 'incoming'
              AND message_type = 'image'
        ) THEN
            RETURN jsonb_build_object('status', 'forbidden');
        END IF;

        IF order_row.image_message_id IS DISTINCT FROM new_image_message_id THEN
            order_row.image_message_id := new_image_message_id;
            changed := TRUE;
        END IF;
    END IF;

    IF new_external_order_number IS NOT NULL
       AND order_row.external_order_number IS DISTINCT FROM new_external_order_number THEN
        order_row.external_order_number := new_external_order_number;
        changed := TRUE;
    END IF;

    IF new_customer_phone_snapshot IS NOT NULL
       AND order_row.customer_phone_snapshot IS DISTINCT FROM new_customer_phone_snapshot THEN
        order_row.customer_phone_snapshot := new_customer_phone_snapshot;
        changed := TRUE;
    END IF;

    IF new_customer_note IS NOT NULL
       AND order_row.customer_note IS DISTINCT FROM new_customer_note THEN
        order_row.customer_note := new_customer_note;
        changed := TRUE;
    END IF;

    IF new_custom_text IS NOT NULL
       AND order_row.custom_text IS DISTINCT FROM new_custom_text THEN
        order_row.custom_text := new_custom_text;
        changed := TRUE;
    ELSIF clear_custom_text AND order_row.custom_text IS NOT NULL THEN
        order_row.custom_text := NULL;
        changed := TRUE;
    END IF;

    IF changed THEN
        UPDATE public.orders
        SET
            external_order_number = order_row.external_order_number,
            customer_phone_snapshot = order_row.customer_phone_snapshot,
            customer_note = order_row.customer_note,
            image_message_id = order_row.image_message_id,
            custom_text = order_row.custom_text,
            last_source_message_id = source_message_id,
            updated_at = NOW(),
            version = version + 1
        WHERE id = order_row.id
        RETURNING * INTO order_row;
    END IF;

    SELECT public._recompute_order_completion(
        target_seller_id,
        target_customer_id,
        target_order_id,
        order_row.version
    ) INTO completed;

    SELECT *
    INTO order_row
    FROM public.orders
    WHERE id = target_order_id
      AND seller_id = target_seller_id
      AND customer_id = target_customer_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', changed,
        'completed', completed,
        'idempotent', FALSE,
        'order', public._order_presenter(order_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 4. Completion kuralını canonical ürün davranışıyla hizala
--
-- Sipariş görseli daima zorunludur. custom_text yalnız seller
-- product_info.order.custom_text_required = true ise zorunludur.
-- Tüm required dynamic snapshot alanları da tamamlanmış olmalıdır.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._recompute_order_completion(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
    expected_version BIGINT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
    seller_info JSONB;
    core_ready BOOLEAN := TRUE;
    custom_text_required BOOLEAN := FALSE;
    required_missing BIGINT := 0;
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

    IF NOT FOUND OR order_row.status = 'COMPLETE' THEN
        RETURN FALSE;
    END IF;

    IF expected_version IS NOT NULL
       AND order_row.version <> expected_version THEN
        RETURN FALSE;
    END IF;

    -- Canonical core gereksinimleri: sipariş no + görsel.
    IF order_row.external_order_number IS NULL
       OR char_length(BTRIM(order_row.external_order_number)) = 0 THEN
        core_ready := FALSE;
    END IF;

    IF order_row.image_message_id IS NULL THEN
        core_ready := FALSE;
    END IF;

    SELECT product_info
    INTO seller_info
    FROM public.sellers
    WHERE id = target_seller_id;

    custom_text_required := COALESCE(
        (seller_info -> 'order' ->> 'custom_text_required')::boolean,
        FALSE
    );

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

-- ------------------------------------------------------------
-- 5. Backend-only RPC erişimleri
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.initialize_order_collection(
    BIGINT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.initialize_order_collection(
    BIGINT, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_order_core_from_message(
    BIGINT, BIGINT, BIGINT, BIGINT,
    TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_order_core_from_message(
    BIGINT, BIGINT, BIGINT, BIGINT,
    TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BIGINT
)
TO service_role;

-- _recompute_order_completion 014'te zaten service_role ile
-- sınırlandırılmıştır; aynı imza korunmuştur.

-- ------------------------------------------------------------
-- 6. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '015',
    'finalize_order_collection_flow',
    'order_collection_flow_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
