from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, TypedDict
from uuid import UUID

from dotenv import load_dotenv
from supabase import Client, create_client
import os
import re
import unicodedata

from onboarding_service import prepare_onboarding_step


# =====================================================
# SUPABASE BAĞLANTISI
# =====================================================

load_dotenv()

_supabase_client: Client | None = None


def get_supabase() -> Client:
    """Supabase istemcisini ihtiyaç anında oluşturup döndürür.

    Modül import edilirken bağlantı kurulmaz. Böylece unit testleri ve
    dokümantasyon araçları gerçek ortam anahtarlarına ihtiyaç duymaz.
    """
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY")

    if not supabase_url:
        raise RuntimeError("SUPABASE_URL ortam değişkeni bulunamadı.")

    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_KEY ortam değişkeni bulunamadı.")

    _supabase_client = create_client(supabase_url, service_key)
    return _supabase_client


def reset_supabase_client() -> None:
    """Supabase istemci önbelleğini temizler."""
    global _supabase_client
    _supabase_client = None


def utc_now() -> datetime:
    """UTC zamanını timezone bilgili olarak döndürür."""
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    """Supabase için ISO formatında UTC zamanı döndürür."""
    return utc_now().isoformat()


def test_connection() -> dict[str, Any]:
    """Supabase bağlantısını test eder."""
    try:
        (
            get_supabase()
            .table("sellers")
            .select("id")
            .limit(1)
            .execute()
        )

        return {
            "durum": "başarılı",
            "bağlantı": True,
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

        result = get_supabase().table("sellers").insert(data).execute()

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
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }

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
            get_supabase().table("sellers")
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
            get_supabase().table("customers")
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

        result = get_supabase().table("customers").insert(data).execute()

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
            get_supabase().table("customers")
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


def get_customers_by_ids(
    seller_id: int,
    customer_ids: list[int],
) -> dict[str, Any]:
    """Verilen müşteri kimliklerini tek seller-scoped toplu sorguyla okur.

    Liste sayfalarını zenginleştirmek içindir (N+1 yok): kimlikler tek
    ``IN`` filtresiyle sorgulanır ve en fazla 100 benzersiz kimlik kabul
    edilir. Yalnız ``id`` ve ``whatsapp_number`` seçilir; telefon numarası
    depolandığı gibi, normalize edilmeden döndürülür. ``seller_id``
    filtresi tenant kapsamını zorlar — başka satıcının müşterisi asla
    sonuç kümesine girmez.
    """
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
        return {
            "durum": "başarılı",
            "customers": [],
        }

    try:
        result = (
            get_supabase()
            .table("customers")
            .select("id,whatsapp_number")
            .eq("seller_id", seller_id)
            .in_("id", unique_ids)
            .execute()
        )

        return {
            "durum": "başarılı",
            "customers": result.data,
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Müşteriler okunamadı.",
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

        result = get_supabase().table("messages").insert(data).execute()

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
            get_supabase().table("customers")
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
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


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
            get_supabase().table("customer_violations")
            .insert(data)
            .execute()
        )

        (
            get_supabase().table("customers")
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
            get_supabase().table("customer_violations")
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
# CONVERSATION CONTROL — KALICI KONTROL DURUMU
# =====================================================

CONTROL_STATE_ASSISTANT_ACTIVE = "ASSISTANT_ACTIVE"
CONTROL_STATE_SELLER_TAKEN_OVER = "SELLER_TAKEN_OVER"
CONTROL_STATE_RETURN_REVIEW = "RETURN_REVIEW"
CONTROL_STATE_ASSISTANT_PAUSED = "ASSISTANT_PAUSED"

VALID_CONTROL_STATES = {
    CONTROL_STATE_ASSISTANT_ACTIVE,
    CONTROL_STATE_SELLER_TAKEN_OVER,
    CONTROL_STATE_RETURN_REVIEW,
    CONTROL_STATE_ASSISTANT_PAUSED,
}

CONTROL_REASON_CODE_MAX_LENGTH = 64
CONTROL_REASON_NOTE_MAX_LENGTH = 500
_CONTROL_REASON_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class ConversationControlSummary(TypedDict):
    """Dış katmanlara döndürülen kararlı konuşma kontrol özeti."""

    state: str
    changed_at: str
    changed_by_profile_id: int | None
    reason_code: str | None
    reason_note: str | None
    resume_after_message_id: int | None
    version: int


def _is_positive_int(value: Any) -> bool:
    """bool değerlerini kimlik olarak kabul etmeden pozitif int doğrular."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def get_seller_message_media_reference(
    seller_id: int,
    message_id: int,
) -> dict[str, Any]:
    """Medya proxy uç noktası için mesajın medya referansını tenant scope'unda okur.

    Dikkat: dönen ``media_url`` ham sağlayıcı adresidir; yalnızca sunucu
    tarafı sağlayıcı indirmesinde kullanılır ve asla tarayıcıya
    döndürülmemelidir (bkz. seller_media_service). Tenant kapsamı
    ``seller_id`` filtresiyle zorlanır; başka satıcının mesajı mevcutmuş
    gibi görünmez (varlık sızıntısı yok).
    """
    if not _is_positive_int(seller_id) or not _is_positive_int(message_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve message_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase()
            .table("messages")
            .select("id, customer_id, message_type, media_url")
            .eq("id", message_id)
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Mesaj medya bilgisi okunamadı.",
        }

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


def _validate_conversation_identity(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any] | None:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }

    return None


def _validate_optional_positive_id(
    value: int | None,
    field_name: str,
) -> dict[str, Any] | None:
    if value is not None and not _is_positive_int(value):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"{field_name} pozitif tam sayı olmalıdır.",
        }

    return None


def _validate_control_reason(
    reason_code: str,
    reason_note: str | None,
) -> dict[str, Any] | None:
    if (
        not isinstance(reason_code, str)
        or not reason_code
        or len(reason_code) > CONTROL_REASON_CODE_MAX_LENGTH
        or _CONTROL_REASON_CODE_PATTERN.fullmatch(reason_code) is None
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                "reason_code küçük harf/rakam/alt çizgi içeren geçerli "
                "bir kod olmalıdır."
            ),
        }

    if reason_note is not None:
        if not isinstance(reason_note, str):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "reason_note metin olmalıdır.",
            }

        if len(reason_note) > CONTROL_REASON_NOTE_MAX_LENGTH:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": (
                    "reason_note en fazla "
                    f"{CONTROL_REASON_NOTE_MAX_LENGTH} karakter olabilir."
                ),
            }

    return None


def _build_conversation_control_summary(
    record: Any,
) -> ConversationControlSummary | None:
    """DB/RPC kaydını kontrollü ve kararlı dış dönüş modeline çevirir."""
    if not isinstance(record, dict):
        return None

    state = record.get("control_state")
    version = record.get("control_version")
    changed_at = record.get("control_changed_at")
    changed_by_profile_id = record.get("control_changed_by_profile_id")
    reason_code = record.get("control_reason_code")
    reason_note = record.get("control_reason_note")
    resume_after_message_id = record.get("resume_after_message_id")

    if (
        state not in VALID_CONTROL_STATES
        or not _is_positive_int(version)
        or not isinstance(changed_at, str)
        or not changed_at
        or (
            changed_by_profile_id is not None
            and not _is_positive_int(changed_by_profile_id)
        )
        or (
            resume_after_message_id is not None
            and not _is_positive_int(resume_after_message_id)
        )
        or (
            reason_code is not None
            and (
                not isinstance(reason_code, str)
                or len(reason_code) > CONTROL_REASON_CODE_MAX_LENGTH
                or _CONTROL_REASON_CODE_PATTERN.fullmatch(reason_code) is None
            )
        )
        or (
            reason_note is not None
            and (
                not isinstance(reason_note, str)
                or len(reason_note) > CONTROL_REASON_NOTE_MAX_LENGTH
            )
        )
    ):
        return None

    return {
        "state": state,
        "changed_at": changed_at,
        "changed_by_profile_id": changed_by_profile_id,
        "reason_code": reason_code,
        "reason_note": reason_note,
        "resume_after_message_id": resume_after_message_id,
        "version": version,
    }


def _extract_rpc_payload(data: Any) -> dict[str, Any] | None:
    """Supabase sürümlerindeki dict/tek elemanlı liste farkını normalize eder."""
    if isinstance(data, dict):
        return data

    if (
        isinstance(data, list)
        and len(data) == 1
        and isinstance(data[0], dict)
    ):
        return data[0]

    return None


def _conversation_control_rpc_response(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)

    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol işlemi geçersiz yanıt döndürdü.",
        }

    status = payload.get("status")

    if status == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "Konuşma kontrol kaydı bulunamadı.",
        }

    if status == "forbidden":
        return {
            "durum": "reddedildi",
            "mesaj": "Konuşma kontrol işlemi bu tenant için geçersiz.",
        }

    control = _build_conversation_control_summary(payload.get("control"))

    if status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": "Konuşma kontrol kaydı başka bir işlemle değişti.",
        }
        if control is not None:
            response["control"] = control
        return response

    if status != "success" or control is None:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol işlemi geçersiz yanıt döndürdü.",
        }

    response = {
        "durum": "başarılı",
        "changed": payload.get("changed") is True,
        "control": control,
    }

    transition_id = payload.get("transition_id")
    if _is_positive_int(transition_id):
        response["transition_id"] = transition_id

    return response


def get_conversation_control(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    """Konuşma kontrolünü seller ve customer birlikte scope ederek okur."""
    validation_error = _validate_conversation_identity(
        seller_id,
        customer_id,
    )
    if validation_error:
        return validation_error

    try:
        result = (
            get_supabase().table("conversation_states")
            .select(
                "control_state,control_changed_at,"
                "control_changed_by_profile_id,control_reason_code,"
                "control_reason_note,resume_after_message_id,"
                "control_version"
            )
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Konuşma kontrol kaydı bulunamadı.",
            }

        control = _build_conversation_control_summary(result.data[0])
        if control is None:
            return {
                "durum": "hata",
                "mesaj": "Konuşma kontrol kaydı geçersiz.",
            }

        return {
            "durum": "başarılı",
            "control": control,
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol kaydı okunamadı.",
        }


def get_conversation_control_history(
    seller_id: int,
    customer_id: int,
    limit: int = 20,
) -> dict[str, Any]:
    """Tenant kapsamındaki kontrol audit kayıtlarını en yeniden eskiye okur."""
    validation_error = _validate_conversation_identity(seller_id, customer_id)
    if validation_error:
        return validation_error
    if not _is_positive_int(limit) or limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "limit 1 ile 100 arasında olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("conversation_control_transitions")
            .select(
                "id,from_control_state,to_control_state,reason_code,"
                "reason_note,changed_by_profile_id,trigger_message_id,"
                "new_resume_after_message_id,previous_version,new_version,"
                "created_at"
            )
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol geçmişi okunamadı.",
        }

    history: list[dict[str, Any]] = []
    for record in result.data or []:
        if not isinstance(record, dict):
            return {
                "durum": "hata",
                "mesaj": "Konuşma kontrol geçmişi geçersiz.",
            }
        history.append(
            {
                "id": record.get("id"),
                "from_state": record.get("from_control_state"),
                "to_state": record.get("to_control_state"),
                "reason_code": record.get("reason_code"),
                "reason_note": record.get("reason_note"),
                "changed_by_profile_id": record.get("changed_by_profile_id"),
                "trigger_message_id": record.get("trigger_message_id"),
                "resume_after_message_id": record.get(
                    "new_resume_after_message_id"
                ),
                "previous_version": record.get("previous_version"),
                "new_version": record.get("new_version"),
                "created_at": record.get("created_at"),
            }
        )

    return {"durum": "başarılı", "history": history}


def transition_conversation_control(
    seller_id: int,
    customer_id: int,
    to_control_state: str,
    reason_code: str,
    reason_note: str | None = None,
    changed_by_profile_id: int | None = None,
    trigger_message_id: int | None = None,
    resume_after_message_id: int | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Kontrol değişikliği ile audit kaydını tek atomik RPC'de uygular."""
    validation_error = _validate_conversation_identity(
        seller_id,
        customer_id,
    )
    if validation_error:
        return validation_error

    if to_control_state not in VALID_CONTROL_STATES:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"Geçersiz kontrol durumu: {to_control_state}",
        }

    validation_error = _validate_control_reason(reason_code, reason_note)
    if validation_error:
        return validation_error

    for value, field_name in (
        (changed_by_profile_id, "changed_by_profile_id"),
        (trigger_message_id, "trigger_message_id"),
        (resume_after_message_id, "resume_after_message_id"),
        (expected_version, "expected_version"),
    ):
        validation_error = _validate_optional_positive_id(value, field_name)
        if validation_error:
            return validation_error

    try:
        result = get_supabase().rpc(
            "transition_conversation_control",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_control_state": to_control_state,
                "transition_reason_code": reason_code,
                "transition_reason_note": reason_note,
                "actor_profile_id": changed_by_profile_id,
                "transition_trigger_message_id": trigger_message_id,
                "target_resume_after_message_id": resume_after_message_id,
                "expected_control_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol işlemi tamamlanamadı.",
        }

    return _conversation_control_rpc_response(result.data)


