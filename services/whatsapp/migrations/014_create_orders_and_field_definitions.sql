-- ============================================================
-- 014_create_orders_and_field_definitions.sql
-- Kalıcı sipariş bilgi toplama domaini ve dinamik alan sistemi
--
-- Amaç:
--   - Sipariş bilgileri artık state_data içinde değil ayrı kalıcı
--     tablolarda tutulur.
--   - Satıcı, mağaza geneli veya ürün bazlı dinamik kişiselleştirme
--     alanları tanımlayabilir.
--   - Sipariş, oluşturulduğu andaki aktif alan tanımlarını snapshot
--     olarak saklar; sonraki tanım değişiklikleri eski siparişi
--     etkilemez.
--   - Tek aktif sipariş kuralı, yarış güvenliği ve idempotency
--     PostgreSQL tarafında atomik RPC'lerle sağlanır.
--
-- Bu migration yalnızca migration dosyasıdır; doğrudan uygulanmaz.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Ürün kataloğu (minimal)
--
-- Mevcut sistemde ürün bilgileri sellers.product_info JSONB
-- içinde tutulur. Ürün bazlı dinamik alanlar ve sipariş ürün
-- referansı için tenant-güvenli minimal bir ürün kataloğu
-- gerekir. Bu görev ürün CRUD endpointi üretmez; katalog
-- ileride satıcı/admin akışıyla doldurulur.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.products (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL
        CHECK (char_length(name) BETWEEN 2 AND 200),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT products_seller_fk_exists
        CHECK (true)
);

ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_seller_check;

CREATE INDEX IF NOT EXISTS idx_products_seller_active
ON public.products(seller_id, is_active)
WHERE is_active = TRUE;

-- ------------------------------------------------------------
-- 1. Kalıcı sipariş tablosu
--
-- status: COLLECTING / COMPLETE / SELLER_REVIEW_REQUIRED
--
-- Tek aktif bilgi toplama siparişi: seller_id + customer_id
-- üzerinde COLLECTING veya SELLER_REVIEW_REQUIRED durumunda olan
-- en fazla bir sipariş bulunabilir (partial unique index).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    customer_id BIGINT NOT NULL
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    product_id BIGINT
        REFERENCES public.products(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    product_name_snapshot VARCHAR(200),
    external_order_number VARCHAR(100),
    customer_phone_snapshot VARCHAR(32),
    customer_note VARCHAR(2000),

    image_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    custom_text VARCHAR(1000),

    status TEXT NOT NULL DEFAULT 'COLLECTING',
    review_reason_code VARCHAR(64),
    review_reason_note VARCHAR(500),

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
    completed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,

    CONSTRAINT orders_status_check
        CHECK (
            status IN (
                'COLLECTING',
                'COMPLETE',
                'SELLER_REVIEW_REQUIRED'
            )
        ),

    CONSTRAINT orders_version_check
        CHECK (version > 0),

    CONSTRAINT orders_review_reason_code_check
        CHECK (
            review_reason_code IS NULL OR
            review_reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
        ),

    CONSTRAINT orders_external_order_number_length_check
        CHECK (
            external_order_number IS NULL OR
            char_length(external_order_number) BETWEEN 1 AND 100
        ),

    CONSTRAINT orders_custom_text_length_check
        CHECK (
            custom_text IS NULL OR
            char_length(custom_text) <= 1000
        )
);

-- Migration boyunca legacy/new order INSERT yarışını kapat. Apply maintenance
-- penceresinde yapılacak olsa da DB seviyesinde de preflight sonucu sabitlenir.
LOCK TABLE public.orders IN ACCESS EXCLUSIVE MODE;

