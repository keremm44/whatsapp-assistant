-- ============================================================
-- 013_add_conversation_control_foundation.sql
-- Konuşma akışından bağımsız, kalıcı kontrol durumu altyapısı
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Mevcut flow state alanlarına dokunmadan kontrol alanlarını ekle.
-- ------------------------------------------------------------

ALTER TABLE public.conversation_states
    ADD COLUMN IF NOT EXISTS control_state TEXT
        NOT NULL DEFAULT 'ASSISTANT_ACTIVE',
    ADD COLUMN IF NOT EXISTS control_changed_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS control_changed_by_profile_id BIGINT,
    ADD COLUMN IF NOT EXISTS control_reason_code VARCHAR(64),
    ADD COLUMN IF NOT EXISTS control_reason_note VARCHAR(500),
    ADD COLUMN IF NOT EXISTS resume_after_message_id BIGINT,
    ADD COLUMN IF NOT EXISTS control_version BIGINT
        NOT NULL DEFAULT 1;

ALTER TABLE public.conversation_states
    DROP CONSTRAINT IF EXISTS conversation_states_control_state_check,
    DROP CONSTRAINT IF EXISTS conversation_states_control_version_check,
    DROP CONSTRAINT IF EXISTS conversation_states_control_reason_code_check,
    DROP CONSTRAINT IF EXISTS conversation_states_control_actor_fk,
    DROP CONSTRAINT IF EXISTS conversation_states_resume_message_fk;

ALTER TABLE public.conversation_states
    ADD CONSTRAINT conversation_states_control_state_check
        CHECK (
            control_state IN (
                'ASSISTANT_ACTIVE',
                'SELLER_TAKEN_OVER',
                'RETURN_REVIEW',
                'ASSISTANT_PAUSED'
            )
        ),
    ADD CONSTRAINT conversation_states_control_version_check
        CHECK (control_version > 0),
    ADD CONSTRAINT conversation_states_control_reason_code_check
        CHECK (
            control_reason_code IS NULL OR
            control_reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
        ),
    ADD CONSTRAINT conversation_states_control_actor_fk
        FOREIGN KEY (control_changed_by_profile_id)
        REFERENCES public.user_profiles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    ADD CONSTRAINT conversation_states_resume_message_fk
        FOREIGN KEY (resume_after_message_id)
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_states_control_queue
ON public.conversation_states(
    seller_id,
    control_state,
    control_changed_at DESC
);


-- ------------------------------------------------------------
-- 2. Flow audit tablosundan ayrı kontrol geçiş geçmişi.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversation_control_transitions (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    customer_id BIGINT NOT NULL
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    from_control_state TEXT NOT NULL,
    to_control_state TEXT NOT NULL,

    changed_by_profile_id BIGINT
        REFERENCES public.user_profiles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    reason_code VARCHAR(64) NOT NULL,
    reason_note VARCHAR(500),

    trigger_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    previous_resume_after_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    new_resume_after_message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    previous_version BIGINT NOT NULL,
    new_version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT conversation_control_transitions_from_state_check
        CHECK (
            from_control_state IN (
                'ASSISTANT_ACTIVE',
                'SELLER_TAKEN_OVER',
                'RETURN_REVIEW',
                'ASSISTANT_PAUSED'
            )
        ),

    CONSTRAINT conversation_control_transitions_to_state_check
        CHECK (
            to_control_state IN (
                'ASSISTANT_ACTIVE',
                'SELLER_TAKEN_OVER',
                'RETURN_REVIEW',
                'ASSISTANT_PAUSED'
            )
        ),

    CONSTRAINT conversation_control_transitions_reason_code_check
        CHECK (reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),

    CONSTRAINT conversation_control_transitions_version_check
        CHECK (
            previous_version > 0 AND
            new_version = previous_version + 1
        )
);