def resume_conversation_assistant(
    seller_id: int,
    customer_id: int,
    reason_code: str = "manual_resume",
    reason_note: str | None = None,
    changed_by_profile_id: int | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Asistanı, son incoming mesaj cursor'ını atomik alarak geri açar."""
    validation_error = _validate_conversation_identity(
        seller_id,
        customer_id,
    )
    if validation_error:
        return validation_error

    validation_error = _validate_control_reason(reason_code, reason_note)
    if validation_error:
        return validation_error

    for value, field_name in (
        (changed_by_profile_id, "changed_by_profile_id"),
        (expected_version, "expected_version"),
    ):
        validation_error = _validate_optional_positive_id(value, field_name)
        if validation_error:
            return validation_error

    try:
        result = get_supabase().rpc(
            "resume_conversation_assistant",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "transition_reason_code": reason_code,
                "transition_reason_note": reason_note,
                "actor_profile_id": changed_by_profile_id,
                "expected_control_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol işlemi tamamlanamadı.",
        }

    return _conversation_control_rpc_response(result.data)


# =====================================================
# CONVERSATION STATE — DURUM MAKİNESİ
# =====================================================

VALID_STATES = {
    "NORMAL",
    "AWAITING_ORDER_CONFIRMATION",
    "AWAITING_ORDER_NUMBER",
    "AWAITING_IMAGE",
    "AWAITING_CUSTOM_TEXT",
    "AWAITING_ORDER_FIELD",
    "AWAITING_SELLER",
}

STATE_TYPES = {
    "NORMAL": "no_lock",
    "AWAITING_ORDER_CONFIRMATION": "soft_lock",
    "AWAITING_ORDER_NUMBER": "soft_lock",
    "AWAITING_IMAGE": "soft_lock",
    "AWAITING_CUSTOM_TEXT": "soft_lock",
    "AWAITING_ORDER_FIELD": "soft_lock",
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
        get_supabase().table("conversation_states")
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
                            get_supabase().table("state_transitions")
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
            get_supabase().table("conversation_states")
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
            get_supabase().table("state_transitions")
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
            get_supabase().table("seller_notifications")
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
            get_supabase().table("seller_notifications")
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
            get_supabase().table("seller_notifications")
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
            get_supabase().table("unanswered_questions")
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
                get_supabase().table("unanswered_questions")
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
            get_supabase().table("unanswered_questions")
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
# UNANSWERED QUESTION LIFECYCLE — 017 DOMAIN
# =====================================================

UNANSWERED_STATUS_OPEN = "OPEN"
UNANSWERED_STATUS_ANSWERED = "ANSWERED"
UNANSWERED_STATUS_DISMISSED = "DISMISSED"

VALID_UNANSWERED_STATUSES = {
    UNANSWERED_STATUS_OPEN,
    UNANSWERED_STATUS_ANSWERED,
    UNANSWERED_STATUS_DISMISSED,
}


def _unanswered_rpc_response(data: Any) -> dict[str, Any]:
    """017 unanswered RPC yanıtını güvenli domain sonucuna normalize eder."""
    payload = _extract_rpc_payload(data)

    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru işlemi geçersiz yanıt döndürdü.",
        }

    rpc_status = payload.get("status")

    if rpc_status == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "Cevaplanamayan soru kaydı bulunamadı.",
        }

    if rpc_status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": payload.get("message")
            or "Cevaplanamayan soru başka bir işlemle değişti.",
        }
        if payload.get("group") is not None:
            response["group"] = payload["group"]
        if payload.get("current_version") is not None:
            response["current_version"] = payload["current_version"]
        return response

    if rpc_status == "answered":
        group = payload.get("group")
        if not isinstance(group, dict):
            return {
                "durum": "hata",
                "mesaj": "Kayıtlı seller cevabı doğrulanamadı.",
            }
        return {
            "durum": "cevap_mevcut",
            "group": group,
            "idempotent": payload.get("idempotent") is True,
            "created": False,
            "notification_created": False,
        }

    if rpc_status == "error":
        return {
            "durum": "hata",
            "mesaj": payload.get("message")
            or "Cevaplanamayan soru işlemi tamamlanamadı.",
        }

    if rpc_status != "success":
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru işlemi geçersiz yanıt döndürdü.",
        }

    response = {"durum": "başarılı"}

    for key in ("group", "occurrence"):
        if payload.get(key) is not None:
            response[key] = payload[key]

    for key in ("changed", "created", "idempotent", "notification_created"):
        if payload.get(key) is not None:
            response[key] = payload[key] is True

    if payload.get("current_version") is not None:
        response["current_version"] = payload["current_version"]

    return response


def record_unanswered_question_occurrence(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    question_text: str,
    *,
    category: str = "unclear",
    suggested_field: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Yeni incoming unanswered occurrence'ı atomik/idempotent kaydeder."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id, customer_id ve source_message_id pozitif tam sayı olmalıdır.",
        }

    question_text = question_text.strip()
    category = category.strip() or "unclear"
    suggested_field = suggested_field.strip() if suggested_field else None

    if not question_text or len(question_text) > 4000:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "question_text 1 ile 4000 karakter arasında olmalıdır.",
        }

    if len(category) > 50:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "category en fazla 50 karakter olabilir.",
        }

    if suggested_field is not None and len(suggested_field) > 150:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "suggested_field en fazla 150 karakter olabilir.",
        }

    if metadata is not None and not isinstance(metadata, dict):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "metadata nesne olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "record_unanswered_question_occurrence",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
                "question_text_value": question_text,
                "category_value": category,
                "suggested_field_value": suggested_field,
                "metadata_value": metadata or {},
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru kaydedilemedi.",
        }

    return _unanswered_rpc_response(result.data)


