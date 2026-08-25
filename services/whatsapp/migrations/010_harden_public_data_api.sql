-- ============================================================
-- 010_harden_public_data_api.sql
-- Public Data API güvenlik sertleştirmesi
--
-- Mimari kararı:
-- - Tarayıcı / mobil istemci Supabase tablolarına doğrudan erişmez.
-- - Tüm iş verisi FastAPI üzerinden okunur ve yazılır.
-- - FastAPI, SUPABASE_SERVICE_KEY (service_role) kullanır.
-- - anon ve authenticated rolleri ana tablolara doğrudan erişemez.
--
-- Bu migration:
-- 1) Ana public tablolarında RLS'yi açar.
-- 2) Önceden kalmış olabilecek policy'leri temizler.
-- 3) anon/authenticated tablo ve sequence yetkilerini kaldırır.
-- 4) service_role yetkilerini açıkça tanımlar.
-- 5) Hassas onboarding RPC fonksiyonlarını istemci rollerine kapatır.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. RLS AÇ
-- ------------------------------------------------------------

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_onboarding_steps ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. MEVCUT POLICY'LERİ TEMİZLE
--
-- Şu anki mimaride doğrudan istemci erişimi yoktur. Daha önce test
-- amacıyla eklenmiş bir policy kalmışsa açık kapı bırakmaması için
-- bu tablolardaki tüm policy'ler kaldırılır.
-- ------------------------------------------------------------

DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'sellers',
              'customers',
              'messages',
              'orders',
              'rules',
              'feedbacks',
              'schema_migrations',
              'customer_violations',
              'conversation_states',
              'state_transitions',
              'seller_notifications',
              'unanswered_questions',
              'seller_applications',
              'user_profiles',
              'seller_onboarding_steps'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            policy_row.policyname,
            policy_row.schemaname,
            policy_row.tablename
        );
    END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 3. DATA API ROLLERİNİ KAPAT
-- ------------------------------------------------------------

REVOKE ALL PRIVILEGES ON TABLE public.sellers FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.customers FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.messages FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.orders FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.rules FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.feedbacks FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.customer_violations FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.conversation_states FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.state_transitions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.seller_notifications FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.unanswered_questions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.seller_applications FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.seller_onboarding_steps FROM anon, authenticated;

-- BIGSERIAL/sequence erişimi üzerinden dolaylı insert ihtimalini de kapat.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ------------------------------------------------------------
-- 4. BACKEND SERVICE ROLE YETKİLERİ
-- ------------------------------------------------------------

GRANT ALL PRIVILEGES ON TABLE public.sellers TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.customers TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.messages TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.orders TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.rules TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.feedbacks TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.schema_migrations TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.customer_violations TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.conversation_states TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.state_transitions TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.seller_notifications TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.unanswered_questions TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.seller_applications TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.user_profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.seller_onboarding_steps TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ------------------------------------------------------------
-- 5. HASSAS RPC/FONKSİYON ERİŞİMİNİ KAPAT
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.initialize_seller_onboarding(BIGINT)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.unlock_next_onboarding_step(BIGINT, INTEGER)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.initialize_seller_onboarding(BIGINT)
TO service_role;

GRANT EXECUTE ON FUNCTION public.unlock_next_onboarding_step(BIGINT, INTEGER)
TO service_role;

-- Trigger fonksiyonları doğrudan istemci RPC'si olarak kullanılamasın.
REVOKE EXECUTE ON FUNCTION public.set_updated_at()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_onboarding_sequence()
FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 6. GELECEK NESNELER İÇİN GÜVENLİ VARSAYILANLAR
--
-- Bu komutlar migration'ı çalıştıran rolün daha sonra oluşturacağı
-- tablo ve sequence'lerde anon/authenticated için otomatik erişimi
-- kapalı tutar.
-- ------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 7. MIGRATION KAYDI
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '010',
    'harden_public_data_api',
    'backend_only_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
