-- =====================================================
-- Migration 002: customer_violations tablosu
-- Amaç: İhlalleri tarihsel olarak sakla, 30 gün window
-- Bağımlılık: 001
-- Tarih: 2026-08-04
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_violations (
    id BIGSERIAL PRIMARY KEY,
    seller_id BIGINT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- İhlal detayı
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    -- 'low', 'medium', 'high', 'critical'
    
    matched_term VARCHAR(200),
    -- Hangi kelime/kalıp tetikledi
    
    message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
    -- İhlal içeren mesaj (silinebilir)
    
    -- Aksiyon takibi
    action_taken VARCHAR(50) NOT NULL,
    -- 'notified_only', 'muted_24h', 'blocked'
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    -- Ek bilgiler: violation_number_in_window, prev_action, vs.
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_violations_customer_recent
ON customer_violations(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_violations_seller
ON customer_violations(seller_id, created_at DESC);

-- Migration'ı kaydet
INSERT INTO schema_migrations (version, name, checksum)
VALUES ('002', 'create_customer_violations', 'v1')
ON CONFLICT (version) DO NOTHING;