def get_answered_unanswered_question(
    seller_id: int,
    question_text: str,
) -> dict[str, Any]:
    """Raw soruyu DB-authoritative normalization ile ANSWERED group'a eşler."""
    if not _is_positive_int(seller_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    question_text = question_text.strip()
    if not question_text or len(question_text) > 4000:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "question_text geçersiz.",
        }

    try:
        result = get_supabase().rpc(
            "get_answered_unanswered_question",
            {
                "target_seller_id": seller_id,
                "question_text_value": question_text,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Kayıtlı seller cevabı okunamadı.",
        }

    mapped = _unanswered_rpc_response(result.data)
    if mapped.get("durum") != "başarılı":
        return mapped

    group = mapped.get("group")
    if group is not None:
        answer = group.get("answer_text") if isinstance(group, dict) else None
        if not isinstance(answer, str) or not answer.strip():
            return {
                "durum": "hata",
                "mesaj": "Kayıtlı seller cevabı geçersiz.",
            }

    return {"durum": "başarılı", "group": group}


def get_unanswered_question_group_by_id(
    seller_id: int,
    group_id: int,
) -> dict[str, Any]:
    """Unanswered group'u tenant scope'unda okur."""
    if not _is_positive_int(seller_id) or not _is_positive_int(group_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve group_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("unanswered_question_groups")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("id", group_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru okunamadı.",
        }

    if not result.data:
        return {
            "durum": "bulunamadı",
            "mesaj": "Cevaplanamayan soru bulunamadı.",
        }

    return {"durum": "başarılı", "group": result.data[0]}


def get_unanswered_question_group_detail(
    seller_id: int,
    group_id: int,
    *,
    occurrence_limit: int = 50,
) -> dict[str, Any]:
    """Group ve güvenli occurrence metadata'sını tenant scope'unda döndürür."""
    if not _is_positive_int(occurrence_limit) or occurrence_limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "occurrence_limit 1 ile 100 arasında olmalıdır.",
        }

    group_result = get_unanswered_question_group_by_id(seller_id, group_id)
    if group_result.get("durum") != "başarılı":
        return group_result

    try:
        occurrence_result = (
            get_supabase().table("unanswered_question_occurrences")
            .select(
                "id,seller_id,group_id,customer_id,message_id,question_text,"
                "category,suggested_field,metadata,occurred_at"
            )
            .eq("seller_id", seller_id)
            .eq("group_id", group_id)
            .order("occurred_at", desc=True)
            .order("id", desc=True)
            .limit(occurrence_limit)
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru detayları okunamadı.",
        }

    return {
        "durum": "başarılı",
        "group": group_result["group"],
        "occurrences": occurrence_result.data,
    }


def list_unanswered_question_groups(
    seller_id: int,
    *,
    view: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Seller unanswered group listesini tenant scope'unda döndürür."""
    if not _is_positive_int(seller_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    view_status = {
        "action_required": UNANSWERED_STATUS_OPEN,
        "answered": UNANSWERED_STATUS_ANSWERED,
        "dismissed": UNANSWERED_STATUS_DISMISSED,
        "all": None,
    }

    if view not in view_status:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "view değeri geçersiz.",
        }

    if not _is_positive_int(limit) or limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "limit 1 ile 100 arasında olmalıdır.",
        }

    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "offset negatif olmayan tam sayı olmalıdır.",
        }

    try:
        query = (
            get_supabase().table("unanswered_question_groups")
            .select("*")
            .eq("seller_id", seller_id)
            .order("last_seen_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
        )

        status_value = view_status[view]
        if status_value is not None:
            query = query.eq("status", status_value)

        result = query.execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan sorular okunamadı.",
        }

    return {
        "durum": "başarılı",
        "toplam": len(result.data),
        "groups": result.data,
    }


