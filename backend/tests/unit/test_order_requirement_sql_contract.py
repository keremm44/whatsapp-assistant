"""Migration 027 bayrak çözümleme sözleşmesi (SQL statik yapı testleri).

Python uygulama katmanı (`order_service._read_core_requirement_flag`) ile
`_recompute_order_completion` aynı kanonik kuralları izlemelidir:

  - eksik / JSON null  -> image_required TRUE, custom_text_required FALSE
  - JSON boolean       -> değerin kendisi
  - JSON string        -> btrim+lower sonrası yalnız 'true'/'false'
  - diğer her şey      -> geçersiz: completion güvenli biçimde durur

Bu testler birinin ileride çözümlemeyi tekrar izinli `::boolean` cast'ine
döndürmesini engeller. Gerçek çalışma-zamanı kanıtı için bkz.
tests/integration/test_027_requirement_parsing_parity.py (integration
işaretli, yerel geçici PostgreSQL'de fonksiyonun kendisini koşturur).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


_SQL_PATH = Path("migrations/027_honor_order_image_requirement.sql")
_FLAGS = ("image_required", "custom_text_required")


def _sql() -> str:
    return _SQL_PATH.read_text(encoding="utf-8")


def _parse_block(sql_lower: str, flag: str) -> str:
    """Tek bayrağın çözümleme merdivenini çıkarır (gereksinim kontrolüne kadar)."""
    match = re.search(
        rf"{flag}\s*:=\s*(?:true|false);\s*\n\s*raw_flag\s*:=\s*order_config -> '{flag}';"
        rf"(?P<body>.*?)\n    if {flag}",
        sql_lower,
        flags=re.S,
    )
    assert match is not None, f"{flag} çözümleme bloğu bulunamadı"
    return match.group("body")


def _code_only(sql: str) -> str:
    """`--` yorum satırlarını düşürür; sözleşme yürütülebilir SQL içindir."""
    return "\n".join(
        line.split("--", 1)[0] for line in sql.splitlines()
    )


def test_027_does_not_use_permissive_boolean_cast_anywhere() -> None:
    code = _code_only(_sql()).lower()
    # Python 'yes'/'on'/'1' gibi değerleri reddeder; PostgreSQL ::boolean
    # bunları sessizce kabul eder. Bu cast yürütülebilir kodda HİÇ geçmemeli.
    assert "::boolean" not in code
    assert re.search(r"cast\s*\([^)]*?\bas\s+boolean\b", code) is None
    # ->> ile text okuyup cast etmek de aynı gevşekliğe gider.
    assert re.search(r"->>\s*'(?:image_required|custom_text_required)'\s*\)\s*::", code) is None


def test_027_flags_are_read_as_jsonb_not_text() -> None:
    sql = _sql().lower()
    for flag in _FLAGS:
        assert f"order_config -> '{flag}'" in sql
        assert f"->> '{flag}'" not in sql


def test_027_defaults_match_python_contract() -> None:
    sql = _sql().lower()
    # image_required varsayılanı TRUE (legacy), custom_text_required FALSE.
    assert re.search(r"image_required\s+boolean\s*:=\s*true\s*;", sql) is not None
    assert re.search(r"custom_text_required\s+boolean\s*:=\s*false\s*;", sql) is not None
    # NULL/eksik dalları da aynı varsayılanları üretir.
    image_body = _parse_block(sql, "image_required")
    text_body = _parse_block(sql, "custom_text_required")
    assert "image_required := true" in image_body
    assert "custom_text_required := false" in text_body


@pytest.mark.parametrize("flag", _FLAGS)
def test_027_flag_ladder_has_canonical_shape(flag: str) -> None:
    body = _parse_block(_sql().lower(), flag)
    # 1) eksik / JSON null -> varsayılan
    assert "raw_flag is null or jsonb_typeof(raw_flag) = 'null'" in body
    # 2) JSON boolean -> doğrudan değer (cast yerine jsonb eşitliği)
    assert "jsonb_typeof(raw_flag) = 'boolean'" in body
    assert re.search(rf"{flag}\s*:=\s*\(raw_flag = 'true'::jsonb\)", body) is not None
    # 3) JSON string -> btrim + lower; yalnız 'true'/'false'
    assert "jsonb_typeof(raw_flag) = 'string'" in body
    assert "lower(btrim(raw_flag #>> '{}'))" in body
    assert "normalized_flag = 'true'" in body
    assert "normalized_flag = 'false'" in body
    # 4) geçersiz string ve geçersiz tür dalları fail-closed
    assert body.count("core_ready := false") == 2


def test_027_normalized_comparisons_only_accept_canonical_literals() -> None:
    sql = _sql().lower()
    compared = set(re.findall(r"normalized_flag\s*=\s*'([^']*)'", sql))
    assert compared == {"true", "false"}
    # PostgreSQL boolean input'unun izinli formları asla karşılaştırılmaz.
    for forbidden in ("'yes'", "'no'", "'on'", "'off'", "'1'", "'0'", "'t'", "'f'"):
        assert re.search(rf"normalized_flag\s*=\s*{forbidden}\b", sql) is None


def test_027_fail_closed_branches_precede_complete_update() -> None:
    sql = _sql().lower()
    # COMPLETE'e giden tek YAZIM yolu fonksiyon sonundaki `if core_ready then`
    # bloğudur (önceki `order_row.status = 'COMPLETE'` bir kısa-devre
    # okumasıdır, yazım değil); geçersiz config dalları ondan ÖNCE
    # core_ready=false yapar ve dinamik alan kontrolü de core_ready
    # kapısının arkasındadır.
    complete_pos = sql.rindex("status = 'complete'")
    gate_pos = sql.rindex("if core_ready then", 0, complete_pos)
    parse_end = sql.index("if custom_text_required", 0)
    assert gate_pos > parse_end
    # Geçersizlik dalları parse bölgesinde:
    parse_region = sql[:parse_end]
    assert "core_ready := false" in parse_region
    # Fonksiyon düşüş yolu FALSE döner (COMPLETE yalnız kapıdan geçince).
    tail = sql[sql.index("end if;", complete_pos):]
    assert "return false;" in tail
    # Fonksiyon gövdesinde COMPLETE'e tek yazım vardır (SET ataması).
    assert sql.count("status = 'complete',") == 1


def test_027_both_flags_use_identical_ladder_structure() -> None:
    sql = _sql().lower()
    bodies = []
    for flag in _FLAGS:
        body = _parse_block(sql, flag)
        # Yorumları, varsayılan atamaları ve bayrak adlarını soyutla.
        body = re.sub(r"--[^\n]*", "", body)
        body = body.replace("image_required", "flag_var").replace(
            "custom_text_required", "flag_var"
        )
        body = re.sub(r"flag_var\s*:=\s*(?:true|false)\s*;", "flag_var := default;", body)
        body = re.sub(r"\s+", " ", body).strip()
        bodies.append(body)
    assert bodies[0] == bodies[1], "iki bayrağın çözümleme merdiveni yapısal olarak aynı olmalı"
