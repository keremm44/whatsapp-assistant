BEGIN;

-- Seller ayarları ve hazır yanıt kuralları için optimistic concurrency temeli.
-- Mevcut iş verisini değiştirmez; yalnız version/timestamp metadata ve index ekler.

DO $$
DECLARE
    duplicate_trigger RECORD;
BEGIN
    SELECT
        seller_id,
        lower(btrim(trigger_text)) AS trigger_key,
        count(*) AS duplicate_count
    INTO duplicate_trigger
    FROM public.rules
    WHERE is_active = TRUE
    GROUP BY seller_id, lower(btrim(trigger_text))
    HAVING count(*) > 1
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Aynı seller için aynı aktif trigger_text birden fazla kez bulunuyor: seller_id=%, trigger=%',
            duplicate_trigger.seller_id,
            duplicate_trigger.trigger_key;
    END IF;
END;
$$;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS settings_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.sellers
    DROP CONSTRAINT IF EXISTS chk_sellers_settings_version;

ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_settings_version
    CHECK (settings_version >= 1);

CREATE OR REPLACE FUNCTION public.bump_seller_settings_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (
        OLD.name,
        OLD.phone,
        OLD.store_name,
        OLD.store_link,
        OLD.product_info
    ) IS DISTINCT FROM (
        NEW.name,
        NEW.phone,
        NEW.store_name,
        NEW.store_link,
        NEW.product_info
    ) AND NEW.settings_version = OLD.settings_version THEN
        NEW.settings_version := OLD.settings_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_seller_settings_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_seller_settings_version() TO service_role;

DROP TRIGGER IF EXISTS trg_sellers_settings_version ON public.sellers;
CREATE TRIGGER trg_sellers_settings_version
BEFORE UPDATE ON public.sellers
FOR EACH ROW
EXECUTE FUNCTION public.bump_seller_settings_version();

ALTER TABLE public.rules
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.rules
    DROP CONSTRAINT IF EXISTS chk_rules_version;

ALTER TABLE public.rules
    ADD CONSTRAINT chk_rules_version
    CHECK (version >= 1);

CREATE INDEX IF NOT EXISTS idx_rules_seller_active_created
    ON public.rules(seller_id, is_active, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rules_seller_active_trigger
    ON public.rules(seller_id, lower(btrim(trigger_text)))
    WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_rules_updated_at ON public.rules;
CREATE TRIGGER trg_rules_updated_at
BEFORE UPDATE ON public.rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.schema_migrations(version, name, checksum, applied_by)
VALUES (
    '023',
    'add_seller_rules_and_product_settings',
    'seller_rules_product_settings_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
