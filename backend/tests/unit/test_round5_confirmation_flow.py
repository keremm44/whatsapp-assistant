from __future__ import annotations

from chat_service import order_change_confirmation as changes


def test_explicit_custom_text_revision_is_parsed_without_guessing() -> None:
    assert changes.parse_custom_text_revision("Elif değil Ayşe olsun") == {
        "old_text": "Elif",
        "new_text": "Ayşe",
    }
    assert changes.parse_custom_text_revision("Elif yerine Ayşe yazılsın") == {
        "old_text": "Elif",
        "new_text": "Ayşe",
    }
    assert changes.parse_custom_text_revision("Ayşe olsun") is None
    assert changes.parse_custom_text_revision("değiştir") is None


def test_confirmation_words_are_deterministic() -> None:
    assert changes.confirmation_decision("onaylıyorum") == "yes"
    assert changes.confirmation_decision("EVET") == "yes"
    assert changes.confirmation_decision("iptal") == "no"
    assert changes.confirmation_decision("bir dakika") is None


def test_change_proposal_requires_one_authoritative_order(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def _list(*args, **kwargs):
        calls.append(kwargs)
        return {
            "durum": "başarılı",
            "orders": [
                {"id": 7, "version": 3, "status": "COMPLETE", "custom_text": "Elif", "external_order_number": "45892"},
                {"id": 8, "version": 2, "status": "COMPLETE", "custom_text": "Elif", "external_order_number": "45901"},
            ],
        }

    monkeypatch.setattr(changes, "list_seller_orders", _list)

    ambiguous = changes.build_custom_text_change_proposal(
        seller_id=1,
        customer_id=2,
        message="Elif değil Ayşe olsun",
    )
    assert ambiguous["status"] == "ambiguous_order"
    assert ambiguous["candidate_count"] == 2
    assert calls[-1]["limit"] == 100
    assert "external_order_number" not in calls[-1]

    resolved = changes.build_custom_text_change_proposal(
        seller_id=1,
        customer_id=2,
        message="sipariş 45892 Elif değil Ayşe olsun",
    )
    assert resolved["status"] == "proposal"
    assert resolved["order_id"] == 7
    assert resolved["order_version"] == 3
    assert resolved["old_text"] == "Elif"
    assert resolved["new_text"] == "Ayşe"
    assert calls[-1]["external_order_number"] == "45892"
    assert calls[-1]["limit"] == 2


def test_explicit_order_hint_is_resolved_by_server_filter_not_first_page(monkeypatch) -> None:
    def _list(*args, **kwargs):
        assert kwargs["external_order_number"] == "OLD-45892"
        assert kwargs["limit"] == 2
        return {
            "durum": "başarılı",
            "orders": [
                {
                    "id": 111,
                    "version": 9,
                    "status": "COMPLETE",
                    "custom_text": "Elif",
                    "external_order_number": "OLD-45892",
                }
            ],
        }

    monkeypatch.setattr(changes, "list_seller_orders", _list)
    result = changes.build_custom_text_change_proposal(
        seller_id=1,
        customer_id=2,
        message="sipariş OLD-45892 Elif değil Ayşe olsun",
    )
    assert result["status"] == "proposal"
    assert result["order_id"] == 111


def test_unhinted_full_scan_fails_closed_instead_of_guessing(monkeypatch) -> None:
    rows = [
        {
            "id": index + 1,
            "version": 1,
            "status": "COMPLETE",
            "custom_text": "Elif" if index == 0 else f"Metin {index}",
            "external_order_number": f"ORD-{index + 1}",
        }
        for index in range(100)
    ]
    monkeypatch.setattr(
        changes,
        "list_seller_orders",
        lambda *args, **kwargs: {"durum": "başarılı", "orders": rows},
    )

    result = changes.build_custom_text_change_proposal(
        seller_id=1,
        customer_id=2,
        message="Elif değil Ayşe olsun",
    )
    assert result == {
        "status": "ambiguous_order",
        "candidate_count": 100,
        "scan_truncated": True,
    }


def test_change_proposal_rejects_old_value_mismatch(monkeypatch) -> None:
    monkeypatch.setattr(
        changes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "orders": [
                {"id": 7, "version": 3, "status": "COMPLETE", "custom_text": "Elif", "external_order_number": "45892"},
            ],
        },
    )
    result = changes.build_custom_text_change_proposal(
        seller_id=1,
        customer_id=2,
        message="Zeynep değil Ayşe olsun",
    )
    assert result["status"] == "old_value_mismatch"
