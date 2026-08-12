from __future__ import annotations

import seller_panel_service


def test_list_conversations_preserves_pagination(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_list",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 3,
            "conversations": [{"customer": {"id": 1}}],
        },
    )

    result = seller_panel_service.list_conversations(
        42,
        attention_only=True,
        limit=10,
        offset=20,
    )

    assert result["ok"] is True
    assert result["toplam"] == 3
    assert result["attention_only"] is True
    assert result["control_state"] is None
    assert result["limit"] == 10
    assert result["offset"] == 20


def test_list_conversations_echoes_control_state_filter(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_list(*args, **kwargs):
        captured["kwargs"] = kwargs
        return {
            "durum": "başarılı",
            "toplam": 1,
            "conversations": [{"customer": {"id": 7}}],
        }

    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_list",
        fake_list,
    )

    result = seller_panel_service.list_conversations(
        42,
        control_state="ASSISTANT_PAUSED",
        limit=20,
        offset=0,
    )

    assert result["ok"] is True
    assert result["toplam"] == 1
    assert result["control_state"] == "ASSISTANT_PAUSED"
    assert result["attention_only"] is False
    assert captured["kwargs"]["control_state"] == "ASSISTANT_PAUSED"
    assert captured["kwargs"]["attention_only"] is False


def test_detail_not_found_maps_to_safe_contract(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_detail_read_model",
        lambda *args, **kwargs: {"durum": "bulunamadı"},
    )

    result = seller_panel_service.get_conversation_detail(42, 999)

    assert result["ok"] is False
    assert result["kind"] == "not_found"
    assert result["error"]["code"] == "seller_conversation_not_found"
    assert "tenant" not in result["error"]["message"].lower()


def test_dashboard_unavailable_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_dashboard_task_list",
        lambda *args, **kwargs: {"durum": "hata"},
    )

    result = seller_panel_service.list_dashboard_tasks(42)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"
    assert result["error"]["code"] == "seller_dashboard_tasks_unavailable"
