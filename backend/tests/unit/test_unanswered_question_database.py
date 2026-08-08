from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import database


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "017_add_unanswered_question_lifecycle.sql"
)


def group_record(
    *,
    group_id: int = 41,
    status: str = database.UNANSWERED_STATUS_OPEN,
    version: int = 1,
    answer: str | None = None,
) -> dict[str, Any]:
    return {
        "id": group_id,
        "seller_id": 11,
        "canonical_question": "Bulaşık makinesinde yıkanır mı?",
        "normalized_question": "bulaşık makinesinde yıkanır mı",
        "status": status,
        "answer_text": answer,
        "occurrence_count": 3,
        "first_seen_at": "2026-08-07T10:00:00+00:00",
        "last_seen_at": "2026-08-07T12:00:00+00:00",
        "version": version,
        "answered_at": None,
        "answered_by_profile_id": None,
        "dismissed_at": None,
        "dismissed_by_profile_id": None,
        "dismiss_note": None,
        "created_at": "2026-08-07T10:00:00+00:00",
        "updated_at": "2026-08-07T12:00:00+00:00",
    }


class FakeQuery:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.filters: list[tuple[str, Any]] = []
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
        rpc_data: dict[str, Any] | Any = None,
    ) -> None:
        self.table_data = table_data or {}
        self.rpc_data = rpc_data
        self.queries: list[tuple[str, FakeQuery]] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> FakeQuery:
        query = FakeQuery(self.table_data.get(name, []))
        self.queries.append((name, query))
        return query

    def rpc(self, name: str, payload: dict[str, Any]) -> FakeRpc:
        self.rpc_calls.append((name, payload))
        if isinstance(self.rpc_data, dict) and name in self.rpc_data:
            return FakeRpc(self.rpc_data[name])
        return FakeRpc(self.rpc_data)


def install_fake(monkeypatch: pytest.MonkeyPatch, fake: FakeSupabase) -> FakeSupabase:
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    return fake


# =====================================================
# MIGRATION 017
# =====================================================


def test_migration_017_preserves_008_and_creates_new_domain_tables() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS public.unanswered_question_groups" in content
    assert "CREATE TABLE IF NOT EXISTS public.unanswered_question_occurrences" in content
    assert "DROP TABLE public.unanswered_questions" not in content
    assert "ALTER TABLE public.unanswered_questions" not in content


def test_migration_017_has_exact_group_uniqueness_and_three_statuses() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    assert "UNIQUE (seller_id, normalized_question)" in content
    for value in ["'OPEN'", "'ANSWERED'", "'DISMISSED'"]:
        assert value in content
    for value in ["APPROVED", "REJECTED", "REFUNDED"]:
        assert value not in content


def test_migration_017_occurrence_is_message_idempotent() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    assert "uq_unanswered_question_occurrences_message" in content
    assert "ON public.unanswered_question_occurrences(seller_id, message_id)" in content
    assert "direction = 'incoming'" in content


def test_migration_017_backfills_without_inventing_missing_occurrences() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    assert "SUM(GREATEST(uq.times_asked, 1))" in content
    assert "WHERE uq.source_message_id IS NOT NULL" in content
    assert "latest source_message_id" in content


def test_migration_017_notification_is_idempotent_per_group() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    assert "uq_seller_notifications_unanswered_group" in content
    assert "related_entity_type = 'unanswered_question_group'" in content
    assert "ON CONFLICT DO NOTHING" in content


def test_migration_017_answer_action_cannot_send_old_messages() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    block = content.split(
        "CREATE OR REPLACE FUNCTION public.set_unanswered_question_answer",
        1,
    )[1].split(
        "CREATE OR REPLACE FUNCTION public.dismiss_unanswered_question_group",
        1,
    )[0]
    assert "INSERT INTO public.messages" not in block
    assert "UPDATE public.messages" not in block
    assert "conversation" not in block.lower()


def test_migration_017_has_atomic_record_answer_and_dismiss_rpcs() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    for rpc in [
        "record_unanswered_question_occurrence",
        "set_unanswered_question_answer",
        "dismiss_unanswered_question_group",
    ]:
        assert f"CREATE OR REPLACE FUNCTION public.{rpc}" in content
        assert f"GRANT EXECUTE ON FUNCTION public.{rpc}" in content


def test_migration_017_is_backend_only_and_records_version() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    for table in ["unanswered_question_groups", "unanswered_question_occurrences"]:
        assert f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY" in content
        assert f"REVOKE ALL PRIVILEGES ON TABLE public.{table}" in content
    assert "'017'" in content
    assert "'add_unanswered_question_lifecycle'" in content


def test_migration_017_reconciles_only_legacy_unanswered_awaiting_seller_states() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    assert "legacy_unanswered_state_reconciliation" in content
    assert "cs.current_state = 'AWAITING_SELLER'" in content
    assert "cs.state_data ? 'question_id'" in content
    assert "uq.seller_id = cs.seller_id" in content
    assert "uq.customer_id IS NULL OR uq.customer_id = cs.customer_id" in content
    assert "current_state = 'NORMAL'" in content
    assert "state_type = 'no_lock'" in content
    assert "state_data = '{}'::jsonb" in content


def test_migration_017_saved_answer_lookup_is_db_authoritative() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    block = content.split(
        "CREATE OR REPLACE FUNCTION public.get_answered_unanswered_question",
        1,
    )[1].split(
        "CREATE OR REPLACE FUNCTION public.record_unanswered_question_occurrence",
        1,
    )[0]
    assert "question_text_value TEXT" in block
    assert "public._normalize_unanswered_question_text" in block
    assert "normalized_question = normalized_question_clean" in block
    assert "status = 'ANSWERED'" in block
    assert "GRANT EXECUTE ON FUNCTION public.get_answered_unanswered_question" in content


