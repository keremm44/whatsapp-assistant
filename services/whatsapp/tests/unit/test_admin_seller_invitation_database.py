from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import database


class FakeRPC:
    def __init__(self, data: Any):
        self.data = data

    def execute(self):
        return SimpleNamespace(data=self.data)


class FakeProfileQuery:
    def __init__(self, data: Any):
        self.data = data
        self.filters: list[tuple[str, Any]] = []
        self.limit_value: int | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field: str, value: Any):
        self.filters.append((field, value))
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    def execute(self):
        return SimpleNamespace(data=self.data)


class FakeSupabase:
    def __init__(self, *, rpc_data: Any = None, profile_data: Any = None):
        self.rpc_data = rpc_data
        self.profile_query = FakeProfileQuery(profile_data)
        self.rpc_name: str | None = None
        self.rpc_params: dict[str, Any] | None = None
        self.table_name: str | None = None

    def rpc(self, name: str, params: dict[str, Any]):
        self.rpc_name = name
        self.rpc_params = params
        return FakeRPC(self.rpc_data)

    def table(self, name: str):
        self.table_name = name
        return self.profile_query


def _success_payload(status: str = "success") -> dict[str, Any]:
    return {
        "status": status,
        "application": {
            "id": 7,
            "status": "approved",
            "approved_seller_id": 51,
        },
        "seller": {
            "id": 51,
            "system_status": "onboarding",
            "onboarding_status": "in_progress",
        },
        "profile": {
            "id": 8,
            "auth_user_id": "11111111-1111-1111-1111-111111111111",
            "seller_id": 51,
            "status": "invited",
        },
    }


def test_finalize_seller_invitation_rpc_success(monkeypatch) -> None:
    fake = FakeSupabase(rpc_data=_success_payload())
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.finalize_seller_invitation_from_application(
        application_id=7,
        auth_user_id="11111111-1111-1111-1111-111111111111",
        invite_email=" SELLER@EXAMPLE.COM ",
        admin_note=" Uygun bulundu ",
    )

    assert result["durum"] == "başarılı"
    assert result["seller"]["id"] == 51
    assert fake.rpc_name == "finalize_seller_invitation_from_application"
    assert fake.rpc_params == {
        "target_application_id": 7,
        "target_auth_user_id": "11111111-1111-1111-1111-111111111111",
        "invite_email": "seller@example.com",
        "admin_note_value": "Uygun bulundu",
    }


def test_finalize_seller_invitation_rpc_already_invited(monkeypatch) -> None:
    fake = FakeSupabase(rpc_data=_success_payload("already_invited"))
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.finalize_seller_invitation_from_application(
        application_id=7,
        auth_user_id="11111111-1111-1111-1111-111111111111",
        invite_email="seller@example.com",
    )

    assert result["durum"] == "zaten_davet_edildi"


def test_finalize_seller_invitation_rpc_maps_conflict(monkeypatch) -> None:
    fake = FakeSupabase(
        rpc_data={"status": "conflict", "message": "application conflict"}
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.finalize_seller_invitation_from_application(
        application_id=7,
        auth_user_id="11111111-1111-1111-1111-111111111111",
        invite_email="seller@example.com",
    )

    assert result == {"durum": "çakışma", "mesaj": "application conflict"}


def test_finalize_seller_invitation_rejects_invalid_uuid_without_db(monkeypatch) -> None:
    called = False

    def fail_if_called():
        nonlocal called
        called = True
        raise AssertionError("DB çağrılmamalı")

    monkeypatch.setattr(database, "get_supabase", fail_if_called)

    result = database.finalize_seller_invitation_from_application(
        application_id=7,
        auth_user_id="not-a-uuid",
        invite_email="seller@example.com",
    )

    assert result["durum"] == "doğrulama_hatası"
    assert called is False


def test_get_user_profile_by_seller_id_is_scoped(monkeypatch) -> None:
    fake = FakeSupabase(
        profile_data=[
            {
                "id": 8,
                "seller_id": 51,
                "role": "seller",
                "status": "invited",
            }
        ]
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_user_profile_by_seller_id(51)

    assert result["durum"] == "başarılı"
    assert fake.table_name == "user_profiles"
    assert fake.profile_query.filters == [
        ("seller_id", 51),
        ("role", "seller"),
    ]
    assert fake.profile_query.limit_value == 1
