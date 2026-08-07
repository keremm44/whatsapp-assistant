from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import database


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "013_add_conversation_control_foundation.sql"
)


def control_record(
    state: str = database.CONTROL_STATE_ASSISTANT_ACTIVE,
    version: int = 1,
    cursor: int | None = None,
) -> dict[str, Any]:
    return {
        "control_state": state,
        "control_changed_at": "2026-08-06T12:00:00+00:00",
        "control_changed_by_profile_id": 7,
        "control_reason_code": "manual_takeover",
        "control_reason_note": "Satıcı devraldı.",
        "resume_after_message_id": cursor,
        "control_version": version,
    }


class FakeQuery:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.filters: list[tuple[str, Any]] = []
        self.selected: str | None = None
        self.limit_value: int | None = None
        self.order_call: tuple[str, bool] | None = None

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
        self.order_call = (column, desc)
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
        table_data: Any = None,
        rpc_data: Any = None,
    ) -> None:
        self.table_data = table_data
        self.rpc_data = rpc_data
        self.table_calls: list[str] = []
        self.queries: list[FakeQuery] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> FakeQuery:
        self.table_calls.append(name)
        query = FakeQuery(self.table_data)
        self.queries.append(query)
        return query

    def rpc(self, name: str, payload: dict[str, Any]) -> FakeRpc:
        self.rpc_calls.append((name, payload))
        return FakeRpc(self.rpc_data)


def install_fake(
    monkeypatch: pytest.MonkeyPatch,
    fake: FakeSupabase,
) -> FakeSupabase:
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    return fake


def rpc_success(
    *,
    state: str,
    version: int,
    changed: bool,
    cursor: int | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": "success",
        "changed": changed,
        "control": control_record(state, version, cursor),
    }
    if changed:
        payload["transition_id"] = 99
    return payload


def test_control_state_constants_are_canonical() -> None:
    assert database.VALID_CONTROL_STATES == {
        "ASSISTANT_ACTIVE",
        "SELLER_TAKEN_OVER",
        "RETURN_REVIEW",
        "ASSISTANT_PAUSED",
    }


def test_get_control_is_tenant_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data=[control_record()]),
    )

    result = database.get_conversation_control(11, 22)

    assert result["durum"] == "başarılı"
    assert result["control"]["state"] == "ASSISTANT_ACTIVE"
    assert fake.table_calls == ["conversation_states"]
    assert fake.queries[0].filters == [
        ("seller_id", 11),
        ("customer_id", 22),
    ]
    assert fake.queries[0].limit_value == 1


def test_get_control_returns_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.get_conversation_control(11, 22)

    assert result["durum"] == "bulunamadı"


def test_get_control_history_is_tenant_scoped_and_newest_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            table_data=[
                {
                    "id": 9,
                    "from_control_state": "ASSISTANT_PAUSED",
                    "to_control_state": "ASSISTANT_ACTIVE",
                    "reason_code": "manual_resume",
                    "reason_note": None,
                    "changed_by_profile_id": 7,
                    "trigger_message_id": 81,
                    "new_resume_after_message_id": 81,
                    "previous_version": 3,
                    "new_version": 4,
                    "created_at": "2026-08-06T12:00:00+00:00",
                }
            ]
        ),
    )

    result = database.get_conversation_control_history(11, 22, 20)

    assert result["durum"] == "başarılı"
    assert result["history"][0]["from_state"] == "ASSISTANT_PAUSED"
    assert result["history"][0]["resume_after_message_id"] == 81
    assert fake.table_calls == ["conversation_control_transitions"]
    assert fake.queries[0].filters == [("seller_id", 11), ("customer_id", 22)]
    assert fake.queries[0].order_call == ("created_at", True)
    assert fake.queries[0].limit_value == 20


def test_get_control_history_does_not_leak_backend_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "sql service secret"
    install_fake(monkeypatch, FakeSupabase(table_data=RuntimeError(secret)))

    result = database.get_conversation_control_history(11, 22)

    assert result["durum"] == "hata"
    assert secret not in result["mesaj"]


@pytest.mark.parametrize(
    ("record_patch", "expected_message"),
    [
        ({"control_state": "UNKNOWN"}, "geçersiz"),
        ({"control_version": 0}, "geçersiz"),
        ({"control_changed_at": None}, "geçersiz"),
        ({"control_changed_by_profile_id": 0}, "geçersiz"),
        ({"resume_after_message_id": False}, "geçersiz"),
        ({"control_reason_code": "Not Valid"}, "geçersiz"),
        ({"control_reason_note": "x" * 501}, "geçersiz"),
    ],
)
def test_get_control_rejects_malformed_records(
    monkeypatch: pytest.MonkeyPatch,
    record_patch: dict[str, Any],
    expected_message: str,
) -> None:
    record = control_record()
    record.update(record_patch)
    install_fake(monkeypatch, FakeSupabase(table_data=[record]))

    result = database.get_conversation_control(11, 22)

    assert result["durum"] == "hata"
    assert expected_message in result["mesaj"]


