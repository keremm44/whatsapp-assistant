from __future__ import annotations


CLASSIFIER_SEMANTIC_SUFFIX = """
Ek ayrım kuralları:
- off_topic: mesajın anlamı açık ama ürün, sipariş, kişiselleştirme, kargo, iade veya işletme bağlamıyla ilgisizse kullan. Spor, hava durumu, siyaset, genel bilgi gibi açıkça ilgisiz konular off_topic'tir.
- unclear: mesajın ne istediği kendi başına anlaşılamıyorsa kullan. Anlamı açık fakat konu dışı mesajı unclear yapma.
- image_question: fotoğraf/görselin gönderilmesi, seçilmesi veya hangi baskı alanında kullanılacağının belirtilmesi bu intent kapsamındadır.
- Sadece fotoğrafın ön/arka yüz gibi baskı alanına atanması design_request değildir; image_question olarak kalmalıdır.

Fiyat / indirim ayrımı:
- discount_request: müşteri açıkça indirim, iskonto, kampanya veya adet nedeniyle fiyat avantajı istiyorsa kullan. "Üç tane alsam indirim olur mu?" discount_request'tir; price_question değildir.
- price_question: müşteri ürünün normal fiyatını, toplam tutarı veya ücretini soruyorsa kullan; indirim talebi yoksa price_question'tır.
- Aynı mesajda hem indirim hem kargo/fiyat gibi başka ihtiyaç varsa discount_request detected_intents içinde mutlaka korunmalıdır. Açık indirim talebini yalnız price_question'a dönüştürme.

Sipariş durumu ayrımı:
- order_intent: müşteri YENİ bir sipariş vermek/satın almak istediğini söylüyorsa kullan. "Sipariş vermek istiyorum", "iki tane alacağım" gibi geleceğe dönük satın alma isteğidir.
- order_confirmation_yes: müşteri siparişi ZATEN verdiğini/onayladığını belirtiyorsa kullan. "Evet, siparişi siteden verdim", "siparişimi oluşturdum", "siparişim zaten var" yeni sipariş isteği değildir.
- order_confirmation_no: müşteri henüz sipariş vermediğini açıkça belirtiyorsa kullan.
- Geçmişte tamamlanmış sipariş verme eylemini order_intent olarak sınıflandırma.
""".strip()