-- ------------------------------------------------------------
-- 1A. 000-012 legacy orders tablosunu upgrade-safe reconcile et
--
-- Canlı 000-012 şemada orders zaten vardır ve şu legacy alanları
-- taşır: order_number, image_url, image_status, notes, confirmed_at.
-- CREATE TABLE IF NOT EXISTS mevcut tabloya canonical kolonları
-- eklemediği için bu bölüm bilinçli olarak ALTER TABLE kullanır.
--
-- Güvenlik politikası:
--   - Legacy orders tablosunda veri varsa tahmini dönüşüm YAPMA.
--   - Mevcut production preflight'ta legacy orders satır sayısı 0'dır.
--   - Apply anına kadar legacy kayıt oluşursa migration fail-fast olur.
--   - DROP TABLE / veri silme yoktur; legacy kolonlar şimdilik korunur.
-- ------------------------------------------------------------

DO $$
DECLARE
    has_legacy_order_number BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'order_number'
    )
    INTO has_legacy_order_number;

    IF has_legacy_order_number
       AND EXISTS (SELECT 1 FROM public.orders LIMIT 1) THEN
        RAISE EXCEPTION USING
            MESSAGE = '014 legacy orders reconciliation requires an empty legacy orders table; migration aborted without data conversion.';
    END IF;
END;
$$;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS product_name_snapshot VARCHAR(200),
    ADD COLUMN IF NOT EXISTS external_order_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_phone_snapshot VARCHAR(32),
    ADD COLUMN IF NOT EXISTS customer_note VARCHAR(2000),
    ADD COLUMN IF NOT EXISTS image_message_id BIGINT,
    ADD COLUMN IF NOT EXISTS review_reason_code VARCHAR(64),
    ADD COLUMN IF NOT EXISTS review_reason_note VARCHAR(500),
    ADD COLUMN IF NOT EXISTS created_from_message_id BIGINT,
    ADD COLUMN IF NOT EXISTS last_source_message_id BIGINT,
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Legacy kolonlar varsa veriyi kaybetmeden canonical alanlara taşı.
-- Production preflight'ta tablo boş olduğu için bu UPDATE'ler no-op'tur,
-- fakat aynı migration fresh/legacy development ortamlarında da güvenlidir.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'order_number'
    ) THEN
        UPDATE public.orders
        SET external_order_number = COALESCE(
            external_order_number,
            NULLIF(BTRIM(order_number), '')
        )
        WHERE external_order_number IS NULL;

        -- Yeni akış order numarasını ilk INSERT'te henüz bilmez.
        ALTER TABLE public.orders
            ALTER COLUMN order_number DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'notes'
    ) THEN
        UPDATE public.orders
        SET customer_note = COALESCE(
            customer_note,
            NULLIF(BTRIM(notes), '')
        )
        WHERE customer_note IS NULL;
    END IF;
END;
$$;

ALTER TABLE public.orders
    ALTER COLUMN status SET DEFAULT 'COLLECTING',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN version SET DEFAULT 1,
    ALTER COLUMN version SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN created_from_message_id SET NOT NULL;

