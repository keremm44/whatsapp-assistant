-- ============================================================
-- 012_onboarding_validation_and_mapping.sql
-- Onboarding verisini gerçek tablolara atomik uygulama
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. step_data her zaman JSON object olmalıdır.
-- ------------------------------------------------------------

UPDATE public.seller_onboarding_steps
SET step_data = '{}'::JSONB
WHERE step_data IS NULL
   OR jsonb_typeof(step_data) <> 'object';

ALTER TABLE public.seller_onboarding_steps
    DROP CONSTRAINT IF EXISTS chk_onboarding_step_data_object;

ALTER TABLE public.seller_onboarding_steps
    ADD CONSTRAINT chk_onboarding_step_data_object
    CHECK (jsonb_typeof(step_data) = 'object');


-- ------------------------------------------------------------
-- 2. Onboarding başlatmayı idempotent hale getir.
--
-- - Hiç adım yoksa 10 adımı oluşturur.
-- - 10 adım zaten varsa ilerlemeyi sıfırlamaz.
-- - Kısmi/bozuk adım setinde açık hata verir.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initialize_seller_onboarding(
    target_seller_id BIGINT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    existing_step_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.sellers
        WHERE id = target_seller_id
    ) THEN
        RAISE EXCEPTION 'Onboarding başlatılacak satıcı bulunamadı.';
    END IF;

    SELECT COUNT(*)
    INTO existing_step_count
    FROM public.seller_onboarding_steps
    WHERE seller_id = target_seller_id;

    IF existing_step_count = 10 THEN
        RETURN;
    END IF;

    IF existing_step_count <> 0 THEN
        RAISE EXCEPTION
            'Satıcının onboarding adım seti eksik veya tutarsızdır. Mevcut adım sayısı: %',
            existing_step_count;
    END IF;

    INSERT INTO public.seller_onboarding_steps (
        seller_id,
        step_order,
        step_key,
        status
    )
    VALUES
        (target_seller_id, 1,  'business_info',       'available'),
        (target_seller_id, 2,  'store_info',          'locked'),
        (target_seller_id, 3,  'product_info',        'locked'),
        (target_seller_id, 4,  'shipping_info',       'locked'),
        (target_seller_id, 5,  'return_policy',       'locked'),
        (target_seller_id, 6,  'rules_and_templates', 'locked'),
        (target_seller_id, 7,  'test_chat',           'locked'),
        (target_seller_id, 8,  'whatsapp_connection', 'locked'),
        (target_seller_id, 9,  'live_test',           'locked'),
        (target_seller_id, 10, 'activation',          'locked');

    UPDATE public.sellers
    SET
        onboarding_status = 'in_progress',
        current_onboarding_step = 1,
        onboarding_completed = FALSE,
        onboarding_completed_at = NULL,
        system_status = 'onboarding',
        ai_enabled = FALSE
    WHERE id = target_seller_id;
END;
$$;


