-- ============================================================
-- 053_fold_stale_recovery_into_outbox_poll.sql
-- Keep stale SENDING recovery on the existing outbound polling round-trip.
-- The worker should not make a second database RPC on every idle loop.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.next_whatsapp_delivery_outbox_id()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    candidate_id BIGINT;
    recovery_result JSONB;
    recovered_count_value INTEGER := 0;
BEGIN
    recovery_result := public.recover_stale_whatsapp_delivery_outbox();

    IF recovery_result IS NULL
       OR recovery_result ->> 'status' IS DISTINCT FROM 'success' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'reason', 'stale_recovery_failed'
        );
    END IF;

    BEGIN
        recovered_count_value := COALESCE(
            (recovery_result ->> 'recovered_count')::INTEGER,
            0
        );
    EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'reason', 'stale_recovery_invalid_count'
            );
    END;

    IF recovered_count_value < 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'reason', 'stale_recovery_invalid_count'
        );
    END IF;

    SELECT o.id
    INTO candidate_id
    FROM public.whatsapp_delivery_outbox o
    WHERE o.status = 'PENDING'
      AND (
            o.next_attempt_at IS NULL
            OR o.next_attempt_at <= NOW()
      )
    ORDER BY o.next_attempt_at NULLS FIRST, o.id
    LIMIT 1;

    RETURN jsonb_build_object(
        'status', 'success',
        'outbox_id', candidate_id,
        'recovered_stale_count', recovered_count_value
    );
END;
$$;

REVOKE ALL ON FUNCTION public.next_whatsapp_delivery_outbox_id()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_whatsapp_delivery_outbox_id()
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '053',
    'fold_stale_recovery_into_outbox_poll',
    'fold_stale_recovery_into_outbox_poll_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
