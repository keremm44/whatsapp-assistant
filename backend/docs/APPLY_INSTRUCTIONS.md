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

Her DB değişikliğinden önce `backend/migrations/` altındaki migration dosyalarını hedef Supabase projesindeki `public.schema_migrations` kaydıyla karşılaştır.

```sql
SELECT version, name
FROM public.schema_migrations
ORDER BY version;
```

- Migration dosyaları üç haneli numara sırasıyla ilerlemelidir.
- `schema_migrations` içinde kayıtlı bir sürümü yeniden uygulama.
- Yalnızca eksik migrationları artan numara sırasıyla uygula.
- Repo ve hedef DB aynı sürüm zincirindeyse migration uygulama.

## Test sırası

```powershell
python -m pytest -q
python -m scripts.run_tests --integration
```

İkinci komut gerçek Supabase veritabanında geçici kayıtlar oluşturur ve senaryo sonlarında temizler.

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
