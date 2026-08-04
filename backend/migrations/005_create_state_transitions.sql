-- 005_create_state_transitions.sql
-- Konuşma durum geçişlerini audit/debug amacıyla kaydeder.

BEGIN;

CREATE TABLE IF NOT EXISTS public.state_transitions (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    customer_id BIGINT NOT NULL
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    from_state VARCHAR(50),

    to_state VARCHAR(50) NOT NULL,

    trigger_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    reason_code VARCHAR(50) NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT state_transitions_from_state_check
        CHECK (
            from_state IS NULL OR
            from_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_SELLER'
            )
        ),

    CONSTRAINT state_transitions_to_state_check
        CHECK (
            to_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_SELLER'
            )
        ),

    CONSTRAINT state_transitions_reason_code_check
        CHECK (
            reason_code IN (
                'user_action',
                'timeout',
                'admin_override',
                'escalation',
                'violation',
                'system'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_state_transitions_seller
ON public.state_transitions(seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_state_transitions_customer
ON public.state_transitions(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_state_transitions_trigger_message
ON public.state_transitions(trigger_message_id)
WHERE trigger_message_id IS NOT NULL;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '005',
    'create_state_transitions',
    'v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;