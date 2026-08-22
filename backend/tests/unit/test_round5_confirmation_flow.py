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
    monkeypatch.setattr(
        changes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "orders": [
                {"id": 7, "version": 3, "status": "COMPLETE", "custom_text": "Elif", "external_order_number": "45892"},
                {"id": 8, "version": 2, "status": "COMPLETE", "custom_text": "Elif", "external_order_number": "45901"},
            ],
        },
    )
    ambiguous = changes.build_custom_text_change_proposal(
        seller_id=1,
        customer_id=2,
        message="Elif değil Ayşe olsun",
    )
    assert ambiguous["status"] == "ambiguous_order"
    assert ambiguous["candidate_count"] == 2

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
