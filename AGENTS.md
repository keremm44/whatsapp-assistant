# WhatsApp Asistan — Agent Talimatları

Bu dosya repository'nin tamamı için geçerlidir. Bir alt klasörde ayrıca `AGENTS.md` varsa, o klasörde çalışırken alt dosyadaki daha dar kurallar da uygulanır.

## 1. Çalışmaya başlamadan önce

Her görevde önce:

1. Bu `AGENTS.md` dosyasını oku.
2. `PROJECT_STRUCTURE.md` dosyasından ilgili katmanı ve kaynak-of-truth dosyalarını belirle.
3. Çalışacağın alanın kendi `AGENTS.md` dosyasını oku:
   - WhatsApp backend: `services/whatsapp/AGENTS.md`
   - Frontend: `frontend/AGENTS.md`
4. Değişiklik yapmadan önce ilgili mevcut kodu ve testleri incele.
5. İstenen davranışın mevcut API contract, auth, veri modeli veya state machine ile çelişip çelişmediğini kontrol et.

Tahmin ederek yeni mimari, endpoint, tablo, alan, durum kodu veya business rule üretme.

## 2. Ürün mimarisinin temel kuralları

- Sistem kişiselleştirilmiş ürün satıcıları için WhatsApp asistanıdır.
- Asistanın karar kaynağı satıcı kuralları, ürün bilgileri, şablonlar ve durum makinesidir.
- Niyet sınıflandırıcı yalnızca mesaj kategorisini belirler; business decision source değildir.
- Frontend business authority değildir. Frontend backend'den gelen durumu sunar ve izin verilen aksiyonları tetikler.
- Korunan satıcı işlemlerinde seller identity istemci tarafından güvenilir kabul edilmez; backend auth/token bağlamından çözülmelidir.
- `SUPABASE_SERVICE_KEY` yalnızca backend ortamında kalır. Frontend'e, loglara, örnek çıktılara veya commitlere taşınmaz.
- `contracts/` altındaki JSON dosyaları frontend-backend sözleşmesidir. Contract değişikliği tek taraflı yapılmaz.

## 3. Değişiklik sınırları

- Görevle ilgisiz dosyalara dokunma.
- Küçük bir feature/fix için geniş refactor yapma.
- Mevcut çalışan davranışı "temizlemek" amacıyla değiştirme.
- Dosya/klasör taşımayı yalnızca görev gerçekten gerektiriyorsa yap.
- Yeni dependency eklemeden önce mevcut dependency ve yardımcıları kullanmanın mümkün olup olmadığını kontrol et.
- CI, deployment, environment, auth, migration veya security ayarlarını görev açıkça gerektirmiyorsa değiştirme.
- `.env`, secret, token, private key veya gerçek credential commit etme.
- `main` branch'e doğrudan merge, force-push veya history rewrite yapma. Branch işlemleri ayrıca istenmedikçe yalnızca çalışma branch'i üzerinde kalmalı.

## 4. Database ve migration sınırları

Database değişikliği gerekiyorsa:

1. `services/whatsapp/migrations/` zincirini incele.
2. Mevcut migration dosyasını geriye dönük olarak değiştirme; yeni migration oluştur.
3. Migration numarası mevcut üç haneli sıralamanın devamı olmalı.
4. Uygulanmış migrationı yeniden çalıştırma.
5. Gerçek Supabase üzerinde işlem gerekiyorsa önce `public.schema_migrations` parity kontrolü yapılmalı.
6. Destructive migration, veri silme veya geri dönüşü zor DDL açıkça istenmedikçe uygulanmamalı.

Ek ayrıntı: `services/whatsapp/docs/APPLY_INSTRUCTIONS.md`.

## 5. API ve contract değişiklikleri

Endpoint request/response şekli, auth davranışı veya seller panel verisi değişiyorsa:

- İlgili backend route/service/database kodunu birlikte incele.
- `contracts/` altındaki ilgili contract'ı kontrol et.
- Frontend type/parser/helper kullanımını kontrol et.
- Mevcut consumer'ları bozan sessiz field rename/remove yapma.
- Yeni alan ekleniyorsa nullability, default ve backward compatibility açık olmalı.
- Raw backend/internal reason code'larını kullanıcı arayüzüne doğrudan basma; presentation mapping kullan.

## 6. Test zorunluluğu

Değişen alan için mümkün olan en dar testi önce çalıştır; ardından ilgili alanın tam kontrollerini çalıştır.

### Backend

`services/whatsapp/` içinde:

```powershell
python -m pytest -q
```

Gerçek Supabase entegrasyonu yalnızca görev gerektiriyorsa ve uygun environment mevcutsa:

```powershell
python -m scripts.run_tests --integration
```

### Frontend

`frontend/` içinde:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

- Test çalıştırılmadıysa "geçti" deme.
- Bir kontrol environment nedeniyle çalıştırılamadıysa bunu sonuçta açıkça belirt.
- Bug fix mümkünse regression test ile birlikte gelmeli.
- Feature mevcut behavior contract'ını değiştiriyorsa testler yeni contract'ı açık biçimde kanıtlamalı.

## 7. Güvenlik sınırları

- `/dev/*` endpointlerini production flow gibi kullanma.
- Development endpointleri `ENABLE_DEV_ENDPOINTS=true` ve `X-Internal-Token` koruması olmadan açılmamalı.
- Public endpointlere auth varmış gibi güvenme; abuse/rate/body-size savunmalarını bozma.
- Satıcıya ait resource erişiminde yalnızca request body/query içindeki seller id'ye güvenme.
- Secret değerleri hata mesajlarına, browser bundle'a veya test snapshot'larına sokma.
- Auth veya authorization bypass eden test amaçlı shortcut'ı production path'e ekleme.

## 8. Kod değişikliği çalışma biçimi

Her görevde şu sırayı izle:

1. İstenen davranışı tek cümlede tanımla.
2. Etkilenen kaynak-of-truth dosyalarını bul.
3. Mevcut testleri bul.
4. En küçük güvenli değişikliği yap.
5. Gerekli testi ekle/güncelle.
6. Dar testi çalıştır.
7. İlgili tam test/check setini çalıştır.
8. Sonuçta değişen dosyaları, behavior farkını ve çalıştırılan komutları yaz.

## 9. Yapılmaması gerekenler

- Repo içeriğini okumadan çözüm uydurmak.
- "Muhtemelen böyle" diyerek API/schema varsaymak.
- Testleri sadece değişikliğe uydurup eski davranış riskini görmezden gelmek.
- Unrelated formatting churn oluşturmak.
- Büyük dosyaları sebepsiz yeniden yazmak.
- Kullanıcı açıkça istemeden production verisi üzerinde write/delete işlemi yapmak.
- Kullanıcı açıkça istemeden dependency major version yükseltmek.
- Kullanıcı açıkça istemeden deployment config veya CI semantics değiştirmek.

## 10. Branch'e özel dikkat

`feature/paused-order-signal` üzerinde çalışırken paused conversation/order sinyali bir "tanıma/bağlam" bilgisidir; tek başına yeni operasyonel aksiyon üretmemelidir. Bu davranış değiştirilmek isteniyorsa önce ilgili paused UI, formatter ve testlerin mevcut intent'i birlikte incelenmelidir.
