from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.seller import conversations as seller_conversation_routes
from main import app


_MEDIA_URL = "https://api.provider.example.com/v1/media/abc123"
_JPEG_BYTES = b"\xff\xd8\xff\xe0fake-jpeg-bytes\xff\xd9"


def seller_context(seller_id: int = 11) -> Any:
    return type(
        "AuthContext",
        (),
        {
            "auth_user_id": "auth-1",
            "email": "seller@example.com",
            "role": "seller",
            "profile_status": "active",
            "seller_id": seller_id,
            "profile": {"id": 7},
            "claims": {},
        },
    )()


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[seller_conversation_routes.require_seller] = (
        lambda: seller_context()
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def install_media_service(
    monkeypatch: pytest.MonkeyPatch,
    result: dict[str, Any],
) -> list[dict[str, Any]]:
    captured: list[dict[str, Any]] = []

    def fake_media(seller_id: int, message_id: int) -> dict[str, Any]:
        captured.append({"seller_id": seller_id, "message_id": message_id})
        return result

    monkeypatch.setattr(
        seller_conversation_routes,
        "get_seller_message_media",
        fake_media,
    )
    return captured


def test_message_media_requires_auth() -> None:
    from main import app as app_instance

    app_instance.dependency_overrides.clear()
    plain_client = TestClient(app_instance)
    response = plain_client.get("/seller/messages/55/media")
    assert response.status_code == 401
    app_instance.dependency_overrides.clear()


def test_message_media_streams_owner_content(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = install_media_service(
        monkeypatch,
        {"ok": True, "content": _JPEG_BYTES, "content_type": "image/jpeg"},
    )

    response = client.get("/seller/messages/55/media")

    assert response.status_code == 200
    assert response.content == _JPEG_BYTES
    # İçerik türü sağlayıcıdan korunarak taşınır.
    assert response.headers["content-type"] == "image/jpeg"
    # Hassas medya herkese açık önbelleğe alınamaz; sniffing kapalı.
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    # Ham sağlayıcı URL'si veya gizli bilgi yanıt gövdesine/header'larına
    # hiçbir biçimde sızmaz.
    assert _MEDIA_URL not in response.text
    assert "location" not in response.headers
    assert "www-authenticate" not in response.headers
    # Tenant kapsamı: servis çağrısı auth context seller_id'siyle yapılır.
    assert captured == [{"seller_id": 11, "message_id": 55}]


@pytest.mark.parametrize(
    ("kind", "expected_status"),
    [
        ("not_found", 404),
        ("validation", 422),
        ("unsupported", 415),
        ("upstream", 502),
        ("unavailable", 503),
        ("bilinmeyen_kind", 503),
    ],
)
def test_message_media_failure_kinds_map_to_status(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    kind: str,
    expected_status: int,
) -> None:
    install_media_service(
        monkeypatch,
        {
            "ok": False,
            "kind": kind,
            "error": {"code": "some_code", "message": "Sakin açıklama."},
        },
    )

    response = client.get("/seller/messages/55/media")

    assert response.status_code == expected_status
    body = response.json()
    assert body["detail"]["code"] == "some_code"
    # Hata gövdesi de URL/secret taşımaz.
    assert _MEDIA_URL not in response.text


def test_message_media_rejects_non_positive_id(client: TestClient) -> None:
    response = client.get("/seller/messages/0/media")
    assert response.status_code == 422

    response = client.get("/seller/messages/-5/media")
    assert response.status_code == 422
