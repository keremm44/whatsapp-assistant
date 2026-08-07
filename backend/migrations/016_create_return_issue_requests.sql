-- ============================================================
-- 016_create_return_issue_requests.sql
-- Kalıcı iade / sorun talebi domaini.
--
-- Amaç:
--   - İade ve ürün sorunu taleplerini conversation state'ten ayrı,
--     kalıcı domain kayıtları olarak saklamak.
--   - Aynı seller + customer için en fazla bir açık talep tutmak.
--   - Görsel gereksinimini talep oluşturma anında snapshot etmek.
--   - Evidence olarak yalnız güvenli incoming image message referansı tutmak.
--   - Chat mutasyonlarında idempotency / concurrency güvenliği sağlamak.
--   - Seller review geçişinde mevcut seller_notifications tablosunu
--     idempotent biçimde kullanmak.
--   - Seller'ın "handled" aksiyonunu optimistic concurrency ile yapmak.
--
-- Bu migration repository için hazırlanır; canlı Supabase'e bu aşamada
-- uygulanmaz. 013, 014 ve 015 migration dosyalarını değiştirmez.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Ana talep tablosu
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.return_issue_requests (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    customer_id BIGINT NOT NULL
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    order_id BIGINT
        REFERENCES public.orders(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    issue_type VARCHAR(48) NOT NULL,

    external_order_number_snapshot VARCHAR(100),
    product_name_snapshot VARCHAR(200),

    reason_text TEXT,

    image_requirement_snapshot VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL',

    status TEXT NOT NULL DEFAULT 'COLLECTING',

    review_reason_code VARCHAR(64),
    review_note VARCHAR(500),

    created_from_message_id BIGINT NOT NULL
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    last_source_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    review_required_at TIMESTAMPTZ,

    handled_at TIMESTAMPTZ,
    handled_by_profile_id BIGINT
        REFERENCES public.user_profiles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    seller_note VARCHAR(2000),

    CONSTRAINT return_issue_requests_issue_type_check
        CHECK (
            issue_type IN (
                'RETURN_REQUEST',
                'DAMAGED_ITEM',
                'WRONG_ITEM',
                'PRINT_OR_PERSONALIZATION_ISSUE',
                'DELIVERY_ISSUE',
                'OTHER_ORDER_ISSUE'
            )
        ),

    CONSTRAINT return_issue_requests_image_requirement_check
        CHECK (
            image_requirement_snapshot IN (
                'REQUIRED',
                'OPTIONAL',
                'NOT_REQUESTED'
            )
        ),

    CONSTRAINT return_issue_requests_status_check
        CHECK (
            status IN (
                'COLLECTING',
                'SELLER_REVIEW_REQUIRED',
                'HANDLED'
            )
        ),

    CONSTRAINT return_issue_requests_version_check
        CHECK (version > 0),

    CONSTRAINT return_issue_requests_external_order_number_length_check
        CHECK (
            external_order_number_snapshot IS NULL
            OR char_length(external_order_number_snapshot) BETWEEN 1 AND 100
        ),

    CONSTRAINT return_issue_requests_reason_length_check
        CHECK (
            reason_text IS NULL
            OR char_length(reason_text) BETWEEN 1 AND 2000
        ),

    CONSTRAINT return_issue_requests_review_reason_code_check
        CHECK (
            review_reason_code IS NULL
            OR review_reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
        ),

    CONSTRAINT return_issue_requests_lifecycle_check
        CHECK (
            (
                status = 'COLLECTING'
                AND review_required_at IS NULL
                AND handled_at IS NULL
            )
            OR
            (
                status = 'SELLER_REVIEW_REQUIRED'
                AND review_required_at IS NOT NULL
                AND handled_at IS NULL
            )
            OR
            (
                status = 'HANDLED'
                AND review_required_at IS NOT NULL
                AND handled_at IS NOT NULL
            )
        ),

    -- Evidence tablosunda seller scope'u composite FK ile bağlamak için.
    CONSTRAINT return_issue_requests_id_seller_unique
        UNIQUE (id, seller_id)
);

-- Aynı seller + customer için en fazla bir açık talep.
CREATE UNIQUE INDEX IF NOT EXISTS uq_return_issue_requests_one_open_per_customer
ON public.return_issue_requests(seller_id, customer_id)
WHERE status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED');

-- Aynı incoming mesaj ikinci kez yeni bir talep başlatamaz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_return_issue_requests_created_source
ON public.return_issue_requests(seller_id, customer_id, created_from_message_id);

CREATE INDEX IF NOT EXISTS idx_return_issue_requests_seller_status
ON public.return_issue_requests(seller_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_return_issue_requests_customer
ON public.return_issue_requests(seller_id, customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_return_issue_requests_order
ON public.return_issue_requests(seller_id, order_id)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_return_issue_requests_created_message
ON public.return_issue_requests(created_from_message_id);

-- ------------------------------------------------------------
-- 2. Görsel evidence
--
-- Binary/public URL saklanmaz. Yalnız public.messages.id referansı tutulur.
-- Mesajın incoming + aynı seller/customer + image olması RPC'de doğrulanır.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.return_issue_request_evidence (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    request_id BIGINT NOT NULL,

    message_id BIGINT NOT NULL
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT return_issue_request_evidence_request_scope_fk
        FOREIGN KEY (request_id, seller_id)
        REFERENCES public.return_issue_requests(id, seller_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT return_issue_request_evidence_request_message_unique
        UNIQUE (request_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_return_issue_request_evidence_request
ON public.return_issue_request_evidence(request_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_return_issue_request_evidence_message
ON public.return_issue_request_evidence(message_id);

-- ------------------------------------------------------------
-- 3. Seller issue-type ayarları
--
-- Kayıt yoksa uygulama varsayılanı OPTIONAL'dır.
-- Talep oluşturulurken resolved değer ana kayda snapshot edilir.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.return_issue_type_settings (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    issue_type VARCHAR(48) NOT NULL,

    image_requirement VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL',

    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT return_issue_type_settings_issue_type_check
        CHECK (
            issue_type IN (
                'RETURN_REQUEST',
                'DAMAGED_ITEM',
                'WRONG_ITEM',
                'PRINT_OR_PERSONALIZATION_ISSUE',
                'DELIVERY_ISSUE',
                'OTHER_ORDER_ISSUE'
            )
        ),

    CONSTRAINT return_issue_type_settings_image_requirement_check
        CHECK (
            image_requirement IN (
                'REQUIRED',
                'OPTIONAL',
                'NOT_REQUESTED'
            )
        ),

    CONSTRAINT return_issue_type_settings_version_check
        CHECK (version > 0),

    CONSTRAINT return_issue_type_settings_seller_type_unique
        UNIQUE (seller_id, issue_type)
);

CREATE INDEX IF NOT EXISTS idx_return_issue_type_settings_seller
ON public.return_issue_type_settings(seller_id, issue_type);

-- ------------------------------------------------------------
-- 4. Return request presenter
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._return_issue_request_presenter(
    p_request public.return_issue_requests%ROWTYPE
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
-- 5. create_or_get_return_issue_request
--
-- - incoming source message tenant scope doğrulaması
-- - seller + customer advisory lock
-- - en fazla bir açık request
-- - image requirement snapshot
-- - güvenli order link/snapshot
-- - duplicate initial message idempotency
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

    -- Önce aynı source mesaj ile daha önce oluşturulan talebi bul.
    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND created_from_message_id = source_message_id
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

    -- Aynı konuşmada açık request varsa ikinci request oluşturma.
    SELECT *
    INTO request_row
    FROM public.return_issue_requests
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
        -- Partial unique/source unique yarışında güvenli mevcut kaydı döndür.
        SELECT *
        INTO request_row
        FROM public.return_issue_requests
        WHERE seller_id = target_seller_id
          AND customer_id = target_customer_id
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
-- 6. update_return_issue_request_from_message
--
-- Chat tarafından toplanan sipariş numarası / reason / güvenli order linki.
-- Request COLLECTING değilse mutation yapılmaz.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_return_issue_request_from_message(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_request_id BIGINT,
    source_message_id BIGINT,
    new_external_order_number TEXT DEFAULT NULL,
    new_reason_text TEXT DEFAULT NULL,
    target_order_id BIGINT DEFAULT NULL,
    expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    request_row public.return_issue_requests%ROWTYPE;
    order_row public.orders%ROWTYPE;
    normalized_external_order_number TEXT;
    normalized_reason TEXT;
    desired_order_id BIGINT;
    desired_external_order_number TEXT;
    desired_product_name TEXT;
    desired_reason TEXT;
    changed BOOLEAN := FALSE;
BEGIN
    normalized_external_order_number := NULLIF(BTRIM(new_external_order_number), '');
    normalized_reason := NULLIF(BTRIM(new_reason_text), '');

    IF normalized_external_order_number IS NOT NULL
       AND char_length(normalized_external_order_number) > 100 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Sipariş numarası çok uzun.'
        );
    END IF;

    IF normalized_reason IS NOT NULL
       AND char_length(normalized_reason) > 2000 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Sorun açıklaması çok uzun.'
        );
    END IF;

    IF normalized_external_order_number IS NULL
       AND normalized_reason IS NULL
       AND target_order_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Güncellenecek talep bilgisi yok.'
        );
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('return_issue:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE id = target_request_id
      AND seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF expected_version IS NOT NULL
       AND request_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'İade/sorun talebi başka bir işlemle değişti.',
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF request_row.status <> 'COLLECTING' THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'İade/sorun talebi artık bilgi toplama durumunda değil.',
            'request', public._return_issue_request_presenter(request_row)
        );
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

    desired_order_id := request_row.order_id;
    desired_external_order_number := request_row.external_order_number_snapshot;
    desired_product_name := request_row.product_name_snapshot;
    desired_reason := request_row.reason_text;

    IF target_order_id IS NOT NULL THEN
        IF request_row.order_id IS NOT NULL
           AND request_row.order_id <> target_order_id THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'message', 'Talep farklı bir siparişe zaten bağlı.',
                'request', public._return_issue_request_presenter(request_row)
            );
        END IF;

        SELECT *
        INTO order_row
        FROM public.orders
        WHERE id = target_order_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'forbidden');
        END IF;

        desired_order_id := order_row.id;
        desired_external_order_number := COALESCE(
            NULLIF(BTRIM(order_row.external_order_number), ''),
            normalized_external_order_number,
            request_row.external_order_number_snapshot
        );
        desired_product_name := order_row.product_name_snapshot;
    ELSIF request_row.order_id IS NULL
          AND normalized_external_order_number IS NOT NULL THEN
        desired_external_order_number := normalized_external_order_number;
    END IF;

    IF normalized_reason IS NOT NULL THEN
        desired_reason := normalized_reason;
    END IF;

    changed :=
        desired_order_id IS DISTINCT FROM request_row.order_id
        OR desired_external_order_number IS DISTINCT FROM request_row.external_order_number_snapshot
        OR desired_product_name IS DISTINCT FROM request_row.product_name_snapshot
        OR desired_reason IS DISTINCT FROM request_row.reason_text;

    IF NOT changed THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'idempotent', request_row.last_source_message_id = source_message_id,
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    UPDATE public.return_issue_requests
    SET
        order_id = desired_order_id,
        external_order_number_snapshot = desired_external_order_number,
        product_name_snapshot = desired_product_name,
        reason_text = desired_reason,
        last_source_message_id = source_message_id,
        updated_at = NOW(),
        version = version + 1
    WHERE id = target_request_id
    RETURNING * INTO request_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'idempotent', FALSE,
        'request', public._return_issue_request_presenter(request_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 7. add_return_issue_request_evidence
--
-- Yalnız incoming image message aynı tenant/customer kapsamındaysa eklenir.
-- Duplicate aynı request+message ikinci evidence/version üretmez.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_return_issue_request_evidence(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_request_id BIGINT,
    source_message_id BIGINT,
    expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    request_row public.return_issue_requests%ROWTYPE;
    evidence_row public.return_issue_request_evidence%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtext('return_issue:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE id = target_request_id
      AND seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    -- Duplicate evidence, stale version olsa bile ikinci yan etki üretmeden
    -- mevcut sonucu döndürebilsin.
    SELECT *
    INTO evidence_row
    FROM public.return_issue_request_evidence
    WHERE request_id = target_request_id
      AND seller_id = target_seller_id
      AND message_id = source_message_id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'idempotent', TRUE,
            'evidence', to_jsonb(evidence_row),
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF expected_version IS NOT NULL
       AND request_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'İade/sorun talebi başka bir işlemle değişti.',
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF request_row.status <> 'COLLECTING' THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'İade/sorun talebi artık evidence kabul etmiyor.',
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.messages
        WHERE id = source_message_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id
          AND direction = 'incoming'
          AND message_type = 'image'
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    INSERT INTO public.return_issue_request_evidence (
        seller_id,
        request_id,
        message_id
    )
    VALUES (
        target_seller_id,
        target_request_id,
        source_message_id
    )
    RETURNING * INTO evidence_row;

    UPDATE public.return_issue_requests
    SET
        last_source_message_id = source_message_id,
        updated_at = NOW(),
        version = version + 1
    WHERE id = target_request_id
    RETURNING * INTO request_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'idempotent', FALSE,
        'evidence', to_jsonb(evidence_row),
        'request', public._return_issue_request_presenter(request_row)
    );

EXCEPTION
    WHEN unique_violation THEN
        SELECT *
        INTO evidence_row
        FROM public.return_issue_request_evidence
        WHERE request_id = target_request_id
          AND seller_id = target_seller_id
          AND message_id = source_message_id
        LIMIT 1;

        SELECT *
        INTO request_row
        FROM public.return_issue_requests
        WHERE id = target_request_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id;

        IF evidence_row.id IS NOT NULL AND request_row.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'status', 'success',
                'changed', FALSE,
                'idempotent', TRUE,
                'race_resolved', TRUE,
                'evidence', to_jsonb(evidence_row),
                'request', public._return_issue_request_presenter(request_row)
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Evidence eşzamanlı işlem nedeniyle kaydedilemedi.'
        );
END;
$$;

-- ------------------------------------------------------------
-- 8. Seller-review geçişi + idempotent seller notification
--
-- Normal geçişte minimum bilgiler DB seviyesinde de kontrol edilir:
--   - order_id veya external order number
--   - reason
--   - image REQUIRED ise evidence
-- force_review=TRUE acil/yüksek riskli akış içindir.
-- ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_notifications_return_issue_review
ON public.seller_notifications(
    seller_id,
    type,
    related_entity_type,
    related_entity_id
)
WHERE type = 'return_request'
  AND related_entity_type = 'return_issue_request'
  AND related_entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_return_issue_review_required(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_request_id BIGINT,
    force_review BOOLEAN DEFAULT FALSE,
    review_code TEXT DEFAULT NULL,
    review_note_text TEXT DEFAULT NULL,
    expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    request_row public.return_issue_requests%ROWTYPE;
    evidence_count BIGINT := 0;
    notification_count INTEGER := 0;
    normalized_review_code TEXT;
    normalized_review_note TEXT;
BEGIN
    normalized_review_code := NULLIF(BTRIM(review_code), '');
    normalized_review_note := NULLIF(BTRIM(review_note_text), '');

    IF normalized_review_code IS NOT NULL
       AND normalized_review_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz review reason code.'
        );
    END IF;

    IF normalized_review_note IS NOT NULL
       AND char_length(normalized_review_note) > 500 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Review notu çok uzun.'
        );
    END IF;

    IF force_review AND normalized_review_code IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Zorunlu review geçişinde reason code gereklidir.'
        );
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('return_issue:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE id = target_request_id
      AND seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF request_row.status = 'SELLER_REVIEW_REQUIRED' THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'idempotent', TRUE,
            'notification_created', FALSE,
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF request_row.status = 'HANDLED' THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Handled talep tekrar review durumuna alınamaz.',
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF expected_version IS NOT NULL
       AND request_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'İade/sorun talebi başka bir işlemle değişti.',
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF NOT force_review THEN
        IF request_row.order_id IS NULL
           AND (
               request_row.external_order_number_snapshot IS NULL
               OR char_length(BTRIM(request_row.external_order_number_snapshot)) = 0
           ) THEN
            RETURN jsonb_build_object(
                'status', 'not_ready',
                'message', 'Sipariş bilgisi eksik.',
                'request', public._return_issue_request_presenter(request_row)
            );
        END IF;

        IF request_row.reason_text IS NULL
           OR char_length(BTRIM(request_row.reason_text)) = 0 THEN
            RETURN jsonb_build_object(
                'status', 'not_ready',
                'message', 'Sorun açıklaması eksik.',
                'request', public._return_issue_request_presenter(request_row)
            );
        END IF;

        IF request_row.image_requirement_snapshot = 'REQUIRED' THEN
            SELECT COUNT(*)
            INTO evidence_count
            FROM public.return_issue_request_evidence
            WHERE request_id = target_request_id
              AND seller_id = target_seller_id;

            IF evidence_count = 0 THEN
                RETURN jsonb_build_object(
                    'status', 'not_ready',
                    'message', 'Zorunlu görsel evidence eksik.',
                    'request', public._return_issue_request_presenter(request_row)
                );
            END IF;
        END IF;
    END IF;

    UPDATE public.return_issue_requests
    SET
        status = 'SELLER_REVIEW_REQUIRED',
        review_reason_code = normalized_review_code,
        review_note = normalized_review_note,
        review_required_at = COALESCE(review_required_at, NOW()),
        updated_at = NOW(),
        version = version + 1
    WHERE id = target_request_id
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
        CASE WHEN force_review THEN 'urgent' ELSE 'warning' END,
        'İade / sorun talebi inceleme bekliyor',
        'Müşteri talebi satıcı incelemesine hazır.',
        'return_issue_request',
        target_request_id
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS notification_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'idempotent', FALSE,
        'notification_created', notification_count = 1,
        'request', public._return_issue_request_presenter(request_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 9. Seller "mark_handled"
--
-- Ticari karar değildir. Conversation control'e dokunmaz.
-- Actor profile seller/auth scope'u DB seviyesinde doğrulanır.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_return_issue_handled(
    target_seller_id BIGINT,
    target_request_id BIGINT,
    actor_profile_id BIGINT,
    expected_version BIGINT,
    seller_note_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    request_row public.return_issue_requests%ROWTYPE;
    normalized_note TEXT;
BEGIN
    normalized_note := NULLIF(BTRIM(seller_note_text), '');

    IF expected_version IS NULL OR expected_version <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'expected_version pozitif olmalıdır.'
        );
    END IF;

    IF normalized_note IS NOT NULL
       AND char_length(normalized_note) > 2000 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Seller notu çok uzun.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = actor_profile_id
          AND seller_id = target_seller_id
          AND role = 'seller'
          AND status = 'active'
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    SELECT *
    INTO request_row
    FROM public.return_issue_requests
    WHERE id = target_request_id
      AND seller_id = target_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF request_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'İade/sorun talebi başka bir işlemle değişti.',
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF request_row.status = 'HANDLED' THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'idempotent', TRUE,
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    IF request_row.status <> 'SELLER_REVIEW_REQUIRED' THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Yalnız seller review bekleyen talep handled yapılabilir.',
            'request', public._return_issue_request_presenter(request_row)
        );
    END IF;

    UPDATE public.return_issue_requests
    SET
        status = 'HANDLED',
        handled_at = NOW(),
        handled_by_profile_id = actor_profile_id,
        seller_note = normalized_note,
        updated_at = NOW(),
        version = version + 1
    WHERE id = target_request_id
    RETURNING * INTO request_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'idempotent', FALSE,
        'request', public._return_issue_request_presenter(request_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 10. Seller issue-type setting optimistic update
--
-- Kayıt yoksa virtual canonical default:
--   image_requirement=OPTIONAL, version=1
-- PATCH bu virtual version üzerinden yapılır.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_return_issue_type_setting(
    target_seller_id BIGINT,
    target_issue_type TEXT,
    new_image_requirement TEXT,
    expected_version BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    setting_row public.return_issue_type_settings%ROWTYPE;
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

    IF new_image_requirement NOT IN ('REQUIRED', 'OPTIONAL', 'NOT_REQUESTED') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz image requirement.'
        );
    END IF;

    IF expected_version IS NULL OR expected_version <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'expected_version pozitif olmalıdır.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.sellers
        WHERE id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('return_issue_setting:' || target_seller_id || ':' || target_issue_type)
    );

    SELECT *
    INTO setting_row
    FROM public.return_issue_type_settings
    WHERE seller_id = target_seller_id
      AND issue_type = target_issue_type
    FOR UPDATE;

    IF NOT FOUND THEN
        IF expected_version <> 1 THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'message', 'İade/sorun ayarı başka bir işlemle değişti.',
                'current_version', 1,
                'setting', jsonb_build_object(
                    'seller_id', target_seller_id,
                    'issue_type', target_issue_type,
                    'image_requirement', 'OPTIONAL',
                    'version', 1
                )
            );
        END IF;

        IF new_image_requirement = 'OPTIONAL' THEN
            RETURN jsonb_build_object(
                'status', 'success',
                'changed', FALSE,
                'setting', jsonb_build_object(
                    'seller_id', target_seller_id,
                    'issue_type', target_issue_type,
                    'image_requirement', 'OPTIONAL',
                    'version', 1,
                    'updated_at', NULL
                )
            );
        END IF;

        INSERT INTO public.return_issue_type_settings (
            seller_id,
            issue_type,
            image_requirement,
            version
        )
        VALUES (
            target_seller_id,
            target_issue_type,
            new_image_requirement,
            2
        )
        RETURNING * INTO setting_row;

        RETURN jsonb_build_object(
            'status', 'success',
            'changed', TRUE,
            'setting', to_jsonb(setting_row)
        );
    END IF;

    IF setting_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'İade/sorun ayarı başka bir işlemle değişti.',
            'current_version', setting_row.version,
            'setting', to_jsonb(setting_row)
        );
    END IF;

    IF setting_row.image_requirement = new_image_requirement THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'setting', to_jsonb(setting_row)
        );
    END IF;

    UPDATE public.return_issue_type_settings
    SET
        image_requirement = new_image_requirement,
        version = version + 1,
        updated_at = NOW()
    WHERE id = setting_row.id
    RETURNING * INTO setting_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'setting', to_jsonb(setting_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 11. Backend-only erişim modeli
-- ------------------------------------------------------------

ALTER TABLE public.return_issue_requests
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.return_issue_request_evidence
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.return_issue_type_settings
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.return_issue_requests
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.return_issue_request_evidence
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.return_issue_type_settings
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE public.return_issue_requests_id_seq
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.return_issue_request_evidence_id_seq
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.return_issue_type_settings_id_seq
FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.return_issue_requests
TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.return_issue_request_evidence
TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.return_issue_type_settings
TO service_role;

GRANT ALL PRIVILEGES ON SEQUENCE public.return_issue_requests_id_seq
TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.return_issue_request_evidence_id_seq
TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.return_issue_type_settings_id_seq
TO service_role;

REVOKE EXECUTE ON FUNCTION public._return_issue_request_presenter(
    public.return_issue_requests
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._return_issue_request_presenter(
    public.return_issue_requests
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_or_get_return_issue_request(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, TEXT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_get_return_issue_request(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, TEXT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_return_issue_request_from_message(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_return_issue_request_from_message(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_return_issue_request_evidence(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_return_issue_request_evidence(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_return_issue_review_required(
    BIGINT, BIGINT, BIGINT, BOOLEAN, TEXT, TEXT, BIGINT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_return_issue_review_required(
    BIGINT, BIGINT, BIGINT, BOOLEAN, TEXT, TEXT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_return_issue_handled(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_return_issue_handled(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_return_issue_type_setting(
    BIGINT, TEXT, TEXT, BIGINT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_return_issue_type_setting(
    BIGINT, TEXT, TEXT, BIGINT
)
TO service_role;

-- ------------------------------------------------------------
-- 12. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '016',
    'create_return_issue_requests',
    'return_issue_requests_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
