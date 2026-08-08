-- 024_harden_seller_product_settings_contract.sql
-- Align seller rules/product settings with the production RPC contract.
-- Upgrade-safe for repositories that previously applied the earlier 023 draft.

BEGIN;

ALTER TABLE public.sellers
    ALTER COLUMN settings_version TYPE BIGINT USING settings_version::BIGINT,
    ALTER COLUMN settings_version SET DEFAULT 1,
    ALTER COLUMN settings_version SET NOT NULL;

ALTER TABLE public.rules
    ALTER COLUMN version TYPE BIGINT USING version::BIGINT,
    ALTER COLUMN version SET DEFAULT 1,
    ALTER COLUMN version SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN category SET DEFAULT 'general';

ALTER TABLE public.sellers DROP CONSTRAINT IF EXISTS chk_sellers_settings_version;
ALTER TABLE public.sellers
    ADD CONSTRAINT chk_sellers_settings_version CHECK (settings_version >= 1);

ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS chk_rules_version;
ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS chk_rules_hit_count;
ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS chk_rules_trigger_text_nonblank;
ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS chk_rules_response_text_nonblank;
ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS chk_rules_category_nonblank;
ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS chk_rules_lengths;

ALTER TABLE public.rules
    ADD CONSTRAINT chk_rules_version CHECK (version >= 1),
    ADD CONSTRAINT chk_rules_hit_count CHECK (hit_count >= 0),
    ADD CONSTRAINT chk_rules_trigger_text_nonblank CHECK (btrim(trigger_text) <> ''),
    ADD CONSTRAINT chk_rules_response_text_nonblank CHECK (btrim(response_text) <> ''),
    ADD CONSTRAINT chk_rules_category_nonblank CHECK (btrim(category) <> ''),
    ADD CONSTRAINT chk_rules_lengths CHECK (
        char_length(trigger_text) <= 500
        AND char_length(response_text) <= 4000
        AND char_length(category) <= 80
    );

DROP INDEX IF EXISTS public.idx_rules_seller_active_created;
DROP INDEX IF EXISTS public.uq_rules_seller_active_trigger;
CREATE INDEX IF NOT EXISTS idx_rules_seller_active_updated
    ON public.rules(seller_id, is_active, updated_at DESC, id DESC);

DROP TRIGGER IF EXISTS trg_sellers_settings_version ON public.sellers;
DROP FUNCTION IF EXISTS public.bump_seller_settings_version();
DROP TRIGGER IF EXISTS trg_rules_updated_at ON public.rules;

CREATE OR REPLACE FUNCTION public.bump_seller_product_settings_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.product_info IS DISTINCT FROM OLD.product_info
       AND NEW.settings_version = OLD.settings_version
    THEN
        NEW.settings_version := OLD.settings_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_product_settings_version ON public.sellers;
CREATE TRIGGER trg_seller_product_settings_version
BEFORE UPDATE OF product_info ON public.sellers
FOR EACH ROW
EXECUTE FUNCTION public.bump_seller_product_settings_version();

