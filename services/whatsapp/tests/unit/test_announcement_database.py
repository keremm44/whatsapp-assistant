from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database


@dataclass
class FakeResponse:
    data: Any


class FakeRpcCall:
    def __init__(self, data: Any = None, error: Exception | None = None) -> None:
        self.data = data
        self.error = error

    def execute(self) -> FakeResponse:
        if self.error:
            raise self.error
        return FakeResponse(self.data)


class FakeSupabase:
    def __init__(self, data: Any = None, error: Exception | None = None) -> None:
        self.data = data
        self.error = error
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> FakeRpcCall:
        self.calls.append((name, params))
        return FakeRpcCall(self.data, self.error)


def test_create_announcement_adapter_passes_atomic_rpc_contract(monkeypatch) -> None:
    fake = FakeSupabase(
        {"status": "success", "announcement": {"id": 7, "target_count": 2}}
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.create_announcement_record(
        3,
        title="Planlı bakım",
        message="Pazar günü bakım yapılacaktır.",
        importance="IMPORTANT",
        image_url="https://cdn.example.com/announcement.jpg",
        audience_type="SELECTED_SELLERS",
        seller_ids=[42, 51],
    )

    assert result == {
        "durum": "başarılı",
        "announcement": {"id": 7, "target_count": 2},
    }
    assert fake.calls == [
        (
            "create_announcement",
            {
                "creator_profile_id": 3,
                "title_value": "Planlı bakım",
                "message_value": "Pazar günü bakım yapılacaktır.",
                "importance_value": "IMPORTANT",
                "image_url_value": "https://cdn.example.com/announcement.jpg",
                "audience_type_value": "SELECTED_SELLERS",
                "seller_ids_value": [42, 51],
            },
        )
    ]


def test_seller_list_and_detail_are_tenant_scoped_in_rpc_params(monkeypatch) -> None:
    fake = FakeSupabase(
        {"status": "success", "total": 0, "announcements": []}
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    database.list_seller_announcement_records(42, limit=10, offset=20)
    fake.data = {"status": "not_found"}
    detail = database.get_seller_announcement_record(42, 99)

    assert fake.calls == [
        (
            "get_seller_announcements_list",
            {
                "target_seller_id": 42,
                "result_limit": 10,
                "result_offset": 20,
            },
        ),
        (
            "get_seller_announcement_detail",
            {"target_seller_id": 42, "target_announcement_id": 99},
        ),
    ]
    assert detail["durum"] == "bulunamadı"


def test_mark_read_adapter_preserves_idempotency_metadata(monkeypatch) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "announcement_id": 9,
            "is_read": True,
            "read_at": "2026-08-16T12:00:00+00:00",
            "changed": False,
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.mark_seller_announcement_read_record(42, 9)

    assert result["durum"] == "başarılı"
    assert result["changed"] is False
    assert fake.calls == [
        (
            "mark_seller_announcement_read",
            {"target_seller_id": 42, "target_announcement_id": 9},
        )
    ]


def test_announcement_adapter_never_leaks_database_exception(monkeypatch) -> None:
    fake = FakeSupabase(error=RuntimeError("secret database detail"))
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_admin_announcement_record(4)

    assert result["durum"] == "hata"
    assert "secret database detail" not in result["mesaj"]


def test_seller_unread_count_adapter_uses_authenticated_seller_scope(monkeypatch) -> None:
    fake = FakeSupabase({"status": "success", "unread_count": 4})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_announcement_unread_count_record(42)

    assert result == {"durum": "başarılı", "unread_count": 4}
    assert fake.calls == [
        (
            "get_seller_announcements_unread_count",
            {"target_seller_id": 42},
        )
    ]
