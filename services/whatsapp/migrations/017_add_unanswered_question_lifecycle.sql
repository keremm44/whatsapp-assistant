-- ============================================================
-- 017_add_unanswered_question_lifecycle.sql
-- Cevaplanamayan sorular için kalıcı seller yaşam döngüsü.
--
-- 008'deki public.unanswered_questions tablosu geçmiş/legacy aggregate
-- kayıtları olarak korunur. 017 onu yeniden anlamlandırmaz veya silmez.
-- Yeni domain iki ayrı tablo kullanır:
--   - unanswered_question_groups: seller + normalize soru başına tek grup
--   - unanswered_question_occurrences: yeni incoming mesaj occurrence'ları
--
-- Seller cevabı yalnız gelecekteki yeni incoming mesajlarda kullanılmak
-- üzere saklanır. Bu migration geçmiş mesajlara outgoing üretmez.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Gruplar
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.unanswered_question_groups (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    canonical_question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,

    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    answer_text TEXT,

    occurrence_count BIGINT NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    version BIGINT NOT NULL DEFAULT 1,

    answered_at TIMESTAMPTZ,
    answered_by_profile_id BIGINT
        REFERENCES public.user_profiles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    dismissed_at TIMESTAMPTZ,
    dismissed_by_profile_id BIGINT
        REFERENCES public.user_profiles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    dismiss_note VARCHAR(1000),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unanswered_question_groups_status_check
        CHECK (status IN ('OPEN', 'ANSWERED', 'DISMISSED')),

    CONSTRAINT unanswered_question_groups_version_check
        CHECK (version > 0),

    CONSTRAINT unanswered_question_groups_occurrence_count_check
        CHECK (occurrence_count >= 0),

    CONSTRAINT unanswered_question_groups_question_length_check
        CHECK (char_length(BTRIM(canonical_question)) BETWEEN 1 AND 4000),

    CONSTRAINT unanswered_question_groups_normalized_length_check
        CHECK (char_length(BTRIM(normalized_question)) BETWEEN 1 AND 4000),

    CONSTRAINT unanswered_question_groups_answer_length_check
        CHECK (
            answer_text IS NULL
            OR char_length(BTRIM(answer_text)) BETWEEN 1 AND 4000
        ),

    CONSTRAINT unanswered_question_groups_lifecycle_check
        CHECK (
            (
                status = 'OPEN'
                AND answer_text IS NULL
                AND answered_at IS NULL
                AND dismissed_at IS NULL
            )
            OR
            (
                status = 'ANSWERED'
                AND answer_text IS NOT NULL
                AND answered_at IS NOT NULL
                AND dismissed_at IS NULL
            )
            OR
            (
                status = 'DISMISSED'
                AND answer_text IS NULL
                AND answered_at IS NULL
                AND dismissed_at IS NOT NULL
            )
        ),

    CONSTRAINT unanswered_question_groups_seller_normalized_unique
        UNIQUE (seller_id, normalized_question),

    CONSTRAINT unanswered_question_groups_id_seller_unique
        UNIQUE (id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_unanswered_question_groups_seller_status
ON public.unanswered_question_groups(seller_id, status, last_seen_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_unanswered_question_groups_seller_last_seen
ON public.unanswered_question_groups(seller_id, last_seen_at DESC, id DESC);

-- ------------------------------------------------------------
-- 2. Occurrence'lar
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.unanswered_question_occurrences (
    id BIGSERIAL PRIMARY KEY,

    seller_id BIGINT NOT NULL
        REFERENCES public.sellers(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    group_id BIGINT NOT NULL,

    customer_id BIGINT
        REFERENCES public.customers(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    message_id BIGINT
        REFERENCES public.messages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    question_text TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'unclear',
    suggested_field VARCHAR(150),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unanswered_question_occurrences_group_scope_fk
        FOREIGN KEY (group_id, seller_id)
        REFERENCES public.unanswered_question_groups(id, seller_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT unanswered_question_occurrences_question_length_check
        CHECK (char_length(BTRIM(question_text)) BETWEEN 1 AND 4000)
);

-- Yeni chat akışında aynı incoming mesaj yalnız bir occurrence olabilir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_unanswered_question_occurrences_message
ON public.unanswered_question_occurrences(seller_id, message_id)
WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unanswered_question_occurrences_group
ON public.unanswered_question_occurrences(group_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_unanswered_question_occurrences_customer
ON public.unanswered_question_occurrences(seller_id, customer_id, occurred_at DESC)
WHERE customer_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Canonical normalization helper
--
-- 008'de Python lower() + regex nedeniyle özellikle büyük Türkçe İ harfi
-- eski normalized_question alanında "i sim" benzeri ayrışmalara yol
-- açabiliyordu. Backfill eski normalized değeri körlemesine kullanmaz;
-- question_text üzerinden yeniden normalize eder.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._normalize_unanswered_question_text(
    input_text TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT BTRIM(
        regexp_replace(
            regexp_replace(
                lower(translate(BTRIM(COALESCE(input_text, '')), 'Iİ', 'ıi')),
                '[^[:alnum:]_şğıöüç[:space:]]',
                ' ',
                'g'
            ),
            '[[:space:]]+',
            ' ',
            'g'
        )
    );
$$;

-- ------------------------------------------------------------
-- 4. Legacy 008 verisini güvenli biçimde grup tablosuna backfill et
--
-- 008 tam occurrence geçmişi tutmadığı için occurrence_count times_asked
-- toplamından gelir. Yalnız bilinen latest source_message_id için tek
-- occurrence referansı backfill edilir; geçmişe ait mesajlar uydurulmaz.
-- ------------------------------------------------------------

INSERT INTO public.unanswered_question_groups (
    seller_id,
    canonical_question,
    normalized_question,
    status,
    answer_text,
    occurrence_count,
    first_seen_at,
    last_seen_at,
    version,
    answered_at,
    dismissed_at,
    created_at,
    updated_at
)
SELECT
    uq.seller_id,
    (ARRAY_AGG(uq.question_text ORDER BY uq.last_asked_at DESC, uq.id DESC))[1],
    public._normalize_unanswered_question_text(uq.question_text),
    CASE
        WHEN BOOL_OR(uq.is_resolved = FALSE) THEN 'OPEN'
        WHEN BOOL_OR(
            uq.is_resolved = TRUE
            AND NULLIF(BTRIM(uq.resolved_response), '') IS NOT NULL
        ) THEN 'ANSWERED'
        ELSE 'DISMISSED'
    END,
    CASE
        WHEN BOOL_OR(uq.is_resolved = FALSE) THEN NULL
        ELSE (
            ARRAY_AGG(
                NULLIF(BTRIM(uq.resolved_response), '')
                ORDER BY uq.resolved_at DESC NULLS LAST, uq.id DESC
            ) FILTER (
                WHERE NULLIF(BTRIM(uq.resolved_response), '') IS NOT NULL
            )
        )[1]
    END,
    SUM(GREATEST(uq.times_asked, 1))::BIGINT,
    MIN(uq.first_asked_at),
    MAX(uq.last_asked_at),
    1,
    CASE
        WHEN BOOL_OR(uq.is_resolved = FALSE) THEN NULL
        WHEN BOOL_OR(NULLIF(BTRIM(uq.resolved_response), '') IS NOT NULL)
            THEN MAX(uq.resolved_at)
        ELSE NULL
    END,
    CASE
        WHEN BOOL_OR(uq.is_resolved = FALSE) THEN NULL
        WHEN BOOL_OR(NULLIF(BTRIM(uq.resolved_response), '') IS NOT NULL)
            THEN NULL
        ELSE COALESCE(MAX(uq.resolved_at), MAX(uq.last_asked_at))
    END,
    MIN(uq.first_asked_at),
    MAX(uq.last_asked_at)
FROM public.unanswered_questions uq
WHERE public._normalize_unanswered_question_text(uq.question_text) <> ''
GROUP BY uq.seller_id, public._normalize_unanswered_question_text(uq.question_text)
ON CONFLICT (seller_id, normalized_question) DO NOTHING;

INSERT INTO public.unanswered_question_occurrences (
    seller_id,
    group_id,
    customer_id,
    message_id,
    question_text,
    category,
    suggested_field,
    metadata,
    occurred_at
)
SELECT DISTINCT ON (uq.seller_id, uq.source_message_id)
    uq.seller_id,
    g.id,
    uq.customer_id,
    uq.source_message_id,
    uq.question_text,
    uq.category,
    uq.suggested_field,
    COALESCE(uq.metadata, '{}'::jsonb),
    uq.last_asked_at
FROM public.unanswered_questions uq
JOIN public.unanswered_question_groups g
  ON g.seller_id = uq.seller_id
 AND g.normalized_question = public._normalize_unanswered_question_text(uq.question_text)
WHERE uq.source_message_id IS NOT NULL
ORDER BY uq.seller_id, uq.source_message_id, uq.last_asked_at DESC, uq.id DESC
ON CONFLICT (seller_id, message_id) WHERE message_id IS NOT NULL DO NOTHING;

-- ------------------------------------------------------------
-- 5. Legacy AWAITING_SELLER state reconciliation
--
-- 008 dönemi unknown-question akışı bazı konuşmaları AWAITING_SELLER
-- durumunda bırakıyordu. Yeni unanswered domaininde unknown soru konuşmayı
-- kilitlemez; yalnız seller work item oluşturur. Yalnız state_data içindeki
-- question_id gerçekten aynı seller/customer'a ait legacy unanswered kaydını
-- gösteriyorsa state NORMAL'a alınır. Seller takeover semantiği uydurulmaz.
-- ------------------------------------------------------------

WITH legacy_unanswered_states AS (
    SELECT
        cs.id AS conversation_state_id,
        cs.seller_id,
        cs.customer_id,
        uq.id AS question_id,
        uq.source_message_id
    FROM public.conversation_states cs
    JOIN public.unanswered_questions uq
      ON uq.id = CASE
            WHEN jsonb_typeof(cs.state_data) = 'object'
             AND cs.state_data ? 'question_id'
             AND (cs.state_data ->> 'question_id') ~ '^[0-9]+$'
                THEN (cs.state_data ->> 'question_id')::BIGINT
            ELSE NULL
        END
     AND uq.seller_id = cs.seller_id
     AND (uq.customer_id IS NULL OR uq.customer_id = cs.customer_id)
    WHERE cs.current_state = 'AWAITING_SELLER'
)
INSERT INTO public.state_transitions (
    seller_id,
    customer_id,
    from_state,
    to_state,
    trigger_message_id,
    reason_code,
    metadata,
    created_at
)
SELECT
    legacy.seller_id,
    legacy.customer_id,
    'AWAITING_SELLER',
    'NORMAL',
    legacy.source_message_id,
    'system',
    jsonb_build_object(
        'migration', '017',
        'reason', 'legacy_unanswered_state_reconciliation',
        'legacy_question_id', legacy.question_id
    ),
    NOW()
FROM legacy_unanswered_states legacy;

UPDATE public.conversation_states cs
SET
    current_state = 'NORMAL',
    state_type = 'no_lock',
    state_data = '{}'::jsonb,
    expires_at = NULL,
    updated_at = NOW()
FROM public.unanswered_questions uq
WHERE cs.current_state = 'AWAITING_SELLER'
  AND uq.id = CASE
        WHEN jsonb_typeof(cs.state_data) = 'object'
         AND cs.state_data ? 'question_id'
         AND (cs.state_data ->> 'question_id') ~ '^[0-9]+$'
            THEN (cs.state_data ->> 'question_id')::BIGINT
        ELSE NULL
      END
  AND uq.seller_id = cs.seller_id
  AND (uq.customer_id IS NULL OR uq.customer_id = cs.customer_id);

-- ------------------------------------------------------------
-- 6. Tek OPEN group için tek seller notification
-- ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_notifications_unanswered_group
ON public.seller_notifications(
    seller_id,
    related_entity_type,
    related_entity_id,
    type
)
WHERE type = 'unanswered_question'
  AND related_entity_type = 'unanswered_question_group'
  AND related_entity_id IS NOT NULL;

-- ------------------------------------------------------------
-- 7. Presenter
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._unanswered_question_group_presenter(
    p_group public.unanswered_question_groups
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', p_group.id,
        'seller_id', p_group.seller_id,
        'canonical_question', p_group.canonical_question,
        'normalized_question', p_group.normalized_question,
        'status', p_group.status,
        'answer_text', p_group.answer_text,
        'occurrence_count', p_group.occurrence_count,
        'first_seen_at', p_group.first_seen_at,
        'last_seen_at', p_group.last_seen_at,
        'version', p_group.version,
        'answered_at', p_group.answered_at,
        'answered_by_profile_id', p_group.answered_by_profile_id,
        'dismissed_at', p_group.dismissed_at,
        'dismissed_by_profile_id', p_group.dismissed_by_profile_id,
        'dismiss_note', p_group.dismiss_note,
        'created_at', p_group.created_at,
        'updated_at', p_group.updated_at
    );
$$;

-- ------------------------------------------------------------
-- 8. DB-authoritative saved-answer lookup
--
-- Hem backfill/record hem lookup aynı PostgreSQL normalization helper'ını
-- kullanır. Python tarafındaki Unicode normalization yalnız input validation
-- için kalabilir; group identity veya saved-answer eşleşmesini belirlemez.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_answered_unanswered_question(
    target_seller_id BIGINT,
    question_text_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    group_row public.unanswered_question_groups%ROWTYPE;
    question_text_clean TEXT := NULLIF(BTRIM(question_text_value), '');
    normalized_question_clean TEXT;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz seller kimliği.');
    END IF;

    IF question_text_clean IS NULL OR char_length(question_text_clean) > 4000 THEN
        RETURN jsonb_build_object('status', 'success', 'group', NULL);
    END IF;

    normalized_question_clean := public._normalize_unanswered_question_text(
        question_text_clean
    );

    IF normalized_question_clean IS NULL OR normalized_question_clean = '' THEN
        RETURN jsonb_build_object('status', 'success', 'group', NULL);
    END IF;

    SELECT *
    INTO group_row
    FROM public.unanswered_question_groups
    WHERE seller_id = target_seller_id
      AND normalized_question = normalized_question_clean
      AND status = 'ANSWERED'
    ORDER BY id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'success', 'group', NULL);
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'group', public._unanswered_question_group_presenter(group_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 9. record_unanswered_question_occurrence
--
-- - incoming message seller/customer scope doğrulanır
-- - seller + normalized soru advisory lock
-- - aynı message ikinci occurrence oluşturmaz
-- - ANSWERED group yarış halinde bulunursa yeni unanswered occurrence yazılmaz
-- - yalnız yeni OPEN group için idempotent seller notification oluşturulur
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_unanswered_question_occurrence(
    target_seller_id BIGINT,
    target_customer_id BIGINT,
    source_message_id BIGINT,
    question_text_value TEXT,
    category_value TEXT DEFAULT 'unclear',
    suggested_field_value TEXT DEFAULT NULL,
    metadata_value JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    group_row public.unanswered_question_groups%ROWTYPE;
    occurrence_row public.unanswered_question_occurrences%ROWTYPE;
    normalized_question_clean TEXT;
    question_text_clean TEXT := NULLIF(BTRIM(question_text_value), '');
    category_clean TEXT := COALESCE(NULLIF(BTRIM(category_value), ''), 'unclear');
    suggested_field_clean TEXT := NULLIF(BTRIM(suggested_field_value), '');
    created_group BOOLEAN := FALSE;
    notification_created BOOLEAN := FALSE;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_customer_id IS NULL OR target_customer_id <= 0
       OR source_message_id IS NULL OR source_message_id <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz tenant veya mesaj kimliği.');
    END IF;

    IF question_text_clean IS NULL OR char_length(question_text_clean) > 4000 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz soru metni.');
    END IF;

    normalized_question_clean := public._normalize_unanswered_question_text(question_text_clean);

    IF normalized_question_clean IS NULL OR normalized_question_clean = ''
       OR char_length(normalized_question_clean) > 4000 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Soru normalize edilemedi.');
    END IF;

    IF char_length(category_clean) > 50
       OR (suggested_field_clean IS NOT NULL AND char_length(suggested_field_clean) > 150) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz soru metadata alanı.');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.sellers
        WHERE id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.customers
        WHERE id = target_customer_id
          AND seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.messages
        WHERE id = source_message_id
          AND seller_id = target_seller_id
          AND customer_id = target_customer_id
          AND direction = 'incoming'
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('unanswered:' || target_seller_id || ':' || normalized_question_clean)
    );

    SELECT g.*
    INTO group_row
    FROM public.unanswered_question_occurrences o
    JOIN public.unanswered_question_groups g
      ON g.id = o.group_id
     AND g.seller_id = o.seller_id
    WHERE o.seller_id = target_seller_id
      AND o.message_id = source_message_id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'idempotent', TRUE,
            'created', FALSE,
            'notification_created', FALSE,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    SELECT *
    INTO group_row
    FROM public.unanswered_question_groups
    WHERE seller_id = target_seller_id
      AND normalized_question = normalized_question_clean
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.unanswered_question_groups (
            seller_id,
            canonical_question,
            normalized_question,
            status,
            occurrence_count,
            first_seen_at,
            last_seen_at,
            version
        )
        VALUES (
            target_seller_id,
            question_text_clean,
            normalized_question_clean,
            'OPEN',
            0,
            NOW(),
            NOW(),
            1
        )
        RETURNING * INTO group_row;

        created_group := TRUE;
    END IF;

    -- Seller bu grup için cevap kaydederken aynı anda gelen mesajda yarış
    -- olursa answered bilgi kazanır; geçmiş mesaja yeni occurrence yazılmaz.
    IF group_row.status = 'ANSWERED' THEN
        RETURN jsonb_build_object(
            'status', 'answered',
            'idempotent', FALSE,
            'created', FALSE,
            'notification_created', FALSE,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    INSERT INTO public.unanswered_question_occurrences (
        seller_id,
        group_id,
        customer_id,
        message_id,
        question_text,
        category,
        suggested_field,
        metadata,
        occurred_at
    )
    VALUES (
        target_seller_id,
        group_row.id,
        target_customer_id,
        source_message_id,
        question_text_clean,
        category_clean,
        suggested_field_clean,
        COALESCE(metadata_value, '{}'::jsonb),
        NOW()
    )
    ON CONFLICT (seller_id, message_id) WHERE message_id IS NOT NULL DO NOTHING
    RETURNING * INTO occurrence_row;

    IF NOT FOUND THEN
        SELECT g.*
        INTO group_row
        FROM public.unanswered_question_occurrences o
        JOIN public.unanswered_question_groups g
          ON g.id = o.group_id
         AND g.seller_id = o.seller_id
        WHERE o.seller_id = target_seller_id
          AND o.message_id = source_message_id
        LIMIT 1;

        RETURN jsonb_build_object(
            'status', 'success',
            'idempotent', TRUE,
            'created', FALSE,
            'notification_created', FALSE,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    UPDATE public.unanswered_question_groups
    SET
        occurrence_count = occurrence_count + 1,
        last_seen_at = NOW(),
        updated_at = NOW()
    WHERE id = group_row.id
      AND seller_id = target_seller_id
    RETURNING * INTO group_row;

    IF created_group THEN
        INSERT INTO public.seller_notifications (
            seller_id,
            customer_id,
            type,
            severity,
            title,
            message,
            related_entity_type,
            related_entity_id,
            action_url
        )
        VALUES (
            target_seller_id,
            target_customer_id,
            'unanswered_question',
            'warning',
            'Cevaplanamayan müşteri sorusu',
            question_text_clean,
            'unanswered_question_group',
            group_row.id,
            '/panel/unanswered-questions'
        )
        ON CONFLICT DO NOTHING
        RETURNING TRUE INTO notification_created;

        notification_created := COALESCE(notification_created, FALSE);
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'idempotent', FALSE,
        'created', created_group,
        'notification_created', notification_created,
        'group', public._unanswered_question_group_presenter(group_row),
        'occurrence', to_jsonb(occurrence_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 10. Seller cevabı
--
-- Bu RPC yalnız domain kaydını günceller. public.messages veya conversation
-- tablolarına yazmaz; geçmiş müşterilere outgoing gönderemez.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_unanswered_question_answer(
    target_seller_id BIGINT,
    target_group_id BIGINT,
    actor_profile_id BIGINT,
    expected_version BIGINT,
    answer_text_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    group_row public.unanswered_question_groups%ROWTYPE;
    answer_clean TEXT := NULLIF(BTRIM(answer_text_value), '');
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_group_id IS NULL OR target_group_id <= 0
       OR actor_profile_id IS NULL OR actor_profile_id <= 0
       OR expected_version IS NULL OR expected_version <= 0
       OR answer_clean IS NULL OR char_length(answer_clean) > 4000 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz seller cevap parametresi.');
    END IF;

    SELECT *
    INTO group_row
    FROM public.unanswered_question_groups
    WHERE id = target_group_id
      AND seller_id = target_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = actor_profile_id
          AND seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF group_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Cevaplanamayan soru başka bir işlemle değişti.',
            'current_version', group_row.version,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    IF group_row.status = 'ANSWERED' AND BTRIM(group_row.answer_text) = answer_clean THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    UPDATE public.unanswered_question_groups
    SET
        status = 'ANSWERED',
        answer_text = answer_clean,
        answered_at = NOW(),
        answered_by_profile_id = actor_profile_id,
        dismissed_at = NULL,
        dismissed_by_profile_id = NULL,
        dismiss_note = NULL,
        version = version + 1,
        updated_at = NOW()
    WHERE id = target_group_id
      AND seller_id = target_seller_id
    RETURNING * INTO group_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'group', public._unanswered_question_group_presenter(group_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 11. Seller dismiss
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dismiss_unanswered_question_group(
    target_seller_id BIGINT,
    target_group_id BIGINT,
    actor_profile_id BIGINT,
    expected_version BIGINT,
    dismiss_note_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    group_row public.unanswered_question_groups%ROWTYPE;
    note_clean TEXT := NULLIF(BTRIM(dismiss_note_value), '');
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0
       OR target_group_id IS NULL OR target_group_id <= 0
       OR actor_profile_id IS NULL OR actor_profile_id <= 0
       OR expected_version IS NULL OR expected_version <= 0
       OR (note_clean IS NOT NULL AND char_length(note_clean) > 1000) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Geçersiz dismiss parametresi.');
    END IF;

    SELECT *
    INTO group_row
    FROM public.unanswered_question_groups
    WHERE id = target_group_id
      AND seller_id = target_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = actor_profile_id
          AND seller_id = target_seller_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF group_row.version <> expected_version THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Cevaplanamayan soru başka bir işlemle değişti.',
            'current_version', group_row.version,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    IF group_row.status = 'ANSWERED' THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'message', 'Cevaplanmış soru dismiss edilemez.',
            'current_version', group_row.version,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    IF group_row.status = 'DISMISSED'
       AND COALESCE(group_row.dismiss_note, '') = COALESCE(note_clean, '') THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'changed', FALSE,
            'group', public._unanswered_question_group_presenter(group_row)
        );
    END IF;

    UPDATE public.unanswered_question_groups
    SET
        status = 'DISMISSED',
        answer_text = NULL,
        answered_at = NULL,
        answered_by_profile_id = NULL,
        dismissed_at = NOW(),
        dismissed_by_profile_id = actor_profile_id,
        dismiss_note = note_clean,
        version = version + 1,
        updated_at = NOW()
    WHERE id = target_group_id
      AND seller_id = target_seller_id
    RETURNING * INTO group_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'changed', TRUE,
        'group', public._unanswered_question_group_presenter(group_row)
    );
END;
$$;

-- ------------------------------------------------------------
-- 12. Backend-only erişim
-- ------------------------------------------------------------

ALTER TABLE public.unanswered_question_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unanswered_question_occurrences ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.unanswered_question_groups
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.unanswered_question_occurrences
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE public.unanswered_question_groups_id_seq
FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.unanswered_question_occurrences_id_seq
FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.unanswered_question_groups TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.unanswered_question_occurrences TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.unanswered_question_groups_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.unanswered_question_occurrences_id_seq TO service_role;

REVOKE EXECUTE ON FUNCTION public._normalize_unanswered_question_text(TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._normalize_unanswered_question_text(TEXT)
TO service_role;

REVOKE EXECUTE ON FUNCTION public._unanswered_question_group_presenter(
    public.unanswered_question_groups
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._unanswered_question_group_presenter(
    public.unanswered_question_groups
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_answered_unanswered_question(
    BIGINT, TEXT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_answered_unanswered_question(
    BIGINT, TEXT
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_unanswered_question_occurrence(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_unanswered_question_occurrence(
    BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_unanswered_question_answer(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_unanswered_question_answer(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dismiss_unanswered_question_group(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_unanswered_question_group(
    BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) TO service_role;

-- ------------------------------------------------------------
-- 13. Migration kaydı
-- ------------------------------------------------------------

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '017',
    'add_unanswered_question_lifecycle',
    'unanswered_question_lifecycle_v2_reconciled',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
