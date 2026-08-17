from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from database.whatsapp_delivery import (
    claim_whatsapp_delivery_outbox,
    get_whatsapp_delivery_context,
    mark_whatsapp_delivery_failed,
    mark_whatsapp_delivery_sent,
    mark_whatsapp_delivery_unknown,
    schedule_whatsapp_delivery_retry,
)
from settings import AppSettings, get_settings


_GRAPH_BASE_URL = "https://graph.facebook.com"
_PHONE_NUMBER_ID_RE = re.compile(r"^[0-9]{5,64}$")
_RECIPIENT_ID_RE = re.compile(r"^[0-9]{5,32}$")
_DEFAULT_RETRY_SECONDS = 60
_MAX_RETRY_SECONDS = 3600
_REQUEST_TIMEOUT_SECONDS = 10.0


def _positive_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


def _safe_meta_error_code(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"http_{response.status_code}"
    if not isinstance(payload, dict):
        return f"http_{response.status_code}"
    error = payload.get("error")
    if not isinstance(error, dict):
        return f"http_{response.status_code}"
    code = error.get("code")
    if isinstance(code, int) and not isinstance(code, bool):
        return f"meta_{code}"[:64]
    if isinstance(code, str) and code.strip():
        normalized = re.sub(r"[^A-Za-z0-9_.-]", "_", code.strip())
        return f"meta_{normalized}"[:64]
    return f"http_{response.status_code}"


def _provider_message_id(response: httpx.Response) -> str | None:
    try:
        payload = response.json()
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        return None
    first = messages[0]
    if not isinstance(first, dict):
        return None
    message_id = first.get("id")
    if not isinstance(message_id, str):
        return None
    normalized = message_id.strip()
    if not normalized.startswith("wamid.") or len(normalized) > 150:
        return None
    return normalized


def _retry_seconds(response: httpx.Response) -> int:
    raw = response.headers.get("Retry-After")
    if isinstance(raw, str):
        try:
            parsed = int(raw.strip())
        except ValueError:
            parsed = _DEFAULT_RETRY_SECONDS
        if 1 <= parsed <= _MAX_RETRY_SECONDS:
            return parsed
    return _DEFAULT_RETRY_SECONDS


def _mark_failed(outbox_id: int, error_code: str) -> dict[str, Any]:
    result = mark_whatsapp_delivery_failed(outbox_id, error_code=error_code)
    if result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "reason_code": "whatsapp_send_failed_state_persist_failed",
        }
    return {
        "durum": "başarılı",
        "delivery_state": "FAILED",
        "error_code": error_code,
    }


def _mark_unknown(outbox_id: int, error_code: str) -> dict[str, Any]:
    result = mark_whatsapp_delivery_unknown(outbox_id, error_code=error_code)
    if result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "reason_code": "whatsapp_send_unknown_state_persist_failed",
        }
    return {
        "durum": "başarılı",
        "delivery_state": "UNKNOWN",
        "error_code": error_code,
        "manual_review_required": True,
    }


def _schedule_retry(
    outbox_id: int,
    *,
    seconds: int,
    error_code: str,
) -> dict[str, Any]:
    retry_at = datetime.now(timezone.utc) + timedelta(seconds=seconds)
    result = schedule_whatsapp_delivery_retry(
        outbox_id,
        retry_at=retry_at.isoformat(),
        error_code=error_code,
    )
    if result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "reason_code": "whatsapp_send_retry_state_persist_failed",
        }
    return {
        "durum": "başarılı",
        "delivery_state": "PENDING",
        "retry_scheduled": True,
        "retry_after_seconds": seconds,
    }


def _post_message(
    *,
    phone_number_id: str,
    recipient_id: str,
    content: str,
    settings: AppSettings,
    http_client: Any | None,
) -> httpx.Response:
    graph_version = settings.whatsapp_graph_api_version
    access_token = settings.whatsapp_access_token
    if not graph_version or not access_token:
        raise RuntimeError("WhatsApp outbound configuration is incomplete.")

    url = f"{_GRAPH_BASE_URL}/{graph_version}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient_id,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": content,
        },
    }

    if http_client is not None:
        return http_client.post(
            url,
            headers=headers,
            json=body,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )

    with httpx.Client(follow_redirects=False) as client:
        return client.post(
            url,
            headers=headers,
            json=body,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )


