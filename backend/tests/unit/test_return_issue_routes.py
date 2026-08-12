from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

import protected_routes
from main import app


def seller_context(seller_id: int = 11, profile_id: int = 7) -> Any:
    return type(
        "AuthContext",
        (),
        {
            "auth_user_id": "auth-1",
            "email": "seller@example.com",
            "role": "seller",
            "profile_status": "active",
            "seller_id": seller_id,
            "profile": {"id": profile_id},
            "claims": {},
        },
    )()


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[protected_routes.require_seller] = lambda: seller_context()
    yield TestClient(app)
    app.dependency_overrides.clear()


def request_record(
    *,
    status: str = "SELLER_REVIEW_REQUIRED",
    version: int = 3,
) -> dict[str, Any]:
    return {
        "id": 41,
        "seller_id": 11,
        "customer_id": 22,
        "order_id": 7,
        "issue_type": "DAMAGED_ITEM",
        "display_issue_type": "Hasarlı ürün",
        "external_order_number_snapshot": "TR123",
        "product_name_snapshot": "Kupa",
        "reason_text": "Kırık geldi",
        "image_requirement_snapshot": "REQUIRED",
        "status": status,
        "seller_action_required": status == "SELLER_REVIEW_REQUIRED",
        "review_reason_code": None,
        "review_note": None,
        "created_from_message_id": 101,
        "last_source_message_id": 103,
        "version": version,
        "created_at": "2026-08-07T10:00:00+00:00",
        "updated_at": "2026-08-07T10:03:00+00:00",
        "review_required_at": "2026-08-07T10:03:00+00:00",
        "handled_at": None,
        "handled_by_profile_id": None,
        "seller_note": None,
    }


def test_return_issue_list_requires_auth() -> None:
    app.dependency_overrides.clear()
    response = TestClient(app).get("/seller/return-issue-requests")
    assert response.status_code == 401


