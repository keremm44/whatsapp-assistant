from __future__ import annotations

import inspect
from types import SimpleNamespace
from typing import Any

import pytest

import quantity_limit_service as service
import return_issue_repository as repository
import return_issue_service


@pytest.mark.parametrize(
    ("message", "requested"),
    [
        ("50 adet yaptırabilir miyim?", 50),
        ("100 tane alabilir miyim?", 100),
        ("adet 25 sipariş verebilir miyim?", 25),
        ("0 adet olur mu?", 0),
    ],
)
def test_detects_explicit_order_quantity_without_llm_guessing(
    message: str,
    requested: int,
) -> None:
    result = service.detect_quantity_question(message)
    assert result == {
        "detected": True,
        "requested_quantity": requested,
        "ambiguous": False,
    }


@pytest.mark.parametrize(
    "message",
    [
        "kaç adet sipariş verebilirim?",
        "minimum sipariş adedi kaç?",
        "maksimum kaç tane sipariş verebilirim?",
    ],
)
def test_detects_limit_question_without_requested_quantity(message: str) -> None:
    result = service.detect_quantity_question(message)
    assert result["detected"] is True
    assert result["requested_quantity"] is None
    assert result["ambiguous"] is False


@pytest.mark.parametrize(
    "message",
    [
        "3 tane renk var mı?",
        "sipariş numaram 1234567",
        "500 ml kupa var mı?",
        "ürün kırık geldi, 50 adet almıştım",
        "iade etmek istiyorum, 20 adet aldım",
    ],
)
def test_quantity_detector_does_not_steal_other_semantics(message: str) -> None:
    assert service.detect_quantity_question(message)["detected"] is False


def test_quantity_range_is_not_guessed_as_single_requested_quantity() -> None:
    for message in (
        "50-100 adet yaptırabilir miyim?",
        "50 adet ya da 100 adet yaptırabilir miyim?",
    ):
        result = service.detect_quantity_question(message)
        assert result["detected"] is True
        assert result["requested_quantity"] is None
        assert result["ambiguous"] is True


def test_limit_only_question_uses_configured_range_without_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "evaluate_quantity_limit_request",
        lambda *args, **kwargs: pytest.fail("No requested quantity must not write a review."),
    )

    result = service.handle_quantity_message(
        seller_id=2,
        customer_id=3,
        source_message_id=4,
        message_text="Kaç adet sipariş verebilirim?",
        product_info={"order": {"min_quantity": 10, "max_quantity": 50}},
    )

    assert result["durum"] == "başarılı"
    assert result["handled"] is True
    assert result["review_required"] is False
    assert "10 ile 50" in result["response_text"]


def test_exact_min_and_max_are_within_range(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_evaluate(
        seller_id: int,
        customer_id: int,
        source_message_id: int,
        requested_quantity: int,
        **kwargs: Any,
    ) -> dict[str, Any]:
        assert (seller_id, customer_id, source_message_id) == (2, 3, 4)
        assert requested_quantity in {10, 50}
        return {
            "durum": "başarılı",
            "within_limit": True,
            "requested_quantity": requested_quantity,
            "min_quantity": 10,
            "max_quantity": 50,
            "review_required": False,
        }

    monkeypatch.setattr(service, "evaluate_quantity_limit_request", fake_evaluate)

    for requested in (10, 50):
        result = service.handle_quantity_message(
            seller_id=2,
            customer_id=3,
            source_message_id=4,
            message_text=f"{requested} adet yaptırabilir miyim?",
            product_info={"order": {"min_quantity": 10, "max_quantity": 50}},
        )
        assert result["review_required"] is False
        assert "sınırları içinde" in result["response_text"]


@pytest.mark.parametrize(
    ("direction", "requested", "expected_text"),
    [
        ("below_min", 5, "minimum sipariş adedi 10"),
        ("above_max", 75, "en fazla 50 adet"),
    ],
)
def test_out_of_range_creates_review_and_routes_customer_to_seller(
    monkeypatch: pytest.MonkeyPatch,
    direction: str,
    requested: int,
    expected_text: str,
) -> None:
    monkeypatch.setattr(
        service,
        "evaluate_quantity_limit_request",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "within_limit": False,
            "review_required": True,
            "notification_created": True,
            "request": {
                "id": 91,
                "issue_type": "QUANTITY_LIMIT_REQUEST",
                "requested_quantity": requested,
                "min_quantity_snapshot": 10,
                "max_quantity_snapshot": 50,
                "quantity_limit_direction": direction,
            },
        },
    )

    result = service.handle_quantity_message(
        seller_id=2,
        customer_id=3,
        source_message_id=4,
        message_text=f"{requested} adet yaptırabilir miyim?",
        product_info={"order": {"min_quantity": 10, "max_quantity": 50}},
    )

    assert result["review_required"] is True
    assert result["request"]["id"] == 91
    assert expected_text in result["response_text"]
    assert "satıcıyla görüşmeniz gerekiyor" in result["response_text"]


