from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import database


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "016_create_return_issue_requests.sql"
)


ISSUE_TYPES = {
    "RETURN_REQUEST",
    "DAMAGED_ITEM",
    "WRONG_ITEM",
    "PRINT_OR_PERSONALIZATION_ISSUE",
    "DELIVERY_ISSUE",
    "OTHER_ORDER_ISSUE",
}


def request_record(
    *,
    request_id: int = 41,
    status: str = database.RETURN_ISSUE_STATUS_COLLECTING,
    version: int = 1,
    order_id: int | None = None,
) -> dict[str, Any]:
    return {
        "id": request_id,
        "seller_id": 11,
        "customer_id": 22,
        "order_id": order_id,
        "issue_type": "DAMAGED_ITEM",
        "external_order_number_snapshot": "TR123",
        "product_name_snapshot": "Kupa" if order_id else None,
        "reason_text": "Ürün kırık geldi.",
        "image_requirement_snapshot": "REQUIRED",
        "status": status,
        "review_reason_code": None,
        "review_note": None,
        "created_from_message_id": 101,
        "last_source_message_id": 101,
        "version": version,
        "created_at": "2026-08-07T10:00:00+00:00",
        "updated_at": "2026-08-07T10:00:00+00:00",
        "review_required_at": None,
        "handled_at": None,
        "handled_by_profile_id": None,
        "seller_note": None,
    }


def rpc_success(**extra: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": "success",
        "request": request_record(),
    }
    payload.update(extra)
    return payload


class FakeQuery:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.filters: list[tuple[str, Any]] = []
        self.in_calls: list[tuple[str, list[Any]]] = []
        self.selected: str | None = None
        self.limit_value: int | None = None
        self.order_calls: list[tuple[str, bool]] = []
        self.range_call: tuple[int, int] | None = None

    def select(self, columns: str, **_kwargs: Any) -> "FakeQuery":
        self.selected = columns
        return self

    def eq(self, column: str, value: Any) -> "FakeQuery":
        self.filters.append((column, value))
        return self

    def in_(self, column: str, values: list[Any]) -> "FakeQuery":
        self.in_calls.append((column, values))
        return self

    def limit(self, value: int) -> "FakeQuery":
        self.limit_value = value
        return self

    def order(self, column: str, desc: bool = False) -> "FakeQuery":
        self.order_calls.append((column, desc))
        return self

    def range(self, start: int, end: int) -> "FakeQuery":
        self.range_call = (start, end)
        return self

    def execute(self) -> SimpleNamespace:
        if isinstance(self.data, Exception):
            raise self.data
        return SimpleNamespace(data=self.data)


class FakeRpc:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> SimpleNamespace:
        if isinstance(self.data, Exception):
            raise self.data
        return SimpleNamespace(data=self.data)


class FakeSupabase:
    def __init__(
        self,
        *,
        table_data: dict[str, Any] | None = None,
        rpc_data: Any = None,
    ) -> None:
        self.table_data = table_data or {}
        self.rpc_data = rpc_data
        self.table_calls: list[str] = []
        self.queries: list[tuple[str, FakeQuery]] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> FakeQuery:
        self.table_calls.append(name)
        query = FakeQuery(self.table_data.get(name, []))
        self.queries.append((name, query))
        return query

    def rpc(self, name: str, payload: dict[str, Any]) -> FakeRpc:
        self.rpc_calls.append((name, payload))
        if isinstance(self.rpc_data, dict) and name in self.rpc_data:
            return FakeRpc(self.rpc_data[name])
        return FakeRpc(self.rpc_data)


def install_fake(
    monkeypatch: pytest.MonkeyPatch,
    fake: FakeSupabase,
) -> FakeSupabase:
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    return fake


# =====================================================
# MIGRATION 016
# =====================================================


def test_migration_016_creates_return_issue_tables() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    for table in [
        "public.return_issue_requests",
        "public.return_issue_request_evidence",
        "public.return_issue_type_settings",
    ]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in content


def test_migration_016_has_canonical_issue_types_only() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    for issue_type in ISSUE_TYPES:
        assert f"'{issue_type}'" in content

    for forbidden_status in ["APPROVED", "REJECTED", "REFUNDED", "REPLACED"]:
        assert f"'{forbidden_status}'" not in content


def test_migration_016_has_only_canonical_lifecycle_statuses() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "'COLLECTING'" in content
    assert "'SELLER_REVIEW_REQUIRED'" in content
    assert "'HANDLED'" in content
    assert "return_issue_requests_lifecycle_check" in content


