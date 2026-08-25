-- 057_add_whatsapp_worker_heartbeat.sql
-- Durable, privacy-safe worker liveness signal for independent monitoring.

CREATE TABLE IF NOT EXISTS public.whatsapp_worker_heartbeats (
    worker_id VARCHAR(120) PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_worker_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_worker_heartbeats FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_worker_heartbeats TO service_role;

CREATE INDEX IF NOT EXISTS idx_whatsapp_worker_heartbeats_last_seen
ON public.whatsapp_worker_heartbeats (last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.record_whatsapp_worker_heartbeat(
    worker_id_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    normalized_worker TEXT := BTRIM(worker_id_value);
    heartbeat_row public.whatsapp_worker_heartbeats%ROWTYPE;
BEGIN
    IF normalized_worker IS NULL
       OR char_length(normalized_worker) NOT BETWEEN 1 AND 120 THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_worker_id');
    END IF;

    INSERT INTO public.whatsapp_worker_heartbeats (worker_id, started_at, last_seen_at)
    VALUES (normalized_worker, NOW(), NOW())
    ON CONFLICT (worker_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at
    RETURNING * INTO heartbeat_row;

    -- Worker IDs include process identity and can change on deploy. Bound the
    -- table without affecting current liveness detection.
    DELETE FROM public.whatsapp_worker_heartbeats
    WHERE last_seen_at < NOW() - INTERVAL '7 days';

    RETURN jsonb_build_object(
        'status', 'success',
        'worker_id', heartbeat_row.worker_id,
        'last_seen_at', heartbeat_row.last_seen_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_whatsapp_worker_heartbeat(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_worker_heartbeat(TEXT)
    TO service_role;

CREATE OR REPLACE FUNCTION public.get_whatsapp_operational_health()
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
WITH inbound AS (
    SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING' AND available_at <= NOW())::BIGINT AS due_pending_count,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status = 'PENDING' AND available_at <= NOW())))::BIGINT, 0) AS oldest_due_pending_seconds,
        COUNT(*) FILTER (WHERE status = 'PROCESSING')::BIGINT AS processing_count,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(claimed_at) FILTER (WHERE status = 'PROCESSING')))::BIGINT, 0) AS oldest_processing_seconds,
        COUNT(*) FILTER (WHERE status = 'FAILED' AND updated_at >= NOW() - INTERVAL '15 minutes')::BIGINT AS failed_recent_15m,
        COUNT(*) FILTER (WHERE attempt_count > 1 AND updated_at >= NOW() - INTERVAL '15 minutes')::BIGINT AS reclaimed_recent_15m
    FROM public.whatsapp_inbound_events
), outbox AS (
    SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))::BIGINT AS due_pending_count,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))))::BIGINT, 0) AS oldest_due_pending_seconds,
        COUNT(*) FILTER (WHERE status = 'SENDING')::BIGINT AS sending_count,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(last_attempt_at) FILTER (WHERE status = 'SENDING')))::BIGINT, 0) AS oldest_sending_seconds,
        COUNT(*) FILTER (WHERE status = 'FAILED' AND updated_at >= NOW() - INTERVAL '15 minutes')::BIGINT AS failed_recent_15m,
        COUNT(*) FILTER (WHERE status = 'UNKNOWN')::BIGINT AS unknown_total,
        COUNT(*) FILTER (WHERE status = 'UNKNOWN' AND updated_at >= NOW() - INTERVAL '15 minutes')::BIGINT AS unknown_recent_15m,
        COUNT(*) FILTER (WHERE status = 'SUPPRESSED' AND updated_at >= NOW() - INTERVAL '15 minutes')::BIGINT AS suppressed_recent_15m
    FROM public.whatsapp_delivery_outbox
), worker AS (
    SELECT
        COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '2 minutes')::BIGINT AS recent_heartbeat_count,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(last_seen_at)))::BIGINT, 0) AS last_heartbeat_age_seconds
    FROM public.whatsapp_worker_heartbeats
)
SELECT jsonb_build_object(
    'status', 'success',
    'generated_at', NOW(),
    'inbound', jsonb_build_object(
        'due_pending_count', inbound.due_pending_count,
        'oldest_due_pending_seconds', inbound.oldest_due_pending_seconds,
        'processing_count', inbound.processing_count,
        'oldest_processing_seconds', inbound.oldest_processing_seconds,
        'failed_recent_15m', inbound.failed_recent_15m,
        'reclaimed_recent_15m', inbound.reclaimed_recent_15m
    ),
    'outbox', jsonb_build_object(
        'due_pending_count', outbox.due_pending_count,
        'oldest_due_pending_seconds', outbox.oldest_due_pending_seconds,
        'sending_count', outbox.sending_count,
        'oldest_sending_seconds', outbox.oldest_sending_seconds,
        'failed_recent_15m', outbox.failed_recent_15m,
        'unknown_total', outbox.unknown_total,
        'unknown_recent_15m', outbox.unknown_recent_15m,
        'suppressed_recent_15m', outbox.suppressed_recent_15m
    ),
    'worker', jsonb_build_object(
        'recent_heartbeat_count', worker.recent_heartbeat_count,
        'last_heartbeat_age_seconds', worker.last_heartbeat_age_seconds
    )
)
FROM inbound, outbox, worker;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_operational_health()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_operational_health()
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '057',
    'add_whatsapp_worker_heartbeat',
    'add_whatsapp_worker_heartbeat_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
