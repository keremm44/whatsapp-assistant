-- 056_add_whatsapp_operational_health_snapshot.sql
-- Privacy-safe aggregate operational snapshot for queue/outbox monitoring.

CREATE OR REPLACE FUNCTION public.get_whatsapp_operational_health()
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
WITH inbound AS (
    SELECT
        COUNT(*) FILTER (
            WHERE status = 'PENDING' AND available_at <= NOW()
        )::BIGINT AS due_pending_count,
        COALESCE(
            EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (
                WHERE status = 'PENDING' AND available_at <= NOW()
            )))::BIGINT,
            0
        ) AS oldest_due_pending_seconds,
        COUNT(*) FILTER (WHERE status = 'PROCESSING')::BIGINT AS processing_count,
        COALESCE(
            EXTRACT(EPOCH FROM (NOW() - MIN(claimed_at) FILTER (
                WHERE status = 'PROCESSING'
            )))::BIGINT,
            0
        ) AS oldest_processing_seconds,
        COUNT(*) FILTER (
            WHERE status = 'FAILED'
              AND updated_at >= NOW() - INTERVAL '15 minutes'
        )::BIGINT AS failed_recent_15m,
        COUNT(*) FILTER (
            WHERE attempt_count > 1
              AND updated_at >= NOW() - INTERVAL '15 minutes'
        )::BIGINT AS reclaimed_recent_15m
    FROM public.whatsapp_inbound_events
), outbox AS (
    SELECT
        COUNT(*) FILTER (
            WHERE status = 'PENDING'
              AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        )::BIGINT AS due_pending_count,
        COALESCE(
            EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (
                WHERE status = 'PENDING'
                  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
            )))::BIGINT,
            0
        ) AS oldest_due_pending_seconds,
        COUNT(*) FILTER (WHERE status = 'SENDING')::BIGINT AS sending_count,
        COALESCE(
            EXTRACT(EPOCH FROM (NOW() - MIN(last_attempt_at) FILTER (
                WHERE status = 'SENDING'
            )))::BIGINT,
            0
        ) AS oldest_sending_seconds,
        COUNT(*) FILTER (
            WHERE status = 'FAILED'
              AND updated_at >= NOW() - INTERVAL '15 minutes'
        )::BIGINT AS failed_recent_15m,
        COUNT(*) FILTER (WHERE status = 'UNKNOWN')::BIGINT AS unknown_total,
        COUNT(*) FILTER (
            WHERE status = 'UNKNOWN'
              AND updated_at >= NOW() - INTERVAL '15 minutes'
        )::BIGINT AS unknown_recent_15m,
        COUNT(*) FILTER (
            WHERE status = 'SUPPRESSED'
              AND updated_at >= NOW() - INTERVAL '15 minutes'
        )::BIGINT AS suppressed_recent_15m
    FROM public.whatsapp_delivery_outbox
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
    )
)
FROM inbound, outbox;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_operational_health()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_operational_health()
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '056',
    'add_whatsapp_operational_health_snapshot',
    'add_whatsapp_operational_health_snapshot_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
