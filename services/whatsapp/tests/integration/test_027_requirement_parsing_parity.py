"""Migration 027 bayrak çözümlemesinin GERÇEK PostgreSQL'de çalışma kanıtı.

Bu test canlı Supabase'e ASLA bağlanmaz; `pgserver` paketi varsa /tmp altında
geçici, izole bir PostgreSQL örneği ayağa kaldırır, migration dosyasındaki
`_recompute_order_completion` fonksiyonunu birebir yükler ve Python uygulama
katmanıyla (`order_service._read_core_requirement_flag`) aynı kabul/red
matrisini koşturur.

`pgserver` kurulu değilse test atlanır (repo bağımlılığı değildir;
`pip install pgserver` yeterlidir). Varsayılan test koşumu bu dosyayı
kapsamaz (pytest.ini testpaths=tests/unit); elle çalıştırmak için:

    pip install pgserver
    python3 -m pytest tests/integration/test_027_requirement_parsing_parity.py

Doğrulanan sözleşme (her iki bayrak için):
  eksik / JSON null -> image_required TRUE, custom_text_required FALSE
  JSON boolean      -> değerin kendisi
  JSON string       -> btrim+lower sonrası yalnız 'true'/'false'
  diğer her şey     -> geçersiz: fonksiyon FALSE döner, sipariş COLLECTING
                       kalır, version artmaz, completed_at yazılmaz
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

pgserver = pytest.importorskip(
    "pgserver",
    reason="pgserver kurulu değil; yerel PostgreSQL kanıtı atlanıyor.",
)

pytestmark = pytest.mark.integration

_SQL_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "027_honor_order_image_requirement.sql"
)

_SCHEMA = """
CREATE TABLE public.sellers (
    id BIGINT PRIMARY KEY,
    product_info JSONB
);
CREATE TABLE public.orders (
    id BIGINT PRIMARY KEY,
    seller_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COLLECTING',
    version BIGINT NOT NULL DEFAULT 1,
    external_order_number TEXT,
    image_message_id BIGINT,
    custom_text TEXT,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE public.order_field_snapshots (
    id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    is_required_snapshot BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE public.order_field_values (
    field_snapshot_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL
);
"""


def _extract_function_sql() -> str:
    match = re.search(
        r"CREATE OR REPLACE FUNCTION public\._recompute_order_completion.*?\n\$\$;",
        _SQL_PATH.read_text(encoding="utf-8"),
        re.S,
    )
    assert match is not None, "027 fonksiyonu migration dosyasında bulunamadı"
    return match.group(0)


class _PgRig:
    def __init__(self, server: Any) -> None:
        self._server = server

    def run_case(
        self,
        product_info: dict[str, Any],
        *,
        has_image: bool,
        custom_text: str | None,
    ) -> dict[str, Any]:
        pi = "'" + json.dumps(product_info) + "'::jsonb"
        ct = "NULL" if custom_text is None else "'" + custom_text + "'"
        self._server.psql(
            f"""
TRUNCATE public.order_field_values, public.order_field_snapshots,
         public.orders, public.sellers;
INSERT INTO public.sellers (id, product_info) VALUES (11, {pi});
INSERT INTO public.orders (
    id, seller_id, customer_id, status, version,
    external_order_number, image_message_id, custom_text
)
VALUES (
    1, 11, 22, 'COLLECTING', 5, 'ETSY-42',
    {105 if has_image else 'NULL'}, {ct}
);
"""
        )
        out = self._server.psql(
            "SELECT 'RESULT|' || "
            "public._recompute_order_completion(11, 22, 1, 5)::text;"
        )
        done_match = re.search(r"RESULT\|(\w+)", out)
        assert done_match is not None, f"beklenmedik çıktı: {out!r}"

        state_out = self._server.psql(
            "SELECT 'STATE|' || status || '|' || version || '|' || "
            "(completed_at IS NOT NULL)::text FROM public.orders WHERE id = 1;"
        )
        state_match = re.search(r"STATE\|([^|\n ]+)\|(\d+)\|(\w+)", state_out)
        assert state_match is not None, f"beklenmedik durum çıktısı: {state_out!r}"

        return {
            "done": done_match.group(1) == "true",
            "status": state_match.group(1),
            "version": int(state_match.group(2)),
            "completed_at_set": state_match.group(3) == "true",
        }


@pytest.fixture(scope="module")
def pg(tmp_path_factory: pytest.TempPathFactory) -> _PgRig:
    server = pgserver.get_server(tmp_path_factory.mktemp("pg027"))
    server.psql(_SCHEMA)
    server.psql(_extract_function_sql())
    return _PgRig(server)


_MISSING = object()


def _order_config(
    image_value: Any = _MISSING,
    text_value: Any = _MISSING,
) -> dict[str, Any]:
    order: dict[str, Any] = {}
    if image_value is not _MISSING:
        order["image_required"] = image_value
    if text_value is not _MISSING:
        order["custom_text_required"] = text_value
    return {"order": order}


def _assert_completion(rig: _PgRig, case: dict[str, Any]) -> None:
    result = rig.run_case(
        case["config"],
        has_image=case["has_image"],
        custom_text=case["custom_text"],
    )
    assert result["done"] is case["expected"], (
        f"{case['name']}: done={result['done']} beklenen {case['expected']}"
    )
    if case["expected"]:
        assert result["status"] == "COMPLETE"
        assert result["version"] == 6
        assert result["completed_at_set"] is True
    else:
        # Fail-closed: durum bozulmaz, version artmaz, COMPLETE yazılmaz.
        assert result["status"] == "COLLECTING"
        assert result["version"] == 5
        assert result["completed_at_set"] is False


_VALID_ABSENT_IMAGE = [
    (_MISSING, False),  # varsayılan TRUE -> görsel yok -> completion yok
    (None, False),      # JSON null -> TRUE
    (True, False),
    (False, True),
    ("true", False),
    (" TRUE ", False),
    ("false", True),
    (" False ", True),
]
_INVALID_VALUES = ["yes", "no", "1", "0", "on", "off", 1, 0, 2.5, [], {}]

_IMAGE_CASES = [
    {"name": f"image_required={value!r} görsel yok", "config": _order_config(image_value=value),
     "has_image": False, "custom_text": None, "expected": expected}
    for value, expected in _VALID_ABSENT_IMAGE
] + [
    {"name": f"image_required={value!r} görsel yok (geçersiz)", "config": _order_config(image_value=value),
     "has_image": False, "custom_text": None, "expected": False}
    for value in _INVALID_VALUES
] + [
    # Ayrıştırıcı satırlar: izinli ::boolean cast'i bu satırlarda YANLIŞ
    # completion üretirdi; sıkı çözümleme üretemez.
    {"name": f"image_required={value!r} görsel var", "config": _order_config(image_value=value),
     "has_image": True, "custom_text": None, "expected": True}
    for value in (_MISSING, None, True, False, "true", " TRUE ", "false", " False ")
] + [
    {"name": f"image_required={value!r} görsel var (geçersiz)", "config": _order_config(image_value=value),
     "has_image": True, "custom_text": None, "expected": False}
    for value in _INVALID_VALUES
]

_VALID_TEXT_ABSENT = [
    (_MISSING, True),   # varsayılan FALSE -> gerekmez -> complete
    (None, True),
    (True, False),      # zorunlu ama metin yok -> completion yok
    (False, True),
    ("true", False),
    (" TRUE ", False),
    ("false", True),
    (" False ", True),
]
_TEXT_CASES = [
    {"name": f"custom_text_required={value!r} metin yok", "config": _order_config(False, value),
     "has_image": False, "custom_text": None, "expected": expected}
    for value, expected in _VALID_TEXT_ABSENT
] + [
    {"name": f"custom_text_required={value!r} metin yok (geçersiz)", "config": _order_config(False, value),
     "has_image": False, "custom_text": None, "expected": False}
    for value in _INVALID_VALUES
] + [
    {"name": f"custom_text_required={value!r} metin var", "config": _order_config(False, value),
     "has_image": False, "custom_text": "Ali", "expected": expected}
    for value, expected in ((_MISSING, True), (None, True), (True, True), (False, True), ("true", True), (" FALSE ", True))
] + [
    # Metin varken geçersiz değer: izinli cast completion'a izin verirdi.
    {"name": f"custom_text_required={value!r} metin var (geçersiz)", "config": _order_config(False, value),
     "has_image": False, "custom_text": "Ali", "expected": False}
    for value in _INVALID_VALUES
]


@pytest.mark.parametrize(
    "case",
    _IMAGE_CASES + _TEXT_CASES,
    ids=[case["name"] for case in _IMAGE_CASES + _TEXT_CASES],
)
def test_027_flag_semantics_match_python(pg: _PgRig, case: dict[str, Any]) -> None:
    _assert_completion(pg, case)


def test_027_invalid_config_never_flips_existing_data(pg: _PgRig) -> None:
    # Geçersiz config altında başarısız çağrı tekrarlansa bile sipariş
    # durumu kararlı kalır (idempotent fail-closed).
    config = _order_config("on", "no")
    for _ in range(3):
        result = pg.run_case(config, has_image=True, custom_text="Ali")
        assert result["done"] is False
        assert result["status"] == "COLLECTING"
        assert result["version"] == 5
        assert result["completed_at_set"] is False
