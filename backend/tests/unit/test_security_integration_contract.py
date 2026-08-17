from __future__ import annotations

from typing import Any, Callable

import pytest
from fastapi.testclient import TestClient

import auth_service
import protected_routes
from auth_service import AuthContext
from main import app


def _seller_context(*, seller_id: int = 11, profile_id: int = 7) -> AuthContext:
    return AuthContext(
        auth_user_id=f"seller-auth-{seller_id}",
        email=f"seller-{seller_id}@example.com",
        role="seller",
        profile_status="active",
        seller_id=seller_id,
        profile={
            "id": profile_id,
            "role": "seller",
            "status": "active",
            "seller_id": seller_id,
        },
        claims={"sub": f"seller-auth-{seller_id}"},
    )


def _admin_context() -> AuthContext:
    return AuthContext(
        auth_user_id="admin-auth-1",
        email="admin@example.com",
        role="admin",
        profile_status="active",
        seller_id=None,
        profile={
            "id": 1,
            "role": "admin",
            "status": "active",
            "seller_id": None,
        },
        claims={"sub": "admin-auth-1"},
    )


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _set_authenticated_context(context: AuthContext) -> None:
    # Deliberately override only the base auth resolver. require_seller and
    # require_admin remain real FastAPI dependencies so role gates are exercised.
    app.dependency_overrides[auth_service.get_current_auth_context] = lambda: context


def _must_not_run(name: str) -> Callable[..., Any]:
    def fail(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError(f"{name} must not run after authorization/validation failure")

    return fail


def test_seller_cannot_reach_admin_route_through_real_role_gate(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_authenticated_context(_seller_context())
    monkeypatch.setattr(
        protected_routes,
        "get_seller_applications",
        _must_not_run("get_seller_applications"),
    )

    response = client.get("/admin/applications")

    assert response.status_code == 403
    assert response.json()["detail"] == "Bu endpoint yalnızca admin içindir."


def test_admin_cannot_reach_seller_route_through_real_role_gate(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_authenticated_context(_admin_context())
    monkeypatch.setattr(
        protected_routes,
        "list_seller_orders",
        _must_not_run("list_seller_orders"),
    )

    response = client.get("/seller/orders")

    assert response.status_code == 403
    assert response.json()["detail"] == "Bu endpoint yalnızca satıcı içindir."


def test_return_mutation_is_scoped_to_authenticated_tenant(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Request 41 is modeled as belonging to seller 11. Authenticate as seller 22.
    _set_authenticated_context(_seller_context(seller_id=22, profile_id=8))
    captured: dict[str, Any] = {}

    def fake_mark_handled(
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
        if seller_id != 11:
            return {
                "durum": "hata",
                "kind": "not_found",
                "mesaj": "İade/sorun talebi bulunamadı.",
            }
        raise AssertionError("Cross-tenant request unexpectedly used seller 11")

    monkeypatch.setattr(
        protected_routes,
        "mark_seller_return_issue_handled",
        fake_mark_handled,
    )

    response = client.post(
        "/seller/return-issue-requests/41/actions",
        json={
            "action": "mark_handled",
            "expected_version": 3,
            "note": "cross-tenant attempt",
        },
    )

    assert response.status_code == 404
    assert captured == {
        "seller_id": 22,
        "request_id": 41,
        "actor_profile_id": 8,
        "expected_version": 3,
        "note": "cross-tenant attempt",
    }


def test_unanswered_mutation_is_scoped_to_authenticated_tenant(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Group 61 is modeled as belonging to seller 11. Authenticate as seller 22.
    _set_authenticated_context(_seller_context(seller_id=22, profile_id=8))
    captured: dict[str, Any] = {}

    def fake_set_answer(
        seller_id: int,
        group_id: int,
        actor_profile_id: int,
        expected_version: int,
        answer: str,
    ) -> dict[str, Any]:
        captured.update(
            seller_id=seller_id,
            group_id=group_id,
            actor_profile_id=actor_profile_id,
            expected_version=expected_version,
            answer=answer,
        )
        if seller_id != 11:
            return {
                "durum": "hata",
                "kind": "not_found",
                "mesaj": "Yanıtlanmamış soru bulunamadı.",
            }
        raise AssertionError("Cross-tenant request unexpectedly used seller 11")

    monkeypatch.setattr(protected_routes, "set_seller_answer", fake_set_answer)

    response = client.post(
        "/seller/unanswered-questions/61/actions",
        json={
            "action": "set_answer",
            "expected_version": 2,
            "answer": "İki iş günü içinde kargoya verilir.",
        },
    )

    assert response.status_code == 404
    assert captured == {
        "seller_id": 22,
        "group_id": 61,
        "actor_profile_id": 8,
        "expected_version": 2,
        "answer": "İki iş günü içinde kargoya verilir.",
    }


def test_return_stale_version_maps_to_409_with_real_seller_gate(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_authenticated_context(_seller_context(seller_id=11, profile_id=7))

    monkeypatch.setattr(
        protected_routes,
        "mark_seller_return_issue_handled",
        lambda *args, **kwargs: {
            "durum": "hata",
            "kind": "conflict",
            "mesaj": "İade/sorun talebi değişti.",
        },
    )

    response = client.post(
        "/seller/return-issue-requests/41/actions",
        json={"action": "mark_handled", "expected_version": 3},
    )

    assert response.status_code == 409


def test_unanswered_stale_version_maps_to_409_with_real_seller_gate(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_authenticated_context(_seller_context(seller_id=11, profile_id=7))

    monkeypatch.setattr(
        protected_routes,
        "set_seller_answer",
        lambda *args, **kwargs: {
            "durum": "hata",
            "kind": "conflict",
            "mesaj": "Yanıtlanmamış soru değişti.",
        },
    )

    response = client.post(
        "/seller/unanswered-questions/61/actions",
        json={
            "action": "set_answer",
            "expected_version": 2,
            "answer": "İki iş günü içinde kargoya verilir.",
        },
    )

    assert response.status_code == 409


def test_client_cannot_forge_seller_or_actor_identity_before_mutation_service(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_authenticated_context(_seller_context(seller_id=22, profile_id=8))
    monkeypatch.setattr(
        protected_routes,
        "mark_seller_return_issue_handled",
        _must_not_run("mark_seller_return_issue_handled"),
    )

    response = client.post(
        "/seller/return-issue-requests/41/actions",
        json={
            "action": "mark_handled",
            "expected_version": 3,
            "seller_id": 11,
            "actor_profile_id": 7,
        },
    )

    assert response.status_code == 422
