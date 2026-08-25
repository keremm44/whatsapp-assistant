-- ============================================================
-- 064_add_seller_entitlements.sql
-- Product entitlement foundation shared by independently operated engines.
-- Existing sellers are backfilled with the currently sold WhatsApp product so
-- introducing package-aware reads remains backwards compatible.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.seller_entitlements (
    id BIGSERIAL PRIMARY KEY,
    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    product_key VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT seller_entitlements_product_key_check
        CHECK (
            product_key = BTRIM(product_key)
            AND product_key ~ '^[a-z][a-z0-9_]{0,63}$'
        ),
    CONSTRAINT seller_entitlements_status_check
        CHECK (status IN ('active', 'suspended', 'cancelled')),
    CONSTRAINT seller_entitlements_seller_product_unique
        UNIQUE (seller_id, product_key)
);

CREATE INDEX IF NOT EXISTS idx_seller_entitlements_seller_status
    ON public.seller_entitlements(seller_id, status, product_key);

DROP TRIGGER IF EXISTS trg_seller_entitlements_updated_at
    ON public.seller_entitlements;
CREATE TRIGGER trg_seller_entitlements_updated_at
BEFORE UPDATE ON public.seller_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- public is exposed by Supabase by default. Entitlements are authorization
-- inputs, so browser roles must never be able to read or mutate them directly.
ALTER TABLE public.seller_entitlements ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.seller_entitlements
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.seller_entitlements_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.seller_entitlements TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.seller_entitlements_id_seq TO service_role;

-- Preserve access for every seller that existed before product entitlements.
INSERT INTO public.seller_entitlements (seller_id, product_key, status)
SELECT id, 'whatsapp', 'active'
FROM public.sellers
ON CONFLICT (seller_id, product_key) DO NOTHING;

INSERT INTO public.schema_migrations(version, name, checksum, applied_by)
VALUES (
    '064',
    'add_seller_entitlements',
    'seller_entitlements_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
