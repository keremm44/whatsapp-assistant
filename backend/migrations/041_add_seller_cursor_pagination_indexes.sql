-- Cursor/keyset pagination support for seller-facing queues.
-- These indexes match each list's tenant filter and stable timestamp + id order.

CREATE INDEX IF NOT EXISTS idx_orders_seller_updated_id_desc
    ON public.orders (seller_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_return_issue_requests_seller_updated_id_desc
    ON public.return_issue_requests (seller_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_unanswered_groups_seller_last_seen_id_desc
    ON public.unanswered_question_groups (seller_id, last_seen_at DESC, id DESC);

-- Conversation list is assembled by the seller-panel read model and orders by
-- most-recent message activity. This index supports tenant-scoped activity
-- traversal without scanning other sellers' messages.
CREATE INDEX IF NOT EXISTS idx_messages_seller_created_id_desc
    ON public.messages (seller_id, created_at DESC, id DESC);

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('041', 'add_seller_cursor_pagination_indexes', 'v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;
