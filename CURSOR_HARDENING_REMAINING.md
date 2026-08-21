# Kalan Cursor Pagination ve Hardening Çalışması

## Mevcut, pushlanan durum

- API request ID, süre ve response-byte gözlemlenebilirliği var.
- Derin offset için HTTP ve ilgili servis sınırları var (`offset <= 10.000`).
- Seller list/detail payloadlarında güvenli projection iyileştirmeleri yapıldı.
- Return evidence metadata sayfalanıyor; seller panelinde “Daha fazla kanıt göster” akışı var.
- Dashboard action-count read modelinde seller-scoped 10 saniyelik in-process cache var.
- Return, unanswered ve conversation-control mutation’ları başarılı olduğunda bu seller cache’i temizleniyor.
- Signed, seller-bound opaque cursor kodlama/çözme altyapısı var.
- Orders, returns, unanswered ve messages için cursor sıralamasını destekleyen index migration’ı eklendi (`041`).

## Henüz uygulanacak cursor v2 işleri

Cursor altyapısı henüz kullanıcıya açık liste endpointlerine bağlanmadı. Aşağıdaki işler birlikte yapılmalıdır:

1. `GET /seller/orders/v2`
   - `(updated_at DESC, id DESC)` keyset sorgusu
   - signed `cursor`, `has_more`, `next_cursor`
   - legacy filtrelerin eşdeğer desteği
   - frontend orders incremental-load consumer geçişi

2. `GET /seller/return-issue-requests/v2`
   - `(updated_at DESC, id DESC)` keyset sorgusu
   - signed cursor response sözleşmesi
   - frontend returns list consumer geçişi

3. `GET /seller/unanswered-questions/v2`
   - `(last_seen_at DESC, id DESC)` keyset sorgusu
   - signed cursor response sözleşmesi
   - frontend unanswered list consumer geçişi

4. `GET /seller/conversations/v2`
   - Seller-panel read-model/RPC için stabil activity cursor tasarımı
   - gerekli RPC migration ve frontend consumer geçişi

## Uygulama kuralları

- Legacy offset endpointleri kaldırılmayacak; geriye uyumluluk korunacak.
- Cursor seller ID’ye imzalı olarak bağlı olacak ve başka tenant’ta fail-closed reddedilecek.
- Cursor filtre bağlamına da bağlanmalı; bir filtreyle üretilen cursor başka filtrede kullanılamamalı.
- Her v2 endpoint `limit <= 100` ile sınırlı olacak.
- Cursor response `items`, `has_more`, `next_cursor` döndürecek.
- Frontend yeni sayfaları mevcut sonuçlara ekleyecek; sonuçları gizleyen sabit limit uygulanmayacak.

## Cursor işi bittikten sonra katı final kontrol

1. Backend tam `pytest`
2. Frontend test, typecheck, lint ve production build
3. API contract testleri
4. `git diff --check`
5. Migration/index SQL incelemesi
6. Cache invalidation kapsam incelemesi
7. Kalan `select("*")` ve büyük payload taraması
