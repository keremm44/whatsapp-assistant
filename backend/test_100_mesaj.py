"""
100 farklı mesajla sistemi test eder.
Sonuçları dosyaya kaydeder.
"""

from chat_service import sohbet_isle
import time
import json

# Test mesajları
TEST_MESAJLARI = {
    "Basit Selamlar": [
        "Merhaba", "Selam", "İyi günler", "Naber",
        "Selamun aleykum", "Aleykum selam", "Hey",
        "Selamlar", "Kolay gelsin", "Hayırlı işler"
    ],
    "Fiyat Sorguları": [
        "Kupanız kaç lira?", "Fiyatlar nasıl?",
        "En ucuz kupa kaç para?", "Toplu alımda indirim var mı?",
        "50 tane alsam ne yaparsınız?", "1 kupa kaç?",
        "Fiyat listesi gönderir misiniz?", "Ücret bilgisi rica ederim",
        "Kaça geliyor bu iş?", "Bütçem 200 lira, ne alabilirim?"
    ],
    "İndirim/Pazarlık": [
        "İndirim yapar mısınız?", "Kupon var mı?",
        "İlk siparişte indirim?", "Öğrenci indirimi var mı?",
        "Yok abi biraz kırın", "300 verirsen alırım",
        "Rakibiniz daha ucuz veriyor", "İkinci alımda indirim?",
        "Sadık müşteriyim, ne yaparsın?",
        "Arkadaşımdan buldum 100 lira ucuz"
    ],
    "Kargo/Teslimat": [
        "Kargo ne zaman gelir?", "Kaç günde gelir?",
        "İstanbul'a ne zaman ulaşır?", "Kargo ücreti kim öder?",
        "Bugün sipariş versem yarın gelir mi?",
        "Aynı gün kargo yapıyor musunuz?", "MNG mi Yurtiçi mi?",
        "Kapıda ödeme var mı?", "Yurt dışına gönderir misiniz?",
        "Kargo firması hangisi?"
    ],
    "Ürün Soruları": [
        "Hangi renklerde var?", "Kupanın hacmi ne kadar?",
        "Mikrodalgaya girer mi?", "Bulaşık makinesine girer mi?",
        "Baskı ne kadar dayanır?", "Silinir mi zamanla?",
        "Porselen mi seramik mi?", "Kaç renk baskı yapabiliyorsunuz?",
        "İki taraflı baskı var mı?", "Kulp da baskı olur mu?"
    ],
    "Görsel/Tasarım İstekleri": [
        "Benim için görsel oluşturur musunuz?",
        "Tasarım yapar mısınız?", "Photoshop bilir misiniz?",
        "Logomu düzenleyin", "Fotoğrafımı güzelleştirir misiniz?",
        "Yazı fontunu değiştirin", "Renkleri siz seçin",
        "AI ile görsel yapın bana", "Örnek tasarımlar var mı?",
        "Bana ilham verin"
    ],
    "İade/Şikayet": [
        "Kupam kırık geldi", "Yanlış baskı yapılmış",
        "Beğenmedim iade istiyorum", "Rengi farklı çıktı",
        "Görsel bulanık basılmış", "Kupam çatlak",
        "Yanlış adrese gitmiş", "Kargo kaybolmuş",
        "İade nasıl yapılır?", "Param geri gelir mi?"
    ],
    "Sipariş Süreci": [
        "Sipariş vermek istiyorum", "Nasıl sipariş verebilirim?",
        "Sipariş numaram ETSY-12345", "Sipariş vermiştim, ne durumda?",
        "Siparişimi iptal edebilir miyim?",
        "Sipariş no unuttum ne yapayım", "Fotoğrafımı gönderiyorum",
        "Sipariş takibi nasıl?", "Ne zaman kargoya verilir?",
        "Acil bir siparişim var yardım"
    ],
    "Kötü Niyet/Küfür": [
        "Amk kupa gelmedi", "Şerefsiz misiniz?",
        "Sikik dükkanınız", "Orospu çocukları",
        "Piç kurusu satıcılar", "Anasını satiyim",
        "Fuck you", "Dava açacağım sizi",
        "Polise gideceğim", "Sizi mahvedeceğim"
    ],
    "Alakasız/Test": [
        "Bugün hava nasıl?", "Fenerbahçe kaç kazandı?",
        "Bana şiir yaz", "Uzun bir hikaye anlat",
        "Matematik ödevimi yapar mısın?",
        "Sen gerçekten insan mısın?", "Adın ne senin?",
        "Sevgilim var mı?", "Yemek tarifi ver",
        "Yapay zeka mısın?"
    ]
}


