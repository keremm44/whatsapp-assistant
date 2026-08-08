-- ============================================================
-- 018_harden_runtime_database.sql
-- Runtime DB güvenlik ve legacy-default hardening.
--
-- Amaç:
--   - Supabase security advisor tarafından işaretlenen mutable function
--     search_path riskini mevcut 012 fonksiyonlarında ve 013-017 ile gelen
--     application RPC/helper fonksiyonlarında kapatmak.
--   - sellers tablosunda 000-012 döneminden kalan literal placeholder
--     default'ları temizlemek.
--
-- Bu migration backend-only erişim modelini değiştirmez:
--   - anon/authenticated tablo yetkisi eklenmez.
--   - RLS policy eklenmez.
--   - service_role modeli korunur.
--
-- Bu migration yalnız repository için hazırlanır; canlı Supabase'e kullanıcı
-- açıkça izin verene kadar uygulanmaz.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Legacy sellers default'larını canonical hale getir
-- ------------------------------------------------------------

ALTER TABLE public.sellers
    ALTER COLUMN email DROP DEFAULT,
    ALTER COLUMN phone DROP DEFAULT,
    ALTER COLUMN status SET DEFAULT 'pending';

-- ------------------------------------------------------------
-- 2. 012 ve öncesinden mevcut runtime functions
-- ------------------------------------------------------------

ALTER FUNCTION public.set_updated_at()
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.initialize_seller_onboarding(BIGINT)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.unlock_next_onboarding_step(BIGINT, INTEGER)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.enforce_onboarding_sequence()
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.complete_seller_onboarding_step(
    BIGINT, INTEGER, JSONB, JSONB, JSONB, JSONB
)
    SET search_path = pg_catalog, public;

-- ------------------------------------------------------------
-- 3. Conversation-control functions (013)
-- ------------------------------------------------------------

ALTER FUNCTION public.transition_conversation_control(
    BIGINT, BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.resume_conversation_assistant(
    BIGINT, BIGINT, TEXT, TEXT, BIGINT, BIGINT
)
    SET search_path = pg_catalog, public;

-- ------------------------------------------------------------
-- 4. Order functions (014-015)
-- ------------------------------------------------------------

ALTER FUNCTION public._order_presenter(public.orders)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public._lock_order_scope(BIGINT, BIGINT, BIGINT)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_or_create_active_order(BIGINT, BIGINT, BIGINT)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.set_order_product_and_snapshot_fields(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.record_order_field_value(
    BIGINT, BIGINT, BIGINT, BIGINT, JSONB, BIGINT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_order_core(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public._recompute_order_completion(
    BIGINT, BIGINT, BIGINT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.flag_order_review(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.initialize_order_collection(BIGINT, BIGINT, BIGINT)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_order_core_from_message(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BIGINT
)
    SET search_path = pg_catalog, public;

-- ------------------------------------------------------------
-- 5. Return/issue functions (016)
-- ------------------------------------------------------------

ALTER FUNCTION public._return_issue_request_presenter(public.return_issue_requests)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.create_or_get_return_issue_request(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, TEXT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_return_issue_request_from_message(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.add_return_issue_request_evidence(
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.mark_return_issue_review_required(
    BIGINT, BIGINT, BIGINT, BOOLEAN, TEXT, TEXT, BIGINT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.mark_return_issue_handled(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_return_issue_type_setting(
    BIGINT, TEXT, TEXT, BIGINT
)
    SET search_path = pg_catalog, public;

-- ------------------------------------------------------------
-- 6. Unanswered-question functions (017)
-- ------------------------------------------------------------

ALTER FUNCTION public._normalize_unanswered_question_text(TEXT)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public._unanswered_question_group_presenter(
    public.unanswered_question_groups
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_answered_unanswered_question(BIGINT, TEXT)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.record_unanswered_question_occurrence(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.set_unanswered_question_answer(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
)
    SET search_path = pg_catalog, public;

ALTER FUNCTION public.dismiss_unanswered_question_group(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
)
    SET search_path = pg_catalog, public;

-- ------------------------------------------------------------
-- 7. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '018',
    'harden_runtime_database',
    'runtime_database_hardening_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
