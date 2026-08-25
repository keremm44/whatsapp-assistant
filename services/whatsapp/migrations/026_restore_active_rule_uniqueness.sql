-- 026_restore_active_rule_uniqueness.sql
-- Restores the API's atomic guarantee that one seller cannot have two active
-- rules with the same normalized trigger text.

BEGIN;

DO $$
DECLARE
    duplicate_trigger RECORD;
BEGIN
    SELECT seller_id, lower(btrim(trigger_text)) AS trigger_key, count(*) AS duplicate_count
    INTO duplicate_trigger
    FROM public.rules
    WHERE is_active = TRUE
    GROUP BY seller_id, lower(btrim(trigger_text))
    HAVING count(*) > 1
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Duplicate active seller rule exists: seller_id=%, trigger=%',
            duplicate_trigger.seller_id,
            duplicate_trigger.trigger_key;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rules_seller_active_trigger
    ON public.rules(seller_id, lower(btrim(trigger_text)))
    WHERE is_active = TRUE;

INSERT INTO public.schema_migrations(version, name, checksum, applied_by)
VALUES (
    '026',
    'restore_active_rule_uniqueness',
    'seller_rule_active_uniqueness_v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