def test_calistir():
    """Tüm testleri çalıştırır"""
    seller_id = 2
    sonuclar = []
    toplam = 0
    basarili = 0
    engellendi = 0
    hata = 0
    
    for kategori, mesajlar in TEST_MESAJLARI.items():
        print(f"\n{'='*70}")
        print(f"KATEGORİ: {kategori}")
        print(f"{'='*70}")
        
        # Her kategori için farklı numara (yanlış blokla etkilenmesin)
        kategori_no = list(TEST_MESAJLARI.keys()).index(kategori)
        whatsapp = f"+90555{kategori_no:03d}0001"
        
        for i, mesaj in enumerate(mesajlar, 1):
            toplam += 1
            print(f"\n[{i}] 👤 {mesaj}")
            
            try:
                sonuc = sohbet_isle(
                    seller_id=seller_id,
                    whatsapp_number=whatsapp,
                    kullanici_mesaji=mesaj,
                    customer_name=f"Test {kategori}"
                )
                
                if sonuc["durum"] == "başarılı":
                    basarili += 1
                    cevap = sonuc.get("cevap", "")[:100]
                    print(f"    🤖 {cevap}")
                    
                    sonuclar.append({
                        "kategori": kategori,
                        "mesaj": mesaj,
                        "durum": "başarılı",
                        "cevap": sonuc.get("cevap", ""),
                        "kaynak": sonuc.get("kaynak", "")
                    })
                    
                elif sonuc["durum"] == "engellendi":
                    engellendi += 1
                    print(f"    🚫 ENGELLENDİ: {sonuc.get('sebep', '')}")
                    
                    sonuclar.append({
                        "kategori": kategori,
                        "mesaj": mesaj,
                        "durum": "engellendi",
                        "sebep": sonuc.get("sebep", "")
                    })
                    
                else:
                    hata += 1
                    print(f"    ❌ HATA: {sonuc.get('mesaj', '')}")
                    
                    sonuclar.append({
                        "kategori": kategori,
                        "mesaj": mesaj,
                        "durum": "hata",
                        "hata": sonuc.get("mesaj", "")
                    })
                
                # Rate limit için küçük bekleme
                time.sleep(0.5)
                
            except Exception as e:
                hata += 1
                print(f"    ❌ İSTİSNA: {str(e)}")
                sonuclar.append({
                    "kategori": kategori,
                    "mesaj": mesaj,
                    "durum": "istisna",
                    "hata": str(e)
                })
    
    # Özet
    print(f"\n{'='*70}")
    print("TEST SONUÇLARI ÖZETİ")
    print(f"{'='*70}")
    print(f"Toplam mesaj:  {toplam}")
    print(f"✅ Başarılı:   {basarili}")
    print(f"🚫 Engellendi: {engellendi}")
    print(f"❌ Hata:       {hata}")
    print(f"{'='*70}")
    
    # Sonuçları JSON'a kaydet
    with open("test_sonuclari.json", "w", encoding="utf-8") as f:
        json.dump(sonuclar, f, ensure_ascii=False, indent=2)
    
    print("\n📁 Detaylı sonuçlar: test_sonuclari.json")


if __name__ == "__main__":
    print("🚀 100 MESAJLIK TEST BAŞLIYOR...")
    print("⏱️  Yaklaşık 2-3 dakika sürecek")
    print()
    test_calistir()