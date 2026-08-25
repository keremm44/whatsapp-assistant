-- Durable worker claims and completion transitions for WhatsApp inbox events.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_next_whatsapp_inbound_event(worker_id_value TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE event_row public.whatsapp_inbound_events%ROWTYPE; normalized_worker TEXT := BTRIM(worker_id_value);
BEGIN
    IF normalized_worker IS NULL OR char_length(normalized_worker) NOT BETWEEN 1 AND 120 THEN RETURN jsonb_build_object('status', 'error'); END IF;
    -- Inbound processing is idempotent through provider message IDs/outcomes. A
    -- crashed worker must not leave an event permanently invisible.
    UPDATE public.whatsapp_inbound_events SET status = 'PENDING', claimed_at = NULL, claimed_by = NULL, available_at = NOW(), updated_at = NOW()
    WHERE status = 'PROCESSING' AND claimed_at < NOW() - INTERVAL '5 minutes';
    SELECT * INTO event_row FROM public.whatsapp_inbound_events WHERE status = 'PENDING' AND available_at <= NOW() ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'success', 'event', NULL); END IF;
    UPDATE public.whatsapp_inbound_events SET status = 'PROCESSING', attempt_count = attempt_count + 1, claimed_at = NOW(), claimed_by = normalized_worker, updated_at = NOW() WHERE id = event_row.id RETURNING * INTO event_row;
    RETURN jsonb_build_object('status', 'success', 'event', to_jsonb(event_row));
END; $$;
CREATE OR REPLACE FUNCTION public.complete_whatsapp_inbound_event(event_id_value BIGINT, outcome_value TEXT, error_code_value TEXT DEFAULT NULL, retry_at_value TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE event_row public.whatsapp_inbound_events%ROWTYPE; normalized_outcome TEXT := UPPER(BTRIM(outcome_value));
BEGIN
    IF event_id_value IS NULL OR event_id_value <= 0 OR normalized_outcome NOT IN ('PROCESSED','FAILED','UNKNOWN','RETRY') THEN RETURN jsonb_build_object('status', 'error'); END IF;
    SELECT * INTO event_row FROM public.whatsapp_inbound_events WHERE id = event_id_value FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
    IF event_row.status <> 'PROCESSING' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.whatsapp_inbound_events SET status = CASE WHEN normalized_outcome = 'RETRY' THEN 'PENDING' ELSE normalized_outcome END, available_at = CASE WHEN normalized_outcome = 'RETRY' THEN GREATEST(COALESCE(retry_at_value, NOW()), NOW()) ELSE available_at END, last_error_code = NULLIF(LEFT(BTRIM(error_code_value), 64), ''), processed_at = CASE WHEN normalized_outcome IN ('PROCESSED','FAILED','UNKNOWN') THEN NOW() ELSE NULL END, claimed_at = NULL, claimed_by = NULL, updated_at = NOW() WHERE id = event_id_value RETURNING * INTO event_row;
    RETURN jsonb_build_object('status', 'success', 'event', to_jsonb(event_row));
END; $$;
REVOKE ALL ON FUNCTION public.claim_next_whatsapp_inbound_event(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_whatsapp_inbound_event(BIGINT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_whatsapp_inbound_event(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_inbound_event(BIGINT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
INSERT INTO public.schema_migrations (version, name, checksum, applied_by) VALUES ('039', 'add_whatsapp_inbound_worker_claims', 'whatsapp_inbound_worker_claims_v1', CURRENT_USER) ON CONFLICT (version) DO NOTHING;
COMMIT;
