-- 043_add_feedback_public_reply.sql
-- Keeps admin_note private and adds a separately persisted seller-facing reply.

BEGIN;

ALTER TABLE public.seller_feedback
    ADD COLUMN IF NOT EXISTS admin_reply VARCHAR(4000),
    ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'seller_feedback_admin_reply_check'
          AND conrelid = 'public.seller_feedback'::regclass
    ) THEN
        ALTER TABLE public.seller_feedback
            ADD CONSTRAINT seller_feedback_admin_reply_check
            CHECK (
                admin_reply IS NULL
                OR (admin_reply = BTRIM(admin_reply) AND char_length(admin_reply) BETWEEN 1 AND 4000)
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'seller_feedback_admin_reply_timestamp_check'
          AND conrelid = 'public.seller_feedback'::regclass
    ) THEN
        ALTER TABLE public.seller_feedback
            ADD CONSTRAINT seller_feedback_admin_reply_timestamp_check
            CHECK (
                (admin_reply IS NULL AND admin_replied_at IS NULL)
                OR (admin_reply IS NOT NULL AND admin_replied_at IS NOT NULL)
            );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_seller_feedback(
    target_seller_id BIGINT,
    category_value TEXT,
    subject_value TEXT,
    message_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    feedback_row public.seller_feedback%ROWTYPE;
    normalized_subject TEXT := BTRIM(subject_value);
    normalized_message TEXT := BTRIM(message_value);
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR category_value IS NULL
       OR category_value NOT IN ('suggestion', 'problem', 'complaint', 'other')
       OR normalized_subject IS NULL
       OR char_length(normalized_subject) NOT BETWEEN 1 AND 200
       OR normalized_message IS NULL
       OR char_length(normalized_message) NOT BETWEEN 1 AND 4000 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz feedback bilgileri.');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = target_seller_id) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    INSERT INTO public.seller_feedback (seller_id, category, subject, message)
    VALUES (target_seller_id, category_value, normalized_subject, normalized_message)
    RETURNING * INTO feedback_row;
    RETURN jsonb_build_object('status', 'success', 'feedback', jsonb_build_object(
        'id', feedback_row.id, 'category', feedback_row.category, 'subject', feedback_row.subject,
        'message', feedback_row.message, 'admin_reply', feedback_row.admin_reply,
        'admin_replied_at', feedback_row.admin_replied_at, 'status', feedback_row.status,
        'version', feedback_row.version, 'created_at', feedback_row.created_at,
        'updated_at', feedback_row.updated_at, 'resolved_at', feedback_row.resolved_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_feedback_list(
    target_seller_id BIGINT,
    result_limit INTEGER DEFAULT 20,
    result_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    payload JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR result_limit IS NULL OR result_limit < 1 OR result_limit > 100
       OR result_offset IS NULL OR result_offset < 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz feedback liste parametreleri.'
        );
    END IF;

    WITH filtered AS (
        SELECT sf.*
        FROM public.seller_feedback sf
        WHERE sf.seller_id = target_seller_id
    ),
    paged AS (
        SELECT f.*
        FROM filtered f
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT result_limit
        OFFSET result_offset
    )
    SELECT jsonb_build_object(
        'status', 'success',
        'total', (SELECT COUNT(*) FROM filtered),
        'feedback', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', p.id,
                        'category', p.category,
                        'subject', p.subject,
                        'message', p.message,
                        'admin_reply', p.admin_reply,
                        'admin_replied_at', p.admin_replied_at,
                        'status', p.status,
                        'version', p.version,
                        'created_at', p.created_at,
                        'updated_at', p.updated_at,
                        'resolved_at', p.resolved_at
                    )
                    ORDER BY p.created_at DESC, p.id DESC
                )
                FROM paged p
            ),
            '[]'::jsonb
        )
    ) INTO payload;

    RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_feedback_detail(
    target_seller_id BIGINT,
    target_feedback_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    feedback_row public.seller_feedback%ROWTYPE;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_feedback_id IS NULL OR target_feedback_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz feedback kimliği.'
        );
    END IF;

    SELECT sf.*
    INTO feedback_row
    FROM public.seller_feedback sf
    WHERE sf.id = target_feedback_id
      AND sf.seller_id = target_seller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'feedback', jsonb_build_object(
            'id', feedback_row.id,
            'category', feedback_row.category,
            'subject', feedback_row.subject,
            'message', feedback_row.message,
            'admin_reply', feedback_row.admin_reply,
            'admin_replied_at', feedback_row.admin_replied_at,
            'status', feedback_row.status,
            'version', feedback_row.version,
            'created_at', feedback_row.created_at,
            'updated_at', feedback_row.updated_at,
            'resolved_at', feedback_row.resolved_at
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_feedback_detail(
    target_feedback_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    feedback_row public.seller_feedback%ROWTYPE;
    seller_name_value TEXT;
    seller_store_name_value TEXT;
BEGIN
    IF target_feedback_id IS NULL OR target_feedback_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz feedback kimliği.'
        );
    END IF;

    SELECT sf.*
    INTO feedback_row
    FROM public.seller_feedback sf
    WHERE sf.id = target_feedback_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT s.name, s.store_name
    INTO seller_name_value, seller_store_name_value
    FROM public.sellers s
    WHERE s.id = feedback_row.seller_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'feedback', jsonb_build_object(
            'id', feedback_row.id,
            'seller', jsonb_build_object(
                'id', feedback_row.seller_id,
                'name', seller_name_value,
                'store_name', seller_store_name_value
            ),
            'category', feedback_row.category,
            'subject', feedback_row.subject,
            'message', feedback_row.message,
            'admin_reply', feedback_row.admin_reply,
            'admin_replied_at', feedback_row.admin_replied_at,
            'status', feedback_row.status,
            'admin_note', feedback_row.admin_note,
            'version', feedback_row.version,
            'created_at', feedback_row.created_at,
            'updated_at', feedback_row.updated_at,
            'resolved_at', feedback_row.resolved_at
        )
    );
