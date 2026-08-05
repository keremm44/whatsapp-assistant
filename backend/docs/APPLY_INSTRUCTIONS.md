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