def test_persist_failure_never_claims_seller_review(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "evaluate_quantity_limit_request",
        lambda *args, **kwargs: {"durum": "hata", "mesaj": "db unavailable"},
    )

    result = service.handle_quantity_message(
        seller_id=2,
        customer_id=3,
        source_message_id=4,
        message_text="100 adet yaptırabilir miyim?",
        product_info={"order": {"min_quantity": 10, "max_quantity": 50}},
    )

    assert result["durum"] == "hata"
    assert result["handled"] is True
    assert "response_text" not in result


class _FakeRpcCall:
    def __init__(self, payload: Any) -> None:
        self.payload = payload

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.payload)


class _FakeRpcClient:
    def __init__(self, payload: Any) -> None:
        self.payload = payload
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _FakeRpcCall:
        self.calls.append((name, params))
        return _FakeRpcCall(self.payload)


def test_quantity_rpc_receives_only_trusted_scope_and_requested_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _FakeRpcClient(
        {
            "status": "within_limit",
            "requested_quantity": 20,
            "min_quantity": 10,
            "max_quantity": 50,
        }
    )
    monkeypatch.setattr(repository, "get_supabase", lambda: client)

    result = repository.evaluate_quantity_limit_request(
        2,
        3,
        4,
        20,
        reason_text="20 adet yaptırabilir miyim?",
    )

    assert result["within_limit"] is True
    assert client.calls == [
        (
            "evaluate_quantity_limit_request",
            {
                "target_seller_id": 2,
                "target_customer_id": 3,
                "source_message_id": 4,
                "requested_quantity_value": 20,
                "reason_text_value": "20 adet yaptırabilir miyim?",
            },
        )
    ]
    # min/max are intentionally not caller parameters; PostgreSQL reads them
    # from the trusted seller settings row before deciding or snapshotting.
    assert "min_quantity_value" not in client.calls[0][1]
    assert "max_quantity_value" not in client.calls[0][1]


class _FakeTableQuery:
    def __init__(self) -> None:
        self.operations: list[tuple[str, Any, Any]] = []

    def select(self, value: str) -> "_FakeTableQuery":
        self.operations.append(("select", value, None))
        return self

    def eq(self, key: str, value: Any) -> "_FakeTableQuery":
        self.operations.append(("eq", key, value))
        return self

    def in_(self, key: str, value: Any) -> "_FakeTableQuery":
        self.operations.append(("in", key, value))
        return self

    def neq(self, key: str, value: Any) -> "_FakeTableQuery":
        self.operations.append(("neq", key, value))
        return self

    def order(self, key: str) -> "_FakeTableQuery":
        self.operations.append(("order", key, None))
        return self

    def limit(self, value: int) -> "_FakeTableQuery":
        self.operations.append(("limit", value, None))
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[])


class _FakeTableClient:
    def __init__(self) -> None:
        self.query = _FakeTableQuery()

    def table(self, name: str) -> _FakeTableQuery:
        assert name == "return_issue_requests"
        return self.query


def test_active_return_collection_explicitly_excludes_quantity_reviews(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _FakeTableClient()
    monkeypatch.setattr(repository, "get_supabase", lambda: client)

    result = repository.get_active_collectable_return_issue_request(2, 3)

    assert result == {"durum": "başarılı", "request": None}
    assert ("neq", "issue_type", "QUANTITY_LIMIT_REQUEST") in client.query.operations


def test_quantity_review_detail_has_no_collection_missing_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        return_issue_service,
        "get_return_issue_request_detail",
        lambda seller_id, request_id: {
            "durum": "başarılı",
            "request": {
                "id": request_id,
                "issue_type": "QUANTITY_LIMIT_REQUEST",
                "status": "SELLER_REVIEW_REQUIRED",
            },
            "customer": {"id": 3},
            "order": None,
            "evidence": [],
        },
    )

    result = return_issue_service.get_request_collection_state(2, 91)

    assert result["ready_for_review"] is True
    assert result["missing_fields"] == []
    assert result["awaiting"] is None
    assert result["question"] is None
    assert (
        return_issue_service.ISSUE_TYPE_DISPLAY_NAMES["QUANTITY_LIMIT_REQUEST"]
        == "Adet sınırı talebi"
    )


def test_quantity_runtime_does_not_create_commercial_orders_or_change_control() -> None:
    source = inspect.getsource(service)
    assert "get_or_create_order" not in source
    assert "initialize_collection" not in source
    assert "transition_conversation_control" not in source
    assert "CONTROL_STATE_" not in source