CREATE OR REPLACE FUNCTION public.get_seller_rules(
    target_seller_id BIGINT,
    include_inactive BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    payload JSONB;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object('status','error','message','Geçersiz seller kimliği.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = target_seller_id) THEN
        RETURN jsonb_build_object('status','not_found');
    END IF;

    SELECT jsonb_build_object(
        'status','success',
        'rules',COALESCE(jsonb_agg(jsonb_build_object(
            'id',r.id,
            'trigger_text',r.trigger_text,
            'response_text',r.response_text,
            'category',r.category,
            'is_active',r.is_active,
            'hit_count',r.hit_count,
            'version',r.version,
            'created_at',r.created_at,
            'updated_at',r.updated_at
        ) ORDER BY r.is_active DESC,r.updated_at DESC,r.id DESC),'[]'::jsonb)
    ) INTO payload
    FROM public.rules r
    WHERE r.seller_id = target_seller_id
      AND (include_inactive OR r.is_active = TRUE);

    RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_seller_rule(
    target_seller_id BIGINT,
    trigger_text_value TEXT,
    response_text_value TEXT,
    category_value TEXT DEFAULT 'general'
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    rule_row public.rules%ROWTYPE;
    normalized_trigger TEXT := BTRIM(trigger_text_value);
    normalized_response TEXT := BTRIM(response_text_value);
    normalized_category TEXT := COALESCE(NULLIF(BTRIM(category_value),''),'general');
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object('status','error','message','Geçersiz seller kimliği.');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = target_seller_id) THEN
        RETURN jsonb_build_object('status','not_found');
    END IF;
    IF normalized_trigger IS NULL OR normalized_trigger = '' OR char_length(normalized_trigger) > 500 THEN
        RETURN jsonb_build_object('status','error','message','Kural tetikleyicisi 1-500 karakter olmalıdır.');
    END IF;
    IF normalized_response IS NULL OR normalized_response = '' OR char_length(normalized_response) > 4000 THEN
        RETURN jsonb_build_object('status','error','message','Kural cevabı 1-4000 karakter olmalıdır.');
    END IF;
    IF char_length(normalized_category) > 80 THEN
        RETURN jsonb_build_object('status','error','message','Kategori en fazla 80 karakter olabilir.');
    END IF;

    INSERT INTO public.rules(seller_id,trigger_text,response_text,category,is_active,hit_count,updated_at,version)
    VALUES(target_seller_id,normalized_trigger,normalized_response,normalized_category,TRUE,0,NOW(),1)
    RETURNING * INTO rule_row;

    RETURN jsonb_build_object('status','success','changed',TRUE,'rule',jsonb_build_object(
        'id',rule_row.id,'trigger_text',rule_row.trigger_text,'response_text',rule_row.response_text,
        'category',rule_row.category,'is_active',rule_row.is_active,'hit_count',rule_row.hit_count,
        'version',rule_row.version,'created_at',rule_row.created_at,'updated_at',rule_row.updated_at
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_seller_rule(
    target_seller_id BIGINT,
    target_rule_id BIGINT,
    expected_version BIGINT,
    trigger_text_value TEXT DEFAULT NULL,
    response_text_value TEXT DEFAULT NULL,
    category_value TEXT DEFAULT NULL,
    is_active_value BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    rule_row public.rules%ROWTYPE;
    next_trigger TEXT;
    next_response TEXT;
    next_category TEXT;
    next_active BOOLEAN;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 OR target_rule_id IS NULL OR target_rule_id <= 0 THEN
        RETURN jsonb_build_object('status','error','message','Geçersiz seller veya rule kimliği.');
    END IF;
    IF expected_version IS NULL OR expected_version <= 0 THEN
        RETURN jsonb_build_object('status','error','message','expected_version pozitif olmalıdır.');
    END IF;

    SELECT r.* INTO rule_row
    FROM public.rules r
    WHERE r.id = target_rule_id AND r.seller_id = target_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
    IF rule_row.version <> expected_version THEN
        RETURN jsonb_build_object('status','conflict','current_version',rule_row.version);
    END IF;

    next_trigger := CASE WHEN trigger_text_value IS NULL THEN rule_row.trigger_text ELSE BTRIM(trigger_text_value) END;
    next_response := CASE WHEN response_text_value IS NULL THEN rule_row.response_text ELSE BTRIM(response_text_value) END;
    next_category := CASE WHEN category_value IS NULL THEN rule_row.category ELSE BTRIM(category_value) END;
    next_active := COALESCE(is_active_value,rule_row.is_active);

    IF next_trigger = '' OR char_length(next_trigger) > 500 THEN
        RETURN jsonb_build_object('status','error','message','Kural tetikleyicisi 1-500 karakter olmalıdır.');
    END IF;
    IF next_response = '' OR char_length(next_response) > 4000 THEN
        RETURN jsonb_build_object('status','error','message','Kural cevabı 1-4000 karakter olmalıdır.');
    END IF;
    IF next_category = '' OR char_length(next_category) > 80 THEN
        RETURN jsonb_build_object('status','error','message','Kategori 1-80 karakter olmalıdır.');
    END IF;

    IF next_trigger IS NOT DISTINCT FROM rule_row.trigger_text
       AND next_response IS NOT DISTINCT FROM rule_row.response_text
       AND next_category IS NOT DISTINCT FROM rule_row.category
       AND next_active IS NOT DISTINCT FROM rule_row.is_active
    THEN
        RETURN jsonb_build_object('status','success','changed',FALSE,'rule',jsonb_build_object(
            'id',rule_row.id,'trigger_text',rule_row.trigger_text,'response_text',rule_row.response_text,
            'category',rule_row.category,'is_active',rule_row.is_active,'hit_count',rule_row.hit_count,
            'version',rule_row.version,'created_at',rule_row.created_at,'updated_at',rule_row.updated_at
        ));
    END IF;

    UPDATE public.rules r
    SET trigger_text = next_trigger,
        response_text = next_response,
        category = next_category,
        is_active = next_active,
        updated_at = NOW(),
        version = r.version + 1
    WHERE r.id = target_rule_id AND r.seller_id = target_seller_id
    RETURNING r.* INTO rule_row;

    RETURN jsonb_build_object('status','success','changed',TRUE,'rule',jsonb_build_object(
        'id',rule_row.id,'trigger_text',rule_row.trigger_text,'response_text',rule_row.response_text,
        'category',rule_row.category,'is_active',rule_row.is_active,'hit_count',rule_row.hit_count,
        'version',rule_row.version,'created_at',rule_row.created_at,'updated_at',rule_row.updated_at
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_seller_rule(
    target_seller_id BIGINT,
    target_rule_id BIGINT,
    expected_version BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    rule_row public.rules%ROWTYPE;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 OR target_rule_id IS NULL OR target_rule_id <= 0 THEN
        RETURN jsonb_build_object('status','error','message','Geçersiz seller veya rule kimliği.');
    END IF;
    IF expected_version IS NULL OR expected_version <= 0 THEN
        RETURN jsonb_build_object('status','error','message','expected_version pozitif olmalıdır.');
    END IF;

    SELECT r.* INTO rule_row
    FROM public.rules r
    WHERE r.id = target_rule_id AND r.seller_id = target_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
    IF rule_row.version <> expected_version THEN
        RETURN jsonb_build_object('status','conflict','current_version',rule_row.version);
    END IF;

    IF rule_row.is_active = FALSE THEN
        RETURN jsonb_build_object('status','success','changed',FALSE,'rule',jsonb_build_object(
            'id',rule_row.id,'trigger_text',rule_row.trigger_text,'response_text',rule_row.response_text,
            'category',rule_row.category,'is_active',rule_row.is_active,'hit_count',rule_row.hit_count,
            'version',rule_row.version,'created_at',rule_row.created_at,'updated_at',rule_row.updated_at
        ));
    END IF;

    UPDATE public.rules r
    SET is_active = FALSE, updated_at = NOW(), version = r.version + 1
    WHERE r.id = target_rule_id AND r.seller_id = target_seller_id
    RETURNING r.* INTO rule_row;

    RETURN jsonb_build_object('status','success','changed',TRUE,'rule',jsonb_build_object(
        'id',rule_row.id,'trigger_text',rule_row.trigger_text,'response_text',rule_row.response_text,
        'category',rule_row.category,'is_active',rule_row.is_active,'hit_count',rule_row.hit_count,
        'version',rule_row.version,'created_at',rule_row.created_at,'updated_at',rule_row.updated_at
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_product_settings(target_seller_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    seller_row public.sellers%ROWTYPE;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object('status','error','message','Geçersiz seller kimliği.');
    END IF;

    SELECT s.* INTO seller_row FROM public.sellers s WHERE s.id = target_seller_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;

    RETURN jsonb_build_object(
        'status','success',
        'version',seller_row.settings_version,
        'updated_at',seller_row.updated_at,
        'settings',jsonb_build_object(
            'product',COALESCE(seller_row.product_info->'product','{}'::jsonb),
            'usage',COALESCE(seller_row.product_info->'usage','{}'::jsonb),
            'shipping',COALESCE(seller_row.product_info->'shipping','{}'::jsonb),
            'order',COALESCE(seller_row.product_info->'order','{}'::jsonb)
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.patch_seller_product_settings(
    target_seller_id BIGINT,
    patch_value JSONB,
    expected_version BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    seller_row public.sellers%ROWTYPE;
    new_info JSONB;
    section_name TEXT;
    section_patch JSONB;
    k TEXT;
    min_q NUMERIC;
    max_q NUMERIC;
    min_days NUMERIC;
    max_days NUMERIC;
    custom_required BOOLEAN;
    custom_max NUMERIC;
    same_day BOOLEAN;
BEGIN
    IF target_seller_id IS NULL OR target_seller_id <= 0 THEN
        RETURN jsonb_build_object('status','error','message','Geçersiz seller kimliği.');
    END IF;
    IF expected_version IS NULL OR expected_version <= 0 THEN
        RETURN jsonb_build_object('status','error','message','expected_version pozitif olmalıdır.');
    END IF;
    IF patch_value IS NULL OR jsonb_typeof(patch_value) <> 'object' OR patch_value = '{}'::jsonb THEN
        RETURN jsonb_build_object('status','error','message','settings patch boş olmayan bir JSON object olmalıdır.');
    END IF;

    FOR k IN SELECT jsonb_object_keys(patch_value) LOOP
        IF k NOT IN ('product','usage','shipping','order') THEN
            RETURN jsonb_build_object('status','error','message','Desteklenmeyen settings bölümü: '||k);
        END IF;
    END LOOP;

    FOREACH section_name IN ARRAY ARRAY['product','usage','shipping','order'] LOOP
        IF patch_value ? section_name THEN
            section_patch := patch_value->section_name;
            IF jsonb_typeof(section_patch) <> 'object' THEN
                RETURN jsonb_build_object('status','error','message',section_name||' bölümü object olmalıdır.');
            END IF;
            FOR k IN SELECT jsonb_object_keys(section_patch) LOOP
                IF section_name='product' AND k NOT IN ('size_ml','material','print_method','custom_text_max_length') THEN
                    RETURN jsonb_build_object('status','error','message','Desteklenmeyen product alanı: '||k);
                ELSIF section_name='usage' AND k NOT IN ('food_safe','microwave_safe','dishwasher_safe','hand_wash_recommended') THEN
                    RETURN jsonb_build_object('status','error','message','Desteklenmeyen usage alanı: '||k);
                ELSIF section_name='shipping' AND k NOT IN ('company','international','same_day_available','processing_days_min','processing_days_max') THEN
                    RETURN jsonb_build_object('status','error','message','Desteklenmeyen shipping alanı: '||k);
                ELSIF section_name='order' AND k NOT IN ('min_quantity','max_quantity','image_required','custom_text_required') THEN
                    RETURN jsonb_build_object('status','error','message','Desteklenmeyen order alanı: '||k);
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    IF patch_value ? 'product' THEN
        section_patch := patch_value->'product';
        IF section_patch ? 'material' THEN
            IF jsonb_typeof(section_patch->'material') NOT IN ('string','null') THEN RETURN jsonb_build_object('status','error','message','material text veya null olmalıdır.'); END IF;
            IF section_patch->>'material' IS NOT NULL AND (char_length(section_patch->>'material') < 2 OR char_length(section_patch->>'material') > 100) THEN RETURN jsonb_build_object('status','error','message','material 2-100 karakter olmalıdır.'); END IF;
        END IF;
        IF section_patch ? 'print_method' THEN
            IF jsonb_typeof(section_patch->'print_method') NOT IN ('string','null') THEN RETURN jsonb_build_object('status','error','message','print_method text veya null olmalıdır.'); END IF;
            IF section_patch->>'print_method' IS NOT NULL AND (char_length(section_patch->>'print_method') < 2 OR char_length(section_patch->>'print_method') > 100) THEN RETURN jsonb_build_object('status','error','message','print_method 2-100 karakter olmalıdır.'); END IF;
        END IF;
        IF section_patch ? 'size_ml' THEN
            IF jsonb_typeof(section_patch->'size_ml') NOT IN ('number','null') THEN RETURN jsonb_build_object('status','error','message','size_ml sayı veya null olmalıdır.'); END IF;
            IF section_patch->>'size_ml' IS NOT NULL AND (((section_patch->>'size_ml')::numeric < 50) OR ((section_patch->>'size_ml')::numeric > 2000) OR ((section_patch->>'size_ml')::numeric <> trunc((section_patch->>'size_ml')::numeric))) THEN RETURN jsonb_build_object('status','error','message','size_ml 50-2000 arasında tam sayı olmalıdır.'); END IF;
        END IF;
        IF section_patch ? 'custom_text_max_length' THEN
            IF jsonb_typeof(section_patch->'custom_text_max_length') NOT IN ('number','null') THEN RETURN jsonb_build_object('status','error','message','custom_text_max_length sayı veya null olmalıdır.'); END IF;
            IF section_patch->>'custom_text_max_length' IS NOT NULL AND (((section_patch->>'custom_text_max_length')::numeric < 1) OR ((section_patch->>'custom_text_max_length')::numeric > 500) OR ((section_patch->>'custom_text_max_length')::numeric <> trunc((section_patch->>'custom_text_max_length')::numeric))) THEN RETURN jsonb_build_object('status','error','message','custom_text_max_length 1-500 arasında tam sayı olmalıdır.'); END IF;
        END IF;
    END IF;

    IF patch_value ? 'usage' THEN
        section_patch := patch_value->'usage';
        FOREACH k IN ARRAY ARRAY['food_safe','microwave_safe','dishwasher_safe','hand_wash_recommended'] LOOP
            IF section_patch ? k AND jsonb_typeof(section_patch->k) NOT IN ('boolean','null') THEN RETURN jsonb_build_object('status','error','message',k||' boolean veya null olmalıdır.'); END IF;
        END LOOP;
    END IF;

    IF patch_value ? 'shipping' THEN
        section_patch := patch_value->'shipping';
        IF section_patch ? 'company' THEN
            IF jsonb_typeof(section_patch->'company') <> 'string' THEN RETURN jsonb_build_object('status','error','message','company null olamaz ve text olmalıdır.'); END IF;
            IF char_length(section_patch->>'company') < 2 OR char_length(section_patch->>'company') > 120 THEN RETURN jsonb_build_object('status','error','message','company 2-120 karakter olmalıdır.'); END IF;
        END IF;
        FOREACH k IN ARRAY ARRAY['international','same_day_available'] LOOP
            IF section_patch ? k AND jsonb_typeof(section_patch->k) <> 'boolean' THEN RETURN jsonb_build_object('status','error','message',k||' null olamaz ve boolean olmalıdır.'); END IF;
        END LOOP;
        FOREACH k IN ARRAY ARRAY['processing_days_min','processing_days_max'] LOOP
            IF section_patch ? k THEN
                IF jsonb_typeof(section_patch->k) <> 'number' THEN RETURN jsonb_build_object('status','error','message',k||' null olamaz ve sayı olmalıdır.'); END IF;
                IF ((section_patch->>k)::numeric < 0) OR ((section_patch->>k)::numeric > 60) OR ((section_patch->>k)::numeric <> trunc((section_patch->>k)::numeric)) THEN RETURN jsonb_build_object('status','error','message',k||' 0-60 arasında tam sayı olmalıdır.'); END IF;
            END IF;
        END LOOP;
    END IF;

    IF patch_value ? 'order' THEN
        section_patch := patch_value->'order';
        IF section_patch ? 'image_required' AND section_patch->'image_required' <> 'true'::jsonb THEN
            RETURN jsonb_build_object('status','error','message','Ana sipariş görseli zorunlu kalmalıdır.');
        END IF;
        IF section_patch ? 'custom_text_required' AND jsonb_typeof(section_patch->'custom_text_required') <> 'boolean' THEN
            RETURN jsonb_build_object('status','error','message','custom_text_required null olamaz ve boolean olmalıdır.');
        END IF;
        IF section_patch ? 'min_quantity' THEN
            IF jsonb_typeof(section_patch->'min_quantity') <> 'number' THEN RETURN jsonb_build_object('status','error','message','min_quantity null olamaz ve sayı olmalıdır.'); END IF;
            IF ((section_patch->>'min_quantity')::numeric < 1) OR ((section_patch->>'min_quantity')::numeric > 100000) OR ((section_patch->>'min_quantity')::numeric <> trunc((section_patch->>'min_quantity')::numeric)) THEN RETURN jsonb_build_object('status','error','message','min_quantity 1-100000 arasında tam sayı olmalıdır.'); END IF;
        END IF;
        IF section_patch ? 'max_quantity' THEN
            IF jsonb_typeof(section_patch->'max_quantity') NOT IN ('number','null') THEN RETURN jsonb_build_object('status','error','message','max_quantity sayı veya null olmalıdır.'); END IF;
            IF section_patch->>'max_quantity' IS NOT NULL AND (((section_patch->>'max_quantity')::numeric < 1) OR ((section_patch->>'max_quantity')::numeric > 100000) OR ((section_patch->>'max_quantity')::numeric <> trunc((section_patch->>'max_quantity')::numeric))) THEN RETURN jsonb_build_object('status','error','message','max_quantity 1-100000 arasında tam sayı olmalıdır.'); END IF;
        END IF;
    END IF;

    SELECT s.* INTO seller_row FROM public.sellers s WHERE s.id = target_seller_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
    IF seller_row.settings_version <> expected_version THEN RETURN jsonb_build_object('status','conflict','current_version',seller_row.settings_version); END IF;

    new_info := seller_row.product_info;
    FOREACH section_name IN ARRAY ARRAY['product','usage','shipping','order'] LOOP
        IF patch_value ? section_name THEN
            new_info := jsonb_set(new_info,ARRAY[section_name],COALESCE(new_info->section_name,'{}'::jsonb) || (patch_value->section_name),TRUE);
        END IF;
    END LOOP;

    min_q := NULLIF(new_info->'order'->>'min_quantity','')::numeric;
    max_q := NULLIF(new_info->'order'->>'max_quantity','')::numeric;
    IF min_q IS NOT NULL AND max_q IS NOT NULL AND min_q > max_q THEN RETURN jsonb_build_object('status','error','message','min_quantity max_quantity değerinden büyük olamaz.'); END IF;

    custom_required := NULLIF(new_info->'order'->>'custom_text_required','')::boolean;
    custom_max := NULLIF(new_info->'product'->>'custom_text_max_length','')::numeric;
    IF custom_required IS TRUE AND custom_max IS NULL THEN RETURN jsonb_build_object('status','error','message','Özel yazı zorunluysa maksimum karakter sayısı belirtilmelidir.'); END IF;

    min_days := NULLIF(new_info->'shipping'->>'processing_days_min','')::numeric;
    max_days := NULLIF(new_info->'shipping'->>'processing_days_max','')::numeric;
    IF min_days IS NOT NULL AND max_days IS NOT NULL AND min_days > max_days THEN RETURN jsonb_build_object('status','error','message','processing_days_min processing_days_max değerinden büyük olamaz.'); END IF;
    same_day := NULLIF(new_info->'shipping'->>'same_day_available','')::boolean;
    IF same_day IS TRUE AND min_days IS NOT NULL AND min_days > 0 THEN RETURN jsonb_build_object('status','error','message','Aynı gün gönderim varsa minimum hazırlık süresi 0 olmalıdır.'); END IF;

    IF new_info IS NOT DISTINCT FROM seller_row.product_info THEN
        RETURN jsonb_build_object('status','success','changed',FALSE,'version',seller_row.settings_version,'updated_at',seller_row.updated_at,'settings',jsonb_build_object(
            'product',COALESCE(new_info->'product','{}'::jsonb),'usage',COALESCE(new_info->'usage','{}'::jsonb),'shipping',COALESCE(new_info->'shipping','{}'::jsonb),'order',COALESCE(new_info->'order','{}'::jsonb)
        ));
    END IF;

    UPDATE public.sellers s
    SET product_info = new_info,
        settings_version = s.settings_version + 1,
        updated_at = NOW()
    WHERE s.id = target_seller_id
    RETURNING s.* INTO seller_row;

    RETURN jsonb_build_object('status','success','changed',TRUE,'version',seller_row.settings_version,'updated_at',seller_row.updated_at,'settings',jsonb_build_object(
        'product',COALESCE(seller_row.product_info->'product','{}'::jsonb),'usage',COALESCE(seller_row.product_info->'usage','{}'::jsonb),'shipping',COALESCE(seller_row.product_info->'shipping','{}'::jsonb),'order',COALESCE(seller_row.product_info->'order','{}'::jsonb)
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.bump_seller_product_settings_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seller_rules(BIGINT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_seller_rule(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_seller_rule(BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_seller_rule(BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seller_product_settings(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.patch_seller_product_settings(BIGINT, JSONB, BIGINT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bump_seller_product_settings_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_rules(BIGINT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_seller_rule(BIGINT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_seller_rule(BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_seller_rule(BIGINT, BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_product_settings(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.patch_seller_product_settings(BIGINT, JSONB, BIGINT) TO service_role;

-- Normalize repositories that had the earlier local 023 draft applied.
UPDATE public.schema_migrations
SET name = 'add_seller_rules_and_product_settings',
    checksum = 'seller_rules_product_settings_v1'
WHERE version = '023';

INSERT INTO public.schema_migrations(version, name, checksum, applied_by)
VALUES (
    '024',
    'harden_seller_product_settings_contract',
    'seller_product_settings_contract_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
