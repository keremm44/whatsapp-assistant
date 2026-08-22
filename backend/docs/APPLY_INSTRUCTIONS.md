# Backend çalışma ve test talimatları

## Ortam

1. `backend/.env.example` dosyasını `backend/.env` olarak kopyala.
2. Supabase URL, service key ve gerekiyorsa sınıflandırıcı anahtarını doldur.
3. `.env` dosyasını Git veya ZIP içine ekleme.

## Çalıştırma

```powershell
cd C:\Projeler\whatsapp-asistan\backend
.\venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload
```

## Migration parity

Her DB değişikliğinden ve her production deployundan önce repo migration zinciri
ile hedef Supabase projesindeki `public.schema_migrations` kaydının **birebir**
eşleştiğini doğrula:

```powershell
cd backend
python -m scripts.check_migration_parity
```

Bu kontrol yalnızca en yüksek migration numarasına bakmaz; arada atlanmış bir
sürümü de hata sayar. Örneğin DB'de `040` ve `042` bulunup `041` yoksa parity
başarısızdır. Daha yüksek bir migration'ın uygulanmış olması eksik eski sürümü
geçerli hale getirmez.

Sadece repo içindeki migration dosya zincirini kontrol etmek için:

```powershell
python -m scripts.check_migration_parity --local-only
```

Gerekirse DB kaydını ayrıca SQL ile incele:

```sql
SELECT version, name
FROM public.schema_migrations
ORDER BY version;
```

- Migration dosyaları üç haneli numara sırasıyla ilerlemelidir.
- `schema_migrations` içinde kayıtlı bir sürümü yeniden uygulama.
- Eksik migrationları **artan numara sırasıyla** uygula; aradaki sürümü atlama.
- Repo ve hedef DB aynı sürüm zincirindeyse migration uygulama.
- Bu branch için mevcut tam zincir `000`–`057`'dir.
- Migration uygulamasından sonra `python -m scripts.check_migration_parity`
  tekrar çalışmalı ve `Migration parity OK.` dönmelidir.

## Test sırası

```powershell
python -m pytest -q
python -m scripts.run_tests --integration
```

İkinci komut gerçek Supabase veritabanında geçici kayıtlar oluşturur ve senaryo sonlarında temizler.

## Production-benzeri concurrency/failure stress testi

Concurrency stress testi **production Supabase projesinde çalıştırılmaz**. Queue claim RPC'si global aday seçtiği için gerçek müşteri event'ini claim etme riski vardır. Bunun yerine migration parity'si production ile aynı olan izole bir Supabase branch/test veritabanı kullanılır.

Test; paralel customer identity oluşturma, atomik message metric yazımı, duplicate message/webhook idempotency, aynı-sender FIFO, farklı-sender paralelliği ve stale worker reclaim/claim fencing senaryolarını gerçek PostgreSQL transaction'ları üzerinde eşzamanlı çalıştırır.

İzole hedefte aşağıdaki değişkenleri açıkça ayarla:

```env
APP_ENV=test
WHATSAPP_STRESS_TARGET=isolated-test-db
WHATSAPP_CONCURRENCY_STRESS_CONFIRM=synthetic-only
WHATSAPP_STRESS_SELLER_ID=<izole-test-seller-id>
WHATSAPP_STRESS_MAX_WORKERS=12
```

Sonra:

```powershell
python -m scripts.run_tests --concurrency-stress
```

`WHATSAPP_STRESS_MAX_WORKERS` 2–32 aralığındadır. Harness her koşuda benzersiz bir run token üretir ve kendi sentetik kayıtlarını `finally` bloğunda temizler. `APP_ENV=production` veya `WHATSAPP_STRESS_TARGET=isolated-test-db` dışındaki hedefler runner tarafından reddedilir.

## WhatsApp operasyon sağlık kontrolü

Migration `056`, queue ve outbox için yalnız aggregate sayaç/yaş bilgisi döndüren
backend-only `get_whatsapp_operational_health()` RPC'sini ekler. Migration `057`
ise privacy-safe worker heartbeat kaydını ve heartbeat metriklerini snapshot'a
ekler. Payload, telefon, recipient, customer veya mesaj içeriği sağlık verisine
dahil edilmez.

Worker 30 saniyede bir heartbeat yazar ve her 60 saniyede snapshot'ı okuyup şu
durumları sınıflandırır:

- son iki dakikada worker heartbeat olmaması,
- inbound/outbound backlog,
- lease reclaim eşiğine yaklaşan veya takılan `PROCESSING`,
- stale eşiğine yaklaşan veya aşan `SENDING`,
- son 15 dakikadaki `FAILED` ve yüksek reclaim sayısı,
- çözülmemiş `UNKNOWN` outbound teslimatlar.

`SENTRY_DSN` ayarlıysa worker operasyon alarmlarını beş dakikalık code-bazlı
cooldown ve sabit fingerprint ile Sentry'ye yollar. Telefon veya mesaj içeriği
alarm payload'ına eklenmez.

Worker tamamen durmuş olsa bile dışarıdan kontrol edebilmek için:

```powershell
python -m scripts.check_operational_health
```

`WHATSAPP_RUNTIME_ENABLED=true` olduğunda bu bağımsız kontrol son iki dakikada
heartbeat yoksa `worker_heartbeat_missing` ile critical olur. Runtime kapalıysa
heartbeat zorunluluğu aranmaz.

Çıkış kodları:

- `0`: healthy
- `1`: degraded / warning
- `2`: critical veya snapshot okunamadı

Bu komut Railway Cron, harici uptime/cron servisi veya başka bir scheduler ile
periyodik çalıştırılabilir. Worker process'inin kendisi öldüğünde worker içi
health loop da duracağı için production'da bağımsız scheduler kullanılması
önerilir.

## Canlı auth kontrolü

API çalışırken:

```powershell
python -m tests.live.live_check_auth
```

## Geliştirme endpointleri

Açık geliştirme endpointleri varsayılan olarak kapalıdır. Yerel kullanımda `.env` içine şunları ekle:

```env
ENABLE_DEV_ENDPOINTS=true
INTERNAL_API_TOKEN=uzun-rastgele-bir-deger
```

Tüm `/dev/*` isteklerinde `X-Internal-Token` headerı zorunludur.

## Güvenlik notları

- `SUPABASE_SERVICE_KEY` frontend'e verilmez.
- Ana veri tabloları doğrudan anon/authenticated erişimine kapalıdır.
- Satıcı kimliği korumalı endpointlerde token profilinden çözülür.
- Gerçek Meta webhook endpointi ve imza doğrulaması eklenmeden `/dev/chat` production trafiği için kullanılmaz.
