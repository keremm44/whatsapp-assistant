import re

from database import (
    get_or_create_customer,
    save_message,
    get_customer_messages,
    get_active_rules,
    get_seller_by_id,
    get_supabase
)
from ai_engine import cevap_uret

# =====================================================
# KÜFÜR/SALDIRI FİLTRESİ
# =====================================================

YASAK_KELIMELER = [
    # Küfür - temel
    "amk", "aq", "sg", "pezevenk", "orospu", "piç",
    "yarrak", "sik", "sikik", "siktim", "sikeceğim", "sikerim",
    "amına", "amına koyayım", "anan", "ananı", "anasını",
    "siktir", "sikeyim", "amcık", "amcığa", "göt",
    "ibne", "kahpe", "puşt", "şerefsiz", "namussuz",
    "orospunun", "orospuçocuğu",
    
    # Hakaret
    "salak", "aptal", "gerizekalı", "manyak", "hayvan",
    "eşek", "domuz", "pislik", "geri zekalı",
    
    # Tehdit / saldırı
    "öldürürüm", "gebertirim", "vururum", "keserim",
    "dava açarım", "şikayet edeceğim", "polise gideceğim",
    
    # İngilizce (yurt dışı için)
    "fuck", "shit", "bitch", "asshole", "dick",
    "motherfucker", "bastard", "fucking", "fucked",
]


def yasak_icerik_var_mi(mesaj: str) -> bool:
    """Mesajda küfür/saldırı var mı kontrol eder - tam kelime bazlı"""
    mesaj_lower = mesaj.lower()
    
    # Türkçe karakterler dahil kelimelere ayır
    kelimeler = re.findall(r'[\wşğıöüçİĞŞÖÜÇ]+', mesaj_lower)
    
    for kelime in kelimeler:
        # Tam kelime eşleşmesi
        if kelime in YASAK_KELIMELER:
            return True
    
    # Çok kelimeli ifadeler için kontrol (örn: "amına koyayım")
    coklu_ifadeler = ["amına koyayım", "orospu çocuğu", "geri zekalı"]
    for ifade in coklu_ifadeler:
        if ifade in mesaj_lower:
            return True
    
    return False


def musteriyi_blokla(customer_id: int):
    """Müşteriyi bloklu duruma getirir"""
    try:
        supabase = get_supabase()
        supabase.table("customers").update({
            "is_blocked": True
        }).eq("id", customer_id).execute()
        return True
    except Exception as e:
        print(f"Bloklama hatası: {e}")
        return False


# =====================================================
# KURAL EŞLEŞTİRME
# =====================================================

def basit_kural_esleme(mesaj: str, kurallar: list):
    """Kelime bazlı basit kural eşleştirme"""
    mesaj_lower = mesaj.lower().strip()
    
    for kural in kurallar:
        trigger = kural["trigger_text"].lower().strip()
        if trigger in mesaj_lower:
            return kural
    
    return None


# =====================================================
# ANA SOHBET FONKSİYONU
# =====================================================

def sohbet_isle(
    seller_id: int,
    whatsapp_number: str,
    kullanici_mesaji: str,
    customer_name: str = None
):
    """Ana sohbet fonksiyonu"""
    
    # 1. Satıcıyı doğrula
    seller_sonuc = get_seller_by_id(seller_id)
    if seller_sonuc.get("durum") != "başarılı":
        return {"durum": "hata", "mesaj": "Satıcı bulunamadı"}
    
    seller = seller_sonuc["satıcı"]
    store_name = seller["store_name"]
    store_link = seller.get("store_link")
    
    # 2. Müşteriyi bul veya oluştur
    customer_sonuc = get_or_create_customer(
        seller_id=seller_id,
        whatsapp_number=whatsapp_number,
        name=customer_name
    )
    
    if customer_sonuc.get("durum") == "hata":
        return {"durum": "hata", "mesaj": customer_sonuc["mesaj"]}
    
    customer = customer_sonuc["customer"]
    customer_id = customer["id"]
    
    # 3. Müşteri zaten bloklu mu?
    if customer.get("is_blocked"):
        return {
            "durum": "engellendi",
            "cevap": None,
            "sebep": "Müşteri bloklu",
            "customer_id": customer_id,
            "not": "Bu müşteri daha önce bloklanmış. Cevap verilmedi."
        }
    
    # 4. Gelen mesajı kaydet
    save_message(
        seller_id=seller_id,
        customer_id=customer_id,
        direction="incoming",
        content=kullanici_mesaji
    )
    
    # 5. KÜFÜR/SALDIRI KONTROLÜ
    if yasak_icerik_var_mi(kullanici_mesaji):
        # Müşteriyi otomatik blokla
        musteriyi_blokla(customer_id)
        
        # Hiçbir cevap gönderme
        return {
            "durum": "engellendi",
            "cevap": None,
            "sebep": "Uygunsuz içerik tespit edildi",
            "customer_id": customer_id,
            "aksiyon": "Müşteri otomatik bloklandı",
            "not": "Cevap verilmedi. Panelde satıcıya bildirim düşecek."
        }
    
    # 6. Kural eşleştirmesi
    kurallar_sonuc = get_active_rules(seller_id)
    kurallar = kurallar_sonuc.get("kurallar", [])
    
    eslesen_kural = basit_kural_esleme(kullanici_mesaji, kurallar)
    
    if eslesen_kural:
        cevap_metni = eslesen_kural["response_text"]
        cevap_kaynagi = "kural"
        
        save_message(
            seller_id=seller_id,
            customer_id=customer_id,
            direction="outgoing",
            content=cevap_metni,
            was_auto_replied=True,
            ai_confidence=1.0
        )
        
        return {
            "durum": "başarılı",
            "cevap": cevap_metni,
            "kaynak": cevap_kaynagi,
            "customer_id": customer_id
        }
    
    # 7. AI'dan cevap al
    ai_sonuc = cevap_uret(
        kullanici_mesaji=kullanici_mesaji,
        store_name=store_name,
        store_link=store_link
    )
    
    if ai_sonuc["durum"] != "başarılı":
        return {"durum": "hata", "mesaj": "AI cevap veremedi: " + ai_sonuc.get("mesaj", "")}
    
    cevap_metni = ai_sonuc["cevap"]
    
    # 8. AI cevabını kaydet
    save_message(
        seller_id=seller_id,
        customer_id=customer_id,
        direction="outgoing",
        content=cevap_metni,
        was_auto_replied=True,
        ai_confidence=0.8
    )
    
    return {
        "durum": "başarılı",
        "cevap": cevap_metni,
        "kaynak": "ai",
        "customer_id": customer_id,
        "kullanılan_token": ai_sonuc.get("kullanılan_token", 0)
    }


# =====================================================
# TEST
# =====================================================

if __name__ == "__main__":
    print("=" * 60)
    print("SOHBET TESTİ - KÜFÜR FİLTRESİ İLE")
    print("=" * 60)
    
    seller_id = 2
    whatsapp = "+905551112233"
    
    test_mesajlari = [
        "Merhaba",
        "Kupanız ne kadar?",
        "Sipariş vermek istiyorum",
        "Sıkıntı yaşıyorum",  # yanlış pozitif testi
    ]
    
    for mesaj in test_mesajlari:
        print(f"\n👤 Müşteri: {mesaj}")
        sonuc = sohbet_isle(
            seller_id=seller_id,
            whatsapp_number=whatsapp,
            kullanici_mesaji=mesaj,
            customer_name="Test Müşteri"
        )
        
        if sonuc["durum"] == "başarılı":
            print(f"🤖 Asistan: {sonuc['cevap']}")
            print(f"   Kaynak: {sonuc['kaynak']}")
            print(f"   Customer ID: {sonuc['customer_id']}")
        elif sonuc["durum"] == "engellendi":
            print(f"🚫 ENGELLENDİ: {sonuc.get('sebep')}")
            print(f"   Aksiyon: {sonuc.get('aksiyon', 'yok')}")
        else:
            print(f"❌ Hata: {sonuc.get('mesaj')}")
    
    # Küfür testi
    print("\n" + "=" * 60)
    print("KÜFÜR TESTİ (farklı numara)")
    print("=" * 60)
    
    kufur_whatsapp = "+905554445566"
    kufur_mesajlari = [
        "Merhaba",
        "amk kupa gelmedi",   # Küfür - bloklanacak
        "Merhaba tekrar",     # Bloklu - cevap verilmez
    ]
    
    for mesaj in kufur_mesajlari:
        print(f"\n👤 Müşteri: {mesaj}")
        sonuc = sohbet_isle(
            seller_id=seller_id,
            whatsapp_number=kufur_whatsapp,
            kullanici_mesaji=mesaj,
            customer_name="Küfürcü Test"
        )
        
        if sonuc["durum"] == "başarılı":
            print(f"🤖 Asistan: {sonuc['cevap']}")
        elif sonuc["durum"] == "engellendi":
            print(f"🚫 ENGELLENDİ: {sonuc.get('sebep')}")
            print(f"   Aksiyon: {sonuc.get('aksiyon', 'yok')}")
    
    # Yanlış pozitif testi
    print("\n" + "=" * 60)
    print("YANLIŞ POZİTİF TESTİ (temiz kelimeler)")
    print("=" * 60)
    
    temiz_whatsapp = "+905557778899"
    temiz_mesajlar = [
        "Merhaba, ben Canan",  # "anan" var ama isim
        "Sıkıntım var",         # "sik" içerir ama küfür değil
        "Götürebilir misin",    # "göt" içerir ama küfür değil
    ]
    
    for mesaj in temiz_mesajlar:
        print(f"\n👤 Müşteri: {mesaj}")
        sonuc = sohbet_isle(
            seller_id=seller_id,
            whatsapp_number=temiz_whatsapp,
            kullanici_mesaji=mesaj,
            customer_name="Canan Test"
        )
        
        if sonuc["durum"] == "başarılı":
            print(f"🤖 Asistan: {sonuc['cevap']}")
        elif sonuc["durum"] == "engellendi":
            print(f"🚫 ENGELLENDİ: {sonuc.get('sebep')}")