# Backend Agent Talimatları

Bu dosya `services/whatsapp/` altındaki tüm çalışmalar için kök `AGENTS.md` kurallarını daraltır.

## 1. Backend rolü

Backend FastAPI + Supabase katmanıdır. Backend şu konularda kaynak-of-truth'tur:

- authentication ve authorization,
- seller identity çözümü,
- business rules ve state transitions,
- order/conversation/return verisi,
- WhatsApp webhook işleme,
- database write/read davranışı,
- protected API response'ları.

Frontend'den gelen seller id, role veya state bilgisi tek başına yetki kanıtı değildir.

## 2. Temel alanlar

- `main.py`: uygulama bootstrap, middleware ve üst seviye router wiring.
- `api/router.py`: protected API route composition sınırı.
- `api/seller/` ve `api/admin/`: protected endpointlerin domain ownership modülleri.
- `protected_routes.py`: geçiş süresince mevcut handler implementasyonlarını ve doğrudan test/monkeypatch uyumluluğunu koruyan legacy compatibility kaynağı; yeni route ownership'i burada büyütme.
- `public_routes.py`: public endpointler.
- `admin_seller_routes.py` / service / repository: mevcut ayrı admin seller işlemleri.
- `chat_service/`: mesaj orkestrasyonu, order state ve response akışı.
- `ai_engine.py`: sınıflandırma/AI yardımcıları; business authority değildir.
- `database/`: Supabase erişim fonksiyonları ve domain odaklı persistence.
- `whatsapp_webhook/`: WhatsApp provider/webhook akışı.
- `migrations/`: database schema history.
- `tests/unit/`: izole testler.
- `tests/integration/`: gerçek Supabase entegrasyon senaryoları.
- `tests/live/`: çalışan servis/canlı auth kontrolleri.

Protected route refactor'unda public path, HTTP method, status code, auth dependency, request modeli ve response sözleşmesi sessizce değiştirilemez. Route ownership'i taşınırken `tests/unit/test_api_router_composition.py` parity kontrolünü koru.

## 3. Katman sınırları

Yeni veya değişen endpoint için tercih edilen akış:

```text
route -> service/orchestrator -> database/repository -> Supabase
```

- Route içinde karmaşık business logic büyütme.
- Database modülüne presentation/UI kararı koyma.
- AI classifier sonucunu doğrudan order/state transition kararı haline getirme.
- Aynı database sorgusunu farklı dosyalara kopyalamak yerine mevcut domain helper/repository yapısını araştır.
- Yeni public surface açmadan önce auth ve abuse modelini açıkça belirle.

## 4. Chat ve state machine kuralları

`chat_service/` değişikliklerinde özellikle:

- Mevcut order state geçişlerini ve helper'ları incelemeden yeni state üretme.
- Kullanıcı mesajından doğrudan state atlama yapma.
- Aynı mesajın tekrar işlenmesi/idempotency riskini hesaba kat.
- Provider message id veya mevcut duplicate korumasını bozma.
- Seller rule, product knowledge, template ve state bilgisi mevcutsa bunların önüne LLM tahmini koyma.
- Raw internal state/reason code'larını istemciye gereksiz yere sızdırma.

## 5. Auth ve güvenlik

- `SUPABASE_SERVICE_KEY` yalnızca backend secret'tır.
- Korunan endpointlerde seller ownership backend auth bağlamıyla doğrulanmalıdır.
- Admin erişimini normal seller erişimiyle birleştirme.
- `/dev/*` yalnızca development içindir; production alternatif endpointi değildir.
- `ENABLE_DEV_ENDPOINTS` kapalıyken dev surface açılmamalı.
- Internal token kontrolünü zayıflatma veya loglama.
- Public request body sınırı/rate-abuse savunmalarını kaldırma.
- Exception içinde token, key, full auth header veya hassas payload loglama.

## 6. Migration prosedürü

Schema değişikliği gerekiyorsa:

1. `migrations/` içindeki en yüksek migration numarasını bul.
2. Eski migrationı edit etme; yeni üç haneli migration ekle.
3. Migration mümkün olduğunca forward-only ve tekrar uygulanmaya karşı anlaşılır olmalı.
4. Hedef Supabase `public.schema_migrations` ile parity kontrolü yapılmadan canlı DB'ye migration uygulama.
5. Destructive DDL veya veri dönüşümü için açık kullanıcı talebi olmadan canlı write yapma.
6. Schema değişikliği kullanan Python kodu ve test aynı change set içinde güncellenmeli.

Bkz. `docs/APPLY_INSTRUCTIONS.md`.

## 7. Contract değişiklikleri

Protected seller response veya request modeli değişiyorsa:

- Repo kökündeki `contracts/` altındaki ilgili JSON contract'ı kontrol et.
- Frontend consumer'ları kontrol et.
- Field rename/remove yerine mümkünse backward-compatible geçiş tasarla.
- Null/optional semantics testte açık olsun.
- Tarih/saat alanlarında timezone formatını rastgele değiştirme.

## 8. Test akışı

Önce ilgili unit testi çalıştır. Ardından:

```powershell
python -m pytest -q
```

Gerçek Supabase entegrasyonu görev kapsamındaysa ve environment hazırsa:

```powershell
python -m scripts.run_tests --integration
```

Canlı auth kontrolü yalnızca çalışan API ve uygun environment ile:

```powershell
python -m tests.live.live_check_auth
```

- Unit test için gerçek network gerektirme.
- Integration testini unit test gibi gizlice çalıştırma.
- Gerçek DB'de test verisi oluşturuyorsan mevcut cleanup davranışını koru.

## 9. Backend'de özellikle yasak olan kestirmeler

- Frontend gönderdi diye seller ownership kabul etmek.
- Service key'i frontend environment değişkenine koymak.
- Mevcut migrationı değiştirmek.
- Test geçsin diye auth check kaldırmak.
- Classifier/LLM cevabını doğrulanmış domain state gibi saklamak.
- Yeni endpoint açıp rate/auth modelini tanımlamamak.
- Production path'e yalnızca test/debug amacıyla bypass eklemek.
