-- =====================================================
-- Migration 001: customers güvenlik kolonları
-- Amaç: Bloklama, susturma, ihlal takibi altyapısı
-- Bağımlılık: 000
-- Tarih: 2026-08-04
-- =====================================================

-- customers tablosuna güvenlik kolonları ekle
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ;

-- Index'ler (hızlı sorgu için)
CREATE INDEX IF NOT EXISTS idx_customers_muted_until 
ON customers(muted_until) 
WHERE muted_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_is_blocked 
ON customers(is_blocked) 
WHERE is_blocked = true;

-- Migration'ı kaydet
INSERT INTO schema_migrations (version, name, checksum)
VALUES ('001', 'add_customer_security_columns', 'v1')
ON CONFLICT (version) DO NOTHING;