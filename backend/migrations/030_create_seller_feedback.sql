-- ============================================================
-- 030_create_seller_feedback.sql
-- Seller -> admin product/service feedback workflow.
--
-- This migration is repository-only in this implementation pass. It must be
-- reviewed and applied separately; no live Supabase write is performed here.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.seller_feedback (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    category VARCHAR(16) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message VARCHAR(4000) NOT NULL,

    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    admin_note VARCHAR(4000),
    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    CONSTRAINT seller_feedback_category_check
        CHECK (category IN ('suggestion', 'problem', 'complaint', 'other')),

    CONSTRAINT seller_feedback_subject_check
        CHECK (
            subject = BTRIM(subject)
            AND char_length(subject) BETWEEN 1 AND 200
        ),

    CONSTRAINT seller_feedback_message_check
        CHECK (
            message = BTRIM(message)
            AND char_length(message) BETWEEN 1 AND 4000
        ),

    CONSTRAINT seller_feedback_admin_note_check
        CHECK (
            admin_note IS NULL
            OR (
                admin_note = BTRIM(admin_note)
                AND char_length(admin_note) BETWEEN 1 AND 4000
            )
        ),

    CONSTRAINT seller_feedback_status_check
        CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED')),

    CONSTRAINT seller_feedback_version_check
        CHECK (version >= 1),

    CONSTRAINT seller_feedback_resolution_check
        CHECK (
            (status = 'RESOLVED' AND resolved_at IS NOT NULL)
            OR
            (status <> 'RESOLVED' AND resolved_at IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_seller_feedback_seller_created
    ON public.seller_feedback(seller_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_seller_feedback_admin_status_created
    ON public.seller_feedback(status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_seller_feedback_admin_category_created
    ON public.seller_feedback(category, created_at DESC, id DESC);

DROP TRIGGER IF EXISTS trg_seller_feedback_updated_at
    ON public.seller_feedback;

CREATE TRIGGER trg_seller_feedback_updated_at
BEFORE UPDATE ON public.seller_feedback
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.seller_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.seller_feedback
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.seller_feedback_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.seller_feedback
    TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.seller_feedback_id_seq
    TO service_role;


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
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz seller kimliği.'
        );
    END IF;

    IF category_value IS NULL
       OR category_value NOT IN ('suggestion', 'problem', 'complaint', 'other') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz feedback kategorisi.'
        );
    END IF;

    IF normalized_subject IS NULL
       OR char_length(normalized_subject) NOT BETWEEN 1 AND 200 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Konu 1-200 karakter olmalıdır.'
        );
    END IF;

    IF normalized_message IS NULL
       OR char_length(normalized_message) NOT BETWEEN 1 AND 4000 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Mesaj 1-4000 karakter olmalıdır.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.sellers s
        WHERE s.id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    INSERT INTO public.seller_feedback (
        seller_id,
        category,
        subject,
        message
    )
    VALUES (
        target_seller_id,
        category_value,
        normalized_subject,
        normalized_message
    )
    RETURNING * INTO feedback_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'feedback', jsonb_build_object(
            'id', feedback_row.id,
            'category', feedback_row.category,
            'subject', feedback_row.subject,
            'message', feedback_row.message,
            'status', feedback_row.status,
            'version', feedback_row.version,
            'created_at', feedback_row.created_at,
            'updated_at', feedback_row.updated_at,
            'resolved_at', feedback_row.resolved_at
        )
    );
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
            'status', feedback_row.status,
            'version', feedback_row.version,
            'created_at', feedback_row.created_at,
            'updated_at', feedback_row.updated_at,
            'resolved_at', feedback_row.resolved_at
        )
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_admin_feedback_list(
    status_filter TEXT DEFAULT NULL,
    category_filter TEXT DEFAULT NULL,
    seller_id_filter BIGINT DEFAULT NULL,
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
    IF (status_filter IS NOT NULL
        AND status_filter NOT IN ('OPEN', 'IN_REVIEW', 'RESOLVED'))
       OR (category_filter IS NOT NULL
        AND category_filter NOT IN ('suggestion', 'problem', 'complaint', 'other'))
       OR (seller_id_filter IS NOT NULL AND seller_id_filter <= 0)
       OR result_limit IS NULL OR result_limit < 1 OR result_limit > 100
       OR result_offset IS NULL OR result_offset < 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz admin feedback liste parametreleri.'
        );
    END IF;

    WITH filtered AS (
        SELECT
            sf.*,
            s.name AS seller_name,
            s.store_name AS seller_store_name
        FROM public.seller_feedback sf
        JOIN public.sellers s ON s.id = sf.seller_id
        WHERE (status_filter IS NULL OR sf.status = status_filter)
          AND (category_filter IS NULL OR sf.category = category_filter)
          AND (seller_id_filter IS NULL OR sf.seller_id = seller_id_filter)
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
                        'seller', jsonb_build_object(
                            'id', p.seller_id,
                            'name', p.seller_name,
                            'store_name', p.seller_store_name
                        ),
                        'category', p.category,
                        'subject', p.subject,
                        'message', p.message,
                        'status', p.status,
                        'admin_note', p.admin_note,
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


CREATE OR REPLACE FUNCTION public.update_admin_feedback(
    target_feedback_id BIGINT,
    expected_version_value BIGINT,
    update_status BOOLEAN DEFAULT FALSE,
    status_value TEXT DEFAULT NULL,
    update_admin_note BOOLEAN DEFAULT FALSE,
    admin_note_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    feedback_row public.seller_feedback%ROWTYPE;
    next_status TEXT;
    next_admin_note TEXT;
    normalized_admin_note TEXT;
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

    IF NOT update_status AND NOT update_admin_note THEN
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

    changed_value := next_status IS DISTINCT FROM feedback_row.status
        OR next_admin_note IS DISTINCT FROM feedback_row.admin_note;

    IF changed_value THEN
        UPDATE public.seller_feedback sf
        SET status = next_status,
            admin_note = next_admin_note,
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
            'version', feedback_row.version,
            'created_at', feedback_row.created_at,
            'updated_at', feedback_row.updated_at,
            'resolved_at', feedback_row.resolved_at
        )
    );
END;
$$;


REVOKE ALL ON FUNCTION public.create_seller_feedback(BIGINT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seller_feedback_list(BIGINT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seller_feedback_detail(BIGINT, BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_feedback_list(TEXT, TEXT, BIGINT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_feedback_detail(BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_admin_feedback(BIGINT, BIGINT, BOOLEAN, TEXT, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_seller_feedback(BIGINT, TEXT, TEXT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_feedback_list(BIGINT, INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_feedback_detail(BIGINT, BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_feedback_list(TEXT, TEXT, BIGINT, INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_feedback_detail(BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.update_admin_feedback(BIGINT, BIGINT, BOOLEAN, TEXT, BOOLEAN, TEXT)
    TO service_role;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '030',
    'create_seller_feedback',
    'seller_feedback_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
