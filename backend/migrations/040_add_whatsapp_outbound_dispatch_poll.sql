-- ============================================================
-- 040_add_whatsapp_outbound_dispatch_poll.sql
-- Safe due-outbox discovery for the background dispatcher.
-- Dispatch itself keeps the existing atomic claim transition.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.next_whatsapp_delivery_outbox_id()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    candidate_id BIGINT;
BEGIN
    SELECT o.id
    INTO candidate_id
    FROM public.whatsapp_delivery_outbox o
    WHERE o.status = 'PENDING'
      AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= NOW())
    ORDER BY o.next_attempt_at NULLS FIRST, o.id
    LIMIT 1;

    RETURN jsonb_build_object(
        'status', 'success',
        'outbox_id', candidate_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.next_whatsapp_delivery_outbox_id()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_whatsapp_delivery_outbox_id()
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '040',
    'add_whatsapp_outbound_dispatch_poll',
    'whatsapp_outbound_dispatch_poll_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
