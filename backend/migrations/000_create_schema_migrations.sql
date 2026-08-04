-- =====================================================
-- Migration 000: schema_migrations tablosu
-- Amaç: Uygulanan migration'ları takip et
-- Tarih: 2026-08-04
-- =====================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(20) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    checksum VARCHAR(64),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    applied_by VARCHAR(100) DEFAULT current_user
);

-- Bu migration'ın kendisini kaydet
INSERT INTO schema_migrations (version, name, checksum)
VALUES ('000', 'create_schema_migrations', 'initial')
ON CONFLICT (version) DO NOTHING;