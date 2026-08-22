from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import database


class FakeRpcCall:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> SimpleNamespace:
        if isinstance(self.data, Exception):
            raise self.data
        return SimpleNamespace(data=self.data)


class FakeSupabase:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> FakeRpcCall:
        self.calls.append((name, params))
        return FakeRpcCall(self.data)


def test_create_feedback_uses_trusted_seller_rpc_scope(monkeypatch) -> None:
    fake = FakeSupabase({"status": "success", "feedback": {"id": 3}})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.create_seller_feedback_record(
        42,
        category="problem",
        subject="Konu",
        message="Mesaj",
    )

    assert result == {"durum": "başarılı", "feedback": {"id": 3}}
    assert fake.calls == [
        (
            "create_seller_feedback",
            {
                "target_seller_id": 42,
                "category_value": "problem",
                "subject_value": "Konu",
                "message_value": "Mesaj",
            },
        )
    ]


def test_seller_feedback_reads_are_tenant_scoped(monkeypatch) -> None:
    fake = FakeSupabase({"status": "success", "total": 0, "feedback": []})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    database.list_seller_feedback_records(42, limit=10, offset=5)
    database.get_seller_feedback_record(42, 99)

    assert fake.calls == [
        (
            "get_seller_feedback_list",
            {"target_seller_id": 42, "result_limit": 10, "result_offset": 5},
        ),
        (
            "get_seller_feedback_detail",
            {"target_seller_id": 42, "target_feedback_id": 99},
        ),
    ]


def test_admin_feedback_list_passes_all_filters(monkeypatch) -> None:
    fake = FakeSupabase({"status": "success", "total": 0, "feedback": []})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.list_admin_feedback_records(
        status="RESOLVED",
        category="suggestion",
        seller_id=42,
        limit=25,
        offset=50,
    )

    assert result["durum"] == "başarılı"
    assert fake.calls == [
        (
            "get_admin_feedback_list",
            {
                "status_filter": "RESOLVED",
                "category_filter": "suggestion",
                "seller_id_filter": 42,
                "result_limit": 25,
                "result_offset": 50,
            },
        )
    ]


def test_admin_feedback_update_sends_concurrency_and_field_presence(monkeypatch) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "changed": True,
            "feedback": {"id": 8, "version": 4},
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.update_admin_feedback_record(
        8,
        3,
        status="RESOLVED",
        admin_note=None,
        update_status=True,
        update_admin_note=False,
        admin_reply=None,
        update_admin_reply=False,
    )

    assert result["changed"] is True
    assert fake.calls == [
        (
            "update_admin_feedback",
            {
                "target_feedback_id": 8,
                "expected_version_value": 3,
                "update_status": True,
                "status_value": "RESOLVED",
                "update_admin_note": False,
                "admin_note_value": None,
                "update_admin_reply": False,
                "admin_reply_value": None,
            },
        )
    ]


def test_feedback_stale_version_and_backend_failure_are_safe(monkeypatch) -> None:
    stale = FakeSupabase(
        {"status": "conflict", "reason": "stale_version", "current_version": 4}
    )
    monkeypatch.setattr(database, "get_supabase", lambda: stale)
    result = database.update_admin_feedback_record(
        8,
        3,
        status="IN_REVIEW",
        admin_note=None,
        update_status=True,
        update_admin_note=False,
        admin_reply=None,
        update_admin_reply=False,
    )
    assert result["durum"] == "conflict"
    assert result["current_version"] == 4

    failed = FakeSupabase(RuntimeError("database credentials and internals"))
    monkeypatch.setattr(database, "get_supabase", lambda: failed)
    result = database.get_admin_feedback_record(8)
    assert result == {"durum": "hata", "mesaj": "Admin feedback detayı okunamadı."}
    assert "credentials" not in result["mesaj"]
