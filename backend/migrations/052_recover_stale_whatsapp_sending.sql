-- ============================================================
-- 052_recover_stale_whatsapp_sending.sql
-- Recover outbound rows abandoned in SENDING after a worker/process crash.
--
-- Delivery ambiguity rule:
--   * never move stale SENDING back to PENDING;
--   * after 60 seconds, move it to UNKNOWN for manual review;
--   * recover in bounded batches with SKIP LOCKED so active finalization is
--     never blocked by the recovery sweep.
-- ============================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_whatsapp_delivery_stale_sending
    ON public.whatsapp_delivery_outbox(last_attempt_at, id)
    WHERE status = 'SENDING';

CREATE OR REPLACE FUNCTION public.recover_stale_whatsapp_delivery_outbox()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    recovered_count_value INTEGER := 0;
BEGIN
    WITH stale AS (
        SELECT o.id
        FROM public.whatsapp_delivery_outbox o
        WHERE o.status = 'SENDING'
          AND (
                o.last_attempt_at IS NULL
                OR o.last_attempt_at <= NOW() - INTERVAL '60 seconds'
          )
        ORDER BY o.last_attempt_at NULLS FIRST, o.id
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    ), recovered AS (
        UPDATE public.whatsapp_delivery_outbox o
        SET status = 'UNKNOWN',
            next_attempt_at = NULL,
            last_error_code = 'stale_sending_recovered',
            updated_at = NOW()
        FROM stale s
        WHERE o.id = s.id
          AND o.status = 'SENDING'
        RETURNING o.id
    )
    SELECT COUNT(*)::INTEGER
    INTO recovered_count_value
    FROM recovered;

    RETURN jsonb_build_object(
        'status', 'success',
        'recovered_count', recovered_count_value
    );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_whatsapp_delivery_outbox()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_whatsapp_delivery_outbox()
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '052',
    'recover_stale_whatsapp_sending',
    'recover_stale_whatsapp_sending_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
