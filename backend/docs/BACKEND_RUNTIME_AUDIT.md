# Backend çalışma zamanı denetimi

## Bu pakette düzeltilenler

- Supabase istemcisi import anında değil, ilk kullanımda oluşturuluyor.
- Sınıflandırıcı anahtarı eksik olduğunda uygulama kapanmıyor; güvenli kelime tabanlı fallback çalışıyor.
- Açık geliştirme endpointleri kaldırıldı ve `/dev/*` altında token korumasına alındı.
- Veritabanı readiness cevabı kayıt verisi veya ham hata döndürmüyor.
- Korumalı route'lardaki beklenmeyen veritabanı hataları istemciye ham exception olarak sızdırılmıyor.
- `HTTP_422_UNPROCESSABLE_CONTENT` sabitine geçildi.
- Unit, integration, live ve stress testleri ayrıldı.
- Testler için tek komutlu çalıştırıcı eklendi.
- `pytest` requirements listesine eklendi.
- README ve ortam değişkeni örneği güncellendi.

## Doğrulama

- Python sözdizimi/compile kontrolü temiz.
- İzole unit test sonucu: `35 passed`.
- Gerçek Supabase entegrasyon testleri bu denetim ortamında çalıştırılmadı; kullanıcının yerel ortamında çalıştırılmalıdır.

## Bilinçli olarak sonraya bırakılanlar

- Meta WhatsApp Cloud API webhook doğrulaması ve mesaj gönderimi
- Satıcı paneli konuşma devralma endpointleri
- Başvuru formunun public rate-limit/CAPTCHA korumalı endpointi
- Merkezi log/monitoring ve hata takip sistemi
- TestClient/httpx bağımlılık uyarısının upstream paket geçişi
