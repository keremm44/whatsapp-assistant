-- 003_add_message_provider_columns.sql
-- Mesajların sağlayıcı kimliğini tutar ve aynı mesajın iki kez işlenmesini önler.

BEGIN;

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS provider VARCHAR(30) NOT NULL DEFAULT 'twilio';

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(150);

-- PostgreSQL'de ADD CONSTRAINT IF NOT EXISTS bulunmadığı için kontrollü ekliyoruz.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_provider_message_id_unique'
          AND conrelid = 'public.messages'::regclass
    ) THEN
        ALTER TABLE public.messages
        ADD CONSTRAINT messages_provider_message_id_unique
        UNIQUE (provider, provider_message_id);
    END IF;
END
$$;

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '003',
    'add_message_provider_columns',
    'v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;