-- ============================================================
-- 009_seller_access_and_applications.sql
-- Aday başvuru, kullanıcı profili, beta hesap ve zorunlu onboarding
-- ============================================================

BEGIN;

-- ============================================================
-- 1. GENEL updated_at TETİKLEYİCİSİ
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- ============================================================
-- 2. SATICI BAŞVURULARI
--
-- Başvuru yapan kişi henüz auth kullanıcısı veya seller değildir.
-- Panel erişimi verilmez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.seller_applications (
    id BIGSERIAL PRIMARY KEY,

    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,

    store_name TEXT NOT NULL,
    store_link TEXT,

    notes TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'contacted',
                'approved',
                'rejected',
                'cancelled'
            )
        ),

    admin_note TEXT,

    contacted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,

    approved_seller_id BIGINT
        REFERENCES public.sellers(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_applications_status
    ON public.seller_applications(status);

CREATE INDEX IF NOT EXISTS idx_seller_applications_created_at
    ON public.seller_applications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seller_applications_email_lower
    ON public.seller_applications(LOWER(email));

-- Aynı e-posta ile birden fazla açık başvuru oluşmasını engeller.
CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_applications_open_email
    ON public.seller_applications(LOWER(email))
    WHERE status IN ('pending', 'contacted');

DROP TRIGGER IF EXISTS trg_seller_applications_updated_at
    ON public.seller_applications;

CREATE TRIGGER trg_seller_applications_updated_at
BEFORE UPDATE ON public.seller_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 3. GİRİŞ YAPAN KULLANICI PROFİLLERİ
--
-- Aday satıcı burada tutulmaz.
-- Yalnızca admin ve onaylanmış satıcı hesabı bulunur.
-- auth_user_id, Supabase Auth içindeki auth.users.id değeridir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id BIGSERIAL PRIMARY KEY,

    auth_user_id UUID NOT NULL UNIQUE
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    email TEXT NOT NULL,
    full_name TEXT NOT NULL,

    role TEXT NOT NULL
        CHECK (role IN ('admin', 'seller')),

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'invited',
                'active',
                'suspended',
                'deactivated'
            )
        ),

    seller_id BIGINT
        REFERENCES public.sellers(id)
        ON DELETE CASCADE,

    last_login_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_user_profile_seller_relation
    CHECK (
        (role = 'admin' AND seller_id IS NULL)
        OR
        (role = 'seller' AND seller_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_seller_id
    ON public.user_profiles(seller_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role_status
    ON public.user_profiles(role, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_email_lower
    ON public.user_profiles(LOWER(email));

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at
    ON public.user_profiles;

CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 4. SELLERS TABLOSUNA HESAP, BETA VE ONBOARDING ALANLARI
-- ============================================================

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS account_type TEXT
        NOT NULL DEFAULT 'standard';

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS system_status TEXT
        NOT NULL DEFAULT 'onboarding';

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS payment_required BOOLEAN
        NOT NULL DEFAULT TRUE;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS special_pricing BOOLEAN
        NOT NULL DEFAULT FALSE;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS activation_requires_admin BOOLEAN
        NOT NULL DEFAULT FALSE;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS onboarding_status TEXT
        NOT NULL DEFAULT 'not_started';

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS current_onboarding_step INTEGER
        NOT NULL DEFAULT 1;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN
        NOT NULL DEFAULT FALSE;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS beta_started_at TIMESTAMPTZ;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS beta_ends_at TIMESTAMPTZ;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN
        NOT NULL DEFAULT FALSE;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS emergency_paused BOOLEAN
        NOT NULL DEFAULT FALSE;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS emergency_paused_at TIMESTAMPTZ;

ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS emergency_pause_reason TEXT;

-- Daha önce eklenmemişse updated_at alanını ekle.
ALTER TABLE public.sellers
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW();

-- Mevcut kısıtlar varsa yeniden oluşturabilmek için kaldır.
ALTER TABLE public.sellers
    DROP CONSTRAINT IF EXISTS chk_sellers_account_type;

ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_account_type
    CHECK (
        account_type IN (
            'founder_beta',
            'standard'
        )
    );

ALTER TABLE public.sellers
    DROP CONSTRAINT IF EXISTS chk_sellers_system_status;

ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_system_status
    CHECK (
        system_status IN (
            'onboarding',
            'admin_review_pending',
            'automatic_validation',
            'beta_active',
            'active',
            'suspended',
            'cancelled'
        )
    );

ALTER TABLE public.sellers
    DROP CONSTRAINT IF EXISTS chk_sellers_onboarding_status;

ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_onboarding_status
    CHECK (
        onboarding_status IN (
            'not_started',
            'in_progress',
            'completed'
        )
    );

ALTER TABLE public.sellers
    DROP CONSTRAINT IF EXISTS chk_sellers_onboarding_step;

ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_onboarding_step
    CHECK (
        current_onboarding_step BETWEEN 1 AND 10
    );

ALTER TABLE public.sellers
    DROP CONSTRAINT IF EXISTS chk_sellers_beta_dates;

ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_beta_dates
    CHECK (
        beta_ends_at IS NULL
        OR beta_started_at IS NULL
        OR beta_ends_at > beta_started_at
    );

CREATE INDEX IF NOT EXISTS idx_sellers_system_status
    ON public.sellers(system_status);

CREATE INDEX IF NOT EXISTS idx_sellers_account_type
    ON public.sellers(account_type);

CREATE INDEX IF NOT EXISTS idx_sellers_beta_ends_at
    ON public.sellers(beta_ends_at)
    WHERE beta_ends_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sellers_updated_at
    ON public.sellers;

CREATE TRIGGER trg_sellers_updated_at
BEFORE UPDATE ON public.sellers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. ZORUNLU ONBOARDING ADIMLARI
--
-- Satıcı adım atlayamaz.
-- Her adım ayrı kaydedilir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.seller_onboarding_steps (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON DELETE CASCADE,

    step_order INTEGER NOT NULL
        CHECK (step_order BETWEEN 1 AND 10),

    step_key TEXT NOT NULL
        CHECK (
            step_key IN (
                'business_info',
                'store_info',
                'product_info',
                'shipping_info',
                'return_policy',
                'rules_and_templates',
                'test_chat',
                'whatsapp_connection',
                'live_test',
                'activation'
            )
        ),

    status TEXT NOT NULL DEFAULT 'locked'
        CHECK (
            status IN (
                'locked',
                'available',
                'in_progress',
                'completed'
            )
        ),

    step_data JSONB NOT NULL DEFAULT '{}'::JSONB,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (seller_id, step_order),
    UNIQUE (seller_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_seller_status
    ON public.seller_onboarding_steps(seller_id, status);

DROP TRIGGER IF EXISTS trg_seller_onboarding_steps_updated_at
    ON public.seller_onboarding_steps;

CREATE TRIGGER trg_seller_onboarding_steps_updated_at
BEFORE UPDATE ON public.seller_onboarding_steps
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 6. ONBOARDING ADIM ATLAMA KORUMASI
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_onboarding_sequence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    incomplete_previous_steps INTEGER;
BEGIN
    -- Tamamlanma dışındaki güncellemelerde sıra kontrolü gerekmez.
    IF NEW.status <> 'completed' THEN
        RETURN NEW;
    END IF;

    -- İlk adım doğrudan tamamlanabilir.
    IF NEW.step_order = 1 THEN
        NEW.completed_at = COALESCE(NEW.completed_at, NOW());
        RETURN NEW;
    END IF;

    SELECT COUNT(*)
    INTO incomplete_previous_steps
    FROM public.seller_onboarding_steps
    WHERE seller_id = NEW.seller_id
      AND step_order < NEW.step_order
      AND status <> 'completed';

    IF incomplete_previous_steps > 0 THEN
        RAISE EXCEPTION
            'Önceki onboarding adımları tamamlanmadan bu adım tamamlanamaz.';
    END IF;

    NEW.completed_at = COALESCE(NEW.completed_at, NOW());

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_onboarding_sequence
    ON public.seller_onboarding_steps;

CREATE TRIGGER trg_enforce_onboarding_sequence
BEFORE INSERT OR UPDATE OF status
ON public.seller_onboarding_steps
FOR EACH ROW
EXECUTE FUNCTION public.enforce_onboarding_sequence();


-- ============================================================
-- 7. YENİ SATICI İÇİN 10 ONBOARDING ADIMINI OLUŞTURAN FONKSİYON
-- ============================================================

CREATE OR REPLACE FUNCTION public.initialize_seller_onboarding(
    target_seller_id BIGINT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
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
        (target_seller_id, 10, 'activation',          'locked')
    ON CONFLICT (seller_id, step_order) DO NOTHING;

    UPDATE public.sellers
    SET
        onboarding_status = 'in_progress',
        current_onboarding_step = 1,
        onboarding_completed = FALSE,
        onboarding_completed_at = NULL,
        ai_enabled = FALSE
    WHERE id = target_seller_id;
END;
$$;


-- ============================================================
-- 8. SONRAKİ ADIMI AÇAN FONKSİYON
-- ============================================================

CREATE OR REPLACE FUNCTION public.unlock_next_onboarding_step(
    target_seller_id BIGINT,
    completed_step_order INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF completed_step_order < 1 OR completed_step_order > 10 THEN
        RAISE EXCEPTION 'Geçersiz onboarding adım numarası.';
    END IF;

    UPDATE public.seller_onboarding_steps
    SET
        status = 'completed',
        completed_at = COALESCE(completed_at, NOW())
    WHERE seller_id = target_seller_id
      AND step_order = completed_step_order;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tamamlanacak onboarding adımı bulunamadı.';
    END IF;

    IF completed_step_order < 10 THEN
        UPDATE public.seller_onboarding_steps
        SET status = 'available'
        WHERE seller_id = target_seller_id
          AND step_order = completed_step_order + 1
          AND status = 'locked';

        UPDATE public.sellers
        SET
            onboarding_status = 'in_progress',
            current_onboarding_step = completed_step_order + 1
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
END;
$$;


-- ============================================================
-- 9. MEVCUT TEST SATICISINI GÜVENLİ VARSAYILANLARA GETİR
--
-- Mevcut seller kayıtları silinmez.
-- ============================================================

UPDATE public.sellers
SET
    account_type = COALESCE(account_type, 'standard'),
    system_status = COALESCE(system_status, 'onboarding'),
    onboarding_status = COALESCE(onboarding_status, 'not_started'),
    current_onboarding_step = COALESCE(current_onboarding_step, 1),
    onboarding_completed = COALESCE(onboarding_completed, FALSE),
    payment_required = COALESCE(payment_required, TRUE),
    special_pricing = COALESCE(special_pricing, FALSE),
    activation_requires_admin = COALESCE(
        activation_requires_admin,
        FALSE
    ),
    ai_enabled = COALESCE(ai_enabled, FALSE),
    emergency_paused = COALESCE(emergency_paused, FALSE);


-- ============================================================
-- 10. RLS
--
-- Şimdilik erişim FastAPI + service role üzerinden yapılacak.
-- Tablolar istemci tarafına doğrudan açık değildir.
-- ============================================================

ALTER TABLE public.seller_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_onboarding_steps ENABLE ROW LEVEL SECURITY;

-- Başvuru formu için güvenli public INSERT politikası daha sonra,
-- API endpoint'i hazırlanırken eklenmelidir.
-- Şimdilik anonim kullanıcıya doğrudan tablo erişimi verilmez.


-- ============================================================
-- 11. MIGRATION KAYDI
-- ============================================================

DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        INSERT INTO public.schema_migrations (
            version,
            name
        )
        VALUES (
            '009',
            'seller_access_and_applications'
        )
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

COMMIT;