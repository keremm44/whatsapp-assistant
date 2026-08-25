from __future__ import annotations

from typing import Any

import pytest

import seller_media_service


_ALLOWED_HOSTS = ("api.provider.example.com", "media.example.com")
_MEDIA_URL = f"https://{_ALLOWED_HOSTS[0]}/v1/media/abc123"

_PNG_BYTES = b"\x89PNG\r\n\x1a\nfake-image-bytes"


def settings_stub(hosts: tuple[str, ...] = _ALLOWED_HOSTS) -> Any:
    return type("Settings", (), {"media_allowed_hosts": hosts})()


def install_reference(
    monkeypatch: pytest.MonkeyPatch,
    result: dict[str, Any],
) -> None:
    monkeypatch.setattr(
        seller_media_service,
        "get_seller_message_media_reference",
        lambda seller_id, message_id: result,
    )


def message_reference(
    media_url: Any = _MEDIA_URL,
    *,
    message_type: str = "image",
) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "message": {
            "id": 55,
            "customer_id": 22,
            "message_type": message_type,
            "media_url": media_url,
        },
    }


def install_fetch(
    monkeypatch: pytest.MonkeyPatch,
    result: dict[str, Any],
) -> list[str]:
    called_with: list[str] = []

    def fake_fetch(url: str) -> dict[str, Any]:
        called_with.append(url)
        return result

    monkeypatch.setattr(seller_media_service, "fetch_upstream_media", fake_fetch)
    return called_with


@pytest.fixture(autouse=True)
def stub_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        seller_media_service,
        "get_settings",
        lambda: settings_stub(),
    )


# =====================================================
# TENANT KAPSAMI VE MESAJ VARLIĞI
# =====================================================

def test_owner_media_is_fetched_server_side(monkeypatch: pytest.MonkeyPatch) -> None:
    install_reference(monkeypatch, message_reference())
    called_with = install_fetch(
        monkeypatch,
        {"ok": True, "content": _PNG_BYTES, "content_type": "image/png"},
    )

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is True
    assert result["content"] == _PNG_BYTES
    assert result["content_type"] == "image/png"
    # Sağlayıcı çağrısı yalnızca sunucu tarafında, doğrulanmış URL ile yapılır.
    assert called_with == [_MEDIA_URL]
    # Ham sağlayıcı URL'si çıktının hiçbir yerine sızmaz.
    assert _MEDIA_URL not in repr(result.get("content_type"))
    assert set(result.keys()) == {"ok", "content", "content_type"}


