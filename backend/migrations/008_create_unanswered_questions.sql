-- 008_create_unanswered_questions.sql
-- Sistem tarafından güvenle cevaplanamayan soruları kaydeder ve gruplanabilir hale getirir.

BEGIN;

CREATE TABLE IF NOT EXISTS public.unanswered_questions (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    customer_id BIGINT
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    source_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    question_text TEXT NOT NULL,

    normalized_question TEXT NOT NULL,

    category VARCHAR(50) NOT NULL DEFAULT 'unclear',

    suggested_field VARCHAR(150),

    times_asked INTEGER NOT NULL DEFAULT 1,

    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,

    resolution_type VARCHAR(30),

    resolved_response TEXT,

    first_asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    last_asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    resolved_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT unanswered_questions_times_asked_check
        CHECK (times_asked >= 1),

    CONSTRAINT unanswered_questions_resolution_consistency_check
        CHECK (
            (is_resolved = FALSE AND resolved_at IS NULL)
            OR
            (is_resolved = TRUE AND resolved_at IS NOT NULL)
        ),

    CONSTRAINT unanswered_questions_resolution_type_check
        CHECK (
            resolution_type IS NULL
            OR resolution_type IN (
                'rule_added',
                'product_info_updated',
                'manual_response',
                'ignored'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_seller_open
ON public.unanswered_questions (
    seller_id,
    is_resolved,
    last_asked_at DESC
);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_normalized
ON public.unanswered_questions (
    seller_id,
    normalized_question
);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_category
ON public.unanswered_questions (
    seller_id,
    category,
    last_asked_at DESC
);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_customer
ON public.unanswered_questions (
    customer_id,
    last_asked_at DESC
)
WHERE customer_id IS NOT NULL;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '008',
    'create_unanswered_questions',
    'v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;