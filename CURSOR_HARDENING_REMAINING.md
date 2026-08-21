# Kalan Cursor Pagination ve Hardening Çalışması

> **Durum (2026-08-21): TAMAMLANDI.** Aşağıdaki 4 v2 endpoint md'de
> belirtilen yollarda açıldı, frontend consumer'ları geçiş yaptı ve
> katı final kontrol çalıştırıldı. Özgün görev listesi kayıt için
> korunur.

## Mevcut, pushlanan durum

- API request ID, süre ve response-byte gözlemlenebilirliği var.
- Derin offset için HTTP ve ilgili servis sınırları var (`offset <= 10.000`).
- Seller list/detail payloadlarında güvenli projection iyileştirmeleri yapıldı.
- Return evidence metadata sayfalanıyor; seller panelinde “Daha fazla kanıt göster” akışı var.
- Dashboard action-count read modelinde seller-scoped 10 saniyelik in-process cache var.
- Return, unanswered ve conversation-control mutation’ları başarılı olduğunda bu seller cache’i temizleniyor.
- Signed, seller-bound opaque cursor kodlama/çözme altyapısı var.
- Orders, returns, unanswered ve messages için cursor sıralamasını destekleyen index migration’ı eklendi (`041`).

## Uygulanan cursor v2 işleri

1. `GET /seller/orders/v2` — ✅
   - `(updated_at DESC, id DESC)` keyset sorgusu (2-tur same-time/older pattern, `cursor_queue_repository`)
   - signed `cursor`, `has_more`, `next_cursor` (HMAC, seller + queue + filtre-bound)
   - legacy filtrelerin eşdeğer desteği (view, status, product_id, image_missing, customer_id, external_order_number)
   - frontend orders incremental-load consumer geçişi (`orders-list-panel.tsx`, `orders-server.ts`)
2. `GET /seller/return-issue-requests/v2` — ✅
   - `(updated_at DESC, id DESC)` keyset sorgusu
   - signed cursor response sözleşmesi
   - frontend returns list consumer geçişi (`returns-list-panel.tsx`, `returns-server.ts`)
3. `GET /seller/unanswered-questions/v2` — ✅
   - `(last_seen_at DESC, id DESC)` keyset sorgusu
   - signed cursor response sözleşmesi
   - frontend unanswered list consumer geçişi (`unanswered-list-panel.tsx`, `unanswered-server.ts`)
4. `GET /seller/conversations/v2` — ✅
   - Seller-panel read-model/RPC stabil activity cursor: `public.get_seller_conversation_list_cursor` (migration `033`; mevcut RPC yeterli bulundu, yeni RPC migration gerekmedi)
   - frontend conversation + paused list consumer geçişi (`conversation-list-panel.tsx`, `paused-list-panel.tsx`, `conversations-server.ts`)

Eklenen altyapı:

- `backend/pagination.py`: `encode_seller_list_cursor` / `decode_seller_list_cursor`
  (payload `{v, s, q, f, p}`; prod'da `PAGINATION_CURSOR_SECRET` yoksa fail-closed).
- `backend/seller_list_v2_service.py`: 4 endpoint'in service katmanı; güvenli
  projection'larla (`columns` parametresi, `select("*")` yok).
- `contracts/seller-lists-v2.json`: v2 contract; frontend drift testi
  `seller-lists-v2-contract-drift.test.ts`.
- `PAGINATION_CURSOR_SECRET` → `backend/.env.example` + `render.yaml` (web service).
- Ön-mevcut test kırıklıkları giderildi: migration chain testi (`000..041`)
  ve action-count cache'i test sızıntısı (autouse cache reset fixture'ı).

## Uygulama kuralları (tümü sağlandı)

- Legacy offset endpointleri kaldırılmayacak; geriye uyumluluk korunacak. ✅ (legacy endpoint'lere ve `/seller/v2/*` yüzeyine sıfır dokunuş)
- Cursor seller ID'ye imzalı olarak bağlı olacak ve başka tenant'ta fail-closed reddedilecek. ✅ (422 `seller_list_v2_cursor_invalid`; test matrisi `test_seller_list_v2.py`)
- Cursor filtre bağlamına da bağlanmalı; bir filtreyle üretilen cursor başka filtrede kullanılamamalı. ✅ (filtre parmak izi, `compare_digest`)
- Her v2 endpoint `limit <= 100` ile sınırlı olacak. ✅
- Cursor response `items`, `has_more`, `next_cursor` döndürecek. ✅ (envelope TAMAMEN bu üç anahtar)
- Frontend yeni sayfaları mevcut sonuçlara ekleyecek; sonuçları gizleyen sabit limit uygulanmayacak. ✅ (append + id/customer-id dedupe güvenlik ağı; `has_more=false` iken buton kapanır)

## Katı final kontrol (çalıştırıldı, 2026-08-21)

1. Backend tam `pytest` — ✅ **1101 passed, 0 failed**
2. Frontend test, typecheck, lint ve production build — ✅ **550 passed / tsc temiz / 0 lint error (2 ön-mevcut warning) / build başarılı**
3. API contract testleri — ✅ v2 drift testleri + mevcut v1 drift testleri
4. `git diff --check` — ✅ temiz
5. Migration/index SQL incelemesi — ✅ yeni migration gerekmedi. Keyset sorguları `041` index'leriyle örtüşüyor: orders/returns `(seller_id, updated_at DESC, id DESC)`, unanswered `(seller_id, last_seen_at DESC, id DESC)`, conversations LATERAL mesaj bakışı `idx_messages_seller_created_id_desc`. `view=status` filtreli orders sorgusu için `033`'teki `idx_orders_seller_status_updated_id` de mevcut. Keyset'in 2-tur pattern'i (same-time + older) sayfa başına 2 index taraması yapar — mevcut `/seller/v2/*` yüzeyiyle aynı maliyet.
6. Cache invalidation kapsam incelemesi — ✅ v2 listeler doğrudan DB/RPC sorgusudur, read-model cache kullanmaz; yeni invalidasyon gerektirmez. Tek in-process cache (`seller_read_cache`, 10 sn) yalnızca action-count özetindedir ve mevcut invalidasyon noktaları (control/return/unanswered mutation → `invalidate_seller`) değişmeden geçerlidir.
7. Kalan `select("*")` ve büyük payload taraması — v2 yüzeyinde `select("*")` yok (güvenli projection'lar). Repo genelinde 24 yerleşik `select("*")` kalmış (ön-mevcut, bu görevin kapsamı dışı): `database/messaging.py` (6), `database/order_fields.py` (4), `database/onboarding.py` (4), `database/return_reads.py` (3), `database/profiles.py` (2), `database/applications.py` (2), `return_issue_repository.py` (1), `database/whatsapp_message_bridge.py` (1), `database/notifications.py` (1) + `cursor_queue_repository.py`'deki `columns or "*"` default'u (mevcut `/seller/v2/*` yüzeyinin davranışını korumak için bilinçli bırakıldı).

## Kalan öneriler (kapsam dışı, izleme listesi)

- `/seller/v2/*` (imzasız, seller-bound olmayan eski yüzey) frontend'de artık tüketilmiyor; ileride devre dışı bırakılabilir ama contract gereği bu görevde değiştirilmedi.
- 24 yerleşik `select("*")` maddesi ayrı bir hardening görevi olarak ele alınabilir.
- Gerçek Supabase üzerinde `EXPLAIN` ile index kullanım doğrulaması integration ortamında yapılabilir (unit suite sahte Supabase kullanır).