def test_migration_016_has_one_open_request_partial_unique_index() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "uq_return_issue_requests_one_open_per_customer" in content
    assert "ON public.return_issue_requests(seller_id, customer_id)" in content
    assert "WHERE status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')" in content


def test_migration_016_evidence_stores_message_reference_not_public_url() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    table_block = content.split(
        "CREATE TABLE IF NOT EXISTS public.return_issue_request_evidence",
        1,
    )[1].split("CREATE INDEX IF NOT EXISTS idx_return_issue_request_evidence_request", 1)[0]

    assert "message_id BIGINT NOT NULL" in table_block
    assert "media_url" not in table_block
    assert "public_url" not in table_block
    assert "return_issue_request_evidence_request_message_unique" in table_block


def test_migration_016_snapshots_image_requirement_with_optional_default() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "image_requirement_snapshot VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL'" in content
    assert "image_requirement_value TEXT := 'OPTIONAL'" in content
    assert "COALESCE(image_requirement_value, 'OPTIONAL')" in content


def test_migration_016_has_required_atomic_rpcs() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    for rpc in [
        "create_or_get_return_issue_request",
        "update_return_issue_request_from_message",
        "add_return_issue_request_evidence",
        "mark_return_issue_review_required",
        "mark_return_issue_handled",
        "update_return_issue_type_setting",
    ]:
        assert f"CREATE OR REPLACE FUNCTION public.{rpc}" in content
        assert f"GRANT EXECUTE ON FUNCTION public.{rpc}" in content


def test_migration_016_validates_evidence_message_scope_and_type() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    block = content.split(
        "CREATE OR REPLACE FUNCTION public.add_return_issue_request_evidence",
        1,
    )[1].split(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_notifications_return_issue_review",
        1,
    )[0]

    assert "seller_id = target_seller_id" in block
    assert "customer_id = target_customer_id" in block
    assert "direction = 'incoming'" in block
    assert "message_type = 'image'" in block


def test_migration_016_review_notification_is_idempotent() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "uq_seller_notifications_return_issue_review" in content
    assert "related_entity_type = 'return_issue_request'" in content
    assert "ON CONFLICT DO NOTHING" in content


def test_migration_016_mark_handled_does_not_touch_conversation_control() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    block = content.split(
        "CREATE OR REPLACE FUNCTION public.mark_return_issue_handled",
        1,
    )[1].split(
        "CREATE OR REPLACE FUNCTION public.update_return_issue_type_setting",
        1,
    )[0]

    assert "conversation_states" not in block
    assert "conversation_control" not in block
    assert "status = 'HANDLED'" in block


def test_migration_016_backend_only_tables_and_migration_record() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    for table in [
        "return_issue_requests",
        "return_issue_request_evidence",
        "return_issue_type_settings",
    ]:
        assert f"ALTER TABLE public.{table}\n    ENABLE ROW LEVEL SECURITY" in content
        assert f"REVOKE ALL PRIVILEGES ON TABLE public.{table}" in content
        assert f"GRANT ALL PRIVILEGES ON TABLE public.{table}" in content

    assert "'016'" in content
    assert "'create_return_issue_requests'" in content


# =====================================================
# RPC WRAPPERS
# =====================================================


def test_create_or_get_return_issue_request_rpc_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data=rpc_success(changed=True, created=True, idempotent=False)
        ),
    )

    result = database.create_or_get_return_issue_request(
        11,
        22,
        101,
        "DAMAGED_ITEM",
        initial_reason_text="  Ürün kırık geldi.  ",
        order_id=7,
        external_order_number="  TR123  ",
    )

    assert result["durum"] == "başarılı"
    assert result["created"] is True
    assert fake.rpc_calls == [
        (
            "create_or_get_return_issue_request",
            {
                "target_seller_id": 11,
                "target_customer_id": 22,
                "source_message_id": 101,
                "target_issue_type": "DAMAGED_ITEM",
                "initial_reason_text": "Ürün kırık geldi.",
                "target_order_id": 7,
                "external_order_number_text": "TR123",
            },
        )
    ]


