-- 064_add_seller_analytics_summary.sql
-- Seller panel analytics: haftalık ve aylık özet RPC.
--
-- Hesaplanan metrikler (tümü seller-scoped, tenant isolated):
--   incoming_messages     : seller'a gelen toplam müşteri mesajı
--   outgoing_messages     : gönderilen toplam yanıt
--   auto_replied_messages : asistan tarafından otomatik yanıtlanan
--   manual_replied_msgs   : satıcı tarafından gönderilen (outgoing - auto)
--   auto_reply_rate       : otomasyon oranı (0.00-1.00)
--   new_orders            : oluşturulan yeni sipariş
--   completed_orders      : tamamlanan sipariş
--   open_returns          : açık iade/sorun talebi
--   resolved_returns      : kapanan iade/sorun talebi
--   unanswered_questions  : bekleyen cevaplanamayan soru
--
-- Periyot: 'week' (son 7 gün) veya 'month' (son 30 gün).
-- Fonksiyon STABLE'dır: aynı transaction'da çoklu çağrı cache'lenir.
-- search_path kilitli (güvenlik).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_seller_analytics_summary(
    target_seller_id  BIGINT,
    period            TEXT DEFAULT 'week'   -- 'week' | 'month'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    since_ts         TIMESTAMPTZ;
    msg_incoming     BIGINT := 0;
    msg_outgoing     BIGINT := 0;
    msg_auto         BIGINT := 0;
    ord_new          BIGINT := 0;
    ord_completed    BIGINT := 0;
    ret_open         BIGINT := 0;
    ret_resolved     BIGINT := 0;
    unanswered_open  BIGINT := 0;
    auto_rate        NUMERIC(5,4) := 0;
BEGIN
    -- Giriş doğrulama
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'reason', 'invalid_seller_id'
        );
    END IF;

    IF period NOT IN ('week', 'month') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'reason', 'invalid_period'
        );
    END IF;

    -- Başlangıç zamanı
    since_ts := CASE period
        WHEN 'week'  THEN NOW() - INTERVAL '7 days'
        WHEN 'month' THEN NOW() - INTERVAL '30 days'
    END;

    -- ── Mesaj metrikleri ─────────────────────────────────────────
    SELECT
        COUNT(*) FILTER (WHERE direction = 'incoming')               INTO msg_incoming
    FROM public.messages
    WHERE seller_id  = target_seller_id
      AND created_at >= since_ts;

    SELECT
        COUNT(*) FILTER (WHERE direction = 'outgoing'),
        COUNT(*) FILTER (WHERE direction = 'outgoing' AND was_auto_replied = TRUE)
    INTO msg_outgoing, msg_auto
    FROM public.messages
    WHERE seller_id  = target_seller_id
      AND created_at >= since_ts;

    -- Otomasyon oranı: outgoing mesaj yoksa 0
    IF msg_outgoing > 0 THEN
        auto_rate := ROUND(msg_auto::NUMERIC / msg_outgoing::NUMERIC, 4);
    END IF;

    -- ── Sipariş metrikleri ───────────────────────────────────────
    SELECT
        COUNT(*) FILTER (WHERE TRUE),
        COUNT(*) FILTER (WHERE status = 'COMPLETE')
    INTO ord_new, ord_completed
    FROM public.orders
    WHERE seller_id  = target_seller_id
      AND created_at >= since_ts;

    -- ── İade metrikleri ──────────────────────────────────────────
    SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('HANDLED', 'CLOSED')),
        COUNT(*) FILTER (WHERE status IN ('HANDLED', 'CLOSED'))
    INTO ret_open, ret_resolved
    FROM public.return_issue_requests
    WHERE seller_id  = target_seller_id
      AND created_at >= since_ts;

    -- ── Cevaplanamayan soru ──────────────────────────────────────
    SELECT COUNT(*)
    INTO unanswered_open
    FROM public.unanswered_questions
    WHERE seller_id  = target_seller_id
      AND status     = 'OPEN'
      AND created_at >= since_ts;

    -- ── Sonuç ───────────────────────────────────────────────────
    RETURN jsonb_build_object(
        'status',  'success',
        'period',  period,
        'since',   since_ts,
        'metrics', jsonb_build_object(
            'incoming_messages',     msg_incoming,
            'outgoing_messages',     msg_outgoing,
            'auto_replied_messages', msg_auto,
            'manual_replied_msgs',   GREATEST(msg_outgoing - msg_auto, 0),
            'auto_reply_rate',       auto_rate,
            'new_orders',            ord_new,
            'completed_orders',      ord_completed,
            'open_returns',          ret_open,
            'resolved_returns',      ret_resolved,
            'unanswered_questions',  unanswered_open
        )
    );
END;
$$;

-- ── Index: messages(seller_id, created_at) ────────────────────────────────
-- Periyot filtreli aggregate sorguları için. created_at DESC zaten birçok
-- yerde var; bu seller_id + created_at (ASC) versiyonu range scan içindir.
CREATE INDEX IF NOT EXISTS idx_messages_seller_created_at
ON public.messages(seller_id, created_at);

-- ── Index: orders(seller_id, created_at) ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_seller_created_at
ON public.orders(seller_id, created_at);

-- ── Index: return_issue_requests(seller_id, created_at) ───────────────────
CREATE INDEX IF NOT EXISTS idx_returns_seller_created_at
ON public.return_issue_requests(seller_id, created_at);

-- ── Index: unanswered_questions(seller_id, status, created_at) ────────────
CREATE INDEX IF NOT EXISTS idx_unanswered_seller_status_created
ON public.unanswered_questions(seller_id, status, created_at);

COMMIT;
