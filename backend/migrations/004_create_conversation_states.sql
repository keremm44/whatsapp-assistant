-- 004_create_conversation_states.sql
-- Müşteri konuşma akışının mevcut durumunu saklar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.conversation_states (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    customer_id BIGINT NOT NULL
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    current_state VARCHAR(50) NOT NULL DEFAULT 'NORMAL',

    state_type VARCHAR(20) NOT NULL DEFAULT 'no_lock',

    state_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT conversation_states_seller_customer_unique
        UNIQUE (seller_id, customer_id),

    CONSTRAINT conversation_states_state_type_check
        CHECK (
            state_type IN (
                'no_lock',
                'soft_lock',
                'informational'
            )
        ),

    CONSTRAINT conversation_states_current_state_check
        CHECK (
            current_state IN (
                'NORMAL',
                'AWAITING_ORDER_CONFIRMATION',
                'AWAITING_ORDER_NUMBER',
                'AWAITING_IMAGE',
                'AWAITING_CUSTOM_TEXT',
                'AWAITING_SELLER'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_conversation_states_seller
ON public.conversation_states(seller_id);

CREATE INDEX IF NOT EXISTS idx_conversation_states_customer
ON public.conversation_states(customer_id);

CREATE INDEX IF NOT EXISTS idx_conversation_states_expires_at
ON public.conversation_states(expires_at)
WHERE expires_at IS NOT NULL;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '004',
    'create_conversation_states',
    'v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;