def test_create_or_get_return_issue_request_rejects_invalid_input_without_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    assert database.create_or_get_return_issue_request(
        True,
        22,
        101,
        "DAMAGED_ITEM",
    )["durum"] == "doğrulama_hatası"
    assert database.create_or_get_return_issue_request(
        11,
        22,
        101,
        "NOT_A_TYPE",
    )["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


def test_update_return_issue_request_from_message_rpc_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(rpc_data=rpc_success(changed=True, idempotent=False)),
    )

    result = database.update_return_issue_request_from_message(
        11,
        22,
        41,
        102,
        external_order_number=" TR999 ",
        reason_text=" Hasarlı geldi ",
        order_id=7,
        expected_version=3,
    )

    assert result["durum"] == "başarılı"
    assert fake.rpc_calls[0] == (
        "update_return_issue_request_from_message",
        {
            "target_seller_id": 11,
            "target_customer_id": 22,
            "target_request_id": 41,
            "source_message_id": 102,
            "new_external_order_number": "TR999",
            "new_reason_text": "Hasarlı geldi",
            "target_order_id": 7,
            "expected_version": 3,
        },
    )


def test_update_return_issue_request_from_message_requires_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    result = database.update_return_issue_request_from_message(11, 22, 41, 102)

    assert result["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


def test_add_return_issue_request_evidence_rpc_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data=rpc_success(
                changed=True,
                idempotent=False,
                evidence={"id": 8, "request_id": 41, "message_id": 103},
            )
        ),
    )

    result = database.add_return_issue_request_evidence(
        11,
        22,
        41,
        103,
        expected_version=4,
    )

    assert result["durum"] == "başarılı"
    assert result["evidence"]["message_id"] == 103
    assert fake.rpc_calls[0][0] == "add_return_issue_request_evidence"
    assert fake.rpc_calls[0][1]["expected_version"] == 4


def test_mark_return_issue_review_required_requires_code_for_force(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    result = database.mark_return_issue_review_required(
        11,
        22,
        41,
        force_review=True,
    )

    assert result["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


def test_mark_return_issue_review_required_rpc_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data=rpc_success(
                changed=True,
                idempotent=False,
                notification_created=True,
            )
        ),
    )

    result = database.mark_return_issue_review_required(
        11,
        22,
        41,
        force_review=True,
        review_reason_code="urgent_safety",
        review_note="  Seller incelemeli. ",
        expected_version=5,
    )

    assert result["durum"] == "başarılı"
    assert result["notification_created"] is True
    assert fake.rpc_calls[0] == (
        "mark_return_issue_review_required",
        {
            "target_seller_id": 11,
            "target_customer_id": 22,
            "target_request_id": 41,
            "force_review": True,
            "review_code": "urgent_safety",
            "review_note_text": "Seller incelemeli.",
            "expected_version": 5,
        },
    )


def test_mark_return_issue_handled_requires_strict_positive_version_and_actor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    assert database.mark_return_issue_handled(
        11, 41, 77, True
    )["durum"] == "doğrulama_hatası"
    assert database.mark_return_issue_handled(
        11, 41, False, 3
    )["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


def test_mark_return_issue_handled_rpc_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(rpc_data=rpc_success(changed=True, idempotent=False)),
    )

    result = database.mark_return_issue_handled(
        11,
        41,
        77,
        3,
        seller_note=" Müşteriyle görüşüldü. ",
    )

    assert result["durum"] == "başarılı"
    assert fake.rpc_calls[0] == (
        "mark_return_issue_handled",
        {
            "target_seller_id": 11,
            "target_request_id": 41,
            "actor_profile_id": 77,
            "expected_version": 3,
            "seller_note_text": "Müşteriyle görüşüldü.",
        },
    )


def test_update_return_issue_type_setting_rpc_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "status": "success",
                "changed": True,
                "setting": {
                    "seller_id": 11,
                    "issue_type": "DAMAGED_ITEM",
                    "image_requirement": "REQUIRED",
                    "version": 2,
                },
            }
        ),
    )

    result = database.update_return_issue_type_setting(
        11,
        "DAMAGED_ITEM",
        "REQUIRED",
        1,
    )

    assert result["durum"] == "başarılı"
    assert result["setting"]["version"] == 2
    assert fake.rpc_calls[0][0] == "update_return_issue_type_setting"


def test_return_issue_rpc_response_normalizes_conflict_not_ready_and_forbidden() -> None:
    conflict = database._return_issue_rpc_response(
        {
            "status": "conflict",
            "message": "stale",
            "current_version": 4,
            "request": request_record(version=4),
        }
    )
    not_ready = database._return_issue_rpc_response(
        {"status": "not_ready", "message": "missing", "request": request_record()}
    )
    forbidden = database._return_issue_rpc_response({"status": "forbidden"})

    assert conflict["durum"] == "çakışma"
    assert conflict["current_version"] == 4
    assert not_ready["durum"] == "hazır_değil"
    assert forbidden["durum"] == "reddedildi"