@pytest.mark.parametrize(
    ("seller_id", "customer_id"),
    [(0, 1), (1, 0), (-1, 1), (1, -1), (True, 1)],
)
def test_invalid_identity_does_not_access_database(
    monkeypatch: pytest.MonkeyPatch,
    seller_id: int,
    customer_id: int,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    result = database.get_conversation_control(seller_id, customer_id)

    assert result["durum"] == "doğrulama_hatası"
    assert fake.table_calls == []
    assert fake.rpc_calls == []


@pytest.mark.parametrize(
    "state",
    [
        database.CONTROL_STATE_ASSISTANT_ACTIVE,
        database.CONTROL_STATE_SELLER_TAKEN_OVER,
        database.CONTROL_STATE_RETURN_REVIEW,
        database.CONTROL_STATE_ASSISTANT_PAUSED,
    ],
)
def test_transition_accepts_every_canonical_state(
    monkeypatch: pytest.MonkeyPatch,
    state: str,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data=rpc_success(state=state, version=2, changed=True)
        ),
    )

    result = database.transition_conversation_control(
        seller_id=11,
        customer_id=22,
        to_control_state=state,
        reason_code="manual_takeover",
        reason_note="Satıcı işlemi",
        changed_by_profile_id=7,
        trigger_message_id=31,
        resume_after_message_id=30,
        expected_version=1,
    )

    assert result["durum"] == "başarılı"
    assert result["changed"] is True
    assert result["control"]["state"] == state
    assert fake.table_calls == []
    assert fake.rpc_calls == [
        (
            "transition_conversation_control",
            {
                "target_seller_id": 11,
                "target_customer_id": 22,
                "target_control_state": state,
                "transition_reason_code": "manual_takeover",
                "transition_reason_note": "Satıcı işlemi",
                "actor_profile_id": 7,
                "transition_trigger_message_id": 31,
                "target_resume_after_message_id": 30,
                "expected_control_version": 1,
            },
        )
    ]


def test_transition_rejects_unknown_state_without_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    result = database.transition_conversation_control(
        11,
        22,
        "NORMAL",
        "manual_takeover",
    )

    assert result["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


@pytest.mark.parametrize(
    "reason_code",
    ["", "Manual Takeover", "manual-takeover", "_manual", "a" * 65],
)
def test_transition_rejects_invalid_reason_codes(
    monkeypatch: pytest.MonkeyPatch,
    reason_code: str,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    result = database.transition_conversation_control(
        11,
        22,
        database.CONTROL_STATE_SELLER_TAKEN_OVER,
        reason_code,
    )

    assert result["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


def test_transition_rejects_long_reason_note(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    result = database.transition_conversation_control(
        11,
        22,
        database.CONTROL_STATE_SELLER_TAKEN_OVER,
        "manual_takeover",
        reason_note="x" * 501,
    )

    assert result["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


@pytest.mark.parametrize(
    ("field_name", "field_value"),
    [
        ("changed_by_profile_id", 0),
        ("trigger_message_id", -1),
        ("resume_after_message_id", False),
        ("expected_version", 0),
    ],
)
def test_transition_rejects_invalid_optional_ids(
    monkeypatch: pytest.MonkeyPatch,
    field_name: str,
    field_value: Any,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())
    kwargs = {field_name: field_value}

    result = database.transition_conversation_control(
        11,
        22,
        database.CONTROL_STATE_SELLER_TAKEN_OVER,
        "manual_takeover",
        **kwargs,
    )

    assert result["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


def test_transition_normalizes_no_op_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data=[
                rpc_success(
                    state=database.CONTROL_STATE_ASSISTANT_PAUSED,
                    version=4,
                    changed=False,
                )
            ]
        ),
    )

    result = database.transition_conversation_control(
        11,
        22,
        database.CONTROL_STATE_ASSISTANT_PAUSED,
        "manual_pause",
        expected_version=4,
    )

    assert result == {
        "durum": "başarılı",
        "changed": False,
        "control": {
            "state": "ASSISTANT_PAUSED",
            "changed_at": "2026-08-06T12:00:00+00:00",
            "changed_by_profile_id": 7,
            "reason_code": "manual_takeover",
            "reason_note": "Satıcı devraldı.",
            "resume_after_message_id": None,
            "version": 4,
        },
    }


@pytest.mark.parametrize(
    ("rpc_status", "expected_status"),
    [
        ("not_found", "bulunamadı"),
        ("forbidden", "reddedildi"),
    ],
)
def test_transition_normalizes_terminal_rpc_statuses(
    monkeypatch: pytest.MonkeyPatch,
    rpc_status: str,
    expected_status: str,
) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(rpc_data={"status": rpc_status}),
    )

    result = database.transition_conversation_control(
        11,
        22,
        database.CONTROL_STATE_RETURN_REVIEW,
        "return_review",
    )

    assert result["durum"] == expected_status


def test_transition_normalizes_version_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "status": "conflict",
                "control": control_record(
                    database.CONTROL_STATE_SELLER_TAKEN_OVER,
                    8,
                ),
            }
        ),
    )

    result = database.transition_conversation_control(
        11,
        22,
        database.CONTROL_STATE_ASSISTANT_PAUSED,
        "manual_pause",
        expected_version=7,
    )

    assert result["durum"] == "çakışma"
    assert result["control"]["version"] == 8