def set_unanswered_question_answer(
    seller_id: int,
    group_id: int,
    actor_profile_id: int,
    expected_version: int,
    answer_text: str,
) -> dict[str, Any]:
    """Seller cevabını optimistic concurrency ile kaydeder."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(group_id)
        or not _is_positive_int(actor_profile_id)
        or not _is_positive_int(expected_version)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Kimlikler ve expected_version pozitif tam sayı olmalıdır.",
        }

    answer_text = answer_text.strip()
    if not answer_text or len(answer_text) > 4000:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "answer_text 1 ile 4000 karakter arasında olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "set_unanswered_question_answer",
            {
                "target_seller_id": seller_id,
                "target_group_id": group_id,
                "actor_profile_id": actor_profile_id,
                "expected_version": expected_version,
                "answer_text_value": answer_text,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Seller cevabı kaydedilemedi.",
        }

    return _unanswered_rpc_response(result.data)


def dismiss_unanswered_question_group(
    seller_id: int,
    group_id: int,
    actor_profile_id: int,
    expected_version: int,
    *,
    note: str | None = None,
) -> dict[str, Any]:
    """OPEN unanswered group'u seller görev listesinden dismiss eder."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(group_id)
        or not _is_positive_int(actor_profile_id)
        or not _is_positive_int(expected_version)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Kimlikler ve expected_version pozitif tam sayı olmalıdır.",
        }

    if note is not None:
        note = note.strip()
        if not note:
            note = None
        elif len(note) > 1000:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "note en fazla 1000 karakter olabilir.",
            }

    try:
        result = get_supabase().rpc(
            "dismiss_unanswered_question_group",
            {
                "target_seller_id": seller_id,
                "target_group_id": group_id,
                "actor_profile_id": actor_profile_id,
                "expected_version": expected_version,
                "dismiss_note_value": note,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru dismiss edilemedi.",
        }

    return _unanswered_rpc_response(result.data)


# =====================================================
# RULES — KURAL FONKSİYONLARI
# =====================================================

def get_active_rules(seller_id: int) -> dict[str, Any]:
    """Satıcının aktif kurallarını getirir."""
    try:
        result = (
            get_supabase().table("rules")
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
            get_supabase().table("rules")
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
            get_supabase().table("rules")
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



SELLER_SETTINGS_SELECT = (
    "id,name,phone,store_name,store_link,product_info,settings_version,updated_at"
)
SELLER_RULE_SELECT = (
    "id,created_at,seller_id,trigger_text,response_text,category,is_active,"
    "hit_count,version,updated_at"
)


def get_seller_settings_record(seller_id: int) -> dict[str, Any]:
    """Seller panelindeki güvenli ayar alanlarını getirir."""
    try:
        result = (
            get_supabase().table("sellers")
            .select(SELLER_SETTINGS_SELECT)
            .eq("id", seller_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Satıcı bulunamadı."}
        return {"durum": "başarılı", "seller": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def update_seller_settings_record(
    seller_id: int,
    expected_version: int,
    *,
    seller_patch: dict[str, Any],
    product_info: dict[str, Any],
) -> dict[str, Any]:
    """Seller ayarlarını settings_version ile atomik günceller."""
    payload = dict(seller_patch)
    payload["product_info"] = product_info
    payload["settings_version"] = expected_version + 1

    try:
        result = (
            get_supabase().table("sellers")
            .update(payload)
            .eq("id", seller_id)
            .eq("settings_version", expected_version)
            .execute()
        )
        if result.data:
            return {"durum": "başarılı", "seller": result.data[0]}

        current = get_seller_settings_record(seller_id)
        if current.get("durum") == "bulunamadı":
            return current
        return {
            "durum": "conflict",
            "mesaj": "Ayarlar başka bir işlem tarafından değiştirildi.",
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def _seller_rule_rpc_response(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {"durum": "hata", "mesaj": "Kural RPC cevabı geçersiz."}
    rpc_status = data.get("status")
    if rpc_status == "success":
        result: dict[str, Any] = {"durum": "başarılı"}
        for key in ("rules", "rule", "changed"):
            if key in data:
                result[key] = data[key]
        return result
    if rpc_status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Kural veya satıcı bulunamadı."}
    if rpc_status == "conflict":
        return {
            "durum": "conflict",
            "mesaj": "Kural başka bir işlem tarafından değiştirildi.",
            "current_version": data.get("current_version"),
        }
    if rpc_status == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": data.get("message") or "Kural bilgileri geçersiz.",
        }
    return {"durum": "hata", "mesaj": "Kural RPC işlemi tamamlanamadı."}


def list_seller_rule_records(
    seller_id: int,
    *,
    active: bool | None = None,
) -> dict[str, Any]:
    """Seller'ın kurallarını production RPC kontratı üzerinden listeler."""
    try:
        result = get_supabase().rpc(
            "get_seller_rules",
            {
                "target_seller_id": seller_id,
                "include_inactive": active is not True,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Kurallar getirilemedi.", "rules": []}

    mapped = _seller_rule_rpc_response(result.data)
    if mapped.get("durum") == "başarılı" and active is False:
        mapped["rules"] = [
            row for row in mapped.get("rules") or [] if row.get("is_active") is False
        ]
    return mapped


def get_seller_rule_record(seller_id: int, rule_id: int) -> dict[str, Any]:
    """Rule ID'yi seller-scoped read RPC sonucu içinden bulur."""
    result = list_seller_rule_records(seller_id, active=None)
    if result.get("durum") != "başarılı":
        return result
    for row in result.get("rules") or []:
        if int(row.get("id") or 0) == rule_id:
            return {"durum": "başarılı", "rule": row}
    return {"durum": "bulunamadı", "mesaj": "Kural bulunamadı."}


def create_seller_rule_record(
    seller_id: int,
    *,
    trigger_text: str,
    response_text: str,
    category: str,
    is_active: bool,
) -> dict[str, Any]:
    """Seller için aktif hazır yanıt kuralı oluşturur."""
    if is_active is not True:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Yeni kural aktif olarak oluşturulmalıdır.",
        }
    try:
        result = get_supabase().rpc(
            "create_seller_rule",
            {
                "target_seller_id": seller_id,
                "trigger_text_value": trigger_text,
                "response_text_value": response_text,
                "category_value": category,
            },
        ).execute()
    except Exception as exc:
        text = str(exc).lower()
        if "23505" in text or "duplicate key" in text:
            return {"durum": "duplicate", "mesaj": "Aktif kural zaten bulunuyor."}
        return {"durum": "hata", "mesaj": "Kural oluşturulamadı."}
    return _seller_rule_rpc_response(result.data)


def update_seller_rule_record(
    seller_id: int,
    rule_id: int,
    expected_version: int,
    *,
    patch: dict[str, Any],
) -> dict[str, Any]:
    """Seller rule'ını tenant scope + version RPC kontratıyla günceller."""
    allowed = {"trigger_text", "response_text", "category", "is_active"}
    payload = {key: value for key, value in patch.items() if key in allowed}
    try:
        result = get_supabase().rpc(
            "update_seller_rule",
            {
                "target_seller_id": seller_id,
                "target_rule_id": rule_id,
                "expected_version": expected_version,
                "trigger_text_value": payload.get("trigger_text"),
                "response_text_value": payload.get("response_text"),
                "category_value": payload.get("category"),
                "is_active_value": payload.get("is_active"),
            },
        ).execute()
    except Exception as exc:
        text = str(exc).lower()
        if "23505" in text or "duplicate key" in text:
            return {"durum": "duplicate", "mesaj": "Aktif kural zaten bulunuyor."}
        return {"durum": "hata", "mesaj": "Kural güncellenemedi."}
    return _seller_rule_rpc_response(result.data)


def deactivate_seller_rule_record(
    seller_id: int,
    rule_id: int,
    expected_version: int,
) -> dict[str, Any]:
    """Rule geçmişini koruyarak production soft-delete RPC'sini çağırır."""
    try:
        result = get_supabase().rpc(
            "delete_seller_rule",
            {
                "target_seller_id": seller_id,
                "target_rule_id": rule_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Kural devre dışı bırakılamadı."}
    return _seller_rule_rpc_response(result.data)


# =====================================================
# PRODUCTS — SELLER PANEL PRODUCT CRUD
# =====================================================


def _seller_product_rpc_response(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {"durum": "hata", "mesaj": "Ürün RPC cevabı geçersiz."}

    rpc_status = data.get("status")
    if rpc_status == "success":
        result: dict[str, Any] = {"durum": "başarılı"}
        for key in ("products", "product", "total", "changed"):
            if key in data:
                result[key] = data[key]
        return result
    if rpc_status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Ürün veya satıcı bulunamadı."}
    if rpc_status == "conflict":
        return {
            "durum": "conflict",
            "mesaj": "Ürün başka bir işlem tarafından değiştirildi.",
            "reason": data.get("reason"),
            "current_version": data.get("current_version"),
        }
    if rpc_status == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": data.get("message") or "Ürün bilgileri geçersiz.",
        }
    return {"durum": "hata", "mesaj": "Ürün RPC işlemi tamamlanamadı."}


def list_seller_product_records(
    seller_id: int,
    *,
    include_inactive: bool = False,
) -> dict[str, Any]:
    """Seller'ın ürünlerini tenant-scoped RPC üzerinden listeler."""
    try:
        result = get_supabase().rpc(
            "get_seller_products",
            {
                "target_seller_id": seller_id,
                "include_inactive": include_inactive,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Ürünler getirilemedi."}
    return _seller_product_rpc_response(result.data)


def create_seller_product_record(
    seller_id: int,
    *,
    name: str,
) -> dict[str, Any]:
    """Seller için ürün oluşturur; duplicate adı DB kontratı engeller."""
    try:
        result = get_supabase().rpc(
            "create_seller_product",
            {"target_seller_id": seller_id, "name_value": name},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Ürün oluşturulamadı."}
    return _seller_product_rpc_response(result.data)


def update_seller_product_record(
    seller_id: int,
    product_id: int,
    expected_version: int,
    *,
    name: str | None,
    is_active: bool | None,
) -> dict[str, Any]:
    """Ürünü seller scope + optimistic concurrency ile günceller/devre dışı bırakır."""
    try:
        result = get_supabase().rpc(
            "update_seller_product",
            {
                "target_seller_id": seller_id,
                "target_product_id": product_id,
                "expected_version": expected_version,
                "name_value": name,
                "is_active_value": is_active,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Ürün güncellenemedi."}
    return _seller_product_rpc_response(result.data)


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
    email: str | None,
    phone: str,
    store_name: str,
    store_link: str | None = None,
    notes: str | None = None,
    product_category: str | None = None,
) -> dict[str, Any]:
    """Yeni satıcı başvurusu oluşturur.

    Public akış WhatsApp-first olduğu için e-posta opsiyoneldir. Bu helper
    service_role istemcisi üzerinden çalışır; public istemciye doğrudan açılmaz.
    """
    normalized_name = full_name.strip()
    normalized_email = email.strip().lower() if email and email.strip() else None
    normalized_phone = phone.strip()
    normalized_store_name = store_name.strip()
    normalized_store_link = store_link.strip() if store_link and store_link.strip() else None
    normalized_notes = notes.strip() if notes and notes.strip() else None
    normalized_category = (
        product_category.strip()
        if product_category and product_category.strip()
        else None
    )

    if not normalized_name:
        return {"durum": "doğrulama_hatası", "mesaj": "Ad soyad zorunludur."}

    if not normalized_phone:
        return {"durum": "doğrulama_hatası", "mesaj": "Telefon zorunludur."}

    if not normalized_store_name:
        return {"durum": "doğrulama_hatası", "mesaj": "Mağaza adı zorunludur."}

    try:
        data: dict[str, Any] = {
            "full_name": normalized_name,
            "phone": normalized_phone,
            "store_name": normalized_store_name,
            "status": "pending",
        }

        if normalized_email is not None:
            data["email"] = normalized_email

        if normalized_store_link is not None:
            data["store_link"] = normalized_store_link

        if normalized_notes is not None:
            data["notes"] = normalized_notes

        if normalized_category is not None:
            data["product_category"] = normalized_category

        result = (
            get_supabase().table("seller_applications")
            .insert(data)
            .execute()
        )

        if not result.data:
            return {
                "durum": "hata",
                "mesaj": "Başvuru kaydı oluşturulamadı.",
            }

        return {
            "durum": "başarılı",
            "application": result.data[0],
        }

    except Exception as exc:
        error_text = str(exc)

        if "duplicate key" in error_text.lower() or "23505" in error_text:
            return {
                "durum": "duplicate",
                "mesaj": "Açık bir başvuru zaten bulunuyor.",
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
            get_supabase().table("seller_applications")
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
            get_supabase().table("seller_applications")
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
            get_supabase().table("seller_applications")
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


def finalize_seller_invitation_from_application(
    application_id: int,
    auth_user_id: str,
    invite_email: str,
    admin_note: str | None = None,
) -> dict[str, Any]:
    """
    Auth daveti oluşturulduktan sonra seller/profile/onboarding/application
    kayıtlarını tek PostgreSQL RPC transaction'ında finalize eder.
    """
    if (
        not isinstance(application_id, int)
        or isinstance(application_id, bool)
        or application_id < 1
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "application_id pozitif tam sayı olmalıdır.",
        }

    try:
        normalized_auth_user_id = str(UUID(str(auth_user_id).strip()))
    except (TypeError, ValueError, AttributeError):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "auth_user_id geçerli UUID olmalıdır.",
        }

    normalized_email = invite_email.strip().lower()
    if not normalized_email:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "invite_email zorunludur.",
        }

    normalized_admin_note = None
    if admin_note is not None:
        normalized_admin_note = admin_note.strip() or None

    try:
        result = get_supabase().rpc(
            "finalize_seller_invitation_from_application",
            {
                "target_application_id": application_id,
                "target_auth_user_id": normalized_auth_user_id,
                "invite_email": normalized_email,
                "admin_note_value": normalized_admin_note,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Seller davet kaydı finalize edilemedi.",
        }

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Seller davet RPC yanıtı geçersiz.",
        }

    status_value = payload.get("status")
    if status_value == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "Başvuru bulunamadı.",
        }
    if status_value == "conflict":
        return {
            "durum": "çakışma",
            "mesaj": payload.get("message") or "Başvuru davet işlemiyle çakıştı.",
        }
    if status_value == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": payload.get("message") or "Davet bilgileri geçersiz.",
        }
    if status_value not in {"success", "already_invited"}:
        return {
            "durum": "hata",
            "mesaj": "Seller davet RPC yanıtı geçersiz.",
        }

    application = payload.get("application")
    seller = payload.get("seller")
    profile = payload.get("profile")
    if not all(isinstance(item, dict) for item in (application, seller, profile)):
        return {
            "durum": "hata",
            "mesaj": "Seller davet RPC yanıtı eksik.",
        }

    return {
        "durum": "zaten_davet_edildi" if status_value == "already_invited" else "başarılı",
        "application": application,
        "seller": seller,
        "profile": profile,
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
            get_supabase().table("user_profiles")
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
            get_supabase().table("user_profiles")
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


def get_user_profile_by_seller_id(
    seller_id: int,
) -> dict[str, Any]:
    """Seller sahibinin user_profile kaydını getirir."""
    if (
        not isinstance(seller_id, int)
        or isinstance(seller_id, bool)
        or seller_id < 1
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("user_profiles")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("role", "seller")
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Seller kullanıcı profili bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "profile": result.data[0],
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Seller kullanıcı profili okunamadı.",
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
            get_supabase().table("user_profiles")
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
        get_supabase().rpc(
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
            get_supabase().table("seller_onboarding_steps")
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
            get_supabase().table("seller_onboarding_steps")
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
            get_supabase().table("seller_onboarding_steps")
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
    """
    Onboarding adımının taslak form verisini doğrulayıp kaydeder.

    Bu fonksiyon adımı tamamlamaz ve hedef işletme tablolarına uygulamaz.
    Tamamlama işlemi complete_onboarding_step() içindeki atomik RPC ile yapılır.
    """
    prepared = prepare_onboarding_step(step_order, step_data)

    if prepared.get("durum") != "başarılı":
        return prepared

    try:
        current_result = (
            get_supabase().table("seller_onboarding_steps")
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
            get_supabase().table("seller_onboarding_steps")
            .update(
                {
                    "step_data": prepared["normalized_step_data"],
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
    Mevcut onboarding adımını doğrular, gerçek tablolara uygular ve tamamlar.

    Veri uygulama, adımı tamamlama ve sıradaki adımı açma işlemleri
    PostgreSQL tarafındaki tek bir transaction/RPC içinde yapılır.
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
            get_supabase().table("seller_onboarding_steps")
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

        prepared = prepare_onboarding_step(step_order, step_data)

        if prepared.get("durum") != "başarılı":
            return prepared

        get_supabase().rpc(
            "complete_seller_onboarding_step",
            {
                "target_seller_id": seller_id,
                "completed_step_order": step_order,
                "normalized_step_data": prepared[
                    "normalized_step_data"
                ],
                "seller_patch": prepared["seller_patch"],
                "product_info_patch": prepared[
                    "product_info_patch"
                ],
                "rules_payload": prepared["rules_payload"],
            },
        ).execute()

        onboarding_result = get_onboarding_status(seller_id)

        if onboarding_result.get("durum") != "başarılı":
            return onboarding_result

        onboarding_result["completed_step"] = {
            "step_order": step_order,
            "step_key": prepared["step_key"],
        }

        if step_order != 10:
            return onboarding_result

        refreshed_seller_result = get_seller_by_id(seller_id)

        if refreshed_seller_result.get("durum") != "başarılı":
            return refreshed_seller_result

        refreshed_seller = refreshed_seller_result["satıcı"]

        should_auto_activate = (
            refreshed_seller.get("account_type") == "standard"
            and not bool(
                refreshed_seller.get("activation_requires_admin")
            )
            and bool(refreshed_seller.get("onboarding_completed"))
        )

        if not should_auto_activate:
            return onboarding_result

        activation_result = activate_seller(
            seller_id=seller_id,
            activated_by_admin=False,
        )

        if activation_result.get("durum") != "başarılı":
            return activation_result

        onboarding_result["automatic_activation"] = True
        onboarding_result["seller"] = activation_result["seller"]
        return onboarding_result

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
        result = (
            get_supabase().table("sellers")
            .update(
                {
                    "account_type": "founder_beta",
                    "system_status": "onboarding",
                    "payment_required": False,
                    "special_pricing": True,
                    "activation_requires_admin": True,
                    "beta_duration_days": beta_days,
                    "beta_started_at": None,
                    "beta_ends_at": None,
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
        activated_at = seller.get("activated_at") or utc_iso()
        update_data: dict[str, Any] = {
            "status": "active",
            "activated_at": activated_at,
            "ai_enabled": True,
            "emergency_paused": False,
            "emergency_paused_at": None,
            "emergency_pause_reason": None,
        }

        if account_type == "founder_beta":
            next_status = "beta_active"
            beta_started_at = seller.get("beta_started_at")
            beta_ends_at = seller.get("beta_ends_at")

            if not beta_started_at or not beta_ends_at:
                beta_start = utc_now()
                beta_days = int(
                    seller.get("beta_duration_days") or 30
                )
                beta_end = beta_start + timedelta(days=beta_days)
                update_data["beta_started_at"] = beta_start.isoformat()
                update_data["beta_ends_at"] = beta_end.isoformat()
        else:
            next_status = "active"

        update_data["system_status"] = next_status

        result = (
            get_supabase().table("sellers")
            .update(update_data)
            .eq("id", seller_id)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Satıcı aktifleştirilemedi veya bulunamadı.",
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


def pause_seller_ai(
    seller_id: int,
    reason: str,
) -> dict[str, Any]:
    """Satıcının otomatik AI cevaplarını acil durumda durdurur."""
    try:
        result = (
            get_supabase().table("sellers")
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
            get_supabase().table("sellers")
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
# ORDER DOMAIN — KALICI SİPARİŞ SİSTEMİ
# =====================================================

ORDER_STATUS_COLLECTING = "COLLECTING"
ORDER_STATUS_COMPLETE = "COMPLETE"
ORDER_STATUS_SELLER_REVIEW_REQUIRED = "SELLER_REVIEW_REQUIRED"

VALID_ORDER_STATUSES = {
    ORDER_STATUS_COLLECTING,
    ORDER_STATUS_COMPLETE,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
}

ORDER_FIELD_TYPES = {
    "short_text",
    "long_text",
    "number",
    "single_choice",
    "multi_choice",
    "boolean",
    "image",
}

ORDER_DISPLAY_STATUS = {
    ORDER_STATUS_COLLECTING: "Bilgi toplanıyor",
    ORDER_STATUS_COMPLETE: "Bilgiler tamamlandı",
    ORDER_STATUS_SELLER_REVIEW_REQUIRED: "Satıcı incelemesi gerekiyor",
}


def _is_positive_int(value: Any) -> bool:
    """bool değerlerini kimlik olarak kabul etmeden pozitif int doğrular."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _extract_rpc_payload(data: Any) -> dict[str, Any] | None:
    """Supabase sürümlerindeki dict/tek elemanlı liste farkını normalize eder."""
    if isinstance(data, dict):
        return data

    if (
        isinstance(data, list)
        and len(data) == 1
        and isinstance(data[0], dict)
    ):
        return data[0]

    return None


def _order_rpc_response(data: Any) -> dict[str, Any]:
    """Order RPC yanıtını güvenli domain sonucuna çevirir."""
    payload = _extract_rpc_payload(data)

    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Sipariş işlemi geçersiz yanıt döndürdü.",
        }

    status = payload.get("status")

    if status == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "Sipariş bulunamadı.",
        }

    if status == "forbidden":
        return {
            "durum": "reddedildi",
            "mesaj": "Sipariş işlemi bu tenant için geçersiz.",
        }

    if status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": payload.get("message") or "Sipariş kaydı değişti.",
        }
        if payload.get("order"):
            response["order"] = payload["order"]
        return response

    if status == "order_product_change_requires_review":
        response: dict[str, Any] = {
            "durum": "ürün_değişikliği_inceleme_gerekli",
            "mesaj": (
                "Değer toplanmaya başlanmış siparişte ürün değişikliği "
                "satıcı incelemesi gerektirir."
            ),
        }
        if payload.get("order"):
            response["order"] = payload["order"]
        return response

    if status == "error":
        return {
            "durum": "hata",
            "mesaj": payload.get("message") or "Sipariş işlemi tamamlanamadı.",
        }

    if status != "success" or not payload.get("order"):
        return {
            "durum": "hata",
            "mesaj": "Sipariş işlemi geçersiz yanıt döndürdü.",
        }

    response = {
        "durum": "başarılı",
        "order": payload["order"],
    }

    if payload.get("changed") is not None:
        response["changed"] = payload["changed"] is True

    if payload.get("created") is not None:
        response["created"] = payload["created"] is True

    if payload.get("completed") is not None:
        response["completed"] = payload["completed"] is True

    if payload.get("idempotent") is not None:
        response["idempotent"] = payload["idempotent"] is True

    if payload.get("snapshot_count") is not None:
        response["snapshot_count"] = payload["snapshot_count"]

    if payload.get("race_resolved") is not None:
        response["race_resolved"] = payload["race_resolved"] is True

    return response


def get_or_create_active_order(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
) -> dict[str, Any]:
    """
    Aktif siparişi atomik olarak getirir veya oluşturur.

    Aynı seller + customer konuşmasında en fazla bir aktif sipariş
    bulunur. Aynı kaynak mesajdan ikinci sipariş oluşmaz.
    """
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }

    if not _is_positive_int(source_message_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "source_message_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "get_or_create_active_order",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Aktif sipariş işlemi tamamlanamadı.",
        }

    return _order_rpc_response(result.data)


def initialize_order_collection(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
) -> dict[str, Any]:
    """
    Sipariş toplama başlangıcını atomik olarak hazırlar.

    Yeni siparişte müşteri telefon snapshot'ı ve aktif mağaza-geneli
    dinamik alan snapshot'ları PostgreSQL RPC içinde sabitlenir.
    """
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }

    if not _is_positive_int(source_message_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "source_message_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "initialize_order_collection",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş toplama başlangıcı tamamlanamadı.",
        }

    return _order_rpc_response(result.data)


def set_order_product_and_snapshot_fields(
    seller_id: int,
    customer_id: int,
    order_id: int,
    product_id: int,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Ürünü doğrular ve aktif alan tanımlarını siparişe snapshot olarak sabitler.
    """
    if not _is_positive_int(order_id) or not _is_positive_int(product_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "order_id ve product_id pozitif tam sayı olmalıdır.",
        }

    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "set_order_product_and_snapshot_fields",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "target_product_id": product_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Ürün ve alan snapshot işlemi tamamlanamadı.",
        }

    return _order_rpc_response(result.data)


def record_order_field_value(
    seller_id: int,
    customer_id: int,
    order_id: int,
    field_snapshot_id: int,
    value: Any,
    source_message_id: int,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Sipariş alan değerini atomik ve idempotent biçimde kaydeder.
    """
    if not _is_positive_int(field_snapshot_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "field_snapshot_id pozitif tam sayı olmalıdır.",
        }

    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "record_order_field_value",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "target_field_snapshot_id": field_snapshot_id,
                "value_jsonb": value,
                "source_message_id": source_message_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş alan değeri kaydedilemedi.",
        }

    return _order_rpc_response(result.data)


def update_order_core(
    seller_id: int,
    customer_id: int,
    order_id: int,
    external_order_number: str | None = None,
    customer_phone_snapshot: str | None = None,
    customer_note: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    clear_custom_text: bool = False,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Core sipariş alanlarını idempotent biçimde günceller.
    """
    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "update_order_core",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "new_external_order_number": external_order_number,
                "new_customer_phone_snapshot": customer_phone_snapshot,
                "new_customer_note": customer_note,
                "new_image_message_id": image_message_id,
                "new_custom_text": custom_text,
                "clear_custom_text": clear_custom_text,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş core alanları güncellenemedi.",
        }

    return _order_rpc_response(result.data)


def update_order_core_from_message(
    seller_id: int,
    customer_id: int,
    order_id: int,
    source_message_id: int,
    external_order_number: str | None = None,
    customer_phone_snapshot: str | None = None,
    customer_note: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    clear_custom_text: bool = False,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Core sipariş alanlarını kaynak incoming mesajla ilişkilendirerek günceller.

    Bu wrapper chat collection mutasyonlarında tenant scope ve source-message
    idempotency sağlayan 015 RPC'sini kullanır.
    """
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(order_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                "seller_id, customer_id, order_id ve source_message_id "
                "pozitif tam sayı olmalıdır."
            ),
        }

    if image_message_id is not None and not _is_positive_int(image_message_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "image_message_id pozitif tam sayı olmalıdır.",
        }

    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "update_order_core_from_message",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "source_message_id": source_message_id,
                "new_external_order_number": external_order_number,
                "new_customer_phone_snapshot": customer_phone_snapshot,
                "new_customer_note": customer_note,
                "new_image_message_id": image_message_id,
                "new_custom_text": custom_text,
                "clear_custom_text": clear_custom_text,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş core alanları kaynak mesajla güncellenemedi.",
        }

    return _order_rpc_response(result.data)


def flag_order_review(
    seller_id: int,
    customer_id: int,
    order_id: int,
    review_code: str,
    review_note: str | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Siparişi satıcı incelemesine bırakır. Conversation control'ü değiştirmez.
    """
    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "flag_order_review",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "review_code": review_code,
                "review_note": review_note,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş inceleme durumuna alınamadı.",
        }

    return _order_rpc_response(result.data)


def get_order_by_id(
    seller_id: int,
    order_id: int,
) -> dict[str, Any]:
    """Siparişi tenant scope'unda okur."""
    if not _is_positive_int(order_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "order_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("orders")
            .select("*")
            .eq("id", order_id)
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Sipariş bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "order": result.data[0],
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş okunamadı.",
        }


def get_order_detail(
    seller_id: int,
    order_id: int,
) -> dict[str, Any]:
    """
    Sipariş detayını snapshot alanları ve değerleriyle birlikte okur.
    """
    order_result = get_order_by_id(seller_id, order_id)

    if order_result.get("durum") != "başarılı":
        return order_result

    order = order_result["order"]

    try:
        snapshots_result = (
            get_supabase().table("order_field_snapshots")
            .select("*")
            .eq("order_id", order_id)
            .order("sort_order_snapshot")
            .execute()
        )

        snapshots = snapshots_result.data or []

        values_result = (
            get_supabase().table("order_field_values")
            .select("*")
            .eq("order_id", order_id)
            .execute()
        )

        values_by_snapshot: dict[int, dict[str, Any]] = {}

        for value_row in values_result.data or []:
            snapshot_id = value_row.get("field_snapshot_id")

            if _is_positive_int(snapshot_id):
                values_by_snapshot[snapshot_id] = value_row

        fields: list[dict[str, Any]] = []

        for snapshot in snapshots:
            snapshot_id = snapshot.get("id")
            value_row = values_by_snapshot.get(snapshot_id)

            fields.append(
                {
                    "id": snapshot_id,
                    "source_definition_id": snapshot.get(
                        "source_definition_id"
                    ),
                    "definition_version": snapshot.get(
                        "definition_version"
                    ),
                    "field_key": snapshot.get("field_key"),
                    "label": snapshot.get("label_snapshot"),
                    "field_type": snapshot.get("field_type_snapshot"),
                    "is_required": snapshot.get("is_required_snapshot"),
                    "sort_order": snapshot.get("sort_order_snapshot"),
                    "options": snapshot.get("options_snapshot") or [],
                    "validation_config": snapshot.get(
                        "validation_snapshot"
                    ) or {},
                    "value": (
                        value_row.get("value")
                        if value_row is not None
                        else None
                    ),
                    "source_message_id": (
                        value_row.get("source_message_id")
                        if value_row is not None
                        else None
                    ),
                    "completed": value_row is not None,
                }
            )

        return {
            "durum": "başarılı",
            "order": order,
            "fields": fields,
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş detayı okunamadı.",
        }


def list_orders(
    seller_id: int,
    *,
    view: str = "all",
    status: str | None = None,
    product_id: int | None = None,
    image_missing: bool | None = None,
    customer_id: int | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """
    Satıcının siparişlerini tenant scope'unda listeler.

    view:
      - action_required: SELLER_REVIEW_REQUIRED
      - collecting: COLLECTING
      - all: tümü
    """
    if view not in {"action_required", "collecting", "all"}:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "view değeri geçersiz.",
        }

    if limit < 1 or limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "limit 1 ile 100 arasında olmalıdır.",
        }

    if offset < 0:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "offset negatif olamaz.",
        }

    try:
        query = (
            get_supabase().table("orders")
            .select("*")
            .eq("seller_id", seller_id)
            .order("updated_at", desc=True)
            .range(offset, offset + limit - 1)
        )

        if view == "action_required":
            query = query.eq("status", ORDER_STATUS_SELLER_REVIEW_REQUIRED)
        elif view == "collecting":
            query = query.eq("status", ORDER_STATUS_COLLECTING)

        if status is not None:
            if status not in VALID_ORDER_STATUSES:
                return {
                    "durum": "doğrulama_hatası",
                    "mesaj": f"Geçersiz sipariş durumu: {status}",
                }
            query = query.eq("status", status)

        if product_id is not None:
            query = query.eq("product_id", product_id)

        if image_missing is not None:
            if image_missing:
                query = query.is_("image_message_id", "null")
            else:
                query = query.not_.is_("image_message_id", "null")

        if customer_id is not None:
            query = query.eq("customer_id", customer_id)

        if external_order_number:
            query = query.eq("external_order_number", external_order_number)

        result = query.execute()

        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "orders": result.data,
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Siparişler okunamadı.",
        }


# =====================================================
# ORDER FIELD DEFINITIONS — DİNAMİK ALAN TANIMLARI
# =====================================================

def get_order_field_definitions(
    seller_id: int,
    *,
    product_id: int | None = None,
    include_inactive: bool = False,
) -> dict[str, Any]:
    """Satıcının dinamik alan tanımlarını listeler."""
    try:
        query = (
            get_supabase().table("order_field_definitions")
            .select("*")
            .eq("seller_id", seller_id)
            .order("sort_order")
            .order("id")
        )

        if product_id is not None:
            query = query.eq("product_id", product_id)

        if not include_inactive:
            query = query.eq("is_active", True)

        result = query.execute()

        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "definitions": result.data,
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Alan tanımları okunamadı.",
        }


def create_order_field_definition(
    seller_id: int,
    *,
    field_key: str,
    label: str,
    field_type: str,
    is_required: bool,
    sort_order: int,
    product_id: int | None = None,
    options: list[dict[str, Any]] | None = None,
    validation_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Yeni dinamik alan tanımı oluşturur."""
    if field_type not in ORDER_FIELD_TYPES:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"Geçersiz alan tipi: {field_type}",
        }

    if sort_order < 0:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "sort_order negatif olamaz.",
        }

    try:
        data: dict[str, Any] = {
            "seller_id": seller_id,
            "field_key": field_key,
            "label": label,
            "field_type": field_type,
            "is_required": is_required,
            "is_active": True,
            "sort_order": sort_order,
            "options": options or [],
            "validation_config": validation_config or {},
        }

        if product_id is not None:
            data["product_id"] = product_id

        result = (
            get_supabase().table("order_field_definitions")
            .insert(data)
            .execute()
        )

        return {
            "durum": "başarılı",
            "definition": result.data[0],
        }

    except Exception as exc:
        error_text = str(exc)

        if "duplicate key" in error_text.lower() or "23505" in error_text:
            return {
                "durum": "çakışma",
                "mesaj": "Bu alan anahtarı bu satıcı için zaten kullanılıyor.",
            }

        return {
            "durum": "hata",
            "mesaj": "Alan tanımı oluşturulamadı.",
        }


def update_order_field_definition(
    seller_id: int,
    field_id: int,
    *,
    expected_version: int,
    label: str | None = None,
    is_required: bool | None = None,
    is_active: bool | None = None,
    sort_order: int | None = None,
) -> dict[str, Any]:
    """
    Dinamik alan tanımını optimistic concurrency ile günceller.

    field_key ve field_type değiştirilemez.
    """
    if not _is_positive_int(field_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "field_id pozitif tam sayı olmalıdır.",
        }

    if not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    try:
        current_result = (
            get_supabase().table("order_field_definitions")
            .select("*")
            .eq("id", field_id)
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )

        if not current_result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Alan tanımı bulunamadı.",
            }

        current = current_result.data[0]

        if int(current.get("version") or 0) != expected_version:
            return {
                "durum": "çakışma",
                "mesaj": "Alan tanımı başka bir işlemle değişti.",
                "definition": current,
            }

        update_data: dict[str, Any] = {
            "version": expected_version + 1,
            "updated_at": utc_iso(),
        }

        if label is not None:
            update_data["label"] = label

        if is_required is not None:
            update_data["is_required"] = is_required

        if is_active is not None:
            update_data["is_active"] = is_active

        if sort_order is not None:
            if sort_order < 0:
                return {
                    "durum": "doğrulama_hatası",
                    "mesaj": "sort_order negatif olamaz.",
                }
            update_data["sort_order"] = sort_order

        result = (
            get_supabase().table("order_field_definitions")
            .update(update_data)
            .eq("id", field_id)
            .eq("seller_id", seller_id)
            .eq("version", expected_version)
            .execute()
        )

        if not result.data:
            return {
                "durum": "çakışma",
                "mesaj": "Alan tanımı başka bir işlemle değişti.",
            }

        return {
            "durum": "başarılı",
            "definition": result.data[0],
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Alan tanımı güncellenemedi.",
        }


def get_order_field_definition_by_id(
    seller_id: int,
    field_id: int,
) -> dict[str, Any]:
    """Alan tanımını tenant scope'unda okur."""
    if not _is_positive_int(field_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "field_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("order_field_definitions")
            .select("*")
            .eq("id", field_id)
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Alan tanımı bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "definition": result.data[0],
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Alan tanımı okunamadı.",
        }


def get_product_by_id(
    seller_id: int,
    product_id: int,
) -> dict[str, Any]:
    """Ürünü tenant scope'unda okur."""
    if not _is_positive_int(product_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "product_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("products")
            .select("*")
            .eq("id", product_id)
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Ürün bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "product": result.data[0],
        }

    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Ürün okunamadı.",
        }


# =====================================================
# RETURN / ISSUE DOMAIN — KALICI İADE VE SORUN TALEPLERİ
# =====================================================

RETURN_ISSUE_TYPES = {
    "RETURN_REQUEST",
    "DAMAGED_ITEM",
    "WRONG_ITEM",
    "PRINT_OR_PERSONALIZATION_ISSUE",
    "DELIVERY_ISSUE",
    "OTHER_ORDER_ISSUE",
}

RETURN_ISSUE_STATUS_COLLECTING = "COLLECTING"
RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED = "SELLER_REVIEW_REQUIRED"
RETURN_ISSUE_STATUS_HANDLED = "HANDLED"

VALID_RETURN_ISSUE_STATUSES = {
    RETURN_ISSUE_STATUS_COLLECTING,
    RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_STATUS_HANDLED,
}

RETURN_IMAGE_REQUIREMENTS = {
    "REQUIRED",
    "OPTIONAL",
    "NOT_REQUESTED",
}


def _return_issue_rpc_response(data: Any) -> dict[str, Any]:
    """Return/issue RPC yanıtını güvenli domain sonucuna normalize eder."""
    payload = _extract_rpc_payload(data)

    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun işlemi geçersiz yanıt döndürdü.",
        }

    status = payload.get("status")

    if status == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "İade/sorun talebi bulunamadı.",
        }

    if status == "forbidden":
        return {
            "durum": "reddedildi",
            "mesaj": "İade/sorun işlemi bu tenant için geçersiz.",
        }

    if status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": payload.get("message") or "İade/sorun talebi değişti.",
        }
        if payload.get("request") is not None:
            response["request"] = payload["request"]
        if payload.get("setting") is not None:
            response["setting"] = payload["setting"]
        if payload.get("current_version") is not None:
            response["current_version"] = payload["current_version"]
        return response

    if status == "not_ready":
        response = {
            "durum": "hazır_değil",
            "mesaj": payload.get("message") or "Talep satıcı incelemesine hazır değil.",
        }
        if payload.get("request") is not None:
            response["request"] = payload["request"]
        return response

    if status == "error":
        return {
            "durum": "hata",
            "mesaj": payload.get("message") or "İade/sorun işlemi tamamlanamadı.",
        }

    if status != "success":
        return {
            "durum": "hata",
            "mesaj": "İade/sorun işlemi geçersiz yanıt döndürdü.",
        }

    response = {"durum": "başarılı"}

    for key in ("request", "evidence", "setting"):
        if payload.get(key) is not None:
            response[key] = payload[key]

    for key in (
        "changed",
        "created",
        "idempotent",
        "race_resolved",
        "notification_created",
    ):
        if payload.get(key) is not None:
            response[key] = payload[key] is True

    if payload.get("current_version") is not None:
        response["current_version"] = payload["current_version"]

    return response


def create_or_get_return_issue_request(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    issue_type: str,
    *,
    initial_reason_text: str | None = None,
    order_id: int | None = None,
    external_order_number: str | None = None,
) -> dict[str, Any]:
    """Açık iade/sorun talebini atomik ve idempotent biçimde oluşturur/getirir."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id, customer_id ve source_message_id pozitif tam sayı olmalıdır.",
        }

    if issue_type not in RETURN_ISSUE_TYPES:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"Geçersiz iade/sorun tipi: {issue_type}",
        }

    if order_id is not None and not _is_positive_int(order_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "order_id pozitif tam sayı olmalıdır.",
        }

    if initial_reason_text is not None:
        normalized_reason = initial_reason_text.strip()
        if not normalized_reason or len(normalized_reason) > 2000:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "initial_reason_text 1 ile 2000 karakter arasında olmalıdır.",
            }
        initial_reason_text = normalized_reason

    if external_order_number is not None:
        normalized_number = external_order_number.strip()
        if not normalized_number or len(normalized_number) > 100:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "external_order_number 1 ile 100 karakter arasında olmalıdır.",
            }
        external_order_number = normalized_number

    try:
        result = get_supabase().rpc(
            "create_or_get_return_issue_request",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
                "target_issue_type": issue_type,
                "initial_reason_text": initial_reason_text,
                "target_order_id": order_id,
                "external_order_number_text": external_order_number,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun talebi oluşturulamadı.",
        }

    return _return_issue_rpc_response(result.data)


def update_return_issue_request_from_message(
    seller_id: int,
    customer_id: int,
    request_id: int,
    source_message_id: int,
    *,
    external_order_number: str | None = None,
    reason_text: str | None = None,
    order_id: int | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Chat'ten toplanan request bilgilerini incoming source message ile günceller."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(request_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                "seller_id, customer_id, request_id ve source_message_id "
                "pozitif tam sayı olmalıdır."
            ),
        }

    if order_id is not None and not _is_positive_int(order_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "order_id pozitif tam sayı olmalıdır.",
        }

    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    if external_order_number is not None:
        external_order_number = external_order_number.strip()
        if not external_order_number or len(external_order_number) > 100:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "external_order_number 1 ile 100 karakter arasında olmalıdır.",
            }

    if reason_text is not None:
        reason_text = reason_text.strip()
        if not reason_text or len(reason_text) > 2000:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "reason_text 1 ile 2000 karakter arasında olmalıdır.",
            }

    if external_order_number is None and reason_text is None and order_id is None:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Güncellenecek talep bilgisi yok.",
        }

    try:
        result = get_supabase().rpc(
            "update_return_issue_request_from_message",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_request_id": request_id,
                "source_message_id": source_message_id,
                "new_external_order_number": external_order_number,
                "new_reason_text": reason_text,
                "target_order_id": order_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun talebi güncellenemedi.",
        }

    return _return_issue_rpc_response(result.data)


def add_return_issue_request_evidence(
    seller_id: int,
    customer_id: int,
    request_id: int,
    source_message_id: int,
    *,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Incoming image message'ı güvenli request evidence olarak ekler."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(request_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                "seller_id, customer_id, request_id ve source_message_id "
                "pozitif tam sayı olmalıdır."
            ),
        }

    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "add_return_issue_request_evidence",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_request_id": request_id,
                "source_message_id": source_message_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun evidence kaydedilemedi.",
        }

    return _return_issue_rpc_response(result.data)


def mark_return_issue_review_required(
    seller_id: int,
    customer_id: int,
    request_id: int,
    *,
    force_review: bool = False,
    review_reason_code: str | None = None,
    review_note: str | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Talebi seller review durumuna atomik/idempotent biçimde geçirir."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(request_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id, customer_id ve request_id pozitif tam sayı olmalıdır.",
        }

    if not isinstance(force_review, bool):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "force_review boolean olmalıdır.",
        }

    if expected_version is not None and not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "expected_version pozitif tam sayı olmalıdır.",
        }

    if review_reason_code is not None:
        review_reason_code = review_reason_code.strip()
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", review_reason_code):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "review_reason_code geçersiz.",
            }

    if force_review and review_reason_code is None:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "force_review için review_reason_code gereklidir.",
        }

    if review_note is not None:
        review_note = review_note.strip()
        if not review_note or len(review_note) > 500:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "review_note 1 ile 500 karakter arasında olmalıdır.",
            }

    try:
        result = get_supabase().rpc(
            "mark_return_issue_review_required",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_request_id": request_id,
                "force_review": force_review,
                "review_code": review_reason_code,
                "review_note_text": review_note,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun talebi seller review durumuna alınamadı.",
        }

    return _return_issue_rpc_response(result.data)


def mark_return_issue_handled(
    seller_id: int,
    request_id: int,
    actor_profile_id: int,
    expected_version: int,
    *,
    seller_note: str | None = None,
) -> dict[str, Any]:
    """Seller'ın talebi operasyonel olarak ele aldığını kaydeder; control state'i değiştirmez."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(request_id)
        or not _is_positive_int(actor_profile_id)
        or not _is_positive_int(expected_version)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                "seller_id, request_id, actor_profile_id ve expected_version "
                "pozitif tam sayı olmalıdır."
            ),
        }

    if seller_note is not None:
        seller_note = seller_note.strip()
        if not seller_note or len(seller_note) > 2000:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "seller_note 1 ile 2000 karakter arasında olmalıdır.",
            }

    try:
        result = get_supabase().rpc(
            "mark_return_issue_handled",
            {
                "target_seller_id": seller_id,
                "target_request_id": request_id,
                "actor_profile_id": actor_profile_id,
                "expected_version": expected_version,
                "seller_note_text": seller_note,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun talebi handled olarak işaretlenemedi.",
        }

    return _return_issue_rpc_response(result.data)


def update_return_issue_type_setting(
    seller_id: int,
    issue_type: str,
    image_requirement: str,
    expected_version: int,
) -> dict[str, Any]:
    """Seller issue-type görsel gereksinimini optimistic concurrency ile günceller."""
    if not _is_positive_int(seller_id) or not _is_positive_int(expected_version):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve expected_version pozitif tam sayı olmalıdır.",
        }

    if issue_type not in RETURN_ISSUE_TYPES:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"Geçersiz iade/sorun tipi: {issue_type}",
        }

    if image_requirement not in RETURN_IMAGE_REQUIREMENTS:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"Geçersiz image requirement: {image_requirement}",
        }

    try:
        result = get_supabase().rpc(
            "update_return_issue_type_setting",
            {
                "target_seller_id": seller_id,
                "target_issue_type": issue_type,
                "new_image_requirement": image_requirement,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun ayarı güncellenemedi.",
        }

    return _return_issue_rpc_response(result.data)


def get_active_return_issue_request(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    """Konuşmadaki açık return/issue request'i tenant scope'unda getirir."""
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("return_issue_requests")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .in_(
                "status",
                [
                    RETURN_ISSUE_STATUS_COLLECTING,
                    RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
                ],
            )
            .order("id")
            .limit(1)
            .execute()
        )

        return {
            "durum": "başarılı",
            "request": result.data[0] if result.data else None,
        }
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Açık iade/sorun talebi okunamadı.",
        }


def get_return_issue_request_by_id(
    seller_id: int,
    request_id: int,
) -> dict[str, Any]:
    """Return/issue request'i tenant scope'unda okur."""
    if not _is_positive_int(seller_id) or not _is_positive_int(request_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve request_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("return_issue_requests")
            .select("*")
            .eq("id", request_id)
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "İade/sorun talebi bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "request": result.data[0],
        }
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun talebi okunamadı.",
        }


def get_return_issue_request_detail(
    seller_id: int,
    request_id: int,
) -> dict[str, Any]:
    """Request + güvenli evidence referanslarını tenant scope'unda döndürür."""
    request_result = get_return_issue_request_by_id(seller_id, request_id)
    if request_result.get("durum") != "başarılı":
        return request_result

    request_row = request_result["request"]

    try:
        evidence_result = (
            get_supabase().table("return_issue_request_evidence")
            .select("id,seller_id,request_id,message_id,created_at")
            .eq("seller_id", seller_id)
            .eq("request_id", request_id)
            .order("created_at")
            .order("id")
            .execute()
        )

        customer_result = (
            get_supabase().table("customers")
            .select("id,seller_id,whatsapp_number,name")
            .eq("id", request_row["customer_id"])
            .eq("seller_id", seller_id)
            .limit(1)
            .execute()
        )

        order_row = None
        if request_row.get("order_id") is not None:
            order_result = (
                get_supabase().table("orders")
                .select(
                    "id,seller_id,customer_id,external_order_number,"
                    "product_name_snapshot,status,version"
                )
                .eq("id", request_row["order_id"])
                .eq("seller_id", seller_id)
                .limit(1)
                .execute()
            )
            order_row = order_result.data[0] if order_result.data else None

        return {
            "durum": "başarılı",
            "request": request_row,
            "customer": customer_result.data[0] if customer_result.data else None,
            "order": order_row,
            "evidence": evidence_result.data,
        }
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun talebi detayı okunamadı.",
        }


def list_return_issue_requests(
    seller_id: int,
    *,
    view: str = "all",
    customer_id: int | None = None,
    issue_type: str | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Seller return/issue taleplerini tenant scope'unda listeler."""
    if not _is_positive_int(seller_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    view_status = {
        "action_required": RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
        "collecting": RETURN_ISSUE_STATUS_COLLECTING,
        "handled": RETURN_ISSUE_STATUS_HANDLED,
        "all": None,
    }

    if view not in view_status:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "view değeri geçersiz.",
        }

    if not _is_positive_int(limit) or limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "limit 1 ile 100 arasında olmalıdır.",
        }

    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "offset negatif olmayan tam sayı olmalıdır.",
        }

    if customer_id is not None and not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "customer_id pozitif tam sayı olmalıdır.",
        }

    if issue_type is not None and issue_type not in RETURN_ISSUE_TYPES:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"Geçersiz iade/sorun tipi: {issue_type}",
        }

    try:
        query = (
            get_supabase().table("return_issue_requests")
            .select("*")
            .eq("seller_id", seller_id)
            .order("updated_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
        )

        if view_status[view] is not None:
            query = query.eq("status", view_status[view])

        if customer_id is not None:
            query = query.eq("customer_id", customer_id)

        if issue_type is not None:
            query = query.eq("issue_type", issue_type)

        # Exact order-number search: yalnız tam eşleşme (.eq). Substring /
        # ILIKE / fuzzy arama yoktur — Orders list endpointiyle aynı sözleşme.
        if external_order_number:
            query = query.eq(
                "external_order_number_snapshot",
                external_order_number,
            )

        result = query.execute()

        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "requests": result.data,
        }
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun talepleri okunamadı.",
        }


def get_return_issue_type_settings(
    seller_id: int,
) -> dict[str, Any]:
    """Seller için DB'de materialize edilmiş return/issue ayarlarını döndürür."""
    if not _is_positive_int(seller_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase().table("return_issue_type_settings")
            .select("*")
            .eq("seller_id", seller_id)
            .order("issue_type")
            .execute()
        )

        return {
            "durum": "başarılı",
            "settings": result.data,
        }
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "İade/sorun ayarları okunamadı.",
        }


# =====================================================
# SELLER PANEL READ MODELS — CONVERSATIONS / DASHBOARD
# =====================================================

SELLER_DASHBOARD_TASK_TYPES = {
    "return_review",
    "order_review",
    "unanswered_question",
}


def _seller_panel_rpc_payload(data: Any) -> dict[str, Any] | None:
    """Seller-panel read RPC JSONB yanıtını normalize eder."""
    return _extract_rpc_payload(data)


def get_seller_conversation_list(
    seller_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
    attention_only: bool = False,
) -> dict[str, Any]:
    """Seller conversation read model listesini tenant scope'unda döndürür."""
    if not _is_positive_int(seller_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    if not _is_positive_int(limit) or limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "limit 1 ile 100 arasında olmalıdır.",
        }

    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "offset negatif olmayan tam sayı olmalıdır.",
        }

    if not isinstance(attention_only, bool):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "attention_only boolean olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "get_seller_conversation_list",
            {
                "target_seller_id": seller_id,
                "result_limit": limit,
                "result_offset": offset,
                "attention_only": attention_only,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Konuşma listesi okunamadı.",
        }

    payload = _seller_panel_rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Konuşma listesi geçersiz yanıt döndürdü.",
        }

    if payload.get("status") == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                payload.get("message")
                or "Konuşma listesi parametreleri geçersiz."
            ),
        }

    conversations = payload.get("conversations")
    total = payload.get("total")
    if payload.get("status") != "success" or not isinstance(conversations, list):
        return {
            "durum": "hata",
            "mesaj": "Konuşma listesi geçersiz yanıt döndürdü.",
        }
    if not isinstance(total, int) or isinstance(total, bool) or total < 0:
        return {
            "durum": "hata",
            "mesaj": "Konuşma listesi toplam değeri geçersiz.",
        }

    return {
        "durum": "başarılı",
        "toplam": total,
        "conversations": conversations,
    }


