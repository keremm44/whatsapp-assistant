-- 025_add_seller_product_crud.sql
-- Seller-scoped product list/create/update/disable contract.
-- Hard delete is intentionally not exposed because products are referenced by orders
-- and order field definitions.

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'public'
          AND r.relname = 'products'
          AND c.conname = 'chk_products_version'
    ) THEN
        ALTER TABLE public.products
            ADD CONSTRAINT chk_products_version CHECK (version >= 1);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_seller_name_normalized
    ON public.products (seller_id, lower(btrim(name::text)));

CREATE OR REPLACE FUNCTION public.get_seller_products(
    target_seller_id BIGINT,
    include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    products_value JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz seller kimliği.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.sellers s WHERE s.id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'is_active', p.is_active,
                'version', p.version,
                'created_at', p.created_at,
                'updated_at', p.updated_at
            )
            ORDER BY p.is_active DESC, p.updated_at DESC, p.id DESC
        ),
        '[]'::jsonb
    )
    INTO products_value
    FROM public.products p
    WHERE p.seller_id = target_seller_id
      AND (include_inactive OR p.is_active = TRUE);

    RETURN jsonb_build_object(
        'status', 'success',
        'total', jsonb_array_length(products_value),
        'products', products_value
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_seller_product(
    target_seller_id BIGINT,
    name_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    product_row public.products%ROWTYPE;
    normalized_name TEXT := BTRIM(name_value);
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz seller kimliği.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.sellers s WHERE s.id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF normalized_name IS NULL
       OR char_length(normalized_name) < 2
       OR char_length(normalized_name) > 200 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Ürün adı 2-200 karakter olmalıdır.'
        );
    END IF;

    INSERT INTO public.products (
        seller_id,
        name,
        is_active,
        updated_at,
        version
    )
    VALUES (
        target_seller_id,
        normalized_name,
        TRUE,
        NOW(),
        1
    )
    RETURNING * INTO product_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'product', jsonb_build_object(
            'id', product_row.id,
            'name', product_row.name,
            'is_active', product_row.is_active,
            'version', product_row.version,
            'created_at', product_row.created_at,
            'updated_at', product_row.updated_at
        )
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'duplicate_name'
        );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_seller_product(
    target_seller_id BIGINT,
    target_product_id BIGINT,
    expected_version BIGINT,
    name_value TEXT DEFAULT NULL,
    is_active_value BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    product_row public.products%ROWTYPE;
    normalized_name TEXT;
    next_name TEXT;
    next_active BOOLEAN;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_product_id IS NULL OR target_product_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz seller veya ürün kimliği.'
        );
    END IF;

    IF expected_version IS NULL OR expected_version <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'expected_version pozitif olmalıdır.'
        );
    END IF;

    IF name_value IS NULL AND is_active_value IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'En az bir ürün alanı değiştirilmelidir.'
        );
    END IF;

    IF name_value IS NOT NULL THEN
        normalized_name := BTRIM(name_value);
        IF char_length(normalized_name) < 2
           OR char_length(normalized_name) > 200 THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'Ürün adı 2-200 karakter olmalıdır.'
            );
        END IF;
    END IF;

    SELECT p.*
    INTO product_row
    FROM public.products p
    WHERE p.id = target_product_id
      AND p.seller_id = target_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF product_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'stale_version',
            'current_version', product_row.version
        );
    END IF;

    next_name := COALESCE(normalized_name, product_row.name::text);
    next_active := COALESCE(is_active_value, product_row.is_active);

    IF next_name = product_row.name::text
       AND next_active = product_row.is_active THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'product', jsonb_build_object(
                'id', product_row.id,
                'name', product_row.name,
                'is_active', product_row.is_active,
                'version', product_row.version,
                'created_at', product_row.created_at,
                'updated_at', product_row.updated_at
            )
        );
    END IF;

    UPDATE public.products p
    SET name = next_name,
        is_active = next_active,
        version = p.version + 1,
        updated_at = NOW()
    WHERE p.id = target_product_id
      AND p.seller_id = target_seller_id
    RETURNING p.* INTO product_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'product', jsonb_build_object(
            'id', product_row.id,
            'name', product_row.name,
            'is_active', product_row.is_active,
            'version', product_row.version,
            'created_at', product_row.created_at,
            'updated_at', product_row.updated_at
        )
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'duplicate_name'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_products(BIGINT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_seller_product(BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_seller_product(BIGINT, BIGINT, BIGINT, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_seller_products(BIGINT, BOOLEAN)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.create_seller_product(BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.update_seller_product(BIGINT, BIGINT, BIGINT, TEXT, BOOLEAN)
    TO service_role;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '025',
    'add_seller_product_crud',
    'seller_product_crud_v1',
    'migration'
)
ON CONFLICT (version) DO NOTHING;
