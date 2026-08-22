-- 048_disambiguate_whatsapp_completion_rpc.sql
-- Remove trailing defaults from the fenced 6-argument overload so historical
-- 4-argument calls resolve unambiguously to the fail-closed compatibility RPC.

CREATE OR REPLACE FUNCTION public.complete_whatsapp_inbound_event(
    event_id_value BIGINT,
    worker_id_value TEXT,
    claim_version_value BIGINT,
    outcome_value TEXT,
    error_code_value TEXT,
    retry_at_value TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    event_row public.whatsapp_inbound_events%ROWTYPE;
    normalized_worker TEXT := BTRIM(worker_id_value);
    normalized_outcome TEXT := UPPER(BTRIM(outcome_value));
BEGIN
    IF event_id_value IS NULL OR event_id_value <= 0
       OR normalized_worker IS NULL OR char_length(normalized_worker) NOT BETWEEN 1 AND 120
       OR claim_version_value IS NULL OR claim_version_value <= 0
       OR normalized_outcome NOT IN ('PROCESSED', 'FAILED', 'UNKNOWN', 'RETRY') THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_completion');
    END IF;

    SELECT * INTO event_row
    FROM public.whatsapp_inbound_events
    WHERE id = event_id_value
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF event_row.status <> 'PROCESSING' THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'event_not_processing');
    END IF;
    IF event_row.claimed_by IS DISTINCT FROM normalized_worker
       OR event_row.claim_version <> claim_version_value THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'claim_lost');
    END IF;

    UPDATE public.whatsapp_inbound_events
    SET status = CASE WHEN normalized_outcome = 'RETRY' THEN 'PENDING' ELSE normalized_outcome END,
        available_at = CASE WHEN normalized_outcome = 'RETRY' THEN GREATEST(COALESCE(retry_at_value, NOW()), NOW()) ELSE available_at END,
        last_error_code = NULLIF(LEFT(BTRIM(error_code_value), 64), ''),
        processed_at = CASE WHEN normalized_outcome IN ('PROCESSED', 'FAILED', 'UNKNOWN') THEN NOW() ELSE NULL END,
        claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE id = event_id_value
    RETURNING * INTO event_row;

    RETURN jsonb_build_object('status', 'success', 'event', to_jsonb(event_row));
END;
$$;

REVOKE ALL ON FUNCTION public.complete_whatsapp_inbound_event(BIGINT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_inbound_event(BIGINT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('048', 'disambiguate_whatsapp_completion_rpc', 'disambiguate_whatsapp_completion_rpc_v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;