def get_seller_conversation_detail_read_model(
    seller_id: int,
    customer_id: int,
    *,
    message_limit: int = 50,
    before_message_id: int | None = None,
    control_history_limit: int = 20,
) -> dict[str, Any]:
    """Tek konuşmanın panel read modelini tenant scope'unda döndürür."""
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }

    if not _is_positive_int(message_limit) or message_limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "message_limit 1 ile 100 arasında olmalıdır.",
        }

    if (
        before_message_id is not None
        and not _is_positive_int(before_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "before_message_id pozitif tam sayı olmalıdır.",
        }

    if (
        not _is_positive_int(control_history_limit)
        or control_history_limit > 100
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "control_history_limit 1 ile 100 arasında olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "get_seller_conversation_detail",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "message_limit": message_limit,
                "before_message_id": before_message_id,
                "control_history_limit": control_history_limit,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Konuşma detayı okunamadı.",
        }

    payload = _seller_panel_rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Konuşma detayı geçersiz yanıt döndürdü.",
        }

    status_value = payload.get("status")
    if status_value == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "Konuşma bulunamadı.",
        }
    if status_value == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                payload.get("message")
                or "Konuşma detayı parametreleri geçersiz."
            ),
        }
    if status_value != "success" or not isinstance(payload.get("customer"), dict):
        return {
            "durum": "hata",
            "mesaj": "Konuşma detayı geçersiz yanıt döndürdü.",
        }

    return {
        "durum": "başarılı",
        "customer": payload["customer"],
        "conversation_state": payload.get("conversation_state"),
        "control": payload.get("control"),
        "messages": payload.get("messages") or [],
        "message_page": payload.get("message_page") or {},
        "control_history": payload.get("control_history") or [],
        "active_order": payload.get("active_order"),
        "active_return_issue": payload.get("active_return_issue"),
        "open_unanswered": payload.get("open_unanswered") or [],
    }