CREATE INDEX IF NOT EXISTS idx_control_transitions_conversation
ON public.conversation_control_transitions(
    seller_id,
    customer_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_control_transitions_trigger_message
ON public.conversation_control_transitions(trigger_message_id)
WHERE trigger_message_id IS NOT NULL;


-- ------------------------------------------------------------
-- 3. Genel kontrol geçişi.
--
-- Satır kilidi, optimistic concurrency, state update ve audit insert
-- aynı PostgreSQL transaction'ında gerçekleşir. Aynı state isteği
-- version artırmayan ve audit yazmayan idempotent no-op'tur.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_conversation_control(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    target_control_state TEXT,
    transition_reason_code TEXT,
    transition_reason_note TEXT DEFAULT NULL,
    actor_profile_id BIGINT DEFAULT NULL,
    transition_trigger_message_id BIGINT DEFAULT NULL,
    target_resume_after_message_id BIGINT DEFAULT NULL,
    expected_control_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    control_row public.conversation_states%ROWTYPE;
    previous_control_state TEXT;
    previous_resume_after_message_id BIGINT;
    next_resume_after_message_id BIGINT;
    transition_id BIGINT;
BEGIN
    IF target_control_state NOT IN (
        'ASSISTANT_ACTIVE',
        'SELLER_TAKEN_OVER',
        'RETURN_REVIEW',
        'ASSISTANT_PAUSED'
    ) THEN
        RAISE EXCEPTION 'Geçersiz konuşma kontrol durumu.';
    END IF;

    IF transition_reason_code IS NULL
       OR transition_reason_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
        RAISE EXCEPTION 'Geçersiz konuşma kontrol neden kodu.';
    END IF;

    IF transition_reason_note IS NOT NULL
       AND char_length(transition_reason_note) > 500 THEN
        RAISE EXCEPTION 'Konuşma kontrol neden notu çok uzun.';
    END IF;

    SELECT *
    INTO control_row
    FROM public.conversation_states
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF expected_control_version IS NOT NULL
       AND control_row.control_version <> expected_control_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'control', jsonb_build_object(
                'control_state', control_row.control_state,
                'control_changed_at', control_row.control_changed_at,
                'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
                'control_reason_code', control_row.control_reason_code,
                'control_reason_note', control_row.control_reason_note,
                'resume_after_message_id', control_row.resume_after_message_id,
                'control_version', control_row.control_version
            )
        );
    END IF;

    IF actor_profile_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = actor_profile_id
          AND seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF control_row.control_state = target_control_state THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'control', jsonb_build_object(
                'control_state', control_row.control_state,
                'control_changed_at', control_row.control_changed_at,
                'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
                'control_reason_code', control_row.control_reason_code,
                'control_reason_note', control_row.control_reason_note,
                'resume_after_message_id', control_row.resume_after_message_id,
                'control_version', control_row.control_version
            )
        );
    END IF;

    IF transition_trigger_message_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.messages
        WHERE id = transition_trigger_message_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF target_resume_after_message_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.messages
        WHERE id = target_resume_after_message_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    next_resume_after_message_id := COALESCE(
        target_resume_after_message_id,
        control_row.resume_after_message_id
    );
    previous_control_state := control_row.control_state;
    previous_resume_after_message_id := control_row.resume_after_message_id;

    UPDATE public.conversation_states
    SET
        control_state = target_control_state,
        control_changed_at = NOW(),
        control_changed_by_profile_id = actor_profile_id,
        control_reason_code = transition_reason_code,
        control_reason_note = transition_reason_note,
        resume_after_message_id = next_resume_after_message_id,
        control_version = control_version + 1
    WHERE id = control_row.id
    RETURNING * INTO control_row;

    INSERT INTO public.conversation_control_transitions (
        seller_id,
        customer_id,
        from_control_state,
        to_control_state,
        changed_by_profile_id,
        reason_code,
        reason_note,
        trigger_message_id,
        previous_resume_after_message_id,
        new_resume_after_message_id,
        previous_version,
        new_version
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        previous_control_state,
        target_control_state,
        actor_profile_id,
        transition_reason_code,
        transition_reason_note,
        transition_trigger_message_id,
        previous_resume_after_message_id,
        next_resume_after_message_id,
        control_row.control_version - 1,
        control_row.control_version
    )
    RETURNING id INTO transition_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'transition_id', transition_id,
        'control', jsonb_build_object(
            'control_state', control_row.control_state,
            'control_changed_at', control_row.control_changed_at,
            'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
            'control_reason_code', control_row.control_reason_code,
            'control_reason_note', control_row.control_reason_note,
            'resume_after_message_id', control_row.resume_after_message_id,
            'control_version', control_row.control_version
        )
    );
END;
$$;


