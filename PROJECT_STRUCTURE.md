# WhatsApp Asistan — Project Structure

Bu dosya repository'nin yüksek seviyeli mimari haritasıdır. Ayrıntılı çalışma kuralları için kök `AGENTS.md`, `services/whatsapp/AGENTS.md` ve `frontend/AGENTS.md` dosyalarını kullan.

> Geçiş notu: mevcut backend servisi repository içinde `services/whatsapp/` altına taşınmıştır. Bu aşamada platform/control-plane ve Trendyol servisleri henüz fiziksel olarak ayrıştırılmamıştır.

## 1. Kök yapı

```text
whatsapp-assistant/
├── .github/
│   └── workflows/
│       └── ci.yml
├── services/
│   └── whatsapp/
│       ├── AGENTS.md
│       ├── main.py
│       ├── settings.py
│       ├── ai_engine.py
│       ├── auth_service.py
│       ├── api/
│       │   ├── router.py
│       │   ├── auth.py
│       │   ├── admin/
│       │   └── seller/
│       ├── public_routes.py
│       ├── admin_seller_routes.py
│       ├── admin_seller_service.py
│       ├── admin_seller_repository.py
│       ├── conversation_control_service.py
│       ├── cursor_queue_routes.py
│       ├── cursor_queue_service.py
│       ├── cursor_queue_repository.py
│       ├── chat_service/
│       ├── database/
│       ├── whatsapp_webhook/
│       ├── migrations/
│       ├── scripts/
│       ├── docs/
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── live/
│       ├── .env.example
│       ├── pytest.ini
│       └── requirements.txt
├── contracts/
│   ├── seller-conversations-unanswered-v1.json
│   └── seller-orders-returns-v1.json
├── frontend/
│   ├── AGENTS.md
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── config/
│   │   ├── lib/
│   │   └── middleware.ts
│   ├── public/
│   ├── scripts/
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.ts
│   └── .env.example
├── AGENTS.md
├── PROMPT.md
├── PROJECT_STRUCTURE.md
├── README.md
└── render.yaml
```

Bu harita önemli sorumluluk sınırlarını gösterir; tüm dosyaların eksiksiz envanteri değildir.

## 2. WhatsApp backend mimarisi

Mevcut WhatsApp servisi FastAPI + Supabase tabanlıdır ve `services/whatsapp/` altında çalışır.

### Uygulama girişi

`services/whatsapp/main.py`

Sorumluluklar:

- FastAPI app oluşturmak,
- middleware wiring,
- router wiring,
- health/readiness endpointleri,
- development endpointlerinin kontrollü biçimde bağlanması.

`main.py` business logic'in ana yeri değildir. Yeni domain davranışı mümkün olduğunda route/service/database katmanlarına ayrılmalıdır.

### Route katmanı

Önemli örnekler:

- `api/router.py`: authenticated/protected API composition sınırı.
- `api/auth.py`: protected auth surface.
- `api/seller/`: seller protected endpointlerinin native domain ownership modülleri; seller list v2 cursor endpointleri de ilgili domain modülünde bulunur.
- `api/admin/`: admin protected endpointlerinin native domain ownership modülleri.
- `public_routes.py`: public surface.
- `admin_seller_routes.py`: mevcut ayrı admin seller surface.
- `cursor_queue_routes.py`: queue/cursor API surface (mevcut `/seller/v2/*` iç yüzeyi; legacy).
- `whatsapp_webhook/`: WhatsApp provider giriş surface'i.

Route katmanı request validation, auth dependency ve HTTP response sınırıdır.

### Service / orchestration katmanı

Önemli örnekler:

- `auth_service.py`
- `admin_seller_service.py`
- `conversation_control_service.py`
- `cursor_queue_service.py`
- `seller_list_v2_service.py` (seller list v2: seller-bound imzalı cursor decode → keyset repository → compatibility presentation → next_cursor encode; contract: `contracts/seller-lists-v2.json`)
- `chat_service/`

`chat_service/` mesaj ve order konuşma akışının kritik alanıdır. Mevcut içerikte orkestrasyon, order helper/state, response ve return-flow sorumlulukları ayrı modüllere bölünmüştür.

Örnek alt yapı:

```text
services/whatsapp/chat_service/
├── __init__.py
├── content.py
├── dependencies.py
├── orchestrator.py
├── order_helpers.py
├── order_state.py
├── responses.py
├── return_flow.py
└── transport_context.py
```

### AI / classification

`services/whatsapp/ai_engine.py`

Niyet sınıflandırması ve AI yardımcıları burada bulunabilir; ancak classifier business state'in kaynak-of-truth'u değildir. Satıcı kuralları, ürün bilgileri, şablonlar ve state machine karar önceliğini korur.

### Database katmanı

`services/whatsapp/database/`

Domain odaklı Supabase read/write fonksiyonları burada tutulur. Mevcut yapı conversation, order, return, seller settings, rules, notifications ve benzeri alanları ayrı modüllere böler.

Önemli ilke:

```text
HTTP request
  -> route
  -> service/orchestrator
  -> database/repository
  -> Supabase
```

Her özellik birebir bu katman sayısını kullanmak zorunda değildir; ancak UI veya route içinde database/business logic biriktirilmemelidir.

### Migrationlar

`services/whatsapp/migrations/`

Schema history'nin mevcut kaynak-of-truth'udur.

Kurallar:

- üç haneli artan migration sırası,
- uygulanmış migrationı değiştirmeme,
- canlı DB öncesi `public.schema_migrations` parity kontrolü.

Ayrıntı: `services/whatsapp/docs/APPLY_INSTRUCTIONS.md`.

### Backend testleri

```text
services/whatsapp/tests/
├── unit/         # izole testler
├── integration/  # gerçek Supabase entegrasyonu
└── live/         # çalışan API/canlı auth kontrolleri
```

Temel CI testi:

```powershell
cd services/whatsapp
python -m pytest -q
```

## 3. Frontend mimarisi

Frontend Next.js 15 App Router + React 19 + TypeScript yapısındadır.

### Route katmanı

`frontend/src/app/`

Başlıca route grupları public/auth/admin/seller ekranlarını içerir.

Seller panelinde mevcut alanlar arasında şunlar bulunur:

```text
frontend/src/app/seller/
├── assistant-knowledge/
├── assistant-settings/
├── conversations/
├── order-collection/
├── orders/
├── paused/
├── products/
├── returns/
├── rules/
├── settings/
├── unanswered/
├── layout.tsx
├── loading.tsx
└── page.tsx
```

### Component katmanı

```text
frontend/src/components/
├── admin/
├── auth/
├── seller/
├── shared/
└── ui/
```

Sorumluluklar:

- `seller/`: seller domain presentation.
- `admin/`: admin presentation.
- `auth/`: auth presentation.
- `shared/`: uygulama genelinde tekrar kullanılan parçalar.
- `ui/`: düşük seviyeli UI primitive'leri.

### Lib katmanı

`frontend/src/lib/`

API/data helper'ları, formatter'lar, domain yardımcıları ve bunların testleri burada tutulur. Backend'den gelen internal code'ların kullanıcıya gösterilecek label/presentation'a dönüştürülmesi mümkün olduğunda component yerine burada merkezileştirilmelidir.

### Middleware

`frontend/src/middleware.ts`

Route/auth middleware davranışını içerir. Backend authorization'ın yerine geçmez.

### Frontend test ve kalite komutları

```powershell
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
```

CI bu dört kontrolü de çalıştırır.

## 4. Contract katmanı

`contracts/` frontend-backend veri sözleşmesinin açık dokümantasyon alanıdır.

Mevcut contract dosyaları:

- `seller-conversations-unanswered-v1.json`
- `seller-orders-returns-v1.json`
- `seller-lists-v2.json` (seller list v2 cursor yüzeyi: 4 endpoint, imzalı seller-bound cursor contractı, `{items, has_more, next_cursor}` envelope)

Bir endpoint/data model değişikliği bu contractlardan birini etkiliyorsa backend ve frontend tek başına güncellenmemelidir. Şunlar birlikte kontrol edilmelidir:

```text
WhatsApp backend producer
    <-> contracts/*.json
    <-> frontend consumer/type/helper
```

## 5. Authentication ve güvenlik kaynak-of-truth'u

### Backend