def dispatch_whatsapp_outbox(
    outbox_id: int,
    *,
    current_settings: AppSettings | None = None,
    http_client: Any | None = None,
) -> dict[str, Any]:
    """Attempt one durable outbox delivery without blind ambiguous retries."""
    if _positive_int(outbox_id) is None:
        return {"durum": "doğrulama_hatası", "reason_code": "whatsapp_outbox_id_invalid"}

    settings = current_settings or get_settings()
    if not settings.whatsapp_send_enabled:
        return {
            "durum": "devre_dışı",
            "reason_code": "whatsapp_send_disabled",
        }
    if not settings.whatsapp_access_token or not settings.whatsapp_graph_api_version:
        return {
            "durum": "hata",
            "reason_code": "whatsapp_send_config_unavailable",
        }

    context_result = get_whatsapp_delivery_context(outbox_id)
    if context_result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "reason_code": "whatsapp_send_context_unavailable",
        }

    outbox = context_result.get("outbox")
    channel = context_result.get("channel")
    message = context_result.get("message")
    if not all(isinstance(value, dict) for value in (outbox, channel, message)):
        return {
            "durum": "hata",
            "reason_code": "whatsapp_send_context_invalid",
        }

    assert isinstance(outbox, dict)
    assert isinstance(channel, dict)
    assert isinstance(message, dict)
    current_status = outbox.get("status")
    if current_status != "PENDING":
        return {
            "durum": "atlandı",
            "reason_code": "whatsapp_outbox_not_pending",
            "delivery_state": current_status,
        }

    claim_result = claim_whatsapp_delivery_outbox(outbox_id)
    if claim_result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "reason_code": "whatsapp_outbox_claim_failed",
        }
    if claim_result.get("claimed") is not True:
        claimed_outbox = claim_result.get("outbox")
        return {
            "durum": "atlandı",
            "reason_code": "whatsapp_outbox_not_claimed",
            "delivery_state": (
                claimed_outbox.get("status")
                if isinstance(claimed_outbox, dict)
                else None
            ),
        }

    phone_number_id = channel.get("phone_number_id")
    recipient_id = outbox.get("recipient_id")
    content = message.get("content")
    message_type = message.get("message_type")
    if (
        not isinstance(phone_number_id, str)
        or _PHONE_NUMBER_ID_RE.fullmatch(phone_number_id) is None
        or not isinstance(recipient_id, str)
        or _RECIPIENT_ID_RE.fullmatch(recipient_id) is None
        or message_type != "text"
        or not isinstance(content, str)
        or not content.strip()
        or len(content) > 4096
    ):
        return _mark_failed(outbox_id, "invalid_delivery_payload")

    try:
        response = _post_message(
            phone_number_id=phone_number_id,
            recipient_id=recipient_id,
            content=content,
            settings=settings,
            http_client=http_client,
        )
    except httpx.RequestError:
        return _mark_unknown(outbox_id, "transport_request_error")
    except RuntimeError:
        return _mark_failed(outbox_id, "transport_config_error")

    status_code = response.status_code
    if 200 <= status_code < 300:
        provider_message_id = _provider_message_id(response)
        if provider_message_id is None:
            return _mark_unknown(outbox_id, "success_response_without_wamid")
        sent_result = mark_whatsapp_delivery_sent(
            outbox_id,
            provider_message_id=provider_message_id,
        )
        if sent_result.get("durum") != "başarılı":
            return {
                "durum": "hata",
                "reason_code": "whatsapp_send_sent_state_persist_failed",
                "manual_review_required": True,
            }
        return {
            "durum": "başarılı",
            "delivery_state": "SENT",
            "provider_message_id": provider_message_id,
        }

    error_code = _safe_meta_error_code(response)
    if status_code == 429:
        return _schedule_retry(
            outbox_id,
            seconds=_retry_seconds(response),
            error_code=error_code,
        )

    if status_code == 408 or status_code == 425 or 300 <= status_code < 400 or status_code >= 500:
        return _mark_unknown(outbox_id, error_code)

    if 400 <= status_code < 500:
        return _mark_failed(outbox_id, error_code)

    return _mark_unknown(outbox_id, error_code)
