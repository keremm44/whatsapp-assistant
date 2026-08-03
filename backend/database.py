from supabase import create_client, Client
from dotenv import load_dotenv
import os

# .env dosyasını oku
load_dotenv()

# Supabase bilgileri
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Supabase client oluştur
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_supabase() -> Client:
    """Supabase client'ı döner"""
    return supabase


def test_connection():
    """Bağlantıyı test eder"""
    try:
        result = supabase.table("sellers").select("*").execute()
        return {
            "durum": "başarılı",
            "kayit_sayisi": len(result.data),
            "veriler": result.data
        }
    except Exception as e:
        return {
            "durum": "hata",
            "mesaj": str(e)
        }


# =====================================================
# SELLER (SATICI) FONKSİYONLARI
# =====================================================

def create_seller(name: str, email: str, store_name: str, phone: str = None):
    """Yeni satıcı ekler"""
    try:
        data = {
            "name": name,
            "email": email,
            "store_name": store_name,
            "status": "pending"
        }
        
        if phone:
            data["phone"] = phone
        
        result = supabase.table("sellers").insert(data).execute()
        return {
            "durum": "başarılı",
            "eklenen": result.data
        }
    except Exception as e:
        return {
            "durum": "hata",
            "mesaj": str(e)
        }


def get_all_sellers():
    """Tüm satıcıları listeler"""
    try:
        result = supabase.table("sellers").select("*").execute()
        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "satıcılar": result.data
        }
    except Exception as e:
        return {
            "durum": "hata",
            "mesaj": str(e)
        }


def get_seller_by_id(seller_id: int):
    """ID'ye göre satıcı getirir"""
    try:
        result = supabase.table("sellers").select("*").eq("id", seller_id).execute()
        if result.data:
            return {
                "durum": "başarılı",
                "satıcı": result.data[0]
            }
        else:
            return {
                "durum": "bulunamadı",
                "mesaj": f"ID {seller_id} olan satıcı yok"
            }
    except Exception as e:
        return {
            "durum": "hata",
            "mesaj": str(e)
        }


# =====================================================
# CUSTOMER (MÜŞTERİ) FONKSİYONLARI
# =====================================================

def get_or_create_customer(seller_id: int, whatsapp_number: str, name: str = None):
    """Müşteriyi bulur, yoksa oluşturur"""
    try:
        # Önce var mı diye bak
        result = supabase.table("customers").select("*").eq(
            "seller_id", seller_id
        ).eq("whatsapp_number", whatsapp_number).execute()
        
        if result.data:
            return {
                "durum": "mevcut",
                "customer": result.data[0]
            }
        
        # Yoksa oluştur
        data = {
            "seller_id": seller_id,
            "whatsapp_number": whatsapp_number,
            "total_messages": 0,
            "is_blocked": False
        }
        if name:
            data["name"] = name
        
        result = supabase.table("customers").insert(data).execute()
        return {
            "durum": "yeni_oluşturuldu",
            "customer": result.data[0]
        }
    except Exception as e:
        return {"durum": "hata", "mesaj": str(e)}


# =====================================================
# MESSAGE (MESAJ) FONKSİYONLARI
# =====================================================

def save_message(
    seller_id: int,
    customer_id: int,
    direction: str,
    content: str,
    message_type: str = "text",
    media_url: str = None,
    was_auto_replied: bool = False,
    ai_confidence: float = None
):
    """Mesajı veritabanına kaydeder"""
    try:
        data = {
            "seller_id": seller_id,
            "customer_id": customer_id,
            "direction": direction,
            "content": content,
            "message_type": message_type,
            "was_auto_replied": was_auto_replied
        }
        
        if media_url:
            data["media_url"] = media_url
        
        if ai_confidence is not None:
            data["ai_confidence"] = ai_confidence
        
        result = supabase.table("messages").insert(data).execute()
        return {"durum": "başarılı", "message": result.data[0]}
    except Exception as e:
        return {"durum": "hata", "mesaj": str(e)}


def get_customer_messages(customer_id: int, limit: int = 10):
    """Müşterinin son mesajlarını getirir"""
    try:
        result = supabase.table("messages").select("*").eq(
            "customer_id", customer_id
        ).order("created_at", desc=True).limit(limit).execute()
        
        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "mesajlar": result.data
        }
    except Exception as e:
        return {"durum": "hata", "mesaj": str(e)}


# =====================================================
# RULES (KURAL) FONKSİYONLARI
# =====================================================

def get_active_rules(seller_id: int):
    """Satıcının aktif kurallarını getirir"""
    try:
        result = supabase.table("rules").select("*").eq(
            "seller_id", seller_id
        ).eq("is_active", True).execute()
        
        return {
            "durum": "başarılı",
            "kurallar": result.data
        }
    except Exception as e:
        return {"durum": "hata", "mesaj": str(e)}


# =====================================================
# TEST BLOĞU
# =====================================================

if __name__ == "__main__":
    print("Supabase bağlantısı test ediliyor...")
    sonuc = test_connection()
    print(sonuc)