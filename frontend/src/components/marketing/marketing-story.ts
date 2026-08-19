export const MARKETING_STORY = {
  storeLabel: "Kişiye özel kupa mağazası",
  customerQuestion: "Kupanız mikrodalgaya girer mi?",
  assistantAnswer: "Evet, kupalarımız mikrodalgada kullanılabilir.",
  unknownQuestion: "Hediye kutusu da gönderiyor musunuz?",
  unknownAnswer:
    "Bu konuda kayıtlı net bir bilgimiz bulunmuyor. Sorunuzu satıcımıza iletiyorum.",
  returnQuestion: "Ürünüm kırık geldi, iade etmek istiyorum.",
  returnSystemOutcome:
    "Otomatik yanıt durur ve konuşma İade incelemesi durumuna geçer.",
  returnSellerOutcome: "Panelde İncelemeniz gerekiyor olarak görünür.",
  ledger: {
    known: {
      time: "08:42",
      topic: "Ürün bilgisi",
      message: "Kupanız mikrodalgaya girer mi?",
      owner: "Asistan",
      outcome: "Kayıtlı bilgiyle cevaplandı",
    },
    unknown: {
      time: "09:17",
      topic: "Bilinmeyen soru",
      message: "Hediye kutusu da gönderiyor musunuz?",
      owner: "Satıcıya bırakıldı",
      outcome: "Net bilgi bulunmadığı için uydurulmadı",
    },
    routine: {
      time: "10:21",
      topic: "Kargo",
      message: "Siparişim ne zaman kargoya verilir?",
      owner: "Asistan",
      outcome: "Kayıtlı teslimat bilgisiyle ilerledi",
    },
    returnReview: {
      time: "11:03",
      topic: "İade talebi",
      message: "Ürünüm kırık geldi, iade etmek istiyorum.",
      owner: "Karar gerekiyor",
      outcome: "Otomatik yanıt durdu",
    },
  },
} as const;
