"""Seller paneli medya proxy servisi.

Amaç: satıcı kendi tenant'ına ait bir mesajın görselini görmek istediğinde
ham sağlayıcı URL'si tarayıcıya VERİLMEZ; içerik sunucu tarafında, yalnızca
yapılandırılmış sağlayıcı hostlarından, HTTPS üzerinden indirilip döner.

SSRF sınırı (fail-closed):
  - Yalnızca HTTPS şeması kabul edilir.
  - Userinfo (kullanıcı/parola gömülü) URL reddedilir.
  - IP-literal host reddedilir (internal ağa sıçrama engellenir).
  - Yalnızca varsayılan HTTPS portu (443/boş) kabul edilir.
  - Host, MEDIA_ALLOWED_HOSTS listesinde birebir eşleşmelidir; liste boşsa
    indirme tamamen kapalıdır.
  - Redirect takip edilmez; 3xx yanıtlar hata sayılır (Location asla
    istemciye sızmaz, başka hosta sapılmaz).
  - Yanıt boyutu üstten sınırlıdır; izin verilmeyen içerik türlerinde
    baytlar istemciye hiç döndürülmez.
  - Provider kimlik bilgileri bu sistemde tutulmaz; indirme kimliksiz
    yapılır ve URL yanıt gövdesine/header'larına asla yansıtılmaz.
"""

from __future__ import annotations

import ipaddress
import logging
from typing import Any
from urllib.parse import urlsplit

import httpx

from database import get_seller_message_media_reference
from settings import get_settings


logger = logging.getLogger(__name__)

_MEDIA_MAX_BYTES = 16 * 1024 * 1024  # 16 MiB
_MEDIA_URL_MAX_LENGTH = 2048
_MEDIA_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_ALLOWED_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    }
)


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message},
        "kind": kind,
    }


def _trusted_media_url(
    raw_url: Any,
    allowed_hosts: tuple[str, ...],
) -> str | None:
    """Kayıtlı medya referansını doğrular; güvenliyse URL'yi döndürür.

    Herhangi bir şüphede None döner; çağıran taraf bu durumda ağa hiç
    çıkmaz (fail closed).
    """
    if not isinstance(raw_url, str):
        return None

    candidate = raw_url.strip()
    if not candidate or len(candidate) > _MEDIA_URL_MAX_LENGTH:
        return None

    try:
        parts = urlsplit(candidate)
        # Aşağıdaki property erişimleri geçersiz girdilerde ValueError
        # fırlatabilir (ör. malformed IPv6, geçersiz port).
        scheme = parts.scheme.lower()
        username = parts.username
        password = parts.password
        hostname = parts.hostname
        port = parts.port
    except ValueError:
        return None

    if scheme != "https":
        return None

    if username is not None or password is not None:
        return None

    if not hostname:
        return None

    host = hostname.lower().rstrip(".")

    try:
        ipaddress.ip_address(host)
        # IP literal güven listesine girse bile kabul edilmez.
        return None
    except ValueError:
        pass

    if port not in (None, 443):
        return None

    if host not in allowed_hosts:
        return None

    return candidate


def fetch_upstream_media(url: str) -> dict[str, Any]:
    """Doğrulanmış sağlayıcı URL'sinden medyayı sunucu tarafında indirir.

    Testler bu seam'i monkeypatch'ler; gerçek ağ çağrısı yalnızca burada
    yapılır. Ham sağlayıcı yanıt başlıkları (Location vb.) dışarı taşınmaz.
    """
    try:
        with httpx.Client(
            timeout=_MEDIA_TIMEOUT,
            follow_redirects=False,
        ) as client:
            with client.stream("GET", url) as response:
                if response.status_code != 200:
                    return {
                        "ok": False,
                        "reason": "upstream_status",
                        "status_code": response.status_code,
                    }

                content_type = (
                    (response.headers.get("content-type") or "")
                    .split(";", 1)[0]
                    .strip()
                    .lower()
                )
                if content_type not in _ALLOWED_CONTENT_TYPES:
                    return {"ok": False, "reason": "unsupported_content_type"}

                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > _MEDIA_MAX_BYTES:
                        return {"ok": False, "reason": "too_large"}
                    chunks.append(chunk)
    except httpx.TimeoutException:
        return {"ok": False, "reason": "timeout"}
    except httpx.HTTPError:
        return {"ok": False, "reason": "network"}

    return {
        "ok": True,
        "content": b"".join(chunks),
        "content_type": content_type,
    }


def get_seller_message_media(
    seller_id: int,
    message_id: int,
) -> dict[str, Any]:
    """Tenant-kontrollü mesaj medyasını sağlayıcıdan indirip döndürür.

    Başarı: {"ok": True, "content": bytes, "content_type": str}
    Hata:   {"ok": False, "kind": kind, "error": {"code", "message"}}

    Hata mesajları bilinçli olarak sakindir: ham sağlayıcı URL'si, upstream
    durum ayrıntısı veya tenant dışı varlık bilgisi içermez.
    """
    reference = get_seller_message_media_reference(seller_id, message_id)
    durum = reference.get("durum")

    if durum == "bulunamadı":
        return _failure(
            "seller_message_not_found",
            "Mesaj bulunamadı.",
            kind="not_found",
        )

    if durum != "başarılı" or not isinstance(reference.get("message"), dict):
        return _failure(
            "seller_message_media_unavailable",
            "Mesaj medyasına şu anda erişilemiyor.",
            kind="unavailable",
        )

    message = reference["message"]
    media_url = message.get("media_url")

    if not isinstance(media_url, str) or not media_url.strip():
        return _failure(
            "seller_message_media_missing",
            "Bu mesaj için görsel bulunmuyor.",
            kind="not_found",
        )

    allowed_hosts = get_settings().media_allowed_hosts
    if not allowed_hosts:
        return _failure(
            "seller_media_fetch_not_configured",
            "Medya indirme bu ortamda yapılandırılmamış.",
            kind="unavailable",
        )

    trusted_url = _trusted_media_url(media_url, allowed_hosts)
    if trusted_url is None:
        # URL asla loglanmaz veya istemciye yansıtılmaz.
        logger.warning(
            "Güvenilmeyen medya referansı reddedildi: seller_id=%s message_id=%s",
            seller_id,
            message_id,
        )
        return _failure(
            "seller_media_reference_untrusted",
            "Medya kaynağı doğrulanamadı.",
            kind="validation",
        )

    fetched = fetch_upstream_media(trusted_url)
    if fetched.get("ok"):
        return {
            "ok": True,
            "content": fetched["content"],
            "content_type": fetched["content_type"],
        }

    reason = fetched.get("reason")
    if reason == "unsupported_content_type":
        return _failure(
            "seller_media_type_unsupported",
            "Medya türü desteklenmiyor.",
            kind="unsupported",
        )

    logger.info(
        "Medya sağlayıcıdan alınamadı: seller_id=%s message_id=%s reason=%s status=%s",
        seller_id,
        message_id,
        reason,
        fetched.get("status_code"),
    )
    return _failure(
        "seller_media_upstream_failed",
        "Medya sağlayıcıdan alınamadı; daha sonra yeniden denenebilir.",
        kind="upstream",
    )
