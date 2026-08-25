-- ============================================================
-- 011_invite_activation_and_single_owner.sql
-- Davet tamamlama, gerçek beta başlangıcı ve tek satıcı/tek kullanıcı
-- ============================================================

BEGIN;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS beta_duration_days INTEGER
        NOT NULL DEFAULT 30;

ALTER TABLE public.sellers
    DROP CONSTRAINT IF EXISTS chk_sellers_beta_duration_days;

ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_beta_duration_days
    CHECK (beta_duration_days BETWEEN 1 AND 365);

-- 009 döneminde onboarding başında yanlışlıkla başlatılmış beta tarihlerini
-- yalnızca henüz hiç aktive edilmemiş founder beta hesaplarında temizler.
UPDATE public.sellers
SET
    beta_started_at = NULL,
    beta_ends_at = NULL
WHERE account_type = 'founder_beta'
  AND activated_at IS NULL
  AND system_status <> 'beta_active';

-- Kısıt eklenmeden önce mevcut veri içinde aynı seller_id'ye bağlı birden
-- fazla satıcı profili varsa migration açık bir hatayla durur.
DO $$
DECLARE
    duplicate_seller_id BIGINT;
BEGIN
    SELECT seller_id
    INTO duplicate_seller_id
    FROM public.user_profiles
    WHERE role = 'seller'
      AND seller_id IS NOT NULL
    GROUP BY seller_id
    HAVING COUNT(*) > 1
    LIMIT 1;

    IF duplicate_seller_id IS NOT NULL THEN
        RAISE EXCEPTION
            'seller_id % birden fazla user_profile ile bağlıdır. Önce yinelenen profilleri temizleyin.',
            duplicate_seller_id;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_one_seller_owner
    ON public.user_profiles(seller_id)
    WHERE role = 'seller' AND seller_id IS NOT NULL;

DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        INSERT INTO public.schema_migrations (version, name)
        VALUES ('011', 'invite_activation_and_single_owner')
        ON CONFLICT (version) DO NOTHING;
    END IF;
END;
$$;

COMMIT;