def get_seller_dashboard_task_list(
    seller_id: int,
    *,
    task_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """Bugün ilgilenmeniz gerekenler read modelini tenant scope'unda döndürür."""
    if not _is_positive_int(seller_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
        }

    if task_type is not None and task_type not in SELLER_DASHBOARD_TASK_TYPES:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "task_type değeri geçersiz.",
        }

    if not _is_positive_int(limit) or limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "limit 1 ile 100 arasında olmalıdır.",
        }

    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "offset negatif olmayan tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "get_seller_dashboard_tasks",
            {
                "target_seller_id": seller_id,
                "task_type_value": task_type,
                "result_limit": limit,
                "result_offset": offset,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Dashboard görevleri okunamadı.",
        }

    payload = _seller_panel_rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Dashboard görevleri geçersiz yanıt döndürdü.",
        }

    if payload.get("status") == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                payload.get("message")
                or "Dashboard görev parametreleri geçersiz."
            ),
        }

    tasks = payload.get("tasks")
    total = payload.get("total")
    if payload.get("status") != "success" or not isinstance(tasks, list):
        return {
            "durum": "hata",
            "mesaj": "Dashboard görevleri geçersiz yanıt döndürdü.",
        }
    if not isinstance(total, int) or isinstance(total, bool) or total < 0:
        return {
            "durum": "hata",
            "mesaj": "Dashboard görev toplamı geçersiz.",
        }

    return {
        "durum": "başarılı",
        "toplam": total,
        "tasks": tasks,
    }

# =====================================================
# TEST
# =====================================================

if __name__ == "__main__":
    print("Supabase bağlantısı test ediliyor...")
    print(test_connection())