def test_transition_does_not_leak_backend_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "service-role-secret-value"
    install_fake(
        monkeypatch,
        FakeSupabase(rpc_data=RuntimeError(secret)),
    )

    result = database.transition_conversation_control(
        11,
        22,
        database.CONTROL_STATE_ASSISTANT_PAUSED,
        "security",
    )

    assert result["durum"] == "hata"
    assert secret not in result["mesaj"]


def test_get_control_does_not_leak_backend_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "database-password"
    install_fake(
        monkeypatch,
        FakeSupabase(table_data=RuntimeError(secret)),
    )

    result = database.get_conversation_control(11, 22)

    assert result["durum"] == "hata"
    assert secret not in result["mesaj"]


def test_resume_uses_dedicated_atomic_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data=rpc_success(
                state=database.CONTROL_STATE_ASSISTANT_ACTIVE,
                version=6,
                changed=True,
                cursor=74,
            )
        ),
    )

    result = database.resume_conversation_assistant(
        11,
        22,
        reason_note="Asistana geri bırakıldı.",
        changed_by_profile_id=7,
        expected_version=5,
    )

    assert result["durum"] == "başarılı"
    assert result["control"]["resume_after_message_id"] == 74
    assert fake.table_calls == []
    assert fake.rpc_calls == [
        (
            "resume_conversation_assistant",
            {
                "target_seller_id": 11,
                "target_customer_id": 22,
                "transition_reason_code": "manual_resume",
                "transition_reason_note": "Asistana geri bırakıldı.",
                "actor_profile_id": 7,
                "expected_control_version": 5,
            },
        )
    ]


def test_resume_rejects_invalid_version_without_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase())

    result = database.resume_conversation_assistant(
        11,
        22,
        expected_version=0,
    )

    assert result["durum"] == "doğrulama_hatası"
    assert fake.rpc_calls == []


def test_migration_is_additive_and_defines_required_columns() -> None:
    sql = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "ADD COLUMN IF NOT EXISTS control_state" in sql
    assert "ADD COLUMN IF NOT EXISTS control_changed_at" in sql
    assert "ADD COLUMN IF NOT EXISTS control_changed_by_profile_id" in sql
    assert "ADD COLUMN IF NOT EXISTS control_reason_code" in sql
    assert "ADD COLUMN IF NOT EXISTS control_reason_note" in sql
    assert "ADD COLUMN IF NOT EXISTS resume_after_message_id" in sql
    assert "ADD COLUMN IF NOT EXISTS control_version" in sql
    assert "DROP COLUMN" not in sql.upper()
    assert "DROP TABLE" not in sql.upper()


def test_migration_defines_separate_audit_and_atomic_rpcs() -> None:
    sql = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "CREATE TABLE IF NOT EXISTS public.conversation_control_transitions" in sql
    assert "CREATE OR REPLACE FUNCTION public.transition_conversation_control" in sql
    assert "CREATE OR REPLACE FUNCTION public.resume_conversation_assistant" in sql
    assert "FOR UPDATE" in sql
    assert "control_version = control_version + 1" in sql
    assert "'changed', FALSE" in sql
    assert "AND direction = 'incoming'" in sql
    assert "INSERT INTO public.state_transitions" not in sql


def test_migration_scopes_actor_and_message_references_to_tenant() -> None:
    sql = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "WHERE id = actor_profile_id\n          AND seller_id = target_seller_id" in sql
    assert "WHERE id = transition_trigger_message_id" in sql
    assert "WHERE id = target_resume_after_message_id" in sql
    assert sql.count("AND customer_id = target_customer_id") >= 4


def test_migration_enforces_backend_only_access() -> None:
    sql = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql
    assert "TO service_role" in sql
    assert "'013'" in sql