def test_migration_017_record_rpc_does_not_accept_client_normalized_identity() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    block = content.split(
        "CREATE OR REPLACE FUNCTION public.record_unanswered_question_occurrence",
        1,
    )[1].split(
        "CREATE OR REPLACE FUNCTION public.set_unanswered_question_answer",
        1,
    )[0]
    signature = block.split(")", 1)[0]
    assert "normalized_question_value" not in signature
    assert "public._normalize_unanswered_question_text(question_text_clean)" in block


# =====================================================
# WRAPPERS
# =====================================================


def test_record_occurrence_rpc_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "record_unanswered_question_occurrence": {
                    "status": "success",
                    "created": True,
                    "idempotent": False,
                    "notification_created": True,
                    "group": group_record(),
                }
            }
        ),
    )

    result = database.record_unanswered_question_occurrence(
        11,
        22,
        101,
        "  Soru?  ",
        category="unclear",
        suggested_field="product.care",
        metadata={"reason": "test"},
    )

    assert result["durum"] == "başarılı"
    assert result["created"] is True
    assert fake.rpc_calls == [
        (
            "record_unanswered_question_occurrence",
            {
                "target_seller_id": 11,
                "target_customer_id": 22,
                "source_message_id": 101,
                "question_text_value": "Soru?",
                "category_value": "unclear",
                "suggested_field_value": "product.care",
                "metadata_value": {"reason": "test"},
            },
        )
    ]


def test_record_occurrence_maps_answered_race(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "record_unanswered_question_occurrence": {
                    "status": "answered",
                    "group": group_record(
                        status=database.UNANSWERED_STATUS_ANSWERED,
                        answer="Evet.",
                    ),
                }
            }
        ),
    )
    result = database.record_unanswered_question_occurrence(
        11, 22, 101, "Soru?"
    )
    assert result["durum"] == "cevap_mevcut"
    assert result["group"]["answer_text"] == "Evet."


@pytest.mark.parametrize("bad", [0, -1, True, "1"])
def test_record_occurrence_rejects_invalid_ids(bad: Any) -> None:
    result = database.record_unanswered_question_occurrence(
        bad, 22, 101, "Soru?"
    )
    assert result["durum"] == "doğrulama_hatası"


def test_answer_lookup_delegates_raw_question_to_db_authoritative_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "get_answered_unanswered_question": {
                    "status": "success",
                    "group": group_record(
                        status=database.UNANSWERED_STATUS_ANSWERED,
                        answer="Evet.",
                    ),
                }
            }
        ),
    )
    result = database.get_answered_unanswered_question(
        11,
        "  Bulaşık makinesinde yıkanır mı?  ",
    )
    assert result["durum"] == "başarılı"
    assert result["group"]["answer_text"] == "Evet."
    assert fake.queries == []
    assert fake.rpc_calls == [
        (
            "get_answered_unanswered_question",
            {
                "target_seller_id": 11,
                "question_text_value": "Bulaşık makinesinde yıkanır mı?",
            },
        )
    ]


def test_group_detail_tenant_scopes_occurrences(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            table_data={
                "unanswered_question_groups": [group_record()],
                "unanswered_question_occurrences": [
                    {"id": 1, "seller_id": 11, "group_id": 41, "message_id": 101}
                ],
            }
        ),
    )
    result = database.get_unanswered_question_group_detail(11, 41)
    assert result["durum"] == "başarılı"
    occurrence_query = fake.queries[1][1]
    assert ("seller_id", 11) in occurrence_query.filters
    assert ("group_id", 41) in occurrence_query.filters


def test_list_groups_view_maps_open_and_paginates(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data={"unanswered_question_groups": [group_record()]}),
    )
    result = database.list_unanswered_question_groups(
        11, view="action_required", limit=20, offset=40
    )
    assert result["durum"] == "başarılı"
    query = fake.queries[0][1]
    assert ("seller_id", 11) in query.filters
    assert ("status", "OPEN") in query.filters
    assert query.range_call == (40, 59)


@pytest.mark.parametrize("view", ["x", "open", "resolved"])
def test_list_groups_rejects_invalid_view(view: str) -> None:
    result = database.list_unanswered_question_groups(11, view=view)
    assert result["durum"] == "doğrulama_hatası"


def test_set_answer_rpc_payload_and_conflict_mapping(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "set_unanswered_question_answer": {
                    "status": "conflict",
                    "current_version": 4,
                    "group": group_record(version=4),
                }
            }
        ),
    )
    result = database.set_unanswered_question_answer(11, 41, 7, 3, "  Cevap  ")
    assert result["durum"] == "çakışma"
    assert result["current_version"] == 4
    assert fake.rpc_calls[0][1]["answer_text_value"] == "Cevap"


@pytest.mark.parametrize("expected", [0, -1, True, "3", 3.0])
def test_set_answer_requires_strict_positive_version(expected: Any) -> None:
    result = database.set_unanswered_question_answer(11, 41, 7, expected, "Cevap")
    assert result["durum"] == "doğrulama_hatası"


def test_dismiss_rpc_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "dismiss_unanswered_question_group": {
                    "status": "success",
                    "changed": True,
                    "group": group_record(status=database.UNANSWERED_STATUS_DISMISSED),
                }
            }
        ),
    )
    result = database.dismiss_unanswered_question_group(
        11, 41, 7, 1, note="  İlgili değil.  "
    )
    assert result["durum"] == "başarılı"
    assert fake.rpc_calls[0][1]["dismiss_note_value"] == "İlgili değil."
