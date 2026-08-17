# WhatsApp Asistan

Kişiselleştirilmiş ürün satıcıları için FastAPI + Supabase tabanlı WhatsApp asistanı.
Asistanın karar kaynağı satıcı kuralları, ürün bilgileri, şablonlar ve durum makinesidir. Niyet sınıflandırıcı yalnızca mesaj kategorisini belirler.

## Proje yapısı

```text
backend/
├── ai_engine.py
├── auth_service.py
├── chat_service.py
├── database.py
├── main.py
├── onboarding_service.py
├── protected_routes.py
├── settings.py
├── migrations/
├── scripts/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── live/
├── .env.example
├── pytest.ini
└── requirements.txt
frontend/
├── public/
└── src/
```

## Backend kurulumu

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

`.env` içine Supabase ve sınıflandırıcı anahtarlarını gir. `SUPABASE_SERVICE_KEY` yalnızca backend ortamında tutulmalıdır.

Migrationlar `backend/migrations/` altındaki üç haneli numara sırasıyla uygulanır. Hangi migrationların daha önce uygulandığı için kaynak `public.schema_migrations` tablosudur; tabloda kayıtlı sürümleri yeniden çalıştırma, yalnızca eksik sürümleri artan numara sırasıyla uygula. Her DB değişikliğinden önce repo migration zinciri ile hedef Supabase projesindeki `schema_migrations` kaydını karşılaştır.

## API çalıştırma

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload
```

Temel kontroller:

```text
GET /health
GET /health/ready
GET /docs
```

## Testler

Sadece izole unit testleri:

```powershell
python -m pytest -q
```

Unit + gerçek Supabase entegrasyon senaryoları:

```powershell
python -m scripts.run_tests --integration
```

Ayrı entegrasyon komutu:

```powershell
python -m pytest tests/integration/test_integration_suite.py -q
```

100 mesaj stres senaryosu:

```powershell
python -m tests.integration.scenario_100_messages
```

Çalışan API ve gerçek Supabase Auth kontrolü:

```powershell
python -m tests.live.live_check_auth
```

İlk admin hesabı kurulumu:

```powershell
python -m scripts.setup_admin
```

## Geliştirme endpointleri

Eski açık `/chat`, `/sellers` ve `/db-test` endpointleri kaldırılmıştır. Yerel geliştirme endpointlerini açmak için:

```env
ENABLE_DEV_ENDPOINTS=true
INTERNAL_API_TOKEN=uzun-rastgele-bir-deger
```

İsteklerde şu header zorunludur:

```text
X-Internal-Token: uzun-rastgele-bir-deger
```

Endpointler `/dev` altında açılır:

```text
POST /dev/chat
GET  /dev/db-test
POST /dev/sellers
GET  /dev/sellers
GET  /dev/sellers/{seller_id}
```

Production ortamında `ENABLE_DEV_ENDPOINTS=false` kalmalıdır.
