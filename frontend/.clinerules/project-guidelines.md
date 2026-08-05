# WhatsApp Asistan Proje Kuralları

- Çalışma kökü bu workspace içindeki `whatsapp-asistan` projesidir.
- Backend dosyaları yalnızca okunabilir; açıkça istenmedikçe değiştirilmez.
- Frontend geliştirmeleri yalnızca `frontend` klasörü içinde yapılır.
- Gizli anahtarlar, `.env` içerikleri ve service role bilgileri frontend'e taşınmaz.
- Kullanıcı arayüzünde ürün “yapay zekâ”, “AI”, “bot” veya “chatbot” olarak tanıtılmaz; “asistan” dili kullanılır.
- Tasarım sıcak, samimi, sade ve insancıl olmalıdır.
- Jenerik teknoloji SaaS görünümünden, neon mor/mavi paletten, robot ikonlarından ve aşırı glassmorphism kullanımından kaçınılır.
- Kendi kendine kayıt akışı oluşturulmaz.
- Yeni kullanıcı için ana eylem “Hemen Başla”dır.
- Satıcı girişi yalnızca önceden kabul edilmiş kullanıcılara açıktır.
- Admin girişi genel navigasyonda gösterilmez.
- Büyük değişikliklerden sonra lint ve production build çalıştırılır.
- Backend sözleşmesi bilinmiyorsa endpoint uydurulmaz ve sahte başarılı sonuç gösterilmez.
