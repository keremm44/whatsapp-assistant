from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database


@dataclass
class FakeResponse:
    data: Any


class FakeRpcCall:
    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> FakeResponse:
        return FakeResponse(self._data)


class FakeSupabase:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, payload: dict[str, Any]) -> FakeRpcCall:
        self.calls.append((name, payload))
        return FakeRpcCall(self.data)


def test_conversation_list_rpc_is_tenant_scoped(monkeypatch) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "total": 1,
            "conversations": [{"customer": {"id": 22}}],
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_conversation_list(
        42,
        attention_only=True,
        limit=15,
        offset=5,
    )

    assert result["durum"] == "başarılı"
    assert result["toplam"] == 1
    assert fake.calls == [
        (
            "get_seller_conversation_list",
            {
                "target_seller_id": 42,
                "result_limit": 15,
                "result_offset": 5,
                "attention_only": True,
            },
        )
    ]
    assert "target_control_state" not in fake.calls[0][1]


def test_conversation_list_rpc_passes_control_state_filter(monkeypatch) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "total": 1,
            "control_state": "ASSISTANT_PAUSED",
            "conversations": [{"customer": {"id": 22}}],
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_conversation_list(
        42,
        control_state="ASSISTANT_PAUSED",
        limit=20,
        offset=0,
    )

    assert result["durum"] == "başarılı"
    assert result["toplam"] == 1
    assert fake.calls == [
        (
            "get_seller_conversation_list",
            {
                "target_seller_id": 42,
                "result_limit": 20,
                "result_offset": 0,
                "attention_only": False,
                "target_control_state": "ASSISTANT_PAUSED",
            },
        )
    ]


def test_conversation_list_rejects_invalid_control_state_without_rpc(
    monkeypatch,
) -> None:
    fake = FakeSupabase({})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_conversation_list(42, control_state="MUTED")

    assert result["durum"] == "doğrulama_hatası"
    assert fake.calls == []


def test_conversation_list_rejects_invalid_limit_without_rpc(monkeypatch) -> None:
    fake = FakeSupabase({})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_conversation_list(42, limit=101)

    assert result["durum"] == "doğrulama_hatası"
    assert fake.calls == []


def test_conversation_detail_rpc_keeps_customer_and_seller_scope(monkeypatch) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "customer": {"id": 22},
            "conversation_state": None,
            "control": None,
            "messages": [],
            "message_page": {"limit": 25, "has_more": False},
            "control_history": [],
            "active_order": None,
            "active_return_issue": None,
            "open_unanswered": [],
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_conversation_detail_read_model(
        42,
        22,
        message_limit=25,
        before_message_id=500,
        control_history_limit=7,
    )

    assert result["durum"] == "başarılı"
    assert result["customer"]["id"] == 22
    assert fake.calls == [
        (
            "get_seller_conversation_detail",
            {
                "target_seller_id": 42,
                "target_customer_id": 22,
                "message_limit": 25,
                "before_message_id": 500,
                "control_history_limit": 7,
            },
        )
    ]


def test_conversation_detail_maps_not_found_without_tenant_leak(monkeypatch) -> None:
    fake = FakeSupabase({"status": "not_found"})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_conversation_detail_read_model(42, 999)

    assert result == {"durum": "bulunamadı", "mesaj": "Konuşma bulunamadı."}


def test_dashboard_tasks_rpc_payload(monkeypatch) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "total": 2,
            "tasks": [
                {"id": "return_review:1", "type": "return_review"},
                {"id": "unanswered_question:2", "type": "unanswered_question"},
            ],
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_dashboard_task_list(
        42,
        task_type="return_review",
        limit=30,
        offset=3,
    )

    assert result["durum"] == "başarılı"
    assert result["toplam"] == 2
    assert fake.calls == [
        (
            "get_seller_dashboard_tasks",
            {
                "target_seller_id": 42,
                "task_type_value": "return_review",
                "result_limit": 30,
                "result_offset": 3,
            },
        )
    ]


def test_dashboard_tasks_rejects_unknown_type_without_rpc(monkeypatch) -> None:
    fake = FakeSupabase({})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_dashboard_task_list(42, task_type="metrics")

    assert result["durum"] == "doğrulama_hatası"
    assert fake.calls == []


def test_read_rpc_malformed_payload_fails_closed(monkeypatch) -> None:
    fake = FakeSupabase([{"status": "success", "conversations": "wrong", "total": 1}])
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.get_seller_conversation_list(42)

    assert result["durum"] == "hata"
