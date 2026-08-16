from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database
import seller_panel_service


@dataclass
class FakeResponse:
    data: Any


class FakeRpcCall:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> FakeResponse:
        return FakeResponse(self.data)


class FakeSupabase:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> FakeRpcCall:
        self.calls.append((name, params))
        return FakeRpcCall(self.data)


def test_paused_summary_exposes_has_active_order_in_one_tenant_scoped_rpc(
    monkeypatch,
) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "total": 2,
            "conversations": [
                {
                    "customer": {"id": 10},
                    "has_active_order": True,
                    "active_order": {"id": 81, "status": "COLLECTING"},
                },
                {
                    "customer": {"id": 11},
                    "has_active_order": False,
                    "active_order": None,
                },
            ],
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
    assert [item["has_active_order"] for item in result["conversations"]] == [
        True,
        False,
    ]
    assert len(fake.calls) == 1
    assert fake.calls[0] == (
        "get_seller_conversation_list",
        {
            "target_seller_id": 42,
            "result_limit": 20,
            "result_offset": 0,
            "attention_only": False,
            "target_control_state": "ASSISTANT_PAUSED",
        },
    )


def test_panel_service_preserves_order_semantic_and_pagination(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        captured.update(seller_id=seller_id, **kwargs)
        return {
            "durum": "başarılı",
            "toplam": 3,
            "conversations": [
                {"customer": {"id": 12}, "has_active_order": True},
                {"customer": {"id": 11}, "has_active_order": True},
                {"customer": {"id": 15}, "has_active_order": False},
            ],
        }

    monkeypatch.setattr(seller_panel_service, "get_seller_conversation_list", fake_list)

    result = seller_panel_service.list_conversations(
        42,
        control_state="ASSISTANT_PAUSED",
        limit=3,
        offset=6,
    )

    assert result["ok"] is True
    assert [row["has_active_order"] for row in result["conversations"]] == [
        True,
        True,
        False,
    ]
    assert result["limit"] == 3
    assert result["offset"] == 6
    assert captured["seller_id"] == 42
    assert captured["control_state"] == "ASSISTANT_PAUSED"
