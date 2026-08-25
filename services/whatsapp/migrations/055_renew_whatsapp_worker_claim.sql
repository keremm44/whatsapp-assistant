-- 055_renew_whatsapp_worker_claim.sql
--
-- Extends queue claim fencing into business processing. A worker renews its
-- exact event_id + worker_id + claim_version lease immediately before a
-- business mutation. Since claim_next_whatsapp_inbound_event may only reclaim
-- PROCESSING rows whose claimed_at is older than five minutes, a successful
-- renewal establishes a fresh exclusive window for the following short DB
-- mutation. If another worker has already reclaimed the event, the conditional
-- renewal fails closed and the stale worker must not mutate business state.

CREATE OR REPLACE FUNCTION public.renew_whatsapp_inbound_event_claim(
    event_id_value BIGINT,
    worker_id_value TEXT,
    claim_version_value BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    normalized_worker TEXT := BTRIM(worker_id_value);
    renewed_id BIGINT;
    observed_status TEXT;
    observed_worker TEXT;
    observed_version BIGINT;
BEGIN
    IF event_id_value IS NULL OR event_id_value <= 0
       OR normalized_worker IS NULL
       OR char_length(normalized_worker) NOT BETWEEN 1 AND 120
       OR claim_version_value IS NULL OR claim_version_value <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'reason', 'invalid_claim'
        );
    END IF;

    UPDATE public.whatsapp_inbound_events AS e
    SET claimed_at = NOW(),
        updated_at = NOW()
    WHERE e.id = event_id_value
      AND e.status = 'PROCESSING'
      AND e.claimed_by = normalized_worker
      AND e.claim_version = claim_version_value
    RETURNING e.id INTO renewed_id;

    IF renewed_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'event_id', renewed_id,
            'claim_version', claim_version_value
        );
    END IF;

    SELECT e.status, e.claimed_by, e.claim_version
    INTO observed_status, observed_worker, observed_version
    FROM public.whatsapp_inbound_events AS e
    WHERE e.id = event_id_value;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'claim_lost');
    END IF;
    IF observed_status <> 'PROCESSING' THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'event_not_processing');
    END IF;
    IF observed_worker IS DISTINCT FROM normalized_worker
       OR observed_version <> claim_version_value THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'claim_lost');
    END IF;

    -- Defensive fallback: the row matched the observed identity but the
    -- conditional UPDATE still did not renew it. Never permit a mutation.
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'claim_not_renewed');
END;
$$;

REVOKE ALL ON FUNCTION public.renew_whatsapp_inbound_event_claim(BIGINT, TEXT, BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_whatsapp_inbound_event_claim(BIGINT, TEXT, BIGINT)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '055',
    'renew_whatsapp_worker_claim',
    'renew_whatsapp_worker_claim_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
