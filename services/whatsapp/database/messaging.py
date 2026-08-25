from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database

    return database.get_supabase()


def utc_now():
    import database

    return database.utc_now()


def utc_iso() -> str:
    import database

    return database.utc_iso()


# =====================================================
# SELLER — SATICI FONKSİYONLARI
# =====================================================

def create_seller(
    name: str,
    email: str,
    store_name: str,
    phone: str | None = None,
    store_link: str | None = None,
) -> dict[str, Any]:
    """Yeni satıcı oluşturur."""
    try:
        data: dict[str, Any] = {
            "name": name,
            "email": email,
            "store_name": store_name,
            "status": "pending",
        }
        if phone:
            data["phone"] = phone
        if store_link:
            data["store_link"] = store_link
        result = get_supabase().table("sellers").insert(data).execute()
        return {"durum": "başarılı", "eklenen": result.data}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_all_sellers() -> dict[str, Any]:
    """Tüm satıcıları getirir."""
    try:
        result = (
            get_supabase().table("sellers")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "satıcılar": result.data,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_seller_by_id(seller_id: int) -> dict[str, Any]:
    """Satıcıyı ID ile getirir."""
    try:
        result = (
            get_supabase().table("sellers")
            .select("*")
            .eq("id", seller_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": f"ID {seller_id} olan satıcı bulunamadı.",
            }
        seller = result.data[0]
        if seller.get("store_link"):
            seller["store_link"] = seller["store_link"].strip()
        return {"durum": "başarılı", "satıcı": seller}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_seller_product_info(seller_id: int) -> dict[str, Any]:
    """Satıcının güvenilir ürün bilgilerini getirir."""
    try:
        result = (
            get_supabase().table("sellers")
            .select("product_info")
            .eq("id", seller_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "product_info": {}}
        return {
            "durum": "başarılı",
            "product_info": result.data[0].get("product_info") or {},
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc), "product_info": {}}


# =====================================================
# CUSTOMER — MÜŞTERİ FONKSİYONLARI
# =====================================================

def get_or_create_customer(
    seller_id: int,
    whatsapp_number: str,
    name: str | None = None,
) -> dict[str, Any]:
    """Müşteriyi bulur; yoksa oluşturur."""
    try:
        result = (
            get_supabase().table("customers")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("whatsapp_number", whatsapp_number)
            .limit(1)
            .execute()
        )
        if result.data:
            return {"durum": "mevcut", "customer": result.data[0]}

        data: dict[str, Any] = {
            "seller_id": seller_id,
            "whatsapp_number": whatsapp_number,
            "total_messages": 0,
            "is_blocked": False,
        }
        if name:
            data["name"] = name
        result = get_supabase().table("customers").insert(data).execute()
        return {"durum": "yeni_oluşturuldu", "customer": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_customer_by_id(customer_id: int) -> dict[str, Any]:
    """Müşteriyi ID ile getirir."""
    try:
        result = (
            get_supabase().table("customers")
            .select("*")
            .eq("id", customer_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Müşteri bulunamadı."}
        return {"durum": "başarılı", "customer": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_customers_by_ids(
    seller_id: int,
    customer_ids: list[int],
) -> dict[str, Any]:
    """Verilen müşteri kimliklerini tek seller-scoped toplu sorguyla okur."""
    if not _is_positive_int(seller_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    unique_ids: list[int] = []
    seen_ids: set[int] = set()
    for customer_id in customer_ids:
        if not _is_positive_int(customer_id):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "customer_ids pozitif tam sayılar içermelidir.",
            }
        if customer_id in seen_ids:
            continue
        seen_ids.add(customer_id)
        unique_ids.append(customer_id)

    if len(unique_ids) > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "customer_ids en fazla 100 kayıt içerebilir.",
        }
    if not unique_ids:
        return {"durum": "başarılı", "customers": []}

    try:
        result = (
            get_supabase().table("customers")
            .select("id,whatsapp_number")
            .eq("seller_id", seller_id)
            .in_("id", unique_ids)
            .execute()
        )
        return {"durum": "başarılı", "customers": result.data}
    except Exception:
        return {"durum": "hata", "mesaj": "Müşteriler okunamadı."}


def increment_customer_message_count(customer_id: int) -> dict[str, Any]:
    """Müşterinin toplam mesaj sayısını artırır."""
    try:
        customer_result = get_customer_by_id(customer_id)
        if customer_result.get("durum") != "başarılı":
            return customer_result
        customer = customer_result["customer"]
        current_count = int(customer.get("total_messages") or 0)
        result = (
            get_supabase().table("customers")
            .update(
                {
                    "total_messages": current_count + 1,
                    "last_message_at": utc_iso(),
                }
            )
            .eq("id", customer_id)
            .execute()
        )
        return {
            "durum": "başarılı",
            "customer": result.data[0] if result.data else None,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


# =====================================================
# MESSAGE — MESAJ VE IDEMPOTENCY
# =====================================================

def check_message_duplicate(
    provider: str,
    provider_message_id: str | None,
) -> dict[str, Any]:
    """Sağlayıcı mesajının daha önce kaydedilip kaydedilmediğini kontrol eder."""
    if not provider_message_id:
        return {"durum": "başarılı", "duplicate": False, "message": None}
    try:
        result = (
            get_supabase().table("messages")
            .select("*")
            .eq("provider", provider)
            .eq("provider_message_id", provider_message_id)
            .limit(1)
            .execute()
        )
        return {
            "durum": "başarılı",
            "duplicate": bool(result.data),
            "message": result.data[0] if result.data else None,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc), "duplicate": False}


def save_message(
    seller_id: int,
    customer_id: int,
    direction: str,
    content: str | None,
    message_type: str = "text",
    media_url: str | None = None,
    was_auto_replied: bool = False,
    ai_confidence: float | None = None,
    provider: str = "internal",
    provider_message_id: str | None = None,
) -> dict[str, Any]:
    """Mesajı kaydeder ve duplicate mesajları engeller."""
    try:
        if provider_message_id:
            duplicate_result = check_message_duplicate(
                provider=provider,
                provider_message_id=provider_message_id,
            )
            if duplicate_result.get("durum") == "hata":
                return duplicate_result
            if duplicate_result.get("duplicate"):
                return {
                    "durum": "duplicate",
                    "message": duplicate_result.get("message"),
                    "mesaj": "Mesaj daha önce işlendi.",
                }

        data: dict[str, Any] = {
            "seller_id": seller_id,
            "customer_id": customer_id,
            "direction": direction,
            "content": content,
            "message_type": message_type,
            "was_auto_replied": was_auto_replied,
            "provider": provider,
            "provider_message_id": provider_message_id,
        }
        if media_url:
            data["media_url"] = media_url
        if ai_confidence is not None:
            data["ai_confidence"] = ai_confidence

        result = get_supabase().table("messages").insert(data).execute()
        if direction == "incoming":
            increment_customer_message_count(customer_id)
        return {"durum": "başarılı", "message": result.data[0]}
    except Exception as exc:
        error_text = str(exc)
        if "duplicate key" in error_text.lower() or "23505" in error_text:
            return {
                "durum": "duplicate",
                "message": None,
                "mesaj": "Mesaj daha önce işlendi.",
            }
        return {"durum": "hata", "mesaj": error_text}


def get_customer_messages(
    customer_id: int,
    limit: int = 10,
) -> dict[str, Any]:
    """Müşterinin son mesajlarını getirir."""
    try:
        result = (
            get_supabase().table("messages")
            .select("*")
            .eq("customer_id", customer_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "mesajlar": result.data,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_seller_message_media_reference(
    seller_id: int,
    message_id: int,
) -> dict[str, Any]:
    """Medya proxy uç noktası için mesajın medya referansını tenant scope'unda okur."""
    if not _is_positive_int(seller_id) or not _is_positive_int(message_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve message_id pozitif tam sayı olmalıdır.",
        }
    try:
        result = (
            get_supabase().table("messages")
            .select("id, customer_id, message_type, media_url")
            .eq("id", message_id)
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {"durum": "hata", "mesaj": "Mesaj medya bilgisi okunamadı."}

    rows = result.data or []
    if not rows:
        return {
            "durum": "bulunamadı",
            "mesaj": "Mesaj bulunamadı.",
            "message": None,
        }
    row = rows[0]
    return {
        "durum": "başarılı",
        "message": {
            "id": row.get("id"),
            "customer_id": row.get("customer_id"),
            "message_type": row.get("message_type"),
            "media_url": row.get("media_url"),
        },
    }


# =====================================================
# CUSTOMER SECURITY — MUTE VE BLOCK
# =====================================================

def is_customer_muted(customer: dict[str, Any]) -> bool:
    """Müşterinin aktif olarak susturulup susturulmadığını kontrol eder."""
    muted_until = customer.get("muted_until")
    if not muted_until:
        return False
    try:
        muted_datetime = datetime.fromisoformat(str(muted_until).replace("Z", "+00:00"))
        return muted_datetime > utc_now()
    except (TypeError, ValueError):
        return False


def mute_customer(customer_id: int, hours: int = 24) -> dict[str, Any]:
    """Müşteriyi belirli süre susturur."""
    try:
        muted_until = utc_now() + timedelta(hours=hours)
        result = (
            get_supabase().table("customers")
            .update({"muted_until": muted_until.isoformat()})
            .eq("id", customer_id)
            .execute()
        )
        return {
            "durum": "başarılı",
            "muted_until": muted_until.isoformat(),
            "customer": result.data[0] if result.data else None,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def unmute_customer(customer_id: int) -> dict[str, Any]:
    """Müşterinin susturmasını kaldırır."""
    try:
        result = (
            get_supabase().table("customers")
            .update({"muted_until": None})
            .eq("id", customer_id)
            .execute()
        )
        return {
            "durum": "başarılı",
            "customer": result.data[0] if result.data else None,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def block_customer(customer_id: int, reason: str) -> dict[str, Any]:
    """Müşteriyi kalıcı olarak bloklar."""
    try:
        result = (
            get_supabase().table("customers")
            .update(
                {
                    "is_blocked": True,
                    "blocked_reason": reason,
                    "blocked_at": utc_iso(),
                    "muted_until": None,
                }
            )
            .eq("id", customer_id)
            .execute()
        )
        return {
            "durum": "başarılı",
            "customer": result.data[0] if result.data else None,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def unblock_customer(customer_id: int) -> dict[str, Any]:
    """Müşterinin kalıcı bloğunu kaldırır."""
    try:
        result = (
            get_supabase().table("customers")
            .update(
                {
                    "is_blocked": False,
                    "blocked_reason": None,
                    "blocked_at": None,
                    "muted_until": None,
                }
            )
            .eq("id", customer_id)
            .execute()
        )
        return {
            "durum": "başarılı",
            "customer": result.data[0] if result.data else None,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


# =====================================================
# CUSTOMER VIOLATIONS — İHLAL KAYITLARI
# =====================================================

def record_violation(
    seller_id: int,
    customer_id: int,
    severity: str,
    matched_term: str | None = None,
    message_id: int | None = None,
    action_taken: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Müşteri ihlalini tarihsel olarak kaydeder."""
    allowed_severities = {"low", "medium", "high", "critical"}
    if severity not in allowed_severities:
        return {"durum": "hata", "mesaj": f"Geçersiz severity: {severity}"}
    try:
        data: dict[str, Any] = {
            "seller_id": seller_id,
            "customer_id": customer_id,
            "severity": severity,
            "metadata": metadata or {},
        }
        if matched_term:
            data["matched_term"] = matched_term
        if message_id:
            data["message_id"] = message_id
        if action_taken:
            data["action_taken"] = action_taken
        result = get_supabase().table("customer_violations").insert(data).execute()
        (
            get_supabase().table("customers")
            .update({"last_violation_at": utc_iso()})
            .eq("id", customer_id)
            .execute()
        )
        return {"durum": "başarılı", "violation": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def count_recent_violations(
    seller_id: int,
    customer_id: int,
    days: int = 30,
) -> dict[str, Any]:
    """Son belirtilen gün içindeki ihlal sayısını döndürür."""
    try:
        start_date = utc_now() - timedelta(days=days)
        result = (
            get_supabase().table("customer_violations")
            .select("id", count="exact")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .gte("created_at", start_date.isoformat())
            .execute()
        )
        count = result.count if result.count is not None else len(result.data)
        return {"durum": "başarılı", "count": count, "window_days": days}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc), "count": 0}
