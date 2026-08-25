-- ============================================================
-- 022_finalize_admin_seller_invitation.sql
-- Admin onaylı başvurudan seller + onboarding + invited profile
-- kayıtlarını tek DB transaction'ında oluşturur.
--
-- Supabase Auth daveti uygulama katmanında önce oluşturulur. Bu RPC yalnızca
-- DB tarafındaki kalıcı kayıtları atomik olarak finalize eder.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_seller_invitation_from_application(
    target_application_id BIGINT,
    target_auth_user_id UUID,
    invite_email TEXT,
    admin_note_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    application_row public.seller_applications%ROWTYPE;
    seller_row public.sellers%ROWTYPE;
    profile_row public.user_profiles%ROWTYPE;
    normalized_email TEXT;
    new_seller_id BIGINT;
BEGIN
    IF target_application_id IS NULL OR target_application_id <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçersiz application kimliği.'
        );
    END IF;

    IF target_auth_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Auth kullanıcı kimliği zorunludur.'
        );
    END IF;

    normalized_email := lower(btrim(invite_email));

    IF normalized_email IS NULL
       OR normalized_email = ''
       OR char_length(normalized_email) > 254
       OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Geçerli bir davet e-postası zorunludur.'
        );
    END IF;

    SELECT application.*
    INTO application_row
    FROM public.seller_applications AS application
    WHERE application.id = target_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF application_row.status = 'approved'
       AND application_row.approved_seller_id IS NOT NULL
    THEN
        SELECT seller.*
        INTO seller_row
        FROM public.sellers AS seller
        WHERE seller.id = application_row.approved_seller_id;

        SELECT profile.*
        INTO profile_row
        FROM public.user_profiles AS profile
        WHERE profile.role = 'seller'
          AND profile.seller_id = application_row.approved_seller_id
        LIMIT 1;

        IF seller_row.id IS NULL OR profile_row.id IS NULL THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'message', 'Onaylanmış başvuru seller/profile bağlantısı eksik.'
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'already_invited',
            'application', jsonb_build_object(
                'id', application_row.id,
                'status', application_row.status,
                'email', application_row.email,
                'approved_seller_id', application_row.approved_seller_id,
                'approved_at', application_row.approved_at
            ),
            'seller', jsonb_build_object(
                'id', seller_row.id,
                'name', seller_row.name,
                'email', seller_row.email,
                'phone', seller_row.phone,
                'store_name', seller_row.store_name,
                'store_link', seller_row.store_link,
                'system_status', seller_row.system_status,
                'onboarding_status', seller_row.onboarding_status,
                'current_onboarding_step', seller_row.current_onboarding_step,
                'onboarding_completed', seller_row.onboarding_completed,
                'ai_enabled', seller_row.ai_enabled
            ),
            'profile', jsonb_build_object(
                'id', profile_row.id,
                'auth_user_id', profile_row.auth_user_id,
                'email', profile_row.email,
                'full_name', profile_row.full_name,
                'role', profile_row.role,
                'status', profile_row.status,
                'seller_id', profile_row.seller_id
            )
        );
    END IF;

    IF application_row.status NOT IN ('pending', 'contacted') THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Yalnızca pending veya contacted başvurular davet edilebilir.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.user_profiles AS p
        WHERE p.auth_user_id = target_auth_user_id
           OR lower(p.email) = normalized_email
    ) THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Bu Auth kullanıcısı veya e-posta zaten bir profile bağlı.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.seller_applications AS other_application
        WHERE other_application.id <> application_row.id
          AND other_application.status IN ('pending', 'contacted')
          AND other_application.email IS NOT NULL
          AND lower(btrim(other_application.email)) = normalized_email
    ) THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Aynı e-posta ile başka bir açık seller application bulunuyor.'
        );
    END IF;

    INSERT INTO public.sellers (
        name,
        email,
        phone,
        store_name,
        status,
        store_link,
        account_type,
        system_status,
        payment_required,
        special_pricing,
        activation_requires_admin,
        onboarding_status,
        current_onboarding_step,
        onboarding_completed,
        ai_enabled,
        emergency_paused
    )
    VALUES (
        application_row.full_name,
        normalized_email,
        application_row.phone,
        application_row.store_name,
        'pending',
        application_row.store_link,
        'standard',
        'onboarding',
        TRUE,
        FALSE,
        FALSE,
        'not_started',
        1,
        FALSE,
        FALSE,
        FALSE
    )
    RETURNING * INTO seller_row;

    new_seller_id := seller_row.id;

    PERFORM public.initialize_seller_onboarding(new_seller_id);

    SELECT seller.*
    INTO seller_row
    FROM public.sellers AS seller
    WHERE seller.id = new_seller_id;

    INSERT INTO public.user_profiles (
        auth_user_id,
        email,
        full_name,
        role,
        status,
        seller_id
    )
    VALUES (
        target_auth_user_id,
        normalized_email,
        application_row.full_name,
        'seller',
        'invited',
        new_seller_id
    )
    RETURNING * INTO profile_row;

    UPDATE public.seller_applications AS application
    SET
        email = normalized_email,
        status = 'approved',
        admin_note = CASE
            WHEN admin_note_value IS NULL THEN application.admin_note
            ELSE NULLIF(btrim(admin_note_value), '')
        END,
        approved_at = NOW(),
        approved_seller_id = new_seller_id
    WHERE application.id = application_row.id
    RETURNING application.* INTO application_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'application', jsonb_build_object(
            'id', application_row.id,
            'status', application_row.status,
            'email', application_row.email,
            'approved_seller_id', application_row.approved_seller_id,
            'approved_at', application_row.approved_at
        ),
        'seller', jsonb_build_object(
            'id', seller_row.id,
            'name', seller_row.name,
            'email', seller_row.email,
            'phone', seller_row.phone,
            'store_name', seller_row.store_name,
            'store_link', seller_row.store_link,
            'system_status', seller_row.system_status,
            'onboarding_status', seller_row.onboarding_status,
            'current_onboarding_step', seller_row.current_onboarding_step,
            'onboarding_completed', seller_row.onboarding_completed,
            'ai_enabled', seller_row.ai_enabled
        ),
        'profile', jsonb_build_object(
            'id', profile_row.id,
            'auth_user_id', profile_row.auth_user_id,
            'email', profile_row.email,
            'full_name', profile_row.full_name,
            'role', profile_row.role,
            'status', profile_row.status,
            'seller_id', profile_row.seller_id
        )
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Seller veya kullanıcı profili benzersizlik kısıtıyla çakıştı.'
        );
    WHEN foreign_key_violation THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Auth kullanıcısı veya seller bağlantısı doğrulanamadı.'
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_seller_invitation_from_application(
    BIGINT, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_seller_invitation_from_application(
    BIGINT, UUID, TEXT, TEXT
) TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, applied_by)
VALUES (
    '022',
    'finalize_admin_seller_invitation',
    'admin_seller_invitation_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