END;
$$;

DROP FUNCTION IF EXISTS public.update_admin_feedback(BIGINT, BIGINT, BOOLEAN, TEXT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.update_admin_feedback(
    target_feedback_id BIGINT,
    expected_version_value BIGINT,
    update_status BOOLEAN DEFAULT FALSE,
    status_value TEXT DEFAULT NULL,
    update_admin_note BOOLEAN DEFAULT FALSE,
    admin_note_value TEXT DEFAULT NULL,
    update_admin_reply BOOLEAN DEFAULT FALSE,
    admin_reply_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    feedback_row public.seller_feedback%ROWTYPE;
    next_status TEXT;
    next_admin_note TEXT;
    next_admin_reply TEXT;
    normalized_admin_note TEXT;
    normalized_admin_reply TEXT;
    changed_value BOOLEAN;
    seller_name_value TEXT;
    seller_store_name_value TEXT;
BEGIN
    IF target_feedback_id IS NULL OR target_feedback_id <= 0
       OR expected_version_value IS NULL OR expected_version_value <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz feedback güncelleme parametreleri.'
        );
    END IF;

    IF NOT update_status AND NOT update_admin_note AND NOT update_admin_reply THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'En az bir feedback alanı değiştirilmelidir.'
        );
    END IF;

    IF update_status
       AND (status_value IS NULL
            OR status_value NOT IN ('OPEN', 'IN_REVIEW', 'RESOLVED')) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz feedback durumu.'
        );
    END IF;

    IF update_admin_note AND admin_note_value IS NOT NULL THEN
        normalized_admin_note := BTRIM(admin_note_value);
        IF char_length(normalized_admin_note) NOT BETWEEN 1 AND 4000 THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'Admin notu 1-4000 karakter olmalı veya null olmalıdır.'
            );
        END IF;
    END IF;

    IF update_admin_reply AND admin_reply_value IS NOT NULL THEN
        normalized_admin_reply := BTRIM(admin_reply_value);
        IF char_length(normalized_admin_reply) NOT BETWEEN 1 AND 4000 THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'Satıcı mesajı 1-4000 karakter olmalı veya null olmalıdır.'
            );
        END IF;
    END IF;

    SELECT sf.*
    INTO feedback_row
    FROM public.seller_feedback sf
    WHERE sf.id = target_feedback_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF feedback_row.version <> expected_version_value THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'reason', 'stale_version',
            'current_version', feedback_row.version
        );
    END IF;

    next_status := CASE
        WHEN update_status THEN status_value
        ELSE feedback_row.status
    END;
    next_admin_note := CASE
        WHEN update_admin_note THEN normalized_admin_note
        ELSE feedback_row.admin_note
    END;
    next_admin_reply := CASE
        WHEN update_admin_reply THEN normalized_admin_reply
        ELSE feedback_row.admin_reply
    END;

    changed_value := next_status IS DISTINCT FROM feedback_row.status
        OR next_admin_note IS DISTINCT FROM feedback_row.admin_note
        OR next_admin_reply IS DISTINCT FROM feedback_row.admin_reply;

    IF changed_value THEN
        UPDATE public.seller_feedback sf
        SET status = next_status,
            admin_note = next_admin_note,
            admin_reply = next_admin_reply,
            admin_replied_at = CASE
                WHEN next_admin_reply IS NULL THEN NULL
                WHEN feedback_row.admin_reply IS NULL THEN NOW()
                ELSE feedback_row.admin_replied_at
            END,
            resolved_at = CASE
                WHEN next_status = 'RESOLVED'
                    THEN COALESCE(feedback_row.resolved_at, NOW())
                ELSE NULL
            END,
            version = sf.version + 1,
            updated_at = NOW()
        WHERE sf.id = target_feedback_id
        RETURNING sf.* INTO feedback_row;
    END IF;

    SELECT s.name, s.store_name
    INTO seller_name_value, seller_store_name_value
    FROM public.sellers s
    WHERE s.id = feedback_row.seller_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', changed_value,
        'feedback', jsonb_build_object(
            'id', feedback_row.id,
            'seller', jsonb_build_object(
                'id', feedback_row.seller_id,
                'name', seller_name_value,
                'store_name', seller_store_name_value
            ),
            'category', feedback_row.category,
            'subject', feedback_row.subject,
            'message', feedback_row.message,
            'status', feedback_row.status,
            'admin_note', feedback_row.admin_note,
            'admin_reply', feedback_row.admin_reply,
            'admin_replied_at', feedback_row.admin_replied_at,
            'version', feedback_row.version,
            'created_at', feedback_row.created_at,
            'updated_at', feedback_row.updated_at,
            'resolved_at', feedback_row.resolved_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_admin_feedback(BIGINT, BIGINT, BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_feedback(BIGINT, BIGINT, BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT)
    TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('043', 'add_feedback_public_reply', 'v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;

COMMIT;
