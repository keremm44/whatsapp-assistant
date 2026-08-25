from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

import return_issue_repository as repository


class _RpcCall:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


class _RpcClient:
    def __init__(self, data: Any) -> None:
        self.data = data

    def rpc(self, name: str, params: dict[str, Any]) -> _RpcCall:
        assert name == "evaluate_quantity_limit_request"
        return _RpcCall(self.data)


class _TableCall:
    def select(self, *_: Any) -> "_TableCall":
        return self

    def eq(self, *_: Any) -> "_TableCall":
        return self

    def in_(self, *_: Any) -> "_TableCall":
        return self

    def neq(self, *_: Any) -> "_TableCall":
        return self

    def order(self, *_: Any) -> "_TableCall":
        return self

    def limit(self, *_: Any) -> "_TableCall":
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data={"unexpected": "shape"})


class _TableClient:
    def table(self, name: str) -> _TableCall:
        assert name == "return_issue_requests"
        return _TableCall()


def test_active_collectable_read_fails_closed_on_non_list_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repository, "get_supabase", lambda: _TableClient())

    result = repository.get_active_collectable_return_issue_request(2, 3)

    assert result["durum"] == "hata"
    assert "geçersiz yanıt" in result["mesaj"]


def test_review_rpc_row_must_match_trusted_tenant_and_requested_quantity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "status": "review_required",
        "request": {
            "id": 9,
            "seller_id": 999,
            "customer_id": 3,
            "issue_type": "QUANTITY_LIMIT_REQUEST",
            "status": "SELLER_REVIEW_REQUIRED",
            "requested_quantity": 75,
            "min_quantity_snapshot": 10,
            "max_quantity_snapshot": 50,
            "quantity_limit_direction": "above_max",
            "image_requirement_snapshot": "NOT_REQUESTED",
        },
    }
    monkeypatch.setattr(repository, "get_supabase", lambda: _RpcClient(payload))

    result = repository.evaluate_quantity_limit_request(2, 3, 4, 75)

    assert result["durum"] == "hata"
    assert "doğrulanamadı" in result["mesaj"]


def test_within_limit_rpc_cannot_claim_out_of_range_value_is_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "status": "within_limit",
        "requested_quantity": 75,
        "min_quantity": 10,
        "max_quantity": 50,
    }
    monkeypatch.setattr(repository, "get_supabase", lambda: _RpcClient(payload))

    result = repository.evaluate_quantity_limit_request(2, 3, 4, 75)

    assert result["durum"] == "hata"
    assert "geçersiz yanıt" in result["mesaj"]
