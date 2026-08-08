from __future__ import annotations

from types import SimpleNamespace

import auth_service


class FakeAuthAdmin:
    def __init__(self, *, invite_response=None, invite_error=None, delete_error=None):
        self.invite_response = invite_response
        self.invite_error = invite_error
        self.delete_error = delete_error
        self.invite_calls: list[tuple[str, dict]] = []
        self.delete_calls: list[str] = []

    def invite_user_by_email(self, email: str, options: dict):
        self.invite_calls.append((email, options))
        if self.invite_error is not None:
            raise self.invite_error
        return self.invite_response

    def delete_user(self, auth_user_id: str):
        self.delete_calls.append(auth_user_id)
        if self.delete_error is not None:
            raise self.delete_error
        return None


class FakeSupabase:
    def __init__(self, admin: FakeAuthAdmin):
        self.auth = SimpleNamespace(admin=admin)


def test_create_seller_invite_auth_user_normalizes_and_scopes_metadata(monkeypatch) -> None:
    admin = FakeAuthAdmin(
        invite_response={
            "user": {"id": "11111111-1111-1111-1111-111111111111"}
        }
    )
    monkeypatch.setattr(auth_service, "get_supabase", lambda: FakeSupabase(admin))

    result = auth_service.create_seller_invite_auth_user(
        " SELLER@EXAMPLE.COM ",
        " Ayşe Kaya ",
        application_id=17,
        redirect_to="https://panel.example.com/auth/callback",
    )

    assert result == {
        "durum": "başarılı",
        "auth_user_id": "11111111-1111-1111-1111-111111111111",
    }
    assert admin.invite_calls == [
        (
            "seller@example.com",
            {
                "data": {
                    "full_name": "Ayşe Kaya",
                    "app_role": "seller",
                    "application_id": 17,
                },
                "redirect_to": "https://panel.example.com/auth/callback",
            },
        )
    ]


def test_create_seller_invite_auth_user_maps_existing_auth_user(monkeypatch) -> None:
    admin = FakeAuthAdmin(invite_error=RuntimeError("User already exists"))
    monkeypatch.setattr(auth_service, "get_supabase", lambda: FakeSupabase(admin))

    result = auth_service.create_seller_invite_auth_user(
        "seller@example.com",
        "Ayşe Kaya",
        application_id=17,
    )

    assert result["durum"] == "çakışma"
    assert "Auth kullanıcısı" in result["mesaj"]


def test_create_seller_invite_auth_user_requires_valid_application_id_without_sdk(monkeypatch) -> None:
    called = False

    def fail_if_called():
        nonlocal called
        called = True
        raise AssertionError("SDK çağrılmamalı")

    monkeypatch.setattr(auth_service, "get_supabase", fail_if_called)

    result = auth_service.create_seller_invite_auth_user(
        "seller@example.com",
        "Ayşe Kaya",
        application_id=0,
    )

    assert result["durum"] == "doğrulama_hatası"
    assert called is False


def test_delete_invited_auth_user(monkeypatch) -> None:
    admin = FakeAuthAdmin()
    monkeypatch.setattr(auth_service, "get_supabase", lambda: FakeSupabase(admin))

    result = auth_service.delete_invited_auth_user(
        "22222222-2222-2222-2222-222222222222"
    )

    assert result["durum"] == "başarılı"
    assert admin.delete_calls == ["22222222-2222-2222-2222-222222222222"]


def test_delete_invited_auth_user_failure_is_fail_closed(monkeypatch) -> None:
    admin = FakeAuthAdmin(delete_error=RuntimeError("network"))
    monkeypatch.setattr(auth_service, "get_supabase", lambda: FakeSupabase(admin))

    result = auth_service.delete_invited_auth_user(
        "33333333-3333-3333-3333-333333333333"
    )

    assert result["durum"] == "hata"
    assert "temizlenemedi" in result["mesaj"]
