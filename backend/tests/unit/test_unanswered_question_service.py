from __future__ import annotations

from typing import Any

import pytest

import unanswered_question_service as service


def answered_group(answer: str = "Evet.") -> dict[str, Any]:
    return {
        "id": 41,
        "seller_id": 11,
        "canonical_question": "Bulaşık makinesinde yıkanır mı?",
        "normalized_question": "bulaşık makinesinde yıkanır mı",
        "status": "ANSWERED",
        "answer_text": answer,
        "occurrence_count": 3,
        "version": 2,
    }


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Bulaşık   makinesinde yıkanır mı? ", "bulaşık makinesinde yıkanır mı"),
        ("KUPA!!!", "kupa"),
        ("İsim: Ali", "isim ali"),
    ],
)
def test_normalize_question_is_deterministic(raw: str, expected: str) -> None:
    assert service.normalize_question(raw) == expected


def test_normalization_does_not_semantically_merge_different_phrasing() -> None:
    assert service.normalize_question("Kupa makinede yıkanır mı?") != service.normalize_question(
        "Bulaşık makinesine koyabilir miyim?"
    )


def test_record_question_passes_normalized_value(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_record(**kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {
            "durum": "başarılı",
            "created": True,
            "idempotent": False,
            "notification_created": True,
            "group": {"id": 41, "status": "OPEN"},
        }

    monkeypatch.setattr(service, "record_unanswered_question_occurrence", fake_record)
    result = service.record_question(
        11,
        22,
        101,
        "  Bulaşık makinesinde yıkanır mı? ",
        reason="kayıtlı_cevap_bulunamadı",
    )
    assert result["durum"] == "başarılı"
    assert calls[0]["normalized_question"] == "bulaşık makinesinde yıkanır mı"
    assert calls[0]["metadata"] == {"reason": "kayıtlı_cevap_bulunamadı"}


def test_record_question_returns_answer_if_race_was_answered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "record_unanswered_question_occurrence",
        lambda **kwargs: {"durum": "cevap_mevcut", "group": answered_group("Seller cevabı")},
    )
    result = service.record_question(11, 22, 101, "Soru?")
    assert result["answer_available"] is True
    assert result["answer"] == "Seller cevabı"


def test_record_question_maps_database_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "record_unanswered_question_occurrence",
        lambda **kwargs: {"durum": "hata"},
    )
    result = service.record_question(11, 22, 101, "Soru?")
    assert result["durum"] == "hata"
    assert result["kind"] == "unavailable"


def test_find_saved_answer_exact_match(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[int, str]] = []

    def fake_get(seller_id: int, normalized: str) -> dict[str, Any]:
        calls.append((seller_id, normalized))
        return {"durum": "başarılı", "group": answered_group("Evet, uygundur.")}

    monkeypatch.setattr(service, "get_answered_unanswered_question", fake_get)
    result = service.find_saved_answer(11, "Bulaşık makinesinde yıkanır mı?")
    assert result["matched"] is True
    assert result["answer"] == "Evet, uygundur."
    assert calls == [(11, "bulaşık makinesinde yıkanır mı")]


def test_find_saved_answer_none_is_not_match(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "get_answered_unanswered_question",
        lambda *args: {"durum": "başarılı", "group": None},
    )
    assert service.find_saved_answer(11, "Soru?")["matched"] is False


@pytest.mark.parametrize("status", ["OPEN", "DISMISSED"])
def test_find_saved_answer_never_uses_non_answered_group(
    monkeypatch: pytest.MonkeyPatch,
    status: str,
) -> None:
    group = answered_group("Cevap")
    group["status"] = status
    monkeypatch.setattr(
        service,
        "get_answered_unanswered_question",
        lambda *args: {"durum": "başarılı", "group": group},
    )
    assert service.find_saved_answer(11, "Soru?")["matched"] is False


def test_set_seller_answer_trims_and_delegates(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[Any, ...]] = []

    def fake_set(*args: Any) -> dict[str, Any]:
        calls.append(args)
        return {"durum": "başarılı", "changed": True, "group": answered_group()}

    monkeypatch.setattr(service, "set_unanswered_question_answer", fake_set)
    result = service.set_seller_answer(11, 41, 7, 3, "  Evet.  ")
    assert result["durum"] == "başarılı"
    assert calls == [(11, 41, 7, 3, "Evet.")]


@pytest.mark.parametrize("answer", ["", "   ", "x" * 4001])
def test_set_seller_answer_validates_answer(answer: str) -> None:
    result = service.set_seller_answer(11, 41, 7, 3, answer)
    assert result["kind"] == "validation"


def test_dismiss_can_delegate_with_optional_note(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_dismiss(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append({"args": args, "kwargs": kwargs})
        return {"durum": "başarılı", "changed": True, "group": {"status": "DISMISSED"}}

    monkeypatch.setattr(service, "dismiss_unanswered_question_group", fake_dismiss)
    result = service.dismiss_seller_unanswered_question(11, 41, 7, 3, note="  İlgili değil  ")
    assert result["durum"] == "başarılı"
    assert calls[0]["kwargs"] == {"note": "İlgili değil"}


def test_service_maps_stale_version_to_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "set_unanswered_question_answer",
        lambda *args: {"durum": "çakışma", "current_version": 4},
    )
    result = service.set_seller_answer(11, 41, 7, 3, "Cevap")
    assert result["kind"] == "conflict"
    assert result["current_version"] == 4