def test_return_issue_rpc_exception_is_safely_normalized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(monkeypatch, FakeSupabase(rpc_data=RuntimeError("secret db error")))

    result = database.create_or_get_return_issue_request(
        11,
        22,
        101,
        "DAMAGED_ITEM",
    )

    assert result == {
        "durum": "hata",
        "mesaj": "İade/sorun talebi oluşturulamadı.",
    }


# =====================================================
# TENANT-SCOPED READ WRAPPERS
# =====================================================


def test_get_active_return_issue_request_is_tenant_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data={"return_issue_requests": [request_record()]}),
    )

    result = database.get_active_return_issue_request(11, 22)

    assert result["durum"] == "başarılı"
    assert result["request"]["id"] == 41
    _, query = fake.queries[0]
    assert ("seller_id", 11) in query.filters
    assert ("customer_id", 22) in query.filters
    assert query.in_calls == [
        (
            "status",
            [
                database.RETURN_ISSUE_STATUS_COLLECTING,
                database.RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
            ],
        )
    ]


def test_get_return_issue_request_by_id_uses_tenant_negative_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data={"return_issue_requests": []}),
    )

    result = database.get_return_issue_request_by_id(11, 999)

    assert result["durum"] == "bulunamadı"
    _, query = fake.queries[0]
    assert ("id", 999) in query.filters
    assert ("seller_id", 11) in query.filters


def test_list_return_issue_requests_action_required_and_pagination(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data={"return_issue_requests": []}),
    )

    result = database.list_return_issue_requests(
        11,
        view="action_required",
        customer_id=22,
        issue_type="DAMAGED_ITEM",
        limit=20,
        offset=40,
    )

    assert result == {"durum": "başarılı", "toplam": 0, "requests": []}
    _, query = fake.queries[0]
    assert ("seller_id", 11) in query.filters
    assert (
        "status",
        database.RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
    ) in query.filters
    assert ("customer_id", 22) in query.filters
    assert ("issue_type", "DAMAGED_ITEM") in query.filters
    assert query.range_call == (40, 59)


def test_list_return_issue_requests_validates_limit_view_and_bool_offset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    assert database.list_return_issue_requests(11, view="bad")["durum"] == "doğrulama_hatası"
    assert database.list_return_issue_requests(11, limit=101)["durum"] == "doğrulama_hatası"
    assert database.list_return_issue_requests(11, offset=True)["durum"] == "doğrulama_hatası"
    assert fake.table_calls == []


def test_get_return_issue_type_settings_is_tenant_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            table_data={
                "return_issue_type_settings": [
                    {
                        "seller_id": 11,
                        "issue_type": "DAMAGED_ITEM",
                        "image_requirement": "REQUIRED",
                        "version": 2,
                    }
                ]
            }
        ),
    )

    result = database.get_return_issue_type_settings(11)

    assert result["durum"] == "başarılı"
    assert result["settings"][0]["image_requirement"] == "REQUIRED"
    _, query = fake.queries[0]
    assert ("seller_id", 11) in query.filters


def test_get_return_issue_request_detail_returns_only_safe_evidence_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = request_record(order_id=7)
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            table_data={
                "return_issue_requests": [request],
                "return_issue_request_evidence": [
                    {
                        "id": 8,
                        "seller_id": 11,
                        "request_id": 41,
                        "message_id": 103,
                        "created_at": "2026-08-07T10:01:00+00:00",
                    }
                ],
                "customers": [
                    {
                        "id": 22,
                        "seller_id": 11,
                        "whatsapp_number": "+90555",
                        "name": "Müşteri",
                    }
                ],
                "orders": [
                    {
                        "id": 7,
                        "seller_id": 11,
                        "customer_id": 22,
                        "external_order_number": "TR123",
                        "product_name_snapshot": "Kupa",
                        "status": "COMPLETE",
                        "version": 5,
                    }
                ],
            }
        ),
    )

    result = database.get_return_issue_request_detail(11, 41)

    assert result["durum"] == "başarılı"
    assert result["evidence"] == [
        {
            "id": 8,
            "seller_id": 11,
            "request_id": 41,
            "message_id": 103,
            "created_at": "2026-08-07T10:01:00+00:00",
        }
    ]
    assert "media_url" not in result["evidence"][0]
    evidence_query = next(
        query for name, query in fake.queries if name == "return_issue_request_evidence"
    )
    assert evidence_query.selected == "id,seller_id,request_id,message_id,created_at"