-- ------------------------------------------------------------
-- 3. Doğrulanmış onboarding adımını tek transaction içinde uygula.
--
-- Python katmanı payload tiplerini ve alan kurallarını doğrular.
-- Bu RPC ise tenant/sıra kilidini, tablo güncellemelerini ve adım
-- geçişini atomik olarak gerçekleştirir.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_seller_onboarding_step(
    target_seller_id BIGINT,
    completed_step_order INTEGER,
    normalized_step_data JSONB,
    seller_patch JSONB,
    product_info_patch JSONB,
    rules_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    seller_row public.sellers%ROWTYPE;
    step_row public.seller_onboarding_steps%ROWTYPE;
BEGIN
    IF completed_step_order < 1 OR completed_step_order > 10 THEN
        RAISE EXCEPTION 'Geçersiz onboarding adım numarası.';
    END IF;

    IF normalized_step_data IS NULL
       OR jsonb_typeof(normalized_step_data) <> 'object' THEN
        RAISE EXCEPTION 'Doğrulanmış onboarding verisi JSON object olmalıdır.';
    END IF;

    IF seller_patch IS NULL OR jsonb_typeof(seller_patch) <> 'object' THEN
        RAISE EXCEPTION 'seller_patch JSON object olmalıdır.';
    END IF;

    IF product_info_patch IS NULL
       OR jsonb_typeof(product_info_patch) <> 'object' THEN
        RAISE EXCEPTION 'product_info_patch JSON object olmalıdır.';
    END IF;

    SELECT *
    INTO seller_row
    FROM public.sellers
    WHERE id = target_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Satıcı bulunamadı.';
    END IF;

    IF seller_row.onboarding_completed THEN
        RAISE EXCEPTION 'Tamamlanmış onboarding yeniden ilerletilemez.';
    END IF;

    IF seller_row.current_onboarding_step <> completed_step_order THEN
        RAISE EXCEPTION
            'Şu anda yalnızca %. onboarding adımı tamamlanabilir.',
            seller_row.current_onboarding_step;
    END IF;

    SELECT *
    INTO step_row
    FROM public.seller_onboarding_steps
    WHERE seller_id = target_seller_id
      AND step_order = completed_step_order
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Onboarding adımı bulunamadı.';
    END IF;

    IF step_row.status = 'locked' THEN
        RAISE EXCEPTION 'Kilitli onboarding adımı tamamlanamaz.';
    END IF;

    IF step_row.status = 'completed' THEN
        RAISE EXCEPTION 'Onboarding adımı zaten tamamlanmış.';
    END IF;

    -- Yalnızca izin verilen sellers kolonları uygulanır.
    UPDATE public.sellers
    SET
        name = CASE
            WHEN seller_patch ? 'name'
                THEN seller_patch ->> 'name'
            ELSE name
        END,
        email = CASE
            WHEN seller_patch ? 'email'
                THEN LOWER(seller_patch ->> 'email')
            ELSE email
        END,
        phone = CASE
            WHEN seller_patch ? 'phone'
                THEN seller_patch ->> 'phone'
            ELSE phone
        END,
        store_name = CASE
            WHEN seller_patch ? 'store_name'
                THEN seller_patch ->> 'store_name'
            ELSE store_name
        END,
        store_link = CASE
            WHEN seller_patch ? 'store_link'
                THEN seller_patch ->> 'store_link'
            ELSE store_link
        END,
        product_info = COALESCE(product_info, '{}'::JSONB)
            || product_info_patch
    WHERE id = target_seller_id;

    -- 6. adımda gönderilen liste satıcının onboarding kural setidir.
    -- İşlem transaction içinde olduğundan silme/ekleme yarım kalmaz.
    IF completed_step_order = 6 THEN
        IF rules_payload IS NULL
           OR jsonb_typeof(rules_payload) <> 'array' THEN
            RAISE EXCEPTION '6. adım için rules_payload JSON array olmalıdır.';
        END IF;

        DELETE FROM public.rules
        WHERE seller_id = target_seller_id;

        INSERT INTO public.rules (
            seller_id,
            trigger_text,
            response_text,
            category,
            is_active,
            hit_count
        )
        SELECT
            target_seller_id,
            rule_item.value ->> 'trigger_text',
            rule_item.value ->> 'response_text',
            COALESCE(NULLIF(rule_item.value ->> 'category', ''), 'custom'),
            COALESCE((rule_item.value ->> 'is_active')::BOOLEAN, TRUE),
            0
        FROM jsonb_array_elements(rules_payload) AS rule_item(value);
    END IF;

    UPDATE public.seller_onboarding_steps
    SET
        step_data = normalized_step_data,
        status = 'completed',
        started_at = COALESCE(started_at, NOW()),
        completed_at = COALESCE(completed_at, NOW())
    WHERE id = step_row.id;

    IF completed_step_order < 10 THEN
        UPDATE public.seller_onboarding_steps
        SET status = 'available'
        WHERE seller_id = target_seller_id
          AND step_order = completed_step_order + 1
          AND status = 'locked';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sıradaki onboarding adımı açılamadı.';
        END IF;

        UPDATE public.sellers
        SET
            onboarding_status = 'in_progress',
            current_onboarding_step = completed_step_order + 1,
            ai_enabled = FALSE
        WHERE id = target_seller_id;
    ELSE
        UPDATE public.sellers
        SET
            onboarding_status = 'completed',
            current_onboarding_step = 10,
            onboarding_completed = TRUE,
            onboarding_completed_at = NOW(),
            system_status = CASE
                WHEN activation_requires_admin
                    THEN 'admin_review_pending'
                ELSE 'automatic_validation'
            END,
            ai_enabled = FALSE
        WHERE id = target_seller_id;
    END IF;

    RETURN jsonb_build_object(
        'seller_id', target_seller_id,
        'completed_step_order', completed_step_order,
        'completed', TRUE
    );
END;
$$;


-- ------------------------------------------------------------
-- 4. RPC yalnızca backend service role tarafından çağrılabilir.
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.initialize_seller_onboarding(BIGINT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.initialize_seller_onboarding(BIGINT)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_seller_onboarding_step(
    BIGINT,
    INTEGER,
    JSONB,
    JSONB,
    JSONB,
    JSONB
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_seller_onboarding_step(
    BIGINT,
    INTEGER,
    JSONB,
    JSONB,
    JSONB,
    JSONB
)
TO service_role;


-- ------------------------------------------------------------
-- 5. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '012',
    'onboarding_validation_and_mapping',
    'onboarding_v1_atomic',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
