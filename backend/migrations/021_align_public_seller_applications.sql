-- ============================================================
-- 021_align_public_seller_applications.sql
-- Public başvuru formunu mevcut seller_applications şemasıyla hizala.
--
-- Ürün kuralı:
-- - Başvuru, seller hesabı oluşturmaz.
-- - Başvuru için e-posta zorunlu değildir; ilk temas WhatsApp üzerinden yapılabilir.
-- - Aynı telefonla birden fazla açık başvuru oluşturulmaz.
-- ============================================================

BEGIN;

-- Mevcut veride normalize edilmiş aynı telefonla birden fazla açık başvuru
-- varsa unique index eklemeden önce açık hata ver.
DO $$
DECLARE
    duplicate_phone TEXT;
BEGIN
    SELECT regexp_replace(phone, '[^0-9]', '', 'g')
    INTO duplicate_phone
    FROM public.seller_applications
    WHERE status IN ('pending', 'contacted')
    GROUP BY regexp_replace(phone, '[^0-9]', '', 'g')
    HAVING COUNT(*) > 1
    LIMIT 1;

    IF duplicate_phone IS NOT NULL THEN
        RAISE EXCEPTION
            'Aynı telefonla birden fazla açık seller application var. Önce duplicate kayıtları çözün.';
    END IF;
END;
$$;

-- Marketing/public başvuru akışı WhatsApp-first çalışır. E-posta daha sonra
-- admin iletişimi sırasında alınabilir; mevcut e-posta verileri korunur.
ALTER TABLE public.seller_applications
    ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.seller_applications
    ADD COLUMN IF NOT EXISTS product_category TEXT;

ALTER TABLE public.seller_applications
    DROP CONSTRAINT IF EXISTS chk_seller_applications_email_nonblank;

ALTER TABLE public.seller_applications
    ADD CONSTRAINT chk_seller_applications_email_nonblank
    CHECK (email IS NULL OR BTRIM(email) <> '');

ALTER TABLE public.seller_applications
    DROP CONSTRAINT IF EXISTS chk_seller_applications_product_category_length;

ALTER TABLE public.seller_applications
    ADD CONSTRAINT chk_seller_applications_product_category_length
    CHECK (product_category IS NULL OR char_length(product_category) <= 160);

-- Public servis telefonları canonical biçimde yazar. Expression index ayrıca
-- eski boşluk/parantez/tire biçimlerini de aynı açık başvuru anahtarına indirger.
CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_applications_open_phone_digits
    ON public.seller_applications (
        regexp_replace(phone, '[^0-9]', '', 'g')
    )
    WHERE status IN ('pending', 'contacted');

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '021',
    'align_public_seller_applications',
    'public_seller_applications_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