- gerçek authorization,
- seller identity resolution,
- protected resource ownership,
- service-role credential kullanımı.

### Frontend

- session/UI flow,
- navigation guard,
- kullanıcıya gösterilen auth state.

Frontend guard güvenlik sınırı olarak tek başına yeterli değildir.

## 6. Configuration

### Backend environment

Kaynak örnek:

`services/whatsapp/.env.example`

Önemli sınır:

`SUPABASE_SERVICE_KEY` backend secret'tır.

### Frontend environment

Kaynak örnek:

`frontend/.env.example`

Browser'a açık değişkenlerin gerçekten public olabileceği varsayılmalıdır. Secret değerler `NEXT_PUBLIC_*` altında tutulmaz.

### Deployment

`render.yaml`

Deployment davranışını etkiler. Feature işi açıkça deployment değişikliği istemiyorsa düzenlenmemelidir.

### CI

`.github/workflows/ci.yml`

PR/push `main` için:

- Python 3.12 backend unit testleri,
- Node 22 frontend test,
- typecheck,
- lint,
- build

çalıştırır.

## 7. Ana veri akışları

### WhatsApp mesaj akışı — yüksek seviye

```text
WhatsApp/provider
  -> services/whatsapp/whatsapp_webhook/
  -> chat service/orchestration
  -> seller rules + product/state context
  -> database
  -> response/provider flow
```

Classifier mesajın kategorisini destekler; domain karar kaynağının yerine geçmez.

### Seller panel akışı — yüksek seviye

```text
Next.js seller page
  -> frontend lib/API helper
  -> protected backend endpoint
  -> auth + seller ownership
  -> service/database
  -> Supabase
  -> typed/presented frontend state
```

## 8. `feature/paused-order-signal` özel alanı

Bu branch'te paused seller deneyimi özellikle dikkat gerektirir.

İlgili alanlar:

```text
frontend/src/app/seller/paused/
frontend/src/components/seller/paused/
frontend/src/lib/seller/paused-format.ts
frontend/src/lib/seller/paused-format.test.ts
frontend/src/lib/seller/freshness.ts
frontend/src/lib/seller/freshness.test.ts
```

Mevcut intent:

- pause reason önce görünür,
- raw reason code kullanıcıya çıkmaz,
- active order bilgisi recognition/context sinyalidir,
- active order sinyali kendi başına yeni action değildir,
- mevcut conversation workbench ana operasyonel geçiş olarak kalır,
- backend ordering korunur.

## 9. Bir değişiklik için nereye bakılmalı?

| İstenen değişiklik | İlk bakılacak alan |
|---|---|
| WhatsApp mesaj davranışı | `services/whatsapp/chat_service/`, `services/whatsapp/whatsapp_webhook/` |
| Order state değişikliği | `services/whatsapp/chat_service/order_state.py`, order helper/database kodu |
| Seller conversation kontrolü | `services/whatsapp/conversation_control_service.py` + ilgili database/frontend alanı |
| Protected API | `services/whatsapp/api/` + service/database + contract |
| Seller panel ekranı | `frontend/src/app/seller/` + `frontend/src/components/seller/` |
| Formatter/status label | `frontend/src/lib/` + ilgili test |
| Auth/ownership | backend auth/native protected route; frontend yalnızca UI/session consumer |
| DB schema | `services/whatsapp/migrations/` + database consumer + test |
| Request/response shape | backend producer + `contracts/` + frontend consumer |
| CI | `.github/workflows/ci.yml` |
| Deployment | `render.yaml` |

## 10. Dokümantasyon önceliği

Çelişki olduğunda çalışma sırasında şu sırayı kullan:

1. Çalışan kod ve testler.
2. İlgili `AGENTS.md` kuralları.
3. `contracts/` veri sözleşmeleri.
4. `services/whatsapp/docs/APPLY_INSTRUCTIONS.md` gibi operasyonel dokümanlar.
5. `PROJECT_STRUCTURE.md` yüksek seviyeli harita.
6. `README.md` genel kurulum/kullanım bilgisi.

Doküman ile çalışan kod çelişiyorsa sessizce birini seçme; farkı belirt ve görev kapsamında hangisinin güncellenmesi gerektiğini belirle.
