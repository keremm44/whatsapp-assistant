-- 044_cleanup_duplicate_pagination_indexes.sql
-- Removes redundant pagination indexes introduced by 041 when an identical
-- index already existed under the original name. Keeping both copies adds
-- write/storage overhead without improving query support.

DROP INDEX IF EXISTS public.idx_orders_seller_updated_id_desc;
DROP INDEX IF EXISTS public.idx_return_issue_requests_seller_updated_id_desc;
DROP INDEX IF EXISTS public.idx_unanswered_groups_seller_last_seen_id_desc;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('044', 'cleanup_duplicate_pagination_indexes', 'v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;