def test_cross_seller_message_is_not_found_and_never_fetched(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Tenant filtresi DB katmanında; başka satıcının mesajı "bulunamadı"
    # ile aynı kalıptan döner (varlık sızıntısı yok).
    install_reference(monkeypatch, {"durum": "bulunamadı", "mesaj": "Mesaj bulunamadı."})
    called_with = install_fetch(monkeypatch, {"ok": True, "content": b"x", "content_type": "image/png"})

    result = seller_media_service.get_seller_message_media(11, 99999)

    assert result["ok"] is False
    assert result["kind"] == "not_found"
    assert result["error"]["code"] == "seller_message_not_found"
    assert called_with == []


def test_database_failure_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    install_reference(monkeypatch, {"durum": "hata", "mesaj": "db down"})
    called_with = install_fetch(monkeypatch, {"ok": True})

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"
    assert result["error"]["code"] == "seller_message_media_unavailable"
    assert called_with == []


def test_message_without_media_is_calm_404(monkeypatch: pytest.MonkeyPatch) -> None:
    install_reference(monkeypatch, message_reference(media_url=None))
    called_with = install_fetch(monkeypatch, {"ok": True})

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is False
    assert result["kind"] == "not_found"
    assert result["error"]["code"] == "seller_message_media_missing"
    assert "görsel bulunmuyor" in result["error"]["message"]
    assert called_with == []


def test_blank_media_url_is_calm_404(monkeypatch: pytest.MonkeyPatch) -> None:
    install_reference(monkeypatch, message_reference(media_url="   "))

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["kind"] == "not_found"


# =====================================================
# SSRF SINIRI (fail-closed)
# =====================================================

def test_empty_allowlist_is_fail_closed_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_reference(monkeypatch, message_reference())
    monkeypatch.setattr(
        seller_media_service,
        "get_settings",
        lambda: settings_stub(hosts=()),
    )
    called_with = install_fetch(monkeypatch, {"ok": True})

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"
    assert result["error"]["code"] == "seller_media_fetch_not_configured"
    assert called_with == []


@pytest.mark.parametrize(
    "bad_url",
    [
        # Şema sınırı
        "http://api.provider.example.com/v1/media/abc123",
        "ftp://api.provider.example.com/v1/media/abc123",
        "file:///etc/passwd",
        "javascript:alert(1)",
        # Userinfo sınırı
        "https://user:secret@api.provider.example.com/v1/media/abc123",
        "https://user@api.provider.example.com/v1/media/abc123",
        # IP literal sınırı (allowlist'te olsa bile)
        "https://127.0.0.1/v1/media/abc123",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/v1/media/abc123",
        # Port sınırı
        "https://api.provider.example.com:8443/v1/media/abc123",
        "https://api.provider.example.com:80/v1/media/abc123",
        # Allowlist dışı host
        "https://evil.example.com/v1/media/abc123",
        "https://api.provider.example.com.evil.example.com/v1/media/abc123",
        # Bozuk yapı (boş string "medya yok" kalıbıyla ayrıca test edilir)
        "not-a-url",
        "https://",
        "https://api.provider.example.com:not-a-port/x",
    ],
)
def test_untrusted_references_are_rejected_without_network(
    monkeypatch: pytest.MonkeyPatch,
    bad_url: str,
) -> None:
    install_reference(monkeypatch, message_reference(media_url=bad_url))
    called_with = install_fetch(monkeypatch, {"ok": True})

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is False
    assert result["kind"] == "validation"
    assert result["error"]["code"] == "seller_media_reference_untrusted"
    # Hata mesajı sakin kalır; ham URL asla yansıtılmaz.
    assert bad_url not in result["error"]["message"]
    assert called_with == []


def test_non_string_media_url_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    install_reference(monkeypatch, message_reference(media_url=12345))

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["kind"] == "not_found"


def test_oversized_media_url_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    long_url = "https://api.provider.example.com/" + "a" * 3000
    install_reference(monkeypatch, message_reference(media_url=long_url))
    called_with = install_fetch(monkeypatch, {"ok": True})

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["kind"] == "validation"
    assert called_with == []


def test_allowlist_match_is_exact_and_case_insensitive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_reference(
        monkeypatch,
        message_reference(media_url="https://API.Provider.Example.COM./v1/media/abc"),
    )
    called_with = install_fetch(
        monkeypatch,
        {"ok": True, "content": _PNG_BYTES, "content_type": "image/png"},
    )

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is True
    assert called_with


# =====================================================
# UPSTREAM DAVRANIŞI (mock'lu; gerçek ağa çıkılmaz)
# =====================================================

@pytest.mark.parametrize(
    "fetch_result",
    [
        {"ok": False, "reason": "upstream_status", "status_code": 500},
        {"ok": False, "reason": "upstream_status", "status_code": 404},
        # Redirect: takip edilmez, Location asla istemciye taşınmaz.
        {"ok": False, "reason": "upstream_status", "status_code": 302},
        {"ok": False, "reason": "timeout"},
        {"ok": False, "reason": "network"},
        {"ok": False, "reason": "too_large"},
    ],
)
def test_upstream_failures_are_controlled_502_kind(
    monkeypatch: pytest.MonkeyPatch,
    fetch_result: dict[str, Any],
) -> None:
    install_reference(monkeypatch, message_reference())
    install_fetch(monkeypatch, fetch_result)

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is False
    assert result["kind"] == "upstream"
    assert result["error"]["code"] == "seller_media_upstream_failed"
    # Sakin mesaj: upstream URL/durum kodu/Location sızıntısı yok.
    message = result["error"]["message"]
    assert _MEDIA_URL not in message
    assert "yeniden denenebilir" in message


def test_non_image_content_type_is_unsupported_and_body_dropped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_reference(monkeypatch, message_reference())
    install_fetch(
        monkeypatch,
        {"ok": False, "reason": "unsupported_content_type"},
    )

    result = seller_media_service.get_seller_message_media(11, 55)

    assert result["ok"] is False
    assert result["kind"] == "unsupported"
    assert result["error"]["code"] == "seller_media_type_unsupported"
    assert "content" not in result
