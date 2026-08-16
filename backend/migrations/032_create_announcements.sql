-- ============================================================
-- 032_create_announcements.sql
-- Uygulama içi admin duyuruları ve seller bazlı hedef/okundu durumu.
-- seller_notifications kanalından tamamen bağımsızdır.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    audience_type TEXT NOT NULL,
    created_by_profile_id BIGINT NOT NULL
        REFERENCES public.user_profiles(id)
        ON DELETE RESTRICT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_announcements_title
        CHECK (CHAR_LENGTH(BTRIM(title)) BETWEEN 1 AND 200),
    CONSTRAINT chk_announcements_message
        CHECK (CHAR_LENGTH(BTRIM(message)) BETWEEN 1 AND 4000),
    CONSTRAINT chk_announcements_audience_type
        CHECK (audience_type IN ('ALL_SELLERS', 'SELECTED_SELLERS'))
);

CREATE TABLE IF NOT EXISTS public.announcement_targets (
    announcement_id BIGINT NOT NULL
        REFERENCES public.announcements(id)
        ON DELETE CASCADE,
    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (announcement_id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_announcements_published
    ON public.announcements(published_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_announcement_targets_seller
    ON public.announcement_targets(seller_id, announcement_id DESC);

CREATE INDEX IF NOT EXISTS idx_announcement_targets_unread
    ON public.announcement_targets(seller_id, announcement_id DESC)
    WHERE read_at IS NULL;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_targets ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.announcements
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.announcement_targets
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.announcements_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.announcements
    TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.announcement_targets
    TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.announcements_id_seq
    TO service_role;

-- Duyuru ve hedefler aynı PostgreSQL transaction'ında oluşturulur. ALL_SELLERS,
-- projenin canlı hesap tanımı olan active/beta_active seller kayıtlarını
-- materialize eder; seçili kitlede tüm seller kimlikleri insert öncesinde
-- doğrulanır.
CREATE OR REPLACE FUNCTION public.create_announcement(
    creator_profile_id BIGINT,
    title_value TEXT,
    message_value TEXT,
    audience_type_value TEXT,
    seller_ids_value BIGINT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    announcement_row public.announcements%ROWTYPE;
    normalized_title TEXT := BTRIM(title_value);
    normalized_message TEXT := BTRIM(message_value);
    target_count_value INTEGER := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles AS up
        WHERE up.id = creator_profile_id
          AND up.role = 'admin'
          AND up.status = 'active'
    ) THEN
        RETURN jsonb_build_object(
            'status', 'forbidden',
            'message', 'Aktif admin profili bulunamadı.'
        );
    END IF;

    IF normalized_title IS NULL
       OR CHAR_LENGTH(normalized_title) NOT BETWEEN 1 AND 200 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Başlık 1 ile 200 karakter arasında olmalıdır.'
        );
    END IF;

    IF normalized_message IS NULL
       OR CHAR_LENGTH(normalized_message) NOT BETWEEN 1 AND 4000 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Mesaj 1 ile 4000 karakter arasında olmalıdır.'
        );
    END IF;

    IF audience_type_value IS NULL
       OR audience_type_value NOT IN ('ALL_SELLERS', 'SELECTED_SELLERS') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz duyuru hedef kitlesi.'
        );
    END IF;

    IF audience_type_value = 'ALL_SELLERS'
       AND COALESCE(CARDINALITY(seller_ids_value), 0) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Tüm seller kitlesinde seller_ids gönderilemez.'
        );
    END IF;

    IF audience_type_value = 'SELECTED_SELLERS' THEN
        IF COALESCE(CARDINALITY(seller_ids_value), 0) = 0 THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'Seçili seller kitlesi için en az bir seller zorunludur.'
            );
        END IF;

        IF EXISTS (
            SELECT 1
            FROM UNNEST(seller_ids_value) AS requested(seller_id)
            WHERE requested.seller_id IS NULL OR requested.seller_id < 1
        ) THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'seller_ids yalnızca pozitif kimlikler içermelidir.'
            );
        END IF;

        IF CARDINALITY(seller_ids_value) <> (
            SELECT COUNT(DISTINCT requested.seller_id)
            FROM UNNEST(seller_ids_value) AS requested(seller_id)
        ) THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'seller_ids yinelenen kimlik içeremez.'
            );
        END IF;

        IF EXISTS (
            SELECT 1
            FROM UNNEST(seller_ids_value) AS requested(seller_id)
            LEFT JOIN public.sellers AS s
              ON s.id = requested.seller_id
            WHERE s.id IS NULL
        ) THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'Seçili seller kimliklerinden biri bulunamadı.'
            );
        END IF;
    END IF;

    INSERT INTO public.announcements (
        title,
        message,
        audience_type,
        created_by_profile_id
    )
    VALUES (
        normalized_title,
        normalized_message,
        audience_type_value,
        creator_profile_id
    )
    RETURNING * INTO announcement_row;

    IF audience_type_value = 'ALL_SELLERS' THEN
        INSERT INTO public.announcement_targets (announcement_id, seller_id)
        SELECT announcement_row.id, s.id
        FROM public.sellers AS s
        WHERE s.system_status IN ('active', 'beta_active');
    ELSE
        INSERT INTO public.announcement_targets (announcement_id, seller_id)
        SELECT announcement_row.id, requested.seller_id
        FROM UNNEST(seller_ids_value) AS requested(seller_id);
    END IF;

    GET DIAGNOSTICS target_count_value = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'success',
        'announcement', jsonb_build_object(
            'id', announcement_row.id,
            'title', announcement_row.title,
            'message', announcement_row.message,
            'audience_type', announcement_row.audience_type,
            'created_by_profile_id', announcement_row.created_by_profile_id,
            'target_count', target_count_value,
            'read_count', 0,
            'published_at', announcement_row.published_at,
            'created_at', announcement_row.created_at
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_announcements_list(
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    total_count BIGINT := 0;
    items JSONB := '[]'::JSONB;
BEGIN
    IF result_limit IS NULL OR result_limit < 1 OR result_limit > 100
       OR result_offset IS NULL OR result_offset < 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz sayfalama değerleri.'
        );
    END IF;

    SELECT COUNT(*) INTO total_count
    FROM public.announcements;

    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.published_at DESC, p.id DESC), '[]'::JSONB)
    INTO items
    FROM (
        SELECT
            a.id,
            a.title,
            a.message,
            a.audience_type,
            a.created_by_profile_id,
            COUNT(at.seller_id)::INTEGER AS target_count,
            COUNT(at.read_at)::INTEGER AS read_count,
            a.published_at,
            a.created_at
        FROM public.announcements AS a
        LEFT JOIN public.announcement_targets AS at
          ON at.announcement_id = a.id
        GROUP BY a.id
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT result_limit
        OFFSET result_offset
    ) AS p;

    RETURN jsonb_build_object(
        'status', 'success',
        'total', total_count,
        'announcements', items
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_announcement_detail(
    target_announcement_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    announcement_row public.announcements%ROWTYPE;
    target_count_value INTEGER := 0;
    read_count_value INTEGER := 0;
    targets_value JSONB := '[]'::JSONB;
BEGIN
    SELECT a.* INTO announcement_row
    FROM public.announcements AS a
    WHERE a.id = target_announcement_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', 'Duyuru bulunamadı.'
        );
    END IF;

    SELECT
        COUNT(*)::INTEGER,
        COUNT(at.read_at)::INTEGER
    INTO target_count_value, read_count_value
    FROM public.announcement_targets AS at
    WHERE at.announcement_id = announcement_row.id;

    IF announcement_row.audience_type = 'SELECTED_SELLERS' THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'seller', jsonb_build_object(
                        'id', s.id,
                        'name', s.name,
                        'store_name', s.store_name
                    ),
                    'read_at', at.read_at
                )
                ORDER BY s.id ASC
            ),
            '[]'::JSONB
        )
        INTO targets_value
        FROM public.announcement_targets AS at
        JOIN public.sellers AS s
          ON s.id = at.seller_id
        WHERE at.announcement_id = announcement_row.id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'announcement', jsonb_build_object(
            'id', announcement_row.id,
            'title', announcement_row.title,
            'message', announcement_row.message,
            'audience_type', announcement_row.audience_type,
            'created_by_profile_id', announcement_row.created_by_profile_id,
            'target_count', target_count_value,
            'read_count', read_count_value,
            'targets', targets_value,
            'published_at', announcement_row.published_at,
            'created_at', announcement_row.created_at
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_announcements_list(
    target_seller_id BIGINT,
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    total_count BIGINT := 0;
    items JSONB := '[]'::JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR result_limit IS NULL OR result_limit < 1 OR result_limit > 100
       OR result_offset IS NULL OR result_offset < 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz seller veya sayfalama değerleri.'
        );
    END IF;

    SELECT COUNT(*) INTO total_count
    FROM public.announcement_targets AS at
    WHERE at.seller_id = target_seller_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.published_at DESC, p.id DESC), '[]'::JSONB)
    INTO items
    FROM (
        SELECT
            a.id,
            a.title,
            a.message,
            a.audience_type,
            (at.read_at IS NOT NULL) AS is_read,
            at.read_at,
            a.published_at,
            a.created_at
        FROM public.announcement_targets AS at
        JOIN public.announcements AS a
          ON a.id = at.announcement_id
        WHERE at.seller_id = target_seller_id
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT result_limit
        OFFSET result_offset
    ) AS p;

    RETURN jsonb_build_object(
        'status', 'success',
        'total', total_count,
        'announcements', items
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_announcement_detail(
    target_seller_id BIGINT,
    target_announcement_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    item JSONB;
BEGIN
    SELECT jsonb_build_object(
        'id', a.id,
        'title', a.title,
        'message', a.message,
        'audience_type', a.audience_type,
        'is_read', (at.read_at IS NOT NULL),
        'read_at', at.read_at,
        'published_at', a.published_at,
        'created_at', a.created_at
    )
    INTO item
    FROM public.announcement_targets AS at
    JOIN public.announcements AS a
      ON a.id = at.announcement_id
    WHERE at.seller_id = target_seller_id
      AND at.announcement_id = target_announcement_id;

    IF item IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', 'Duyuru bulunamadı.'
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'announcement', item
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_seller_announcement_read(
    target_seller_id BIGINT,
    target_announcement_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    read_at_value TIMESTAMPTZ;
BEGIN
    UPDATE public.announcement_targets AS at
    SET read_at = NOW()
    WHERE at.seller_id = target_seller_id
      AND at.announcement_id = target_announcement_id
      AND at.read_at IS NULL
    RETURNING at.read_at INTO read_at_value;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'announcement_id', target_announcement_id,
            'is_read', TRUE,
            'read_at', read_at_value,
            'changed', TRUE
        );
    END IF;

    SELECT at.read_at INTO read_at_value
    FROM public.announcement_targets AS at
    WHERE at.seller_id = target_seller_id
      AND at.announcement_id = target_announcement_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', 'Duyuru bulunamadı.'
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'announcement_id', target_announcement_id,
        'is_read', TRUE,
        'read_at', read_at_value,
        'changed', FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_announcement(BIGINT, TEXT, TEXT, TEXT, BIGINT[])
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_announcements_list(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_announcement_detail(BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seller_announcements_list(BIGINT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seller_announcement_detail(BIGINT, BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_seller_announcement_read(BIGINT, BIGINT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_announcement(BIGINT, TEXT, TEXT, TEXT, BIGINT[])
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_announcements_list(INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_announcement_detail(BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_announcements_list(BIGINT, INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_announcement_detail(BIGINT, BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_seller_announcement_read(BIGINT, BIGINT)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        INSERT INTO public.schema_migrations (
            version,
            name,
            checksum,
            applied_by
        )
        VALUES (
            '032',
            'create_announcements',
            'announcements_v1',
            CURRENT_USER
        )
        ON CONFLICT (version) DO NOTHING;
    END IF;
END;
$$;

COMMIT;
