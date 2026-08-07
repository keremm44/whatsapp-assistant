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


def group_record(*, status: str = "OPEN", version: int = 3) -> dict[str, Any]:
    return {
        "id": 41,
        "seller_id": 11,
        "canonical_question": "Bulaşık makinesinde yıkanır mı?",
        "normalized_question": "bulaşık makinesinde yıkanır mı",
        "status": status,
        "answer_text": "Evet." if status == "ANSWERED" else None,
        "occurrence_count": 3,
        "first_seen_at": "2026-08-07T10:00:00+00:00",
        "last_seen_at": "2026-08-07T12:00:00+00:00",
        "version": version,
        "answered_at": None,
        "answered_by_profile_id": None,
        "dismissed_at": None,
        "dismissed_by_profile_id": None,
        "dismiss_note": None,
        "created_at": "2026-08-07T10:00:00+00:00",
        "updated_at": "2026-08-07T12:00:00+00:00",
    }


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[protected_routes.require_seller] = lambda: seller_context()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_unanswered_list_requires_auth() -> None:
    app.dependency_overrides.clear()
    assert TestClient(app).get("/seller/unanswered-questions").status_code == 401


def test_unanswered_list_uses_auth_seller_and_view(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = seller_id
        captured.update(kwargs)
        return {"durum": "başarılı", "toplam": 1, "groups": [group_record()]}

    monkeypatch.setattr(protected_routes, "list_seller_unanswered_questions", fake_list)
    response = client.get(
        "/seller/unanswered-questions?view=action_required&limit=20&offset=0"
    )
    assert response.status_code == 200
    assert captured == {
        "seller_id": 11,
        "view": "action_required",
        "limit": 20,
        "offset": 0,
    }
    body = response.json()
    assert body["questions"][0]["question"] == "Bulaşık makinesinde yıkanır mı?"


def test_unanswered_list_validates_view_and_pagination(client: TestClient) -> None:
    assert client.get("/seller/unanswered-questions?view=x").status_code == 422
    assert client.get("/seller/unanswered-questions?limit=101").status_code == 422
    assert client.get("/seller/unanswered-questions?offset=-1").status_code == 422


def test_unanswered_list_unavailable_is_503(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "list_seller_unanswered_questions",
        lambda *args, **kwargs: {"durum": "hata", "kind": "unavailable"},
    )
    assert client.get("/seller/unanswered-questions").status_code == 503


def test_unanswered_detail_success(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_seller_unanswered_question_detail",
        lambda seller_id, group_id: {
            "durum": "başarılı",
            "group": group_record(),
            "occurrences": [
                {
                    "id": 1,
                    "customer_id": 22,
                    "message_id": 101,
                    "question_text": "Bulaşık makinesinde yıkanır mı?",
                    "category": "unclear",
                    "occurred_at": "now",
                }
            ],
        },
    )
    response = client.get("/seller/unanswered-questions/41")
    assert response.status_code == 200
    assert response.json()["question"]["id"] == 41
    assert response.json()["occurrences"][0]["message_id"] == 101


def test_unanswered_detail_cross_tenant_is_404(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_seller_unanswered_question_detail",
        lambda *args: {"durum": "hata", "kind": "not_found"},
    )
    assert client.get("/seller/unanswered-questions/999").status_code == 404


def test_set_answer_uses_auth_profile_and_no_client_identity(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_set(
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
        return {
            "durum": "başarılı",
            "changed": True,
            "group": group_record(status="ANSWERED", version=4),
        }

    monkeypatch.setattr(protected_routes, "set_seller_answer", fake_set)
    response = client.post(
        "/seller/unanswered-questions/41/actions",
        json={
            "action": "set_answer",
            "expected_version": 3,
            "answer": "Evet, uygundur.",
        },
    )
    assert response.status_code == 200
    assert captured["seller_id"] == 11
    assert captured["actor_profile_id"] == 7
    assert response.json()["action"] == "set_answer"


def test_dismiss_success(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_dismiss(
        seller_id: int,
        group_id: int,
        actor_profile_id: int,
        expected_version: int,
        *,
        note: str | None,
    ) -> dict[str, Any]:
        captured.update(
            seller_id=seller_id,
            group_id=group_id,
            actor_profile_id=actor_profile_id,
            expected_version=expected_version,
            note=note,
        )
        return {
            "durum": "başarılı",
            "changed": True,
            "group": group_record(status="DISMISSED", version=4),
        }

    monkeypatch.setattr(
        protected_routes,
        "dismiss_seller_unanswered_question",
        fake_dismiss,
    )
    response = client.post(
        "/seller/unanswered-questions/41/actions",
        json={"action": "dismiss", "expected_version": 3, "note": "İlgili değil."},
    )
    assert response.status_code == 200
    assert captured["note"] == "İlgili değil."


@pytest.mark.parametrize("bad", [True, "3", 0, -1, 3.0])
def test_unanswered_action_expected_version_is_strict(
    client: TestClient,
    bad: Any,
) -> None:
    response = client.post(
        "/seller/unanswered-questions/41/actions",
        json={"action": "dismiss", "expected_version": bad},
    )
    assert response.status_code == 422


def test_unanswered_action_rejects_extra_identity(client: TestClient) -> None:
    response = client.post(
        "/seller/unanswered-questions/41/actions",
        json={
            "action": "dismiss",
            "expected_version": 3,
            "seller_id": 999,
            "actor_profile_id": 999,
        },
    )
    assert response.status_code == 422


def test_action_specific_payloads_are_strict(client: TestClient) -> None:
    missing_answer = client.post(
        "/seller/unanswered-questions/41/actions",
        json={"action": "set_answer", "expected_version": 3},
    )
    assert missing_answer.status_code == 422

    answer_on_dismiss = client.post(
        "/seller/unanswered-questions/41/actions",
        json={"action": "dismiss", "expected_version": 3, "answer": "x"},
    )
    assert answer_on_dismiss.status_code == 422

    note_on_answer = client.post(
        "/seller/unanswered-questions/41/actions",
        json={
            "action": "set_answer",
            "expected_version": 3,
            "answer": "x",
            "note": "y",
        },
    )
    assert note_on_answer.status_code == 422


def test_stale_action_is_409(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "set_seller_answer",
        lambda *args, **kwargs: {"durum": "hata", "kind": "conflict"},
    )
    response = client.post(
        "/seller/unanswered-questions/41/actions",
        json={"action": "set_answer", "expected_version": 3, "answer": "Cevap"},
    )
    assert response.status_code == 409
