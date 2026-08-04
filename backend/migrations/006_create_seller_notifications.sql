-- 006_create_seller_notifications.sql
-- Satıcı panelinde gösterilecek kalıcı bildirimleri saklar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.seller_notifications (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    customer_id BIGINT
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    type VARCHAR(50) NOT NULL,

    severity VARCHAR(20) NOT NULL DEFAULT 'info',

    title VARCHAR(200) NOT NULL,

    message TEXT NOT NULL,

    related_entity_type VARCHAR(50),

    related_entity_id BIGINT,

    action_url VARCHAR(500),

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    read_at TIMESTAMPTZ,

    is_actioned BOOLEAN NOT NULL DEFAULT FALSE,

    actioned_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ,

    CONSTRAINT seller_notifications_type_check
        CHECK (
            type IN (
                'new_order',
                'unanswered_question',
                'violation',
                'return_request',
                'complex_question',
                'system'
            )
        ),

    CONSTRAINT seller_notifications_severity_check
        CHECK (
            severity IN (
                'info',
                'warning',
                'urgent'
            )
        ),

    CONSTRAINT seller_notifications_read_consistency_check
        CHECK (
            (is_read = FALSE AND read_at IS NULL)
            OR
            (is_read = TRUE AND read_at IS NOT NULL)
        ),

    CONSTRAINT seller_notifications_action_consistency_check
        CHECK (
            (is_actioned = FALSE AND actioned_at IS NULL)
            OR
            (is_actioned = TRUE AND actioned_at IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_seller_notifications_unread
ON public.seller_notifications (
    seller_id,
    is_read,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_seller_notifications_type
ON public.seller_notifications (
    seller_id,
    type,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_seller_notifications_customer
ON public.seller_notifications (
    customer_id,
    created_at DESC
)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_notifications_expires
ON public.seller_notifications (expires_at)
WHERE expires_at IS NOT NULL;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '006',
    'create_seller_notifications',
    'v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;