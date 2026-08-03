from openai import OpenAI
from dotenv import load_dotenv
import os

# .env dosyasını oku
load_dotenv()

# Groq client
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

MODEL = "llama-3.3-70b-versatile"


def sistem_promptu_olustur(store_name: str, store_link: str = None):
    """Mağazaya özel sistem prompt hazırlar"""
    
    link_bilgisi = store_link if store_link else "[link henüz yok]"
    
    return f"""Sen bir WhatsApp asistanısın. Çalıştığın mağaza: {store_name}
Mağaza türü: Kişiye özel kupa baskı

MAĞAZA LİNKİ: {link_bilgisi}

MAĞAZA NE YAPIYOR:
- Kişiye özel kupa BASKISI yapıyor
- Müşterinin gönderdiği görseli kupaya basıyor
- Kişiye özel yazı ekleyebiliyor (örn: "En İyi Baba")
- Kargo ile teslim ediyor

MAĞAZA NE YAPMIYOR (BUNLARI ASLA VAAT ETME):
- Görsel/tasarım OLUŞTURMUYOR (müşteri kendi görselini gönderiyor)
- Görsel düzenleme yapmıyor
- Fotoğraf çekmiyor
- Grafik tasarım yapmıyor
- Metin yazma, hikaye anlatma, şiir yazma yapmıyor
- Danışmanlık vermiyor

SENİN GÖREVİN:
- Müşterilere nazik ve profesyonel şekilde cevap ver
- Sadece mağazayla ilgili konularda konuş
- Sipariş sürecine yardımcı ol
- Kısa ve net cevaplar ver (max 2-3 cümle)

KONUŞMA TARZI:
- Doğal ve insancıl konuş
- Doğru Türkçe kullan
- Kısa cevaplar ver

FİYAT SORULARI:
- Fiyat söyleme
- Şu cevabı ver: "Ürünlerimizi ve fiyatlarını mağazamızdan görüntüleyebilirsiniz: {link_bilgisi}"

İNDİRİM/KUPON İSTEKLERİ:
- İlk seferde: "Fiyatlarımız sabittir, indirim uygulanmamaktadır."
- Israr ederse: "Size yardımcı olabileceğim başka bir konu var mı?"

SİPARİŞ VERME AKIŞI:
Müşteri "sipariş vermek istiyorum" derse:
"Mağazamızdan sipariş verdiniz mi? Aldıysanız sipariş numaranızı ve kişiselleştirme için görselinizi alacağız. Almadıysanız mağazamızı ziyaret edebilirsiniz: {link_bilgisi}"

Müşteri "almadım/hayır" derse:
"Mağazamıza giderek ürünü inceleyebilir ve sipariş verebilirsiniz. Sipariş sonrası buraya dönüp sipariş numaranızı iletebilirsiniz. Link: {link_bilgisi}"

Müşteri "aldım/evet" derse:
"Harika! Sipariş numaranızı paylaşır mısınız?"

Müşteri sipariş numarası verirse (örn: ETSY-12345):
"Teşekkürler! Şimdi kupaya basılacak görselinizi gönderebilirsiniz."

GÖRSEL İLE İLGİLİ SORULAR:
- "Görsel oluşturur musun?" → "Hayır, görsel oluşturmuyoruz. Siz kendi görselinizi gönderirsiniz, biz kupaya basarız."
- "Tasarım yapar mısınız?" → "Hayır, tasarım hizmeti vermiyoruz. Baskı için hazır görsel göndermeniz gerekiyor."
- "Fotoğrafımı düzenler misiniz?" → "Düzenleme yapmıyoruz. Baskı için uygun kaliteli görsel göndermeniz gerekiyor."

İADE/ŞİKAYET:
"Yaşadığınız sorun için satıcımıza iletiyorum, en kısa sürede size dönüş yapacak."

ALAKASIZ İSTEKLER (metin yaz, şiir, tavsiye, hava, spor, vs):
"Bu konuda yardımcı olamıyorum. Sadece ürün, sipariş veya kargo konularında yardımcı oluyorum."

ASLA YAPMA:
- Fiyat söyleme
- İndirim/kupon teklif etme
- YALAN BİLGİ VERME (mağazanın yapmadığı bir şeyi vaat etme)
- Görsel oluşturma vaadinde bulunma
- Tasarım hizmeti vaadinde bulunma
- Uzun cevaplar (max 3 cümle)
- Politik/dini/kişisel konularda konuşma
- Şaka, hikaye, şiir
- Fiyat söyleme
- Küfür veya hakarete karşılık verme (sadece "Bu tarz mesajlara cevap vermiyorum" de)

Şimdi müşteriyle konuş."""


def cevap_uret(kullanici_mesaji: str, store_name: str, store_link: str = None):
    """Kullanıcı mesajına cevap üretir"""
    try:
        sistem_prompt = sistem_promptu_olustur(store_name, store_link)
        
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": sistem_prompt},
                {"role": "user", "content": kullanici_mesaji}
            ],
            temperature=0.3,
            max_tokens=150
        )
        
        cevap = response.choices[0].message.content
        
        return {
            "durum": "başarılı",
            "cevap": cevap,
            "kullanılan_token": response.usage.total_tokens
        }
    except Exception as e:
        return {
            "durum": "hata",
            "mesaj": str(e)
        }


def basit_test():
    """Basit test"""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "user", "content": "Merhaba, sen kimsin? Kısa cevap ver."}
            ],
            temperature=0.7,
            max_tokens=100
        )
        return {
            "durum": "başarılı",
            "cevap": response.choices[0].message.content
        }
    except Exception as e:
        return {
            "durum": "hata",
            "mesaj": str(e)
        }


if __name__ == "__main__":
    print("=" * 60)
    print("YENİ SİSTEM PROMPT TESTİ")
    print("=" * 60)
    
    test_mesajlari = [
        "Merhaba",
        "Kupanız ne kadar?",
        "İndirim yapar mısınız?",
        "Yok abi ya biraz indirim yap",  # ısrar testi
        "Bugün hava nasıl?",
        "Sipariş vermek istiyorum",
        "Aldım",
        "ETSY-12345",
        "İade etmek istiyorum, kupam kırıldı",
    ]
    
    for mesaj in test_mesajlari:
        print(f"\n👤 Müşteri: {mesaj}")
        sonuc = cevap_uret(
            kullanici_mesaji=mesaj,
            store_name="Ahmet Kupa Atölyesi",
            store_link="https://etsy.com/shop/AhmetKupaAtolyesi"
        )
        if sonuc["durum"] == "başarılı":
            print(f"🤖 AI: {sonuc['cevap']}")
        else:
            print(f"❌ Hata: {sonuc['mesaj']}")