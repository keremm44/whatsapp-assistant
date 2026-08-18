# Frontend Agent Talimatları

Bu dosya `frontend/` altındaki tüm çalışmalar için kök `AGENTS.md` kurallarını daraltır.

## 1. Frontend rolü

Frontend Next.js App Router tabanlı seller/admin arayüzüdür. Frontend'in görevi backend state'ini doğru, güvenli ve erişilebilir biçimde sunmak ve izin verilen API aksiyonlarını tetiklemektir.

Frontend business authority değildir; backend state veya auth kararını yeniden üretmeye çalışma.

## 2. Temel yapı

- `src/app/`: route, layout, loading ve page dosyaları.
- `src/app/seller/`: seller panel route'ları.
- `src/components/seller/`: seller domain bileşenleri.
- `src/components/admin/`: admin bileşenleri.
- `src/components/auth/`: auth UI parçaları.
- `src/components/shared/`: tekrar kullanılan uygulama bileşenleri.
- `src/components/ui/`: düşük seviyeli UI primitive'leri.
- `src/lib/`: API/data helper'ları, formatter'lar, domain yardımcıları ve testler.
- `src/config/`: frontend config.
- `src/middleware.ts`: route/auth middleware davranışı.
- `scripts/run-tests.mjs`: frontend test runner.

## 3. App Router ve component sınırları

- Mevcut Server/Client Component ayrımını koru.
- Sadece ihtiyaç varsa `"use client"` ekle.
- Page/layout dosyasına büyüyen presentation logic yığma; mevcut domain component yapısını kullan.
- Aynı formatter veya label mapping'i farklı componentlerde kopyalama; `src/lib/` veya mevcut shared helper'ı kullan.
- Route-specific loading UI varsa global loading behavior ile çeliştirme.
- Yeni navigation veya link davranışında mevcut route yapısını kontrol et; string URL tahmin etme.

## 4. API ve data sınırları

- Backend response alanını tahmin ederek kullanma; mevcut type/parser/helper ve `../contracts/` dosyalarını incele.
- Raw internal reason/state code kullanıcıya doğrudan gösterilmez; presentation mapping kullanılır.
- Backend ordering anlamlıysa client tarafında sessizce yeniden sıralama yapma.
- Seller ownership, role veya authorization kararını frontend kontrolüyle güvenli kabul etme.
- Secret veya service-role credential browser'a taşınmaz.
- Yeni ad-hoc fetch/client oluşturmadan önce `src/lib/` içindeki mevcut API katmanını bul.

## 5. Tasarım ve erişilebilirlik

- Var olan design token/class yapılarını kullan; görev istemedikçe yeni görsel dil icat etme.
- Shared component mevcutsa aynı UI pattern'ini tekrar kodlama.
- Interactive elementlerin keyboard/focus davranışını koru.
- Bir satırın tamamı link ise içine ikinci nested interactive control koyma.
- Renk tek başına durum anlatmasın; label/icon/text desteği kullan.
- Loading skeleton/signal gerçek layout'a yakın olmalı; layout shift oluşturan rastgele placeholder üretme.

## 6. `feature/paused-order-signal` intent'i

Paused seller ekranında mevcut davranışın önemli parçaları:

- Liste satırı önce pause reason bilgisini anlatır.
- Raw backend reason code kullanıcıya gösterilmez.
- Active order bilgisi bir recognition/context signal'dır; tek başına yeni operasyonel button/action değildir.
- Backend liste sıralaması korunur.
- Satırın tamamı mevcut Conversations workbench'e giden tek link olarak kalır; nested action eklenmez.
- Pause durumu alarm/error gibi kırmızı destructive chrome ile sunulmaz; güvenlik pause'u bir state'tir, acil hata değildir.
- Active order olmayan satırlar görsel olarak gereksiz yere güçlendirilmez.

Bu intent değiştirilmek isteniyorsa en az şu alanları birlikte incele:

- `src/components/seller/paused/`
- `src/lib/seller/paused-format.ts`
- `src/lib/seller/paused-format.test.ts`
- conversation type/data helper'ları
- ilgili seller paused route/page

## 7. Test ve kalite kontrolü

Önce değişen helper/component ile ilişkili en dar testi çalıştır. Ardından `frontend/` içinde:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

- Yeni formatter/domain helper davranışı test edilmelidir.
- Regression fix test olmadan bırakılmamalı; test yazmak teknik olarak mümkün değilse nedeni açıklanmalı.
- Type error'ı `any` ile susturmak varsayılan çözüm değildir.
- ESLint hatasını disable comment ile gizlemeden önce gerçek nedeni düzelt.
- Build sadece local dev render doğru görünüyor diye atlanmamalı.

## 8. Dependency ve stil sınırları

- Yeni npm dependency yalnızca mevcut stack ile çözülemeyen gerçek ihtiyaç varsa eklenir.
- `package-lock.json` görevle ilgisiz biçimde yeniden üretilmez.
- Major dependency upgrade görev dışında yapılmaz.
- Global CSS'e feature-specific tek kullanımlık kural eklemeden önce mevcut Tailwind/token yaklaşımını kullan.
- UI primitive değişikliği tüm consumer'ları etkileyebileceği için `src/components/ui/` değişikliklerinde kullanım alanlarını kontrol et.

## 9. Frontend'de özellikle yasak olan kestirmeler

- Backend auth eksikliğini client redirect ile "güvenli" saymak.
- Secret değerini `NEXT_PUBLIC_*` altına taşımak.
- Contract uyuşmazlığını `as any` ile gizlemek.
- Raw reason/state code basmak.
- Aynı status mapping'i birden fazla componentte ayrı ayrı üretmek.
- Küçük UI görevi için genel layout/design system refactor yapmak.
- Çalışan accessibility/focus davranışını görsel sadelik uğruna kaldırmak.
