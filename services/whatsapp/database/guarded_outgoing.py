from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


_ALLOWED_PROVIDERS = {"internal", "whatsapp_cloud_pending"}
_SUPPRESSION_REASONS = {
    "control_unavailable": (
        "outgoing_suppressed_control_unavailable",
        "Konuşma kontrolü yeniden doğrulanamadı.",
    ),
    "control_changed": (
        "outgoing_suppressed_control_changed",
        "Konuşma kontrolü otomatik yanıta kapatıldı veya sürümü değişti.",
    ),
    "before_resume_cursor": (
        "outgoing_suppressed_before_resume_cursor",
        "Mesaj asistana geri bırakma sınırından eski.",
    ),
}


def get_supabase():
    import database

    return database.get_supabase()


def persist_guarded_auto_reply(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    expected_control_version: int,
    content: str | None,
    message_type: str = "text",
    media_url: str | None = None,
    ai_confidence: float | None = None,
    provider: str = "internal",
) -> dict[str, Any]:
    """Persist one auto reply only while the expected control version is active.

    The permission check and insert are performed by one PostgreSQL RPC while
    holding the conversation-control row lock. Application-level callers may do
    an earlier fail-fast read, but this function is the final write boundary.
    """
    if not all(
        _is_positive_int(value)
        for value in (
            seller_id,
            customer_id,
            source_message_id,
            expected_control_version,
        )
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Otomatik yanıt kimlikleri ve kontrol sürümü pozitif tam sayı olmalıdır.",
        }

    normalized_provider = provider.strip() if isinstance(provider, str) else ""
    if normalized_provider not in _ALLOWED_PROVIDERS:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Desteklenmeyen otomatik yanıt sağlayıcısı.",
        }

    normalized_message_type = (
        message_type.strip() if isinstance(message_type, str) else ""
    )
    if not normalized_message_type or len(normalized_message_type) > 64:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Geçersiz otomatik yanıt mesaj tipi.",
        }

    if content is None and media_url is None:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Otomatik yanıt içerik veya medya içermelidir.",
        }

    if ai_confidence is not None:
        if (
            isinstance(ai_confidence, bool)
            or not isinstance(ai_confidence, (int, float))
            or not 0 <= float(ai_confidence) <= 1
        ):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "Otomatik yanıt güven değeri 0 ile 1 arasında olmalıdır.",
            }

    try:
        result = get_supabase().rpc(
            "persist_guarded_auto_reply",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_source_message_id": source_message_id,
                "expected_control_version": expected_control_version,
                "content_value": content,
                "message_type_value": normalized_message_type,
                "media_url_value": media_url,
                "ai_confidence_value": ai_confidence,
                "provider_value": normalized_provider,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Otomatik yanıt güvenli biçimde kaydedilemedi.",
        }

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Otomatik yanıt işlemi geçersiz yanıt döndürdü.",
        }

    status = payload.get("status")
    if status == "suppressed":
        reason = str(payload.get("reason") or "")
        reason_code, message = _SUPPRESSION_REASONS.get(
            reason,
            _SUPPRESSION_REASONS["control_unavailable"],
        )
        return {
            "durum": "bastırıldı",
            "reason_code": reason_code,
            "mesaj": message,
        }

    if status == "conflict":
        return {
            "durum": "çakışma",
            "mesaj": "Otomatik yanıt kaydı başka bir işlemle çakıştı.",
        }

    message = payload.get("message")
    if status != "success" or not isinstance(message, dict):
        return {
            "durum": "hata",
            "mesaj": "Otomatik yanıt işlemi tamamlanamadı.",
        }

    return {
        "durum": "başarılı",
        "message": message,
        "created": payload.get("created") is True,
        "idempotent": payload.get("idempotent") is True,
    }
