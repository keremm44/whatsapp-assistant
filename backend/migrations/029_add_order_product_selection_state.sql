-- ============================================================
-- 029_add_order_product_selection_state.sql
-- Adds AWAITING_ORDER_PRODUCT to the order-collection flow
-- state allowlists.
--
-- This is an ORDER COLLECTION state, not a conversation-control
-- state. ASSISTANT_ACTIVE / SELLER_TAKEN_OVER / RETURN_REVIEW /
-- ASSISTANT_PAUSED are untouched. No business rows are rewritten.
-- ============================================================

BEGIN;

ALTER TABLE public.conversation_states
    DROP CONSTRAINT IF EXISTS conversation_states_current_state_check;

ALTER TABLE public.conversation_states
    ADD CONSTRAINT conversation_states_current_state_check
        CHECK (
            current_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_PRODUCT',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_ORDER_FIELD',
                'AWAITING_SELLER'
            )
        );

ALTER TABLE public.state_transitions
    DROP CONSTRAINT IF EXISTS state_transitions_from_state_check;

ALTER TABLE public.state_transitions
    ADD CONSTRAINT state_transitions_from_state_check
        CHECK (
            from_state IS NULL OR
            from_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_PRODUCT',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_ORDER_FIELD',
                'AWAITING_SELLER'
            )
        );

ALTER TABLE public.state_transitions
    DROP CONSTRAINT IF EXISTS state_transitions_to_state_check;

ALTER TABLE public.state_transitions
    ADD CONSTRAINT state_transitions_to_state_check
        CHECK (
            to_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_PRODUCT',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_ORDER_FIELD',
                'AWAITING_SELLER'
            )
        );

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '029',
    'add_order_product_selection_state',
    'order_product_selection_state_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