-- ------------------------------------------------------------
-- 4. Asistana geri bırakma.
--
-- Son incoming mesaj kimliği, kontrol satırı kilitliyken alınır. Böylece
-- geri bırakma öncesindeki mesajlar daha sonra otomatik işlenmez.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resume_conversation_assistant(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    transition_reason_code TEXT,
    transition_reason_note TEXT DEFAULT NULL,
    actor_profile_id BIGINT DEFAULT NULL,
    expected_control_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    control_row public.conversation_states%ROWTYPE;
    previous_control_state TEXT;
    previous_resume_after_message_id BIGINT;
    snapshot_message_id BIGINT;
    transition_id BIGINT;
BEGIN
    IF transition_reason_code IS NULL
       OR transition_reason_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
        RAISE EXCEPTION 'Geçersiz konuşma kontrol neden kodu.';
    END IF;

    IF transition_reason_note IS NOT NULL
       AND char_length(transition_reason_note) > 500 THEN
        RAISE EXCEPTION 'Konuşma kontrol neden notu çok uzun.';
    END IF;

    SELECT *
    INTO control_row
    FROM public.conversation_states
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF expected_control_version IS NOT NULL
       AND control_row.control_version <> expected_control_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'control', jsonb_build_object(
                'control_state', control_row.control_state,
                'control_changed_at', control_row.control_changed_at,
                'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
                'control_reason_code', control_row.control_reason_code,
                'control_reason_note', control_row.control_reason_note,
                'resume_after_message_id', control_row.resume_after_message_id,
                'control_version', control_row.control_version
            )
        );
    END IF;

    IF actor_profile_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = actor_profile_id
          AND seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF control_row.control_state = 'ASSISTANT_ACTIVE' THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'control', jsonb_build_object(
                'control_state', control_row.control_state,
                'control_changed_at', control_row.control_changed_at,
                'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
                'control_reason_code', control_row.control_reason_code,
                'control_reason_note', control_row.control_reason_note,
                'resume_after_message_id', control_row.resume_after_message_id,
                'control_version', control_row.control_version
            )
        );
    END IF;

    SELECT MAX(id)
    INTO snapshot_message_id
    FROM public.messages
    WHERE seller_id = target_seller_id
      AND customer_id = target_customer_id
      AND direction = 'incoming';

    previous_control_state := control_row.control_state;
    previous_resume_after_message_id := control_row.resume_after_message_id;

    UPDATE public.conversation_states
    SET
        control_state = 'ASSISTANT_ACTIVE',
        control_changed_at = NOW(),
        control_changed_by_profile_id = actor_profile_id,
        control_reason_code = transition_reason_code,
        control_reason_note = transition_reason_note,
        resume_after_message_id = snapshot_message_id,
        control_version = control_version + 1
    WHERE id = control_row.id
    RETURNING * INTO control_row;

    INSERT INTO public.conversation_control_transitions (
        seller_id,
        customer_id,
        from_control_state,
        to_control_state,
        changed_by_profile_id,
        reason_code,
        reason_note,
        trigger_message_id,
        previous_resume_after_message_id,
        new_resume_after_message_id,
        previous_version,
        new_version
    )
    VALUES (
        target_seller_id,
        target_customer_id,
        previous_control_state,
        'ASSISTANT_ACTIVE',
        actor_profile_id,
        transition_reason_code,
        transition_reason_note,
        snapshot_message_id,
        previous_resume_after_message_id,
        snapshot_message_id,
        control_row.control_version - 1,
        control_row.control_version
    )
    RETURNING id INTO transition_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'transition_id', transition_id,
        'control', jsonb_build_object(
            'control_state', control_row.control_state,
            'control_changed_at', control_row.control_changed_at,
            'control_changed_by_profile_id', control_row.control_changed_by_profile_id,
            'control_reason_code', control_row.control_reason_code,
            'control_reason_note', control_row.control_reason_note,
            'resume_after_message_id', control_row.resume_after_message_id,
            'control_version', control_row.control_version
        )
    );
END;
$$;


-- ------------------------------------------------------------
-- 5. Backend-only erişim modeli.
-- ------------------------------------------------------------

ALTER TABLE public.conversation_control_transitions
ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.conversation_control_transitions
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE public.conversation_control_transitions_id_seq
FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.conversation_control_transitions
TO service_role;

GRANT ALL PRIVILEGES ON SEQUENCE public.conversation_control_transitions_id_seq
TO service_role;

REVOKE EXECUTE ON FUNCTION public.transition_conversation_control(
    BIGINT,
    BIGINT,
    TEXT,
    TEXT,
    TEXT,
    BIGINT,
    BIGINT,
    BIGINT,
    BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transition_conversation_control(
    BIGINT,
    BIGINT,
    TEXT,
    TEXT,
    TEXT,
    BIGINT,
    BIGINT,
    BIGINT,
    BIGINT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.resume_conversation_assistant(
    BIGINT,
    BIGINT,
    TEXT,
    TEXT,
    BIGINT,
    BIGINT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resume_conversation_assistant(
    BIGINT,
    BIGINT,
    TEXT,
    TEXT,
    BIGINT,
    BIGINT
)
TO service_role;


-- ------------------------------------------------------------
-- 6. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '013',
    'add_conversation_control_foundation',
    'conversation_control_v1_atomic',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;