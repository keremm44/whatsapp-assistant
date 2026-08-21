-- 042_extend_announcements_presentation.sql
-- Presentation metadata and tenant-scoped unread counts for announcements.

BEGIN;

ALTER TABLE public.announcements
    ADD COLUMN IF NOT EXISTS importance TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS image_url TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_announcements_importance'
          AND conrelid = 'public.announcements'::regclass
    ) THEN
        ALTER TABLE public.announcements
            ADD CONSTRAINT chk_announcements_importance
            CHECK (importance IN ('NORMAL', 'IMPORTANT'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_announcements_image_url'
          AND conrelid = 'public.announcements'::regclass
    ) THEN
        ALTER TABLE public.announcements
            ADD CONSTRAINT chk_announcements_image_url
            CHECK (
                image_url IS NULL
                OR (
                    CHAR_LENGTH(BTRIM(image_url)) <= 2048
                    AND LEFT(LOWER(BTRIM(image_url)), 8) = 'https://'
                    AND LENGTH(SPLIT_PART(SUBSTRING(BTRIM(image_url) FROM 9), '/', 1)) > 0
                    AND POSITION('@' IN SPLIT_PART(SUBSTRING(BTRIM(image_url) FROM 9), '/', 1)) = 0
                )
            );
    END IF;
END;
$$;

-- The old five-argument function would otherwise remain callable and create
-- rows without the new presentation fields. Replace it with one canonical
-- signature instead of leaving an under-specified overload behind.
DROP FUNCTION IF EXISTS public.create_announcement(BIGINT, TEXT, TEXT, TEXT, BIGINT[]);

CREATE OR REPLACE FUNCTION public.create_announcement(
    creator_profile_id BIGINT,
    title_value TEXT,
    message_value TEXT,
    importance_value TEXT,
    image_url_value TEXT,
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
    normalized_image_url TEXT := NULLIF(BTRIM(image_url_value), '');
    normalized_importance TEXT := COALESCE(NULLIF(BTRIM(importance_value), ''), 'NORMAL');
    target_count_value INTEGER := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles AS up
        WHERE up.id = creator_profile_id AND up.role = 'admin' AND up.status = 'active'
    ) THEN
        RETURN jsonb_build_object('status', 'forbidden', 'message', 'Aktif admin profili bulunamadı.');
    END IF;
    IF normalized_title IS NULL OR CHAR_LENGTH(normalized_title) NOT BETWEEN 1 AND 200 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Başlık 1 ile 200 karakter arasında olmalıdır.');
    END IF;
    IF normalized_message IS NULL OR CHAR_LENGTH(normalized_message) NOT BETWEEN 1 AND 4000 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Mesaj 1 ile 4000 karakter arasında olmalıdır.');
    END IF;
    IF normalized_importance NOT IN ('NORMAL', 'IMPORTANT') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz duyuru önem seviyesi.');
    END IF;
    IF normalized_image_url IS NOT NULL AND (
        CHAR_LENGTH(normalized_image_url) > 2048
        OR LEFT(LOWER(normalized_image_url), 8) <> 'https://'
        OR LENGTH(SPLIT_PART(SUBSTRING(normalized_image_url FROM 9), '/', 1)) = 0
        OR POSITION('@' IN SPLIT_PART(SUBSTRING(normalized_image_url FROM 9), '/', 1)) > 0
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Görsel URL geçerli bir HTTPS URL olmalıdır.');
    END IF;
    IF audience_type_value IS NULL OR audience_type_value NOT IN ('ALL_SELLERS', 'SELECTED_SELLERS') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz duyuru hedef kitlesi.');
    END IF;
    IF audience_type_value = 'ALL_SELLERS' AND COALESCE(CARDINALITY(seller_ids_value), 0) > 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Tüm seller kitlesinde seller_ids gönderilemez.');
    END IF;
    IF audience_type_value = 'SELECTED_SELLERS' THEN
        IF COALESCE(CARDINALITY(seller_ids_value), 0) = 0 THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Seçili seller kitlesi için en az bir seller zorunludur.');
        END IF;
        IF EXISTS (SELECT 1 FROM UNNEST(seller_ids_value) AS requested(seller_id)
                   WHERE requested.seller_id IS NULL OR requested.seller_id < 1) THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'seller_ids yalnızca pozitif kimlikler içermelidir.');
        END IF;
        IF CARDINALITY(seller_ids_value) <> (SELECT COUNT(DISTINCT requested.seller_id)
                                              FROM UNNEST(seller_ids_value) AS requested(seller_id)) THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'seller_ids yinelenen kimlik içeremez.');
        END IF;
        IF EXISTS (SELECT 1 FROM UNNEST(seller_ids_value) AS requested(seller_id)
                   LEFT JOIN public.sellers AS s ON s.id = requested.seller_id
                   WHERE s.id IS NULL) THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Seçili seller kimliklerinden biri bulunamadı.');
        END IF;
    END IF;

    INSERT INTO public.announcements (title, message, importance, image_url, audience_type, created_by_profile_id)
    VALUES (normalized_title, normalized_message, normalized_importance, normalized_image_url,
            audience_type_value, creator_profile_id)
    RETURNING * INTO announcement_row;

    IF audience_type_value = 'ALL_SELLERS' THEN
        INSERT INTO public.announcement_targets (announcement_id, seller_id)
        SELECT announcement_row.id, s.id FROM public.sellers AS s
        WHERE s.system_status IN ('active', 'beta_active');
    ELSE
        INSERT INTO public.announcement_targets (announcement_id, seller_id)
        SELECT announcement_row.id, requested.seller_id
        FROM UNNEST(seller_ids_value) AS requested(seller_id);
    END IF;
    GET DIAGNOSTICS target_count_value = ROW_COUNT;

    RETURN jsonb_build_object('status', 'success', 'announcement', jsonb_build_object(
        'id', announcement_row.id, 'title', announcement_row.title, 'message', announcement_row.message,
        'importance', announcement_row.importance, 'image_url', announcement_row.image_url,
        'audience_type', announcement_row.audience_type,
        'created_by_profile_id', announcement_row.created_by_profile_id,
        'target_count', target_count_value, 'read_count', 0,
        'published_at', announcement_row.published_at, 'created_at', announcement_row.created_at
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_announcements_list(
    result_limit INTEGER DEFAULT 50, result_offset INTEGER DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE total_count BIGINT := 0; items JSONB := '[]'::JSONB;
BEGIN
    IF result_limit IS NULL OR result_limit < 1 OR result_limit > 100 OR result_offset IS NULL OR result_offset < 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz sayfalama değerleri.');
    END IF;
    SELECT COUNT(*) INTO total_count FROM public.announcements;
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.published_at DESC, p.id DESC), '[]'::JSONB) INTO items
    FROM (SELECT a.id, a.title, a.message, a.importance, a.image_url, a.audience_type,
                 a.created_by_profile_id, COUNT(at.seller_id)::INTEGER AS target_count,
                 COUNT(at.read_at)::INTEGER AS read_count, a.published_at, a.created_at
          FROM public.announcements AS a LEFT JOIN public.announcement_targets AS at ON at.announcement_id = a.id
          GROUP BY a.id ORDER BY a.published_at DESC, a.id DESC LIMIT result_limit OFFSET result_offset) AS p;
    RETURN jsonb_build_object('status', 'success', 'total', total_count, 'announcements', items);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_announcement_detail(target_announcement_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE announcement_row public.announcements%ROWTYPE; target_count_value INTEGER := 0; read_count_value INTEGER := 0; targets_value JSONB := '[]'::JSONB;
BEGIN
    SELECT a.* INTO announcement_row FROM public.announcements AS a WHERE a.id = target_announcement_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found', 'message', 'Duyuru bulunamadı.'); END IF;
    SELECT COUNT(*)::INTEGER, COUNT(at.read_at)::INTEGER INTO target_count_value, read_count_value
    FROM public.announcement_targets AS at WHERE at.announcement_id = announcement_row.id;
    IF announcement_row.audience_type = 'SELECTED_SELLERS' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('seller', jsonb_build_object('id', s.id, 'name', s.name, 'store_name', s.store_name), 'read_at', at.read_at) ORDER BY s.id ASC), '[]'::JSONB)
        INTO targets_value FROM public.announcement_targets AS at JOIN public.sellers AS s ON s.id = at.seller_id
        WHERE at.announcement_id = announcement_row.id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'announcement', jsonb_build_object(
        'id', announcement_row.id, 'title', announcement_row.title, 'message', announcement_row.message,
        'importance', announcement_row.importance, 'image_url', announcement_row.image_url,
        'audience_type', announcement_row.audience_type, 'created_by_profile_id', announcement_row.created_by_profile_id,
        'target_count', target_count_value, 'read_count', read_count_value, 'targets', targets_value,
        'published_at', announcement_row.published_at, 'created_at', announcement_row.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_announcements_list(
    target_seller_id BIGINT, result_limit INTEGER DEFAULT 50, result_offset INTEGER DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE total_count BIGINT := 0; unread_count_value BIGINT := 0; items JSONB := '[]'::JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 OR result_limit IS NULL OR result_limit < 1 OR result_limit > 100 OR result_offset IS NULL OR result_offset < 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz seller veya sayfalama değerleri.');
    END IF;
    SELECT COUNT(*) INTO total_count FROM public.announcement_targets AS at WHERE at.seller_id = target_seller_id;
    SELECT COUNT(*) INTO unread_count_value FROM public.announcement_targets AS at
    WHERE at.seller_id = target_seller_id AND at.read_at IS NULL;
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.published_at DESC, p.id DESC), '[]'::JSONB) INTO items
    FROM (SELECT a.id, a.title, a.message, a.importance, a.image_url, a.audience_type,
                 (at.read_at IS NOT NULL) AS is_read, at.read_at, a.published_at, a.created_at
          FROM public.announcement_targets AS at JOIN public.announcements AS a ON a.id = at.announcement_id
          WHERE at.seller_id = target_seller_id ORDER BY a.published_at DESC, a.id DESC LIMIT result_limit OFFSET result_offset) AS p;
    RETURN jsonb_build_object('status', 'success', 'total', total_count, 'unread_count', unread_count_value, 'announcements', items);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_announcement_detail(target_seller_id BIGINT, target_announcement_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item JSONB;
BEGIN
    SELECT jsonb_build_object('id', a.id, 'title', a.title, 'message', a.message, 'importance', a.importance,
        'image_url', a.image_url, 'audience_type', a.audience_type, 'is_read', (at.read_at IS NOT NULL),
        'read_at', at.read_at, 'published_at', a.published_at, 'created_at', a.created_at) INTO item
    FROM public.announcement_targets AS at JOIN public.announcements AS a ON a.id = at.announcement_id
    WHERE at.seller_id = target_seller_id AND at.announcement_id = target_announcement_id;
    IF item IS NULL THEN RETURN jsonb_build_object('status', 'not_found', 'message', 'Duyuru bulunamadı.'); END IF;
    RETURN jsonb_build_object('status', 'success', 'announcement', item);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_announcements_unread_count(target_seller_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE unread_count_value BIGINT := 0;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz seller.');
    END IF;
    SELECT COUNT(*) INTO unread_count_value FROM public.announcement_targets AS at
    WHERE at.seller_id = target_seller_id AND at.read_at IS NULL;
    RETURN jsonb_build_object('status', 'success', 'unread_count', unread_count_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_seller_announcement_read(target_seller_id BIGINT, target_announcement_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE read_at_value TIMESTAMPTZ; unread_count_value BIGINT := 0;
BEGIN
    UPDATE public.announcement_targets AS at SET read_at = NOW()
    WHERE at.seller_id = target_seller_id AND at.announcement_id = target_announcement_id AND at.read_at IS NULL
    RETURNING at.read_at INTO read_at_value;
    IF FOUND THEN
        SELECT COUNT(*) INTO unread_count_value FROM public.announcement_targets AS at
        WHERE at.seller_id = target_seller_id AND at.read_at IS NULL;
        RETURN jsonb_build_object('status', 'success', 'announcement_id', target_announcement_id, 'is_read', TRUE,
            'read_at', read_at_value, 'changed', TRUE, 'unread_count', unread_count_value);
    END IF;
    SELECT at.read_at INTO read_at_value FROM public.announcement_targets AS at
    WHERE at.seller_id = target_seller_id AND at.announcement_id = target_announcement_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found', 'message', 'Duyuru bulunamadı.'); END IF;
    SELECT COUNT(*) INTO unread_count_value FROM public.announcement_targets AS at
    WHERE at.seller_id = target_seller_id AND at.read_at IS NULL;
    RETURN jsonb_build_object('status', 'success', 'announcement_id', target_announcement_id, 'is_read', TRUE,
        'read_at', read_at_value, 'changed', FALSE, 'unread_count', unread_count_value);
END;
$$;

REVOKE ALL ON FUNCTION public.create_announcement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seller_announcements_unread_count(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_announcement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_announcements_unread_count(BIGINT) TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES ('042', 'extend_announcements_presentation', 'v1', CURRENT_USER)
ON CONFLICT (version) DO NOTHING;

COMMIT;
