from __future__ import annotations

from types import SimpleNamespace

from database import notifications


class _Table:
    def __init__(self) -> None:
        self.inserted = None

    def insert(self, data):
        self.inserted = data
        return self

    def execute(self):
        return SimpleNamespace(data=[{"id": 1, **(self.inserted or {})}])


class _Supabase:
    def __init__(self) -> None:
        self.table_client = _Table()

    def table(self, name: str):
        assert name == "seller_notifications"
        return self.table_client


def test_order_review_alias_is_persisted_as_db_canonical_system(monkeypatch) -> None:
    client = _Supabase()
    monkeypatch.setattr(notifications, "get_supabase", lambda: client)

    result = notifications.create_seller_notification(
        seller_id=1,
        customer_id=2,
        notification_type="order_review",
        severity="warning",
        title="Onaylanmış kişiselleştirme değişikliği",
        message="Müşteri değişikliği onayladı.",
        related_entity_type="order",
        related_entity_id=7,
    )

    assert result["durum"] == "başarılı"
    assert client.table_client.inserted["type"] == "system"
    assert "order_review" not in notifications.VALID_NOTIFICATION_TYPES


def test_unknown_notification_type_still_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(
        notifications,
        "get_supabase",
        lambda: (_ for _ in ()).throw(AssertionError("DB must not be called")),
    )
    result = notifications.create_seller_notification(
        seller_id=1,
        notification_type="invented_type",
        title="x",
        message="x",
    )
    assert result["durum"] == "hata"