def test_return_issue_list_uses_authenticated_seller(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = seller_id
        captured.update(kwargs)
        return {"durum": "başarılı", "toplam": 1, "requests": [request_record()]}

    monkeypatch.setattr(protected_routes, "list_seller_return_issue_requests", fake_list)

    response = client.get(
        "/seller/return-issue-requests?view=action_required&customer_id=22"
        "&issue_type=DAMAGED_ITEM&limit=20&offset=0"
    )

    assert response.status_code == 200
    assert captured["seller_id"] == 11
    assert captured["view"] == "action_required"
    assert response.json()["requests"][0]["id"] == 41


def test_return_issue_list_validation(client: TestClient) -> None:
    assert client.get("/seller/return-issue-requests?view=invalid").status_code == 422
    assert client.get("/seller/return-issue-requests?limit=101").status_code == 422
    assert client.get("/seller/return-issue-requests?offset=-1").status_code == 422


def test_return_issue_list_order_number_search_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = seller_id
        captured.update(kwargs)
        return {
            "durum": "başarılı",
            "toplam": 1,
            "requests": [request_record()],
        }

    monkeypatch.setattr(protected_routes, "list_seller_return_issue_requests", fake_list)

    response = client.get(
        "/seller/return-issue-requests?external_order_number=TR-1001"
    )

    assert response.status_code == 200
    assert captured["seller_id"] == 11
    assert captured["external_order_number"] == "TR-1001"

    # 100 karakter kabul edilir; 101 karakter mevcut doğrulama
    # sözleşmesi gereği 422 reddedilir (Orders aramasıyla aynı).
    assert (
        client.get("/seller/return-issue-requests?external_order_number=" + "A" * 100).status_code
        == 200
    )
    assert (
        client.get("/seller/return-issue-requests?external_order_number=" + "A" * 101).status_code
        == 422
    )


def test_return_issue_list_exposes_customer_phone(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        return {
            "durum": "başarılı",
            "toplam": 1,
            "requests": [
                {**request_record(), "customer_phone": "+905551112244"}
            ],
        }

    monkeypatch.setattr(protected_routes, "list_seller_return_issue_requests", fake_list)

    response = client.get("/seller/return-issue-requests")

    assert response.status_code == 200
    assert (
        response.json()["requests"][0]["customer_phone"] == "+905551112244"
    )


def test_return_issue_list_service_unavailable_is_503(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "list_seller_return_issue_requests",
        lambda *args, **kwargs: {
            "durum": "hata",
            "kind": "unavailable",
            "mesaj": "db down",
        },
    )
    assert client.get("/seller/return-issue-requests").status_code == 503


def test_return_issue_detail_success(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_seller_return_issue_request_detail",
        lambda seller_id, request_id: {
            "durum": "başarılı",
            "request": request_record(),
            "customer": {"id": 22, "whatsapp_number": "+90555"},
            "order": {"id": 7, "external_order_number": "TR123"},
            "evidence": [{"id": 8, "message_id": 103, "created_at": "now"}],
            "missing_fields": [],
        },
    )

    response = client.get("/seller/return-issue-requests/41")

    assert response.status_code == 200
    body = response.json()
    assert body["request"]["id"] == 41
    assert body["evidence"] == [{"id": 8, "message_id": 103, "created_at": "now"}]
    assert "media_url" not in body["evidence"][0]


def test_return_issue_detail_other_tenant_is_404(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_seller_return_issue_request_detail",
        lambda *args: {
            "durum": "hata",
            "kind": "not_found",
            "mesaj": "İade/sorun talebi bulunamadı.",
        },
    )
    assert client.get("/seller/return-issue-requests/999").status_code == 404


def test_mark_handled_uses_auth_profile_not_client_actor(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_mark(
        seller_id: int,
        request_id: int,
        actor_profile_id: int,
        expected_version: int,
        *,
        note: str | None,
    ) -> dict[str, Any]:
        captured.update(
            seller_id=seller_id,
            request_id=request_id,
            actor_profile_id=actor_profile_id,
            expected_version=expected_version,
            note=note,
        )
        return {
            "durum": "başarılı",
            "changed": True,
            "request": request_record(status="HANDLED", version=4),
        }

    monkeypatch.setattr(protected_routes, "mark_seller_return_issue_handled", fake_mark)

    response = client.post(
        "/seller/return-issue-requests/41/actions",
        json={
            "action": "mark_handled",
            "expected_version": 3,
            "note": "Müşteriyle görüşüldü.",
        },
    )

    assert response.status_code == 200
    assert captured["seller_id"] == 11
    assert captured["actor_profile_id"] == 7
    assert response.json()["request"]["status"] == "HANDLED"


def test_return_issue_action_rejects_commercial_actions(client: TestClient) -> None:
    for action in ["approve", "reject", "refund", "replace", "compensate"]:
        response = client.post(
            "/seller/return-issue-requests/41/actions",
            json={"action": action, "expected_version": 3},
        )
        assert response.status_code == 422


def test_return_issue_action_rejects_extra_client_identity(client: TestClient) -> None:
    response = client.post(
        "/seller/return-issue-requests/41/actions",
        json={
            "action": "mark_handled",
            "expected_version": 3,
            "seller_id": 999,
            "actor_profile_id": 999,
        },
    )
    assert response.status_code == 422


def test_return_issue_action_expected_version_is_strict(client: TestClient) -> None:
    for bad in [True, "3", 0, -1]:
        response = client.post(
            "/seller/return-issue-requests/41/actions",
            json={"action": "mark_handled", "expected_version": bad},
        )
        assert response.status_code == 422


def test_return_issue_action_stale_version_is_409(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "mark_seller_return_issue_handled",
        lambda *args, **kwargs: {
            "durum": "hata",
            "kind": "conflict",
            "mesaj": "stale",
        },
    )
    response = client.post(
        "/seller/return-issue-requests/41/actions",
        json={"action": "mark_handled", "expected_version": 3},
    )
    assert response.status_code == 409


def test_return_issue_settings_returns_all_canonical_rows(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = [
        {
            "issue_type": issue_type,
            "display_name": issue_type,
            "image_requirement": "OPTIONAL",
            "version": 1,
            "updated_at": None,
        }
        for issue_type in [
            "RETURN_REQUEST",
            "DAMAGED_ITEM",
            "WRONG_ITEM",
            "PRINT_OR_PERSONALIZATION_ISSUE",
            "DELIVERY_ISSUE",
            "OTHER_ORDER_ISSUE",
        ]
    ]
    monkeypatch.setattr(
        protected_routes,
        "get_seller_return_issue_settings",
        lambda seller_id: {"durum": "başarılı", "settings": settings},
    )

    response = client.get("/seller/return-issue-settings")

    assert response.status_code == 200
    assert len(response.json()["settings"]) == 6


def test_return_issue_setting_patch_success(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_update(
        seller_id: int,
        issue_type: str,
        image_requirement: str,
        expected_version: int,
    ) -> dict[str, Any]:
        captured.update(
            seller_id=seller_id,
            issue_type=issue_type,
            image_requirement=image_requirement,
            expected_version=expected_version,
        )
        return {
            "durum": "başarılı",
            "changed": True,
            "setting": {
                "issue_type": issue_type,
                "display_name": "Hasarlı ürün",
                "image_requirement": image_requirement,
                "version": 2,
                "updated_at": "now",
            },
        }

    monkeypatch.setattr(protected_routes, "update_seller_return_issue_setting", fake_update)

    response = client.patch(
        "/seller/return-issue-settings/DAMAGED_ITEM",
        json={"expected_version": 1, "image_requirement": "REQUIRED"},
    )

    assert response.status_code == 200
    assert captured == {
        "seller_id": 11,
        "issue_type": "DAMAGED_ITEM",
        "image_requirement": "REQUIRED",
        "expected_version": 1,
    }


def test_return_issue_setting_patch_rejects_invalid_enum_and_extra(client: TestClient) -> None:
    invalid = client.patch(
        "/seller/return-issue-settings/DAMAGED_ITEM",
        json={"expected_version": 1, "image_requirement": "ALWAYS"},
    )
    assert invalid.status_code == 422

    extra = client.patch(
        "/seller/return-issue-settings/DAMAGED_ITEM",
        json={
            "expected_version": 1,
            "image_requirement": "REQUIRED",
            "seller_id": 999,
        },
    )
    assert extra.status_code == 422


def test_return_issue_setting_patch_bool_version_is_422(client: TestClient) -> None:
    response = client.patch(
        "/seller/return-issue-settings/DAMAGED_ITEM",
        json={"expected_version": True, "image_requirement": "REQUIRED"},
    )
    assert response.status_code == 422


def test_return_issue_setting_patch_stale_is_409(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "update_seller_return_issue_setting",
        lambda *args, **kwargs: {
            "durum": "hata",
            "kind": "conflict",
            "mesaj": "stale",
        },
    )
    response = client.patch(
        "/seller/return-issue-settings/DAMAGED_ITEM",
        json={"expected_version": 1, "image_requirement": "REQUIRED"},
    )
    assert response.status_code == 409
