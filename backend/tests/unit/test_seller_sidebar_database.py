from __future__ import annotations

from typing import Any, Iterator

import pytest

import database
from database.seller_summary import get_seller_action_counts, seller_read_cache


@pytest.fixture(autouse=True)
def _fresh_action_counts_cache() -> Iterator[None]:
    # The action-count read model sits behind a 10s in-process cache.
    # Without a reset, one test's fake DB result would leak into the
    # next test through the cache (cache invalidation scope).
    seller_read_cache.invalidate_seller(11)
    yield
    seller_read_cache.invalidate_seller(11)


class _FakeResult:
    def __init__(self, data: Any = None, count: int | None = None) -> None:
        self.data = data
        self.count = count


class _FakeTable:
    def __init__(self, expected_counts: dict[str, int], table_name: str, calls: list) -> None:
        self._expected_counts = expected_counts
        self._table_name = table_name
        self._calls = calls
        self._filters: list[tuple[str, Any]] = []

    def select(self, *args: Any, **kwargs: Any) -> "_FakeTable":
        self._select_kwargs = kwargs
        return self

    def eq(self, column: str, value: Any) -> "_FakeTable":
        self._filters.append(("eq", column, value))
        return self

    def in_(self, column: str, values: Any) -> "_FakeTable":
        self._filters.append(("in", column, values))
        return self

    def execute(self) -> _FakeResult:
        # record call for assertion
        self._calls.append((self._table_name, list(self._filters)))
        # map table to count
        if self._table_name == "return_issue_requests":
            return _FakeResult(data=[], count=self._expected_counts.get("returns", 0))
        if self._table_name == "unanswered_question_groups":
            return _FakeResult(data=[], count=self._expected_counts.get("unanswered", 0))
        if self._table_name == "conversation_states":
            return _FakeResult(data=[], count=self._expected_counts.get("paused", 0))
        return _FakeResult(data=[], count=0)


class _FakeSupabase:
    def __init__(self, expected_counts: dict[str, int]) -> None:
        self.expected_counts = expected_counts
        self.calls: list[tuple[str, list]] = []

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(self.expected_counts, name, self.calls)


def test_sidebar_counts_returns_exact_numbers(monkeypatch) -> None:
    fake = _FakeSupabase({"returns": 4, "unanswered": 7, "paused": 2})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    monkeypatch.setattr("database.seller_summary.get_supabase", lambda: fake)

    result = get_seller_action_counts(11)

    assert result["durum"] == "başarılı"
    assert result["returns_action_required"] == 4
    assert result["unanswered_open"] == 7
    assert result["paused_or_taken_over"] == 2
    # üç tablo sorgusu yapılmalı, her biri seller_id scope'lu
    assert len(fake.calls) == 3
    # her çağrı seller_id filtre içermeli
    for _table, filters in fake.calls:
        assert any(col == "seller_id" and val == 11 for kind, col, val in filters if kind == "eq")
    # return_issue_requests status filtre doğrulaması
    return_filters = next(f for t, f in fake.calls if t == "return_issue_requests")
    assert any(col == "status" and val == "SELLER_REVIEW_REQUIRED" for kind, col, val in return_filters if kind == "eq")
    # unanswered status filtre
    unanswered_filters = next(f for t, f in fake.calls if t == "unanswered_question_groups")
    assert any(col == "status" and val == "OPEN" for kind, col, val in unanswered_filters if kind == "eq")
    # paused conversation control_state in filter
    conv_filters = next(f for t, f in fake.calls if t == "conversation_states")
    assert any(kind == "in" and col == "control_state" for kind, col, val in conv_filters)
    # değerlerin içinde iki beklenen state olmalı
    for kind, col, val in conv_filters:
        if kind == "in" and col == "control_state":
            assert set(val) == {"ASSISTANT_PAUSED", "SELLER_TAKEN_OVER"}


def test_sidebar_counts_uses_head_count_and_fallback(monkeypatch) -> None:
    # Supabase mock count döndürmediğinde data uzunluğu fallback'u
    class FallbackFakeTable(_FakeTable):
        def execute(self) -> _FakeResult:
            self._calls.append((self._table_name, list(self._filters)))
            # count=None, data list ile fallback
            if self._table_name == "return_issue_requests":
                return _FakeResult(data=[{}, {}], count=None)
            if self._table_name == "unanswered_question_groups":
                return _FakeResult(data=[{}], count=None)
            if self._table_name == "conversation_states":
                return _FakeResult(data=[], count=None)
            return _FakeResult(data=[], count=None)

    class FallbackSupabase(_FakeSupabase):
        def table(self, name: str) -> _FakeTable:
            return FallbackFakeTable(self.expected_counts, name, self.calls)

    fake = FallbackSupabase({"returns": 0, "unanswered": 0, "paused": 0})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    monkeypatch.setattr("database.seller_summary.get_supabase", lambda: fake)

    result = get_seller_action_counts(11)

    assert result["durum"] == "başarılı"
    assert result["returns_action_required"] == 2
    assert result["unanswered_open"] == 1
    assert result["paused_or_taken_over"] == 0


def test_sidebar_counts_validates_seller_id_without_db(monkeypatch) -> None:
    executed = []

    class NoExecuteSupabase:
        def table(self, *args: Any, **kwargs: Any) -> Any:
            executed.append(True)
            raise AssertionError("DB should not be called on invalid seller_id")

    monkeypatch.setattr(database, "get_supabase", lambda: NoExecuteSupabase())
    monkeypatch.setattr("database.seller_summary.get_supabase", lambda: NoExecuteSupabase())

    assert get_seller_action_counts(0)["durum"] == "doğrulama_hatası"
    assert get_seller_action_counts(-5)["durum"] == "doğrulama_hatası"
    assert get_seller_action_counts("11")["durum"] == "doğrulama_hatası"  # type: ignore[arg-type]
    assert executed == []


def test_sidebar_counts_handles_db_exception(monkeypatch) -> None:
    class ErrorSupabase:
        def table(self, *args: Any, **kwargs: Any) -> Any:
            raise RuntimeError("db down")

    fake = ErrorSupabase()
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    monkeypatch.setattr("database.seller_summary.get_supabase", lambda: fake)

    result = get_seller_action_counts(11)
    assert result["durum"] == "hata"


def test_sidebar_counts_tenant_isolation(monkeypatch) -> None:
    # Her seller için ayrı count dönmeli; seller_id filtre korunmalı
    fake = _FakeSupabase({"returns": 1, "unanswered": 2, "paused": 3})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    monkeypatch.setattr("database.seller_summary.get_supabase", lambda: fake)

    get_seller_action_counts(42)
    # tüm çağrılarda seller_id 42 olmalı, başka seller id sızmamalı
    for _, filters in fake.calls:
        eq_seller = [v for k, c, v in filters if k == "eq" and c == "seller_id"]
        assert eq_seller == [42]
