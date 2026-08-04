from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client
import os
import re
import unicodedata


# =====================================================
# SUPABASE BAĞLANTISI
# =====================================================

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL ortam değişkeni bulunamadı.")

if not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_KEY ortam değişkeni bulunamadı.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_supabase() -> Client:
    """Supabase istemcisini döndürür."""
    return supabase


def utc_now() -> datetime:
    """UTC zamanını timezone bilgili olarak döndürür."""
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    """Supabase için ISO formatında UTC zamanı döndürür."""
    return utc_now().isoformat()


def test_connection() -> dict[str, Any]:
    """Supabase bağlantısını test eder."""
    try:
        result = supabase.table("sellers").select("*").execute()

        return {
            "durum": "başarılı",
            "kayit_sayisi": len(result.data),
            "veriler": result.data,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


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

        result = supabase.table("sellers").insert(data).execute()

        return {
            "durum": "başarılı",
            "eklenen": result.data,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def get_all_sellers() -> dict[str, Any]:
    """Tüm satıcıları getirir."""
    try:
        result = (
            supabase.table("sellers")
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
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }

def get_seller_by_id(seller_id: int) -> dict[str, Any]:
    """Satıcıyı ID ile getirir."""
    try:
        result = (
            supabase.table("sellers")
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

        return {
            "durum": "başarılı",
            "satıcı": seller,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def get_seller_product_info(seller_id: int) -> dict[str, Any]:
    """Satıcının güvenilir ürün bilgilerini getirir."""
    try:
        result = (
            supabase.table("sellers")
            .select("product_info")
            .eq("id", seller_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "product_info": {},
            }

        return {
            "durum": "başarılı",
            "product_info": result.data[0].get("product_info") or {},
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
            "product_info": {},
        }


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
            supabase.table("customers")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("whatsapp_number", whatsapp_number)
            .limit(1)
            .execute()
        )

        if result.data:
            return {
                "durum": "mevcut",
                "customer": result.data[0],
            }

        data: dict[str, Any] = {
            "seller_id": seller_id,
            "whatsapp_number": whatsapp_number,
            "total_messages": 0,
            "is_blocked": False,
        }

        if name:
            data["name"] = name

        result = supabase.table("customers").insert(data).execute()

        return {
            "durum": "yeni_oluşturuldu",
            "customer": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def get_customer_by_id(customer_id: int) -> dict[str, Any]:
    """Müşteriyi ID ile getirir."""
    try:
        result = (
            supabase.table("customers")
            .select("*")
            .eq("id", customer_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Müşteri bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "customer": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def increment_customer_message_count(customer_id: int) -> dict[str, Any]:
    """Müşterinin toplam mesaj sayısını artırır."""
    try:
        customer_result = get_customer_by_id(customer_id)

        if customer_result.get("durum") != "başarılı":
            return customer_result

        customer = customer_result["customer"]
        current_count = int(customer.get("total_messages") or 0)

        result = (
            supabase.table("customers")
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
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


# =====================================================
# MESSAGE — MESAJ VE IDEMPOTENCY
# =====================================================

def check_message_duplicate(
    provider: str,
    provider_message_id: str | None,
) -> dict[str, Any]:
    """Sağlayıcı mesajının daha önce kaydedilip kaydedilmediğini kontrol eder."""
    if not provider_message_id:
        return {
            "durum": "başarılı",
            "duplicate": False,
            "message": None,
        }

    try:
        result = (
            supabase.table("messages")
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
        return {
            "durum": "hata",
            "mesaj": str(exc),
            "duplicate": False,
        }


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

        result = supabase.table("messages").insert(data).execute()

        if direction == "incoming":
            increment_customer_message_count(customer_id)

        return {
            "durum": "başarılı",
            "message": result.data[0],
        }

    except Exception as exc:
        error_text = str(exc)

        # Eş zamanlı iki webhook aynı mesajı kaydetmeye çalışırsa
        # veritabanı unique constraint'i devreye girer.
        if "duplicate key" in error_text.lower() or "23505" in error_text:
            return {
                "durum": "duplicate",
                "message": None,
                "mesaj": "Mesaj daha önce işlendi.",
            }

        return {
            "durum": "hata",
            "mesaj": error_text,
        }


def get_customer_messages(
    customer_id: int,
    limit: int = 10,
) -> dict[str, Any]:
    """Müşterinin son mesajlarını getirir."""
    try:
        result = (
            supabase.table("messages")
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
        return {
            "durum": "hata",
            "mesaj": str(exc),
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
        muted_datetime = datetime.fromisoformat(
            str(muted_until).replace("Z", "+00:00")
        )
        return muted_datetime > utc_now()

    except (TypeError, ValueError):
        return False


def mute_customer(
    customer_id: int,
    hours: int = 24,
) -> dict[str, Any]:
    """Müşteriyi belirli süre susturur."""
    try:
        muted_until = utc_now() + timedelta(hours=hours)

        result = (
            supabase.table("customers")
            .update(
                {
                    "muted_until": muted_until.isoformat(),
                }
            )
            .eq("id", customer_id)
            .execute()
        )

        return {
            "durum": "başarılı",
            "muted_until": muted_until.isoformat(),
            "customer": result.data[0] if result.data else None,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def unmute_customer(customer_id: int) -> dict[str, Any]:
    """Müşterinin susturmasını kaldırır."""
    try:
        result = (
            supabase.table("customers")
            .update({"muted_until": None})
            .eq("id", customer_id)
            .execute()
        )

        return {
            "durum": "başarılı",
            "customer": result.data[0] if result.data else None,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def block_customer(
    customer_id: int,
    reason: str,
) -> dict[str, Any]:
    """Müşteriyi kalıcı olarak bloklar."""
    try:
        result = (
            supabase.table("customers")
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
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def unblock_customer(customer_id: int) -> dict[str, Any]:
    """Müşterinin kalıcı bloğunu kaldırır."""
    try:
        result = (
            supabase.table("customers")
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
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


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
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz severity: {severity}",
        }

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

        result = (
            supabase.table("customer_violations")
            .insert(data)
            .execute()
        )

        (
            supabase.table("customers")
            .update({"last_violation_at": utc_iso()})
            .eq("id", customer_id)
            .execute()
        )

        return {
            "durum": "başarılı",
            "violation": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def count_recent_violations(
    seller_id: int,
    customer_id: int,
    days: int = 30,
) -> dict[str, Any]:
    """Son belirtilen gün içindeki ihlal sayısını döndürür."""
    try:
        start_date = utc_now() - timedelta(days=days)

        result = (
            supabase.table("customer_violations")
            .select("id", count="exact")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .gte("created_at", start_date.isoformat())
            .execute()
        )

        count = result.count if result.count is not None else len(result.data)

        return {
            "durum": "başarılı",
            "count": count,
            "window_days": days,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
            "count": 0,
        }


# =====================================================
# CONVERSATION STATE — DURUM MAKİNESİ
# =====================================================

VALID_STATES = {
    "NORMAL",
    "AWAITING_ORDER_CONFIRMATION",
    "AWAITING_ORDER_NUMBER",
    "AWAITING_IMAGE",
    "AWAITING_CUSTOM_TEXT",
    "AWAITING_SELLER",
}

STATE_TYPES = {
    "NORMAL": "no_lock",
    "AWAITING_ORDER_CONFIRMATION": "soft_lock",
    "AWAITING_ORDER_NUMBER": "soft_lock",
    "AWAITING_IMAGE": "soft_lock",
    "AWAITING_CUSTOM_TEXT": "soft_lock",
    "AWAITING_SELLER": "informational",
}

VALID_REASON_CODES = {
    "user_action",
    "timeout",
    "admin_override",
    "escalation",
    "violation",
    "system",
}

def _fetch_state_record(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any] | None:
    """
    State kaydını doğrudan veritabanından getirir.

    Bu fonksiyon zaman aşımı kontrolü veya state geçişi yapmaz.
    Böylece get_state ile transition_state arasında döngü oluşmaz.
    """
    result = (
        supabase.table("conversation_states")
        .select("*")
        .eq("seller_id", seller_id)
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )

    return result.data[0] if result.data else None

def get_state(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    """Müşterinin aktif konuşma durumunu getirir."""
    try:
        state = _fetch_state_record(
            seller_id=seller_id,
            customer_id=customer_id,
        )

        if not state:
            return {
                "durum": "başarılı",
                "state": {
                    "seller_id": seller_id,
                    "customer_id": customer_id,
                    "current_state": "NORMAL",
                    "state_type": "no_lock",
                    "state_data": {},
                    "expires_at": None,
                },
                "database_record_exists": False,
            }

        expires_at = state.get("expires_at")

        if expires_at:
            try:
                expires_datetime = datetime.fromisoformat(
                    str(expires_at).replace("Z", "+00:00")
                )

                if expires_datetime <= utc_now():
                    expired_state = state.get(
                        "current_state",
                        "NORMAL",
                    )

                    state_result = set_state(
                        seller_id=seller_id,
                        customer_id=customer_id,
                        current_state="NORMAL",
                        state_data={},
                        expires_at=None,
                    )

                    if state_result.get("durum") != "başarılı":
                        return state_result

                    transition_data = {
                        "seller_id": seller_id,
                        "customer_id": customer_id,
                        "from_state": expired_state,
                        "to_state": "NORMAL",
                        "reason_code": "timeout",
                        "metadata": {
                            "expired_state": expired_state,
                        },
                    }

                    transition_warning = None

                    try:
                        (
                            supabase.table("state_transitions")
                            .insert(transition_data)
                            .execute()
                        )
                    except Exception as transition_exc:
                        transition_warning = str(transition_exc)

                    response = {
                        "durum": "başarılı",
                        "state": state_result["state"],
                        "expired": True,
                        "database_record_exists": True,
                    }

                    if transition_warning:
                        response["uyarı"] = (
                            "State sıfırlandı ancak timeout geçiş "
                            f"kaydı yazılamadı: {transition_warning}"
                        )

                    return response

            except (TypeError, ValueError):
                pass

        return {
            "durum": "başarılı",
            "state": state,
            "database_record_exists": True,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def set_state(
    seller_id: int,
    customer_id: int,
    current_state: str,
    state_data: dict[str, Any] | None = None,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Konuşma durumunu oluşturur veya günceller."""
    if current_state not in VALID_STATES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz state: {current_state}",
        }

    try:
        data = {
            "seller_id": seller_id,
            "customer_id": customer_id,
            "current_state": current_state,
            "state_type": STATE_TYPES[current_state],
            "state_data": state_data or {},
            "expires_at": expires_at,
            "updated_at": utc_iso(),
        }

        result = (
            supabase.table("conversation_states")
            .upsert(
                data,
                on_conflict="seller_id,customer_id",
            )
            .execute()
        )

        return {
            "durum": "başarılı",
            "state": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def transition_state(
    seller_id: int,
    customer_id: int,
    to_state: str,
    reason_code: str,
    trigger_message_id: int | None = None,
    state_data: dict[str, Any] | None = None,
    expires_in_hours: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """State değiştirir ve geçiş kaydı oluşturur."""
    if to_state not in VALID_STATES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz hedef state: {to_state}",
        }

    if reason_code not in VALID_REASON_CODES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz reason_code: {reason_code}",
        }

    try:
        current_state_record = _fetch_state_record(
            seller_id=seller_id,
            customer_id=customer_id,
        )
    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": f"Mevcut state okunamadı: {exc}",
        }

    from_state = (
        current_state_record.get("current_state", "NORMAL")
        if current_state_record
        else "NORMAL"
    )

    expires_at = None

    if expires_in_hours is not None:
        expires_at = (
            utc_now() + timedelta(hours=expires_in_hours)
        ).isoformat()

    state_result = set_state(
        seller_id=seller_id,
        customer_id=customer_id,
        current_state=to_state,
        state_data=state_data,
        expires_at=expires_at,
    )

    if state_result.get("durum") != "başarılı":
        return state_result

    transition_data: dict[str, Any] = {
        "seller_id": seller_id,
        "customer_id": customer_id,
        "from_state": from_state,
        "to_state": to_state,
        "reason_code": reason_code,
        "metadata": metadata or {},
    }

    if trigger_message_id:
        transition_data["trigger_message_id"] = trigger_message_id

    try:
        transition_result = (
            supabase.table("state_transitions")
            .insert(transition_data)
            .execute()
        )

        return {
            "durum": "başarılı",
            "state": state_result["state"],
            "transition": (
                transition_result.data[0]
                if transition_result.data
                else None
            ),
        }

    except Exception as exc:
        return {
            "durum": "kısmi_başarılı",
            "state": state_result["state"],
            "mesaj": (
                "State güncellendi fakat geçiş kaydı oluşturulamadı: "
                f"{exc}"
            ),
        }


# =====================================================
# SELLER NOTIFICATIONS — SATICI BİLDİRİMLERİ
# =====================================================

VALID_NOTIFICATION_TYPES = {
    "new_order",
    "unanswered_question",
    "violation",
    "return_request",
    "complex_question",
    "system",
}

VALID_NOTIFICATION_SEVERITIES = {
    "info",
    "warning",
    "urgent",
}


def create_seller_notification(
    seller_id: int,
    notification_type: str,
    title: str,
    message: str,
    severity: str = "info",
    customer_id: int | None = None,
    related_entity_type: str | None = None,
    related_entity_id: int | None = None,
    action_url: str | None = None,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Satıcı için kalıcı panel bildirimi oluşturur."""
    if notification_type not in VALID_NOTIFICATION_TYPES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz bildirim tipi: {notification_type}",
        }

    if severity not in VALID_NOTIFICATION_SEVERITIES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz bildirim seviyesi: {severity}",
        }

    try:
        data: dict[str, Any] = {
            "seller_id": seller_id,
            "type": notification_type,
            "severity": severity,
            "title": title,
            "message": message,
        }

        optional_fields = {
            "customer_id": customer_id,
            "related_entity_type": related_entity_type,
            "related_entity_id": related_entity_id,
            "action_url": action_url,
            "expires_at": expires_at,
        }

        for key, value in optional_fields.items():
            if value is not None:
                data[key] = value

        result = (
            supabase.table("seller_notifications")
            .insert(data)
            .execute()
        )

        return {
            "durum": "başarılı",
            "notification": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def get_unread_notifications(
    seller_id: int,
    limit: int = 50,
) -> dict[str, Any]:
    """Satıcının okunmamış bildirimlerini getirir."""
    try:
        result = (
            supabase.table("seller_notifications")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("is_read", False)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "bildirimler": result.data,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def mark_notification_as_read(
    notification_id: int,
) -> dict[str, Any]:
    """Bildirimi okundu olarak işaretler."""
    try:
        result = (
            supabase.table("seller_notifications")
            .update(
                {
                    "is_read": True,
                    "read_at": utc_iso(),
                }
            )
            .eq("id", notification_id)
            .execute()
        )

        return {
            "durum": "başarılı",
            "notification": result.data[0] if result.data else None,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


# =====================================================
# UNANSWERED QUESTIONS — CEVAPLANAMAYAN SORULAR
# =====================================================

def normalize_question(question: str) -> str:
    """Soruyu basit gruplama için normalize eder."""
    normalized = question.lower().strip()

    normalized = unicodedata.normalize("NFKC", normalized)

    normalized = re.sub(
        r"[^\wşğıöüç\s]",
        " ",
        normalized,
        flags=re.UNICODE,
    )

    normalized = re.sub(r"\s+", " ", normalized).strip()

    return normalized


def save_unanswered_question(
    seller_id: int,
    question_text: str,
    category: str = "unclear",
    customer_id: int | None = None,
    source_message_id: int | None = None,
    suggested_field: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Cevaplanamayan soruyu kaydeder veya tekrar sayısını artırır."""
    normalized = normalize_question(question_text)

    try:
        existing_result = (
            supabase.table("unanswered_questions")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("normalized_question", normalized)
            .eq("is_resolved", False)
            .limit(1)
            .execute()
        )

        if existing_result.data:
            existing = existing_result.data[0]

            update_data: dict[str, Any] = {
                "times_asked": int(existing.get("times_asked") or 1) + 1,
                "last_asked_at": utc_iso(),
            }

            if customer_id is not None:
                update_data["customer_id"] = customer_id

            if source_message_id is not None:
                update_data["source_message_id"] = source_message_id

            if suggested_field:
                update_data["suggested_field"] = suggested_field

            result = (
                supabase.table("unanswered_questions")
                .update(update_data)
                .eq("id", existing["id"])
                .execute()
            )

            return {
                "durum": "güncellendi",
                "question": result.data[0],
            }

        data: dict[str, Any] = {
            "seller_id": seller_id,
            "question_text": question_text,
            "normalized_question": normalized,
            "category": category,
            "metadata": metadata or {},
        }

        if customer_id is not None:
            data["customer_id"] = customer_id

        if source_message_id is not None:
            data["source_message_id"] = source_message_id

        if suggested_field:
            data["suggested_field"] = suggested_field

        result = (
            supabase.table("unanswered_questions")
            .insert(data)
            .execute()
        )

        return {
            "durum": "başarılı",
            "question": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


# =====================================================
# RULES — KURAL FONKSİYONLARI
# =====================================================

def get_active_rules(seller_id: int) -> dict[str, Any]:
    """Satıcının aktif kurallarını getirir."""
    try:
        result = (
            supabase.table("rules")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("is_active", True)
            .execute()
        )

        return {
            "durum": "başarılı",
            "kurallar": result.data,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
            "kurallar": [],
        }


def increment_rule_hit_count(rule_id: int) -> dict[str, Any]:
    """Bir kuralın kullanım sayısını artırır."""
    try:
        current = (
            supabase.table("rules")
            .select("hit_count")
            .eq("id", rule_id)
            .limit(1)
            .execute()
        )

        if not current.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Kural bulunamadı.",
            }

        current_count = int(current.data[0].get("hit_count") or 0)

        result = (
            supabase.table("rules")
            .update({"hit_count": current_count + 1})
            .eq("id", rule_id)
            .execute()
        )

        return {
            "durum": "başarılı",
            "rule": result.data[0] if result.data else None,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }



# =====================================================
# SELLER APPLICATIONS — SATICI BAŞVURULARI
# =====================================================

VALID_APPLICATION_STATUSES = {
    "pending",
    "contacted",
    "approved",
    "rejected",
    "cancelled",
}


def create_seller_application(
    full_name: str,
    email: str,
    phone: str,
    store_name: str,
    store_link: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Yeni satıcı başvurusu oluşturur."""
    normalized_email = email.strip().lower()
    normalized_phone = phone.strip()

    if not full_name.strip():
        return {"durum": "hata", "mesaj": "Ad soyad zorunludur."}

    if not normalized_email:
        return {"durum": "hata", "mesaj": "E-posta zorunludur."}

    if not normalized_phone:
        return {"durum": "hata", "mesaj": "Telefon zorunludur."}

    if not store_name.strip():
        return {"durum": "hata", "mesaj": "Mağaza adı zorunludur."}

    try:
        data: dict[str, Any] = {
            "full_name": full_name.strip(),
            "email": normalized_email,
            "phone": normalized_phone,
            "store_name": store_name.strip(),
            "status": "pending",
        }

        if store_link and store_link.strip():
            data["store_link"] = store_link.strip()

        if notes and notes.strip():
            data["notes"] = notes.strip()

        result = (
            supabase.table("seller_applications")
            .insert(data)
            .execute()
        )

        return {
            "durum": "başarılı",
            "application": result.data[0],
        }

    except Exception as exc:
        error_text = str(exc)

        if "duplicate key" in error_text.lower() or "23505" in error_text:
            return {
                "durum": "duplicate",
                "mesaj": (
                    "Bu e-posta adresiyle açık bir başvuru zaten bulunuyor."
                ),
            }

        return {
            "durum": "hata",
            "mesaj": error_text,
        }


def get_seller_application_by_id(
    application_id: int,
) -> dict[str, Any]:
    """Satıcı başvurusunu ID ile getirir."""
    try:
        result = (
            supabase.table("seller_applications")
            .select("*")
            .eq("id", application_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Başvuru bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "application": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def get_seller_applications(
    status: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """Satıcı başvurularını listeler."""
    if status is not None and status not in VALID_APPLICATION_STATUSES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz başvuru durumu: {status}",
            "applications": [],
        }

    try:
        query = (
            supabase.table("seller_applications")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
        )

        if status is not None:
            query = query.eq("status", status)

        result = query.execute()

        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "applications": result.data,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
            "applications": [],
        }


def update_seller_application_status(
    application_id: int,
    status: str,
    admin_note: str | None = None,
    approved_seller_id: int | None = None,
) -> dict[str, Any]:
    """Başvuru durumunu günceller."""
    if status not in VALID_APPLICATION_STATUSES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz başvuru durumu: {status}",
        }

    try:
        update_data: dict[str, Any] = {
            "status": status,
        }

        if admin_note is not None:
            update_data["admin_note"] = admin_note.strip() or None

        if status == "contacted":
            update_data["contacted_at"] = utc_iso()

        if status == "approved":
            if approved_seller_id is None:
                return {
                    "durum": "hata",
                    "mesaj": (
                        "Onaylanan başvuru için approved_seller_id zorunludur."
                    ),
                }

            update_data["approved_at"] = utc_iso()
            update_data["approved_seller_id"] = approved_seller_id

        if status == "rejected":
            update_data["rejected_at"] = utc_iso()

        result = (
            supabase.table("seller_applications")
            .update(update_data)
            .eq("id", application_id)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Başvuru bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "application": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


# =====================================================
# USER PROFILES — GİRİŞ YAPAN KULLANICILAR
# =====================================================

VALID_USER_ROLES = {"admin", "seller"}
VALID_USER_STATUSES = {
    "invited",
    "active",
    "suspended",
    "deactivated",
}


def create_user_profile(
    auth_user_id: str,
    email: str,
    full_name: str,
    role: str,
    seller_id: int | None = None,
    status: str = "invited",
) -> dict[str, Any]:
    """
    Supabase Auth kullanıcısını uygulama profiline bağlar.

    Not:
    Bu fonksiyon auth.users kaydı oluşturmaz.
    auth_user_id önceden Supabase Auth tarafından oluşturulmuş olmalıdır.
    """
    if role not in VALID_USER_ROLES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz kullanıcı rolü: {role}",
        }

    if status not in VALID_USER_STATUSES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz kullanıcı durumu: {status}",
        }

    if role == "seller" and seller_id is None:
        return {
            "durum": "hata",
            "mesaj": "Satıcı rolü için seller_id zorunludur.",
        }

    if role == "admin" and seller_id is not None:
        return {
            "durum": "hata",
            "mesaj": "Admin rolü seller_id ile bağlanamaz.",
        }

    try:
        data: dict[str, Any] = {
            "auth_user_id": auth_user_id,
            "email": email.strip().lower(),
            "full_name": full_name.strip(),
            "role": role,
            "status": status,
            "seller_id": seller_id,
        }

        result = (
            supabase.table("user_profiles")
            .insert(data)
            .execute()
        )

        return {
            "durum": "başarılı",
            "profile": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def get_user_profile_by_auth_user_id(
    auth_user_id: str,
) -> dict[str, Any]:
    """Kullanıcı profilini Supabase Auth UUID ile getirir."""
    try:
        result = (
            supabase.table("user_profiles")
            .select("*")
            .eq("auth_user_id", auth_user_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Kullanıcı profili bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "profile": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def update_user_profile_status(
    profile_id: int,
    status: str,
) -> dict[str, Any]:
    """Kullanıcı profilinin erişim durumunu günceller."""
    if status not in VALID_USER_STATUSES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz kullanıcı durumu: {status}",
        }

    try:
        result = (
            supabase.table("user_profiles")
            .update({"status": status})
            .eq("id", profile_id)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Kullanıcı profili bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "profile": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


# =====================================================
# SELLER ONBOARDING — ZORUNLU KURULUM AKIŞI
# =====================================================

VALID_ONBOARDING_STEP_STATUSES = {
    "locked",
    "available",
    "in_progress",
    "completed",
}


def initialize_onboarding(
    seller_id: int,
) -> dict[str, Any]:
    """Satıcı için 10 zorunlu onboarding adımını oluşturur."""
    try:
        supabase.rpc(
            "initialize_seller_onboarding",
            {
                "target_seller_id": seller_id,
            },
        ).execute()

        return get_onboarding_status(seller_id)

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def get_onboarding_steps(
    seller_id: int,
) -> dict[str, Any]:
    """Satıcının onboarding adımlarını getirir."""
    try:
        result = (
            supabase.table("seller_onboarding_steps")
            .select("*")
            .eq("seller_id", seller_id)
            .order("step_order")
            .execute()
        )

        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "steps": result.data,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
            "steps": [],
        }


def get_onboarding_status(
    seller_id: int,
) -> dict[str, Any]:
    """Satıcının genel onboarding durumunu ve adımlarını getirir."""
    seller_result = get_seller_by_id(seller_id)

    if seller_result.get("durum") != "başarılı":
        return seller_result

    steps_result = get_onboarding_steps(seller_id)

    if steps_result.get("durum") != "başarılı":
        return steps_result

    seller = seller_result["satıcı"]

    return {
        "durum": "başarılı",
        "seller_id": seller_id,
        "onboarding_status": seller.get("onboarding_status"),
        "current_onboarding_step": seller.get(
            "current_onboarding_step"
        ),
        "onboarding_completed": seller.get(
            "onboarding_completed"
        ),
        "system_status": seller.get("system_status"),
        "ai_enabled": seller.get("ai_enabled"),
        "steps": steps_result["steps"],
    }


def start_onboarding_step(
    seller_id: int,
    step_order: int,
) -> dict[str, Any]:
    """Açık onboarding adımını in_progress durumuna getirir."""
    try:
        current_result = (
            supabase.table("seller_onboarding_steps")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("step_order", step_order)
            .limit(1)
            .execute()
        )

        if not current_result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Onboarding adımı bulunamadı.",
            }

        current = current_result.data[0]

        if current["status"] == "locked":
            return {
                "durum": "kilitli",
                "mesaj": "Önceki adım tamamlanmadan bu adım başlatılamaz.",
            }

        if current["status"] == "completed":
            return {
                "durum": "tamamlanmış",
                "step": current,
            }

        result = (
            supabase.table("seller_onboarding_steps")
            .update(
                {
                    "status": "in_progress",
                    "started_at": (
                        current.get("started_at") or utc_iso()
                    ),
                }
            )
            .eq("id", current["id"])
            .execute()
        )

        return {
            "durum": "başarılı",
            "step": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def save_onboarding_step_data(
    seller_id: int,
    step_order: int,
    step_data: dict[str, Any],
) -> dict[str, Any]:
    """Onboarding adımının form verisini kaydeder."""
    try:
        current_result = (
            supabase.table("seller_onboarding_steps")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("step_order", step_order)
            .limit(1)
            .execute()
        )

        if not current_result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Onboarding adımı bulunamadı.",
            }

        current = current_result.data[0]

        if current["status"] == "locked":
            return {
                "durum": "kilitli",
                "mesaj": "Kilitli onboarding adımına veri yazılamaz.",
            }

        result = (
            supabase.table("seller_onboarding_steps")
            .update(
                {
                    "step_data": step_data,
                    "status": (
                        "completed"
                        if current["status"] == "completed"
                        else "in_progress"
                    ),
                    "started_at": (
                        current.get("started_at") or utc_iso()
                    ),
                }
            )
            .eq("id", current["id"])
            .execute()
        )

        return {
            "durum": "başarılı",
            "step": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def complete_onboarding_step(
    seller_id: int,
    step_order: int,
    step_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Mevcut onboarding adımını tamamlar ve sıradaki adımı açar.

    Adım atlama kontrolü hem Python hem veritabanı tarafında yapılır.
    """
    try:
        seller_result = get_seller_by_id(seller_id)

        if seller_result.get("durum") != "başarılı":
            return seller_result

        seller = seller_result["satıcı"]
        current_step = int(
            seller.get("current_onboarding_step") or 1
        )

        if step_order != current_step:
            return {
                "durum": "sıra_hatası",
                "mesaj": (
                    f"Şu anda yalnızca {current_step}. adım "
                    "tamamlanabilir."
                ),
                "current_onboarding_step": current_step,
            }

        step_result = (
            supabase.table("seller_onboarding_steps")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("step_order", step_order)
            .limit(1)
            .execute()
        )

        if not step_result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Onboarding adımı bulunamadı.",
            }

        step = step_result.data[0]

        if step["status"] == "locked":
            return {
                "durum": "kilitli",
                "mesaj": "Bu onboarding adımı henüz açık değil.",
            }

        if step_data is not None:
            data_result = save_onboarding_step_data(
                seller_id=seller_id,
                step_order=step_order,
                step_data=step_data,
            )

            if data_result.get("durum") != "başarılı":
                return data_result

        supabase.rpc(
            "unlock_next_onboarding_step",
            {
                "target_seller_id": seller_id,
                "completed_step_order": step_order,
            },
        ).execute()

        return get_onboarding_status(seller_id)

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


# =====================================================
# BETA VE AKTİVASYON
# =====================================================

def configure_founder_beta(
    seller_id: int,
    beta_days: int = 30,
) -> dict[str, Any]:
    """Satıcıyı ücretsiz founder beta hesabı olarak ayarlar."""
    if beta_days < 1:
        return {
            "durum": "hata",
            "mesaj": "Beta süresi en az 1 gün olmalıdır.",
        }

    try:
        start = utc_now()
        end = start + timedelta(days=beta_days)

        result = (
            supabase.table("sellers")
            .update(
                {
                    "account_type": "founder_beta",
                    "system_status": "onboarding",
                    "payment_required": False,
                    "special_pricing": True,
                    "activation_requires_admin": True,
                    "beta_started_at": start.isoformat(),
                    "beta_ends_at": end.isoformat(),
                    "ai_enabled": False,
                }
            )
            .eq("id", seller_id)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Satıcı bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "seller": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def activate_seller(
    seller_id: int,
    activated_by_admin: bool = False,
) -> dict[str, Any]:
    """Onboarding sonrası satıcıyı canlı kullanıma açar."""
    try:
        seller_result = get_seller_by_id(seller_id)

        if seller_result.get("durum") != "başarılı":
            return seller_result

        seller = seller_result["satıcı"]

        if not seller.get("onboarding_completed"):
            return {
                "durum": "reddedildi",
                "mesaj": "Onboarding tamamlanmadan satıcı aktif edilemez.",
            }

        requires_admin = bool(
            seller.get("activation_requires_admin")
        )

        if requires_admin and not activated_by_admin:
            return {
                "durum": "admin_onayı_gerekli",
                "mesaj": "Bu hesap admin onayı olmadan aktif edilemez.",
            }

        account_type = seller.get("account_type")

        if account_type == "founder_beta":
            next_status = "beta_active"
        else:
            next_status = "active"

        result = (
            supabase.table("sellers")
            .update(
                {
                    "system_status": next_status,
                    "status": "active",
                    "activated_at": utc_iso(),
                    "ai_enabled": True,
                    "emergency_paused": False,
                    "emergency_paused_at": None,
                    "emergency_pause_reason": None,
                }
            )
            .eq("id", seller_id)
            .execute()
        )

        return {
            "durum": "başarılı",
            "seller": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def pause_seller_ai(
    seller_id: int,
    reason: str,
) -> dict[str, Any]:
    """Satıcının otomatik AI cevaplarını acil durumda durdurur."""
    try:
        result = (
            supabase.table("sellers")
            .update(
                {
                    "ai_enabled": False,
                    "emergency_paused": True,
                    "emergency_paused_at": utc_iso(),
                    "emergency_pause_reason": reason.strip(),
                }
            )
            .eq("id", seller_id)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Satıcı bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "seller": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def resume_seller_ai(
    seller_id: int,
) -> dict[str, Any]:
    """Acil durdurulan AI sistemini yeniden açar."""
    try:
        seller_result = get_seller_by_id(seller_id)

        if seller_result.get("durum") != "başarılı":
            return seller_result

        seller = seller_result["satıcı"]

        if seller.get("system_status") not in {
            "active",
            "beta_active",
        }:
            return {
                "durum": "reddedildi",
                "mesaj": "Aktif olmayan satıcıda AI yeniden açılamaz.",
            }

        result = (
            supabase.table("sellers")
            .update(
                {
                    "ai_enabled": True,
                    "emergency_paused": False,
                    "emergency_paused_at": None,
                    "emergency_pause_reason": None,
                }
            )
            .eq("id", seller_id)
            .execute()
        )

        return {
            "durum": "başarılı",
            "seller": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


# =====================================================
# TEST
# =====================================================

if __name__ == "__main__":
    print("Supabase bağlantısı test ediliyor...")
    print(test_connection())