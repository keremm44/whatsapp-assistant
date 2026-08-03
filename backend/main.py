from fastapi import FastAPI
from dotenv import load_dotenv
import os
from database import test_connection, create_seller, get_all_sellers, get_seller_by_id
from chat_service import sohbet_isle
from pydantic import BaseModel

# .env dosyasını oku
load_dotenv()

# Chat için veri modeli
class ChatMesaj(BaseModel):
    seller_id: int
    whatsapp_number: str
    mesaj: str
    customer_name: str = None

# FastAPI uygulaması oluştur
app = FastAPI(title="WhatsApp Asistan API")


@app.get("/")
def ana_sayfa():
    return {
        "mesaj": "Sistem çalışıyor!",
        "durum": "aktif"
    }


@app.get("/test")
def test():
    return {
        "supabase_url": os.getenv("SUPABASE_URL"),
        "groq_key_var_mi": bool(os.getenv("GROQ_API_KEY")),
        "mesaj": "Ortam değişkenleri okundu"
    }


@app.get("/db-test")
def veritabani_testi():
    """Supabase bağlantısını test eder"""
    return test_connection()


@app.post("/sellers/create")
def yeni_satici_ekle():
    """Test satıcısı ekler"""
    return create_seller(
        name="Ahmet Yılmaz",
        email="ahmet@kupaAtolyesi.com",
        store_name="Ahmet Kupa Atölyesi",
        phone="+905551234567"
    )


@app.get("/sellers")
def tum_saticilari_getir():
    """Tüm satıcıları listeler"""
    return get_all_sellers()


@app.get("/sellers/{seller_id}")
def satici_detay(seller_id: int):
    """ID'ye göre satıcı getirir"""
    return get_seller_by_id(seller_id)

@app.post("/chat")
def chat(data: ChatMesaj):
    """
    Müşteri mesajını işler ve AI cevabı döner
    
    Kullanım:
    - seller_id: Hangi satıcının müşterisi (Ahmet için 2)
    - whatsapp_number: Müşteri telefon numarası
    - mesaj: Müşterinin yazdığı mesaj
    - customer_name: (opsiyonel) Müşteri adı
    """
    sonuc = sohbet_isle(
        seller_id=data.seller_id,
        whatsapp_number=data.whatsapp_number,
        kullanici_mesaji=data.mesaj,
        customer_name=data.customer_name
    )
    return sonuc