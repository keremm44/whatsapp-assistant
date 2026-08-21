from __future__ import annotations

from typing import Any


def get_supabase():
    import database
    return database.get_supabase()


def get_active_rules(seller_id: int) -> dict[str, Any]:
    try:
        result = (
            get_supabase().table("rules")
            .select(SELLER_RULE_SELECT).eq("seller_id", seller_id).eq("is_active", True).execute()
        )
        return {"durum": "başarılı", "kurallar": result.data}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc), "kurallar": []}


def increment_rule_hit_count(rule_id: int) -> dict[str, Any]:
    try:
        current = (
            get_supabase().table("rules").select("hit_count")
            .eq("id", rule_id).limit(1).execute()
        )
        if not current.data:
            return {"durum": "bulunamadı", "mesaj": "Kural bulunamadı."}
        current_count = int(current.data[0].get("hit_count") or 0)
        result = (
            get_supabase().table("rules")
            .update({"hit_count": current_count + 1}).eq("id", rule_id).execute()
        )
        return {"durum": "başarılı", "rule": result.data[0] if result.data else None}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


SELLER_RULE_SELECT = (
    "id,created_at,seller_id,trigger_text,response_text,category,is_active,"
    "hit_count,version,updated_at"
)


def _seller_rule_rpc_response(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {"durum": "hata", "mesaj": "Kural RPC cevabı geçersiz."}
    rpc_status = data.get("status")
    if rpc_status == "success":
        result: dict[str, Any] = {"durum": "başarılı"}
        for key in ("rules", "rule", "changed"):
            if key in data:
                result[key] = data[key]
        return result
    if rpc_status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Kural veya satıcı bulunamadı."}
    if rpc_status == "conflict":
        return {
            "durum": "conflict",
            "mesaj": "Kural başka bir işlem tarafından değiştirildi.",
            "current_version": data.get("current_version"),
        }
    if rpc_status == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": data.get("message") or "Kural bilgileri geçersiz.",
        }
    return {"durum": "hata", "mesaj": "Kural RPC işlemi tamamlanamadı."}


def list_seller_rule_records(
    seller_id: int,
    *,
    active: bool | None = None,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_seller_rules",
            {"target_seller_id": seller_id, "include_inactive": active is not True},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Kurallar getirilemedi.", "rules": []}
    mapped = _seller_rule_rpc_response(result.data)
    if mapped.get("durum") == "başarılı" and active is False:
        mapped["rules"] = [
            row for row in mapped.get("rules") or [] if row.get("is_active") is False
        ]
    return mapped


def get_seller_rule_record(seller_id: int, rule_id: int) -> dict[str, Any]:
    result = list_seller_rule_records(seller_id, active=None)
    if result.get("durum") != "başarılı":
        return result
    for row in result.get("rules") or []:
        if int(row.get("id") or 0) == rule_id:
            return {"durum": "başarılı", "rule": row}
    return {"durum": "bulunamadı", "mesaj": "Kural bulunamadı."}


def create_seller_rule_record(
    seller_id: int,
    *,
    trigger_text: str,
    response_text: str,
    category: str,
    is_active: bool,
) -> dict[str, Any]:
    if is_active is not True:
        return {"durum": "doğrulama_hatası", "mesaj": "Yeni kural aktif olarak oluşturulmalıdır."}
    try:
        result = get_supabase().rpc(
            "create_seller_rule",
            {
                "target_seller_id": seller_id,
                "trigger_text_value": trigger_text,
                "response_text_value": response_text,
                "category_value": category,
            },
        ).execute()
    except Exception as exc:
        text = str(exc).lower()
        if "23505" in text or "duplicate key" in text:
            return {"durum": "duplicate", "mesaj": "Aktif kural zaten bulunuyor."}
        return {"durum": "hata", "mesaj": "Kural oluşturulamadı."}
    return _seller_rule_rpc_response(result.data)


def update_seller_rule_record(
    seller_id: int,
    rule_id: int,
    expected_version: int,
    *,
    patch: dict[str, Any],
) -> dict[str, Any]:
    allowed = {"trigger_text", "response_text", "category", "is_active"}
    payload = {key: value for key, value in patch.items() if key in allowed}
    try:
        result = get_supabase().rpc(
            "update_seller_rule",
            {
                "target_seller_id": seller_id,
                "target_rule_id": rule_id,
                "expected_version": expected_version,
                "trigger_text_value": payload.get("trigger_text"),
                "response_text_value": payload.get("response_text"),
                "category_value": payload.get("category"),
                "is_active_value": payload.get("is_active"),
            },
        ).execute()
    except Exception as exc:
        text = str(exc).lower()
        if "23505" in text or "duplicate key" in text:
            return {"durum": "duplicate", "mesaj": "Aktif kural zaten bulunuyor."}
        return {"durum": "hata", "mesaj": "Kural güncellenemedi."}
    return _seller_rule_rpc_response(result.data)


def deactivate_seller_rule_record(
    seller_id: int,
    rule_id: int,
    expected_version: int,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "delete_seller_rule",
            {
                "target_seller_id": seller_id,
                "target_rule_id": rule_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Kural devre dışı bırakılamadı."}
    return _seller_rule_rpc_response(result.data)