-- Existing 000-012 FK davranışını canonical cascade/restrict modeline getir.
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_seller_id_fkey,
    DROP CONSTRAINT IF EXISTS orders_customer_id_fkey,
    DROP CONSTRAINT IF EXISTS orders_product_id_fkey,
    DROP CONSTRAINT IF EXISTS orders_image_message_id_fkey,
    DROP CONSTRAINT IF EXISTS orders_created_from_message_id_fkey,
    DROP CONSTRAINT IF EXISTS orders_last_source_message_id_fkey;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_seller_id_fkey
        FOREIGN KEY (seller_id)
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    ADD CONSTRAINT orders_customer_id_fkey
        FOREIGN KEY (customer_id)
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    ADD CONSTRAINT orders_product_id_fkey
        FOREIGN KEY (product_id)
        REFERENCES public.products(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    ADD CONSTRAINT orders_image_message_id_fkey
        FOREIGN KEY (image_message_id)
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    ADD CONSTRAINT orders_created_from_message_id_fkey
        FOREIGN KEY (created_from_message_id)
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    ADD CONSTRAINT orders_last_source_message_id_fkey
        FOREIGN KEY (last_source_message_id)
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;

ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_status_check,
    DROP CONSTRAINT IF EXISTS orders_version_check,
    DROP CONSTRAINT IF EXISTS orders_review_reason_code_check,
    DROP CONSTRAINT IF EXISTS orders_external_order_number_length_check,
    DROP CONSTRAINT IF EXISTS orders_custom_text_length_check;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_check
        CHECK (
            status IN (
                'COLLECTING',
                'COMPLETE',
                'SELLER_REVIEW_REQUIRED'
            )
        ),
    ADD CONSTRAINT orders_version_check
        CHECK (version > 0),
    ADD CONSTRAINT orders_review_reason_code_check
        CHECK (
            review_reason_code IS NULL OR
            review_reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
        ),
    ADD CONSTRAINT orders_external_order_number_length_check
        CHECK (
            external_order_number IS NULL OR
            char_length(external_order_number) BETWEEN 1 AND 100
        ),
    ADD CONSTRAINT orders_custom_text_length_check
        CHECK (
            custom_text IS NULL OR
            char_length(custom_text) <= 1000
        );

-- Tek aktif bilgi toplama siparişi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_one_active_per_conversation
ON public.orders(seller_id, customer_id)
WHERE status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED');

CREATE INDEX IF NOT EXISTS idx_orders_seller_status
ON public.orders(seller_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer
ON public.orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_from_message
ON public.orders(created_from_message_id);

CREATE INDEX IF NOT EXISTS idx_orders_external_number_lookup
ON public.orders(seller_id, external_order_number)
WHERE external_order_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_product
ON public.orders(product_id)
WHERE product_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Dinamik alan tanımları
--
-- product_id NULL -> mağaza geneli alan.
-- is_active FALSE -> yeni siparişlere eklenmez (hard delete yok).
-- field_key seller kapsamında aktifken benzersizdir.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_field_definitions (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    product_id BIGINT
        REFERENCES public.products(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    field_key VARCHAR(64) NOT NULL
        CHECK (field_key ~ '^[a-z][a-z0-9_]{0,63}$'),

    label VARCHAR(120) NOT NULL,

    field_type VARCHAR(20) NOT NULL,

    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- single_choice / multi_choice için:
    -- [ {"value": "...", "label": "..."} ]
    options JSONB,

    -- short_text & long_text: {"max_length": N}
    -- number: {"min": N, "max": N}
    -- multi_choice: {"max_selections": N}
    validation_config JSONB NOT NULL DEFAULT '{}'::jsonb,

    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT order_field_definitions_type_check
        CHECK (
            field_type IN (
                'short_text',
                'long_text',
                'number',
                'single_choice',
                'multi_choice',
                'boolean',
                'image'
            )
        ),

    CONSTRAINT order_field_definitions_version_check
        CHECK (version > 0),

    CONSTRAINT order_field_definitions_sort_order_check
        CHECK (sort_order >= 0)
);

-- Aktif alanlarda field_key seller kapsamında benzersiz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_field_definitions_active_key
ON public.order_field_definitions(seller_id, field_key)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_order_field_definitions_effective
ON public.order_field_definitions(seller_id, product_id, sort_order, id)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_order_field_definitions_seller_active
ON public.order_field_definitions(seller_id, sort_order, id)
WHERE is_active = TRUE AND product_id IS NULL;

-- ------------------------------------------------------------
-- 3. Sipariş alan snapshot'ları
--
-- Oluşturulduktan sonra immutable kalır.
-- (id, order_id) composite unique, order_field_values'ta başka
-- siparişe ait snapshot'a değer yazılmasını DB seviyesinde önler.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_field_snapshots (
    id BIGSERIAL PRIMARY KEY,

    order_id BIGINT NOT NULL
        REFERENCES public.orders(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    source_definition_id BIGINT
        REFERENCES public.order_field_definitions(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    definition_version BIGINT NOT NULL,

    field_key VARCHAR(64) NOT NULL,

    label_snapshot VARCHAR(120) NOT NULL,

    field_type_snapshot VARCHAR(20) NOT NULL,

    is_required_snapshot BOOLEAN NOT NULL,

    sort_order_snapshot INTEGER NOT NULL,

    options_snapshot JSONB,

    validation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT order_field_snapshots_version_check
        CHECK (definition_version > 0),

    CONSTRAINT order_field_snapshots_type_check
        CHECK (
            field_type_snapshot IN (
                'short_text',
                'long_text',
                'number',
                'single_choice',
                'multi_choice',
                'boolean',
                'image'
            )
        ),

    CONSTRAINT order_field_snapshots_order_key_unique
        UNIQUE (order_id, field_key),

    CONSTRAINT order_field_snapshots_order_identity_unique
        UNIQUE (id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_field_snapshots_order
ON public.order_field_snapshots(order_id, sort_order_snapshot, id);

CREATE INDEX IF NOT EXISTS idx_order_field_snapshots_definition
ON public.order_field_snapshots(source_definition_id)
WHERE source_definition_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Sipariş alan değerleri
--
-- Aynı sipariş alanı için tek güncel değer (upsert).
-- (field_snapshot_id, order_id) composite FK, snapshot'ın aynı
-- siparişe ait olmasını zorunlu kılar.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_field_values (
    id BIGSERIAL PRIMARY KEY,

    order_id BIGINT NOT NULL,

    field_snapshot_id BIGINT NOT NULL,

    -- Field type'a göre doğrulanmış, normalize edilmiş değer.
    -- image türünde yalnız güvenli mesaj referansı taşır:
    --   {"message_id": <int>}
    value JSONB NOT NULL,

    source_message_id BIGINT NOT NULL
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT order_field_values_order_fk
        FOREIGN KEY (order_id)
        REFERENCES public.orders(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT order_field_values_snapshot_scope_fk
        FOREIGN KEY (field_snapshot_id, order_id)
        REFERENCES public.order_field_snapshots(id, order_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT order_field_values_source_fk
        FOREIGN KEY (source_message_id)
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_field_values_order_field
ON public.order_field_values(order_id, field_snapshot_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_field_values_idempotency
ON public.order_field_values(order_id, field_snapshot_id, source_message_id);

CREATE INDEX IF NOT EXISTS idx_order_field_values_order
ON public.order_field_values(order_id, field_snapshot_id);

-- ------------------------------------------------------------
-- 5. Ortak yardımcı: order_presenter
--
-- RPC'lerin döndürdüğü order JSON'ını normalize eder.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._order_presenter(
    p_order public.orders
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN jsonb_build_object(
        'id', p_order.id,
        'seller_id', p_order.seller_id,
        'customer_id', p_order.customer_id,
        'product_id', p_order.product_id,
        'product_name_snapshot', p_order.product_name_snapshot,
        'external_order_number', p_order.external_order_number,
        'customer_phone_snapshot', p_order.customer_phone_snapshot,
        'customer_note', p_order.customer_note,
        'image_message_id', p_order.image_message_id,
        'custom_text', p_order.custom_text,
        'status', p_order.status,
        'review_reason_code', p_order.review_reason_code,
        'review_reason_note', p_order.review_reason_note,
        'created_from_message_id', p_order.created_from_message_id,
        'last_source_message_id', p_order.last_source_message_id,
        'version', p_order.version,
        'created_at', p_order.created_at,
        'updated_at', p_order.updated_at,
        'completed_at', p_order.completed_at,
        'closed_at', p_order.closed_at
    );
END;
$$;

-- ------------------------------------------------------------
-- 6. Yardımcı: order'ı seller + customer scope ile kilitle
--
-- Eş zamanlı istekleri seller+customer üzerinde serileştirmek
-- için advisory transaction lock kullanır.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._lock_order_scope(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT
)
RETURNS public.orders
LANGUAGE plpgsql
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtext('order:' || target_seller_id || ':' || target_customer_id)
    );

    SELECT *
    INTO order_row
    FROM public.orders
    WHERE id = target_order_id
      AND seller_id = target_seller_id
      AND customer_id = target_customer_id;

    RETURN order_row;
END;
$$;

-- ------------------------------------------------------------
-- 7. get_or_create_active_order
--
-- Aynı seller + customer konuşmasında en fazla bir aktif sipariş.
-- idempotency: aynı kaynak mesajdan ikinci sipariş oluşmaz.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_or_create_active_order(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    source_message_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    active_order public.orders;
    created boolean := FALSE;
BEGIN
    -- Müşteri ve kaynak mesaj tenant scope'unda doğrulanır.
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
        hashtext('order:' || target_seller_id || ':' || target_customer_id)
    );

    -- Aktif sipariş varsa onu döndür.
    SELECT *
    INTO active_order
    FROM public.orders
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', TRUE,
            'created', FALSE,
            'order', public._order_presenter(active_order)
        );
    END IF;

    -- Idempotency: aynı kaynak mesajdan daha önce oluşturulmuş
    -- (tamamlanmış olabilecek) siparişi döndür.
    SELECT *
    INTO active_order
    FROM public.orders
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND created_from_message_id = source_message_id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'created', FALSE,
            'order', public._order_presenter(active_order)
        );
    END IF;

    -- Yeni sipariş oluştur.
    INSERT INTO public.orders (
        seller_id,
        customer_id,
        created_from_message_id
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        source_message_id
    )
    RETURNING * INTO active_order;

    created := TRUE;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'created', TRUE,
        'order', public._order_presenter(active_order)
    );

EXCEPTION
    WHEN unique_violation THEN
        -- İki eş zamanlı istek aynı anda aktif sipariş oluşturmayı
        -- denerse partial unique index devreye girer. Mevcut aktif
        -- siparişi güvenle döndür.
        SELECT *
        INTO active_order
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
                'order', public._order_presenter(active_order),
                'race_resolved', TRUE
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Aktif sipariş çakışması çözülemedi.'
        );
END;
$$;

-- ------------------------------------------------------------
-- 8. set_order_product_and_snapshot_fields
--
-- Ürünü doğrular, ürün adını snapshot olarak yazar ve aktif alan
-- tanımlarını siparişe snapshot olarak sabitler.
--
-- Değer toplamaya başlanmış bir siparişte ürün değişikliği
-- reddedilir (sessiz veri kaybı yapılmaz).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_order_product_and_snapshot_fields(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
    target_product_id BIGINT,
    expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
    product_row public.products%ROWTYPE;
    has_values boolean := FALSE;
    field_row public.order_field_definitions%ROWTYPE;
    snapshot_id BIGINT;
    snapshot_count integer := 0;
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

    SELECT *
    INTO product_row
    FROM public.products
    WHERE id = target_product_id
      AND seller_id = target_seller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    -- Değer toplanmaya başlandıysa ürün değişikliği reddedilir.
    SELECT EXISTS (
        SELECT 1
        FROM public.order_field_values v
        WHERE v.order_id = order_row.id
    )
    INTO has_values;

    IF has_values OR
       order_row.image_message_id IS NOT NULL OR
       order_row.custom_text IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'order_product_change_requires_review',
            'order', public._order_presenter(order_row)
        );
    END IF;

    -- Ürün değişikliğini uygula.
    UPDATE public.orders
    SET
        product_id = target_product_id,
        product_name_snapshot = product_row.name,
        updated_at = NOW(),
        version = version + 1
    WHERE id = order_row.id
    RETURNING * INTO order_row;

    -- Mağaza geneli + ürün bazlı aktif alanları etkili sırayla
    -- alıp snapshot'a sabitle.
    FOR field_row IN
        SELECT df.*
        FROM public.order_field_definitions df
        WHERE df.seller_id = target_seller_id
          AND df.is_active = TRUE
          AND (
              df.product_id IS NULL
              OR df.product_id = target_product_id
          )
        ORDER BY df.sort_order, df.id
    LOOP
        BEGIN
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
            VALUES (
                order_row.id,
                field_row.id,
                field_row.version,
                field_row.field_key,
                field_row.label,
                field_row.field_type,
                field_row.is_required,
                field_row.sort_order,
                COALESCE(field_row.options, '[]'::jsonb),
                field_row.validation_config
            )
            RETURNING id INTO snapshot_id;

            snapshot_count := snapshot_count + 1;

        EXCEPTION
            WHEN unique_violation THEN
                -- Aynı key daha önce snapshot'a alınmış; no-op.
                NULL;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'snapshot_count', snapshot_count,
        'order', public._order_presenter(order_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 9. record_order_field_value
--
-- Tenant scope, snapshot scope, kaynak mesaj scope ve idempotency
-- tek transaction içinde uygulanır. Değerin field type doğrulaması
-- application katmanında (order_service) yapılır; bu fonksiyon
-- yapısal güvenliği sağlar.
-- ------------------------------------------------------------

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

-- ------------------------------------------------------------
-- 10. update_order_core
--
-- Core alanları (sipariş no, telefon, not, görsel mesaj, özel
-- metin) idempotent biçimde günceller. NULL gönderilen değer
-- değişmez; eksik/boş değer temizlemek için açık boş dize
-- gönderilir. İşlem sonunda sipariş tamamlanma durumu yeniden
-- hesaplanır.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_order_core(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
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

    IF new_image_message_id IS NOT NULL THEN
        -- Görsel mesajı tenant + yön doğrulaması.
        IF NOT EXISTS (
            SELECT 1
            FROM public.messages
            WHERE id = new_image_message_id
              AND seller_id = target_seller_id
              AND customer_id = target_customer_id
              AND direction = 'incoming'
        ) THEN
            RETURN jsonb_build_object('status', 'forbidden');
        END IF;

        IF order_row.image_message_id IS DISTINCT FROM new_image_message_id THEN
            order_row.image_message_id := new_image_message_id;
            changed := TRUE;
        END IF;
    END IF;

    IF new_external_order_number IS NOT NULL THEN
        IF order_row.external_order_number IS DISTINCT FROM new_external_order_number THEN
            order_row.external_order_number := new_external_order_number;
            changed := TRUE;
        END IF;
    END IF;

    IF new_customer_phone_snapshot IS NOT NULL THEN
        IF order_row.customer_phone_snapshot IS DISTINCT FROM new_customer_phone_snapshot THEN
            order_row.customer_phone_snapshot := new_customer_phone_snapshot;
            changed := TRUE;
        END IF;
    END IF;

    IF new_customer_note IS NOT NULL THEN
        IF order_row.customer_note IS DISTINCT FROM new_customer_note THEN
            order_row.customer_note := new_customer_note;
            changed := TRUE;
        END IF;
    END IF;

    IF new_custom_text IS NOT NULL THEN
        IF order_row.custom_text IS DISTINCT FROM new_custom_text THEN
            order_row.custom_text := new_custom_text;
            changed := TRUE;
        END IF;
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
            last_source_message_id = COALESCE(
                order_row.last_source_message_id,
                new_image_message_id
            ),
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
    WHERE id = target_order_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', changed,
        'completed', completed,
        'order', public._order_presenter(order_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 11. _recompute_order_completion
--
-- Core zorunlulukları (sipariş numarası, image_required ise
-- görsel, custom_text_required ise özel metin) ve tüm zorunlu
-- snapshot alanları tamamlandığında siparişi COMPLETE yapar.
-- completed_at yalnızca bir kez yazılır.
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
    seller_info jsonb;
    core_ready boolean := TRUE;
    snapshot_ready boolean := TRUE;
    required_missing bigint := 0;
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

    -- Core zorunluluklar.
    IF order_row.external_order_number IS NULL OR
       char_length(order_row.external_order_number) = 0 THEN
        core_ready := FALSE;
    ELSE
        SELECT product_info
        INTO seller_info
        FROM public.sellers
        WHERE id = target_seller_id;

        IF seller_info IS NOT NULL
           AND (seller_info -> 'order' ->> 'image_required')::boolean THEN
            IF order_row.image_message_id IS NULL THEN
                core_ready := FALSE;
            END IF;
        END IF;

        IF core_ready AND seller_info IS NOT NULL
           AND (seller_info -> 'order' ->> 'custom_text_required')::boolean THEN
            IF order_row.custom_text IS NULL OR
               char_length(order_row.custom_text) = 0 THEN
                core_ready := FALSE;
            END IF;
        END IF;
    END IF;

    -- Zorunlu snapshot alanları.
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
-- 12. flag_order_review
--
-- Belirsiz veya çatışmalı durumlarda siparişi satıcı incelemesine
-- bırakır. Conversation control'ü değiştirmez.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.flag_order_review(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_order_id BIGINT,
    review_code TEXT,
    review_note TEXT DEFAULT NULL,
    expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    order_row public.orders%ROWTYPE;
BEGIN
    IF review_code IS NULL
       OR review_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
        RAISE EXCEPTION 'Geçersiz inceleme neden kodu.';
    END IF;

    IF review_note IS NOT NULL AND char_length(review_note) > 500 THEN
        RAISE EXCEPTION 'İnceleme notu çok uzun.';
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

    IF order_row.status = 'COMPLETE' THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Tamamlanmış sipariş inceleme durumuna alınamaz.',
            'order', public._order_presenter(order_row)
        );
    END IF;

    UPDATE public.orders
    SET
        status = 'SELLER_REVIEW_REQUIRED',
        review_reason_code = review_code,
        review_reason_note = review_note,
        updated_at = NOW(),
        version = version + 1
    WHERE id = order_row.id
    RETURNING * INTO order_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'order', public._order_presenter(order_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 13. Backend-only erişim modeli
-- ------------------------------------------------------------

ALTER TABLE public.products
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_field_definitions
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_field_snapshots
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_field_values
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.products
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.orders
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.order_field_definitions
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.order_field_snapshots
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.order_field_values
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE public.products_id_seq
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.orders_id_seq
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.order_field_definitions_id_seq
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.order_field_snapshots_id_seq
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.order_field_values_id_seq
FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.products
TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.orders
TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.order_field_definitions
TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.order_field_snapshots
TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.order_field_values
TO service_role;

GRANT ALL PRIVILEGES ON SEQUENCE public.products_id_seq
TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.orders_id_seq
TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.order_field_definitions_id_seq
TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.order_field_snapshots_id_seq
TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.order_field_values_id_seq
TO service_role;

-- RPC erişimleri.

REVOKE EXECUTE ON FUNCTION public.get_or_create_active_order(
    BIGINT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_or_create_active_order(
    BIGINT, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_order_product_and_snapshot_fields(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_order_product_and_snapshot_fields(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_order_field_value(
    BIGINT, BIGINT, BIGINT, BIGINT, JSONB, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_order_field_value(
    BIGINT, BIGINT, BIGINT, BIGINT, JSONB, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_order_core(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_order_core(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.flag_order_review(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.flag_order_review(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public._lock_order_scope(
    BIGINT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._lock_order_scope(
    BIGINT, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public._recompute_order_completion(
    BIGINT, BIGINT, BIGINT, BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._recompute_order_completion(
    BIGINT, BIGINT, BIGINT, BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public._order_presenter(
    public.orders
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._order_presenter(
    public.orders
)
TO service_role;

-- ------------------------------------------------------------
-- 14. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '014',
    'create_orders_and_field_definitions',
    'orders_and_dynamic_fields_v2_upgrade_safe',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;