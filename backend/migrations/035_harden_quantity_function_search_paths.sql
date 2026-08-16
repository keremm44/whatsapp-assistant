-- ============================================================
-- 035_harden_quantity_function_search_paths.sql
-- Security hardening for quantity / return-issue helper functions introduced
-- or replaced by migration 034.
--
-- This migration changes function configuration only. It does not modify
-- business logic, tables, rows, permissions, or conversation/order semantics.
-- ============================================================

ALTER FUNCTION public._return_issue_request_presenter(
    public.return_issue_requests
)
SET search_path = pg_catalog, public;

ALTER FUNCTION public.create_or_get_return_issue_request(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, TEXT
)
SET search_path = pg_catalog, public;

ALTER FUNCTION public.evaluate_quantity_limit_request(
    BIGINT, BIGINT, BIGINT, INTEGER, TEXT
)
SET search_path = pg_catalog, public;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '035',
    'harden_quantity_function_search_paths',
    'quantity_function_search_paths_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;
