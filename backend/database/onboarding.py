from __future__ import annotations

from typing import Any

from onboarding_service import prepare_onboarding_step


def get_supabase():
    import database
    return database.get_supabase()


def utc_iso() -> str:
    import database
    return database.utc_iso()


def get_seller_by_id(seller_id: int) -> dict[str, Any]:
    import database
    return database.get_seller_by_id(seller_id)


VALID_ONBOARDING_STEP_STATUSES = {
    "locked",
    "available",
    "in_progress",
    "completed",
}


def initialize_onboarding(seller_id: int) -> dict[str, Any]:
    try:
        get_supabase().rpc(
            "initialize_seller_onboarding",
            {"target_seller_id": seller_id},
        ).execute()
        return get_onboarding_status(seller_id)
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_onboarding_steps(seller_id: int) -> dict[str, Any]:
    try:
        result = (
            get_supabase().table("seller_onboarding_steps")
            .select("*").eq("seller_id", seller_id).order("step_order").execute()
        )
        return {"durum": "başarılı", "toplam": len(result.data), "steps": result.data}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc), "steps": []}


def get_onboarding_status(seller_id: int) -> dict[str, Any]:
    seller_result = get_seller_by_id(seller_id)
    if seller_result.get("durum") != "başarılı":
        return seller_result
    steps_result = get_onboarding_steps(seller_id)
    if steps_result.get("durum") != "başarılı":
        return steps_result
    seller = seller_result["satıcı"]
    return {
        "durum": "başarılı",
        "seller_id": seller_id,
        "onboarding_status": seller.get("onboarding_status"),
        "current_onboarding_step": seller.get("current_onboarding_step"),
        "onboarding_completed": seller.get("onboarding_completed"),
        "system_status": seller.get("system_status"),
        "ai_enabled": seller.get("ai_enabled"),
        "steps": steps_result["steps"],
    }


def start_onboarding_step(seller_id: int, step_order: int) -> dict[str, Any]:
    try:
        current_result = (
            get_supabase().table("seller_onboarding_steps")
            .select("*").eq("seller_id", seller_id).eq("step_order", step_order)
            .limit(1).execute()
        )
        if not current_result.data:
            return {"durum": "bulunamadı", "mesaj": "Onboarding adımı bulunamadı."}
        current = current_result.data[0]
        if current["status"] == "locked":
            return {"durum": "kilitli", "mesaj": "Önceki adım tamamlanmadan bu adım başlatılamaz."}
        if current["status"] == "completed":
            return {"durum": "tamamlanmış", "step": current}
        result = (
            get_supabase().table("seller_onboarding_steps")
            .update({"status": "in_progress", "started_at": current.get("started_at") or utc_iso()})
            .eq("id", current["id"]).execute()
        )
        return {"durum": "başarılı", "step": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def save_onboarding_step_data(
    seller_id: int,
    step_order: int,
    step_data: dict[str, Any],
) -> dict[str, Any]:
    prepared = prepare_onboarding_step(step_order, step_data)
    if prepared.get("durum") != "başarılı":
        return prepared
    try:
        current_result = (
            get_supabase().table("seller_onboarding_steps")
            .select("*").eq("seller_id", seller_id).eq("step_order", step_order)
            .limit(1).execute()
        )
        if not current_result.data:
            return {"durum": "bulunamadı", "mesaj": "Onboarding adımı bulunamadı."}
        current = current_result.data[0]
        if current["status"] == "locked":
            return {"durum": "kilitli", "mesaj": "Kilitli onboarding adımına veri yazılamaz."}
        result = (
            get_supabase().table("seller_onboarding_steps")
            .update({
                "step_data": prepared["normalized_step_data"],
                "status": "completed" if current["status"] == "completed" else "in_progress",
                "started_at": current.get("started_at") or utc_iso(),
            })
            .eq("id", current["id"]).execute()
        )
        return {"durum": "başarılı", "step": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def complete_onboarding_step(
    seller_id: int,
    step_order: int,
    step_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        seller_result = get_seller_by_id(seller_id)
        if seller_result.get("durum") != "başarılı":
            return seller_result
        current_step = int(seller_result["satıcı"].get("current_onboarding_step") or 1)
        if step_order != current_step:
            return {
                "durum": "sıra_hatası",
                "mesaj": f"Şu anda yalnızca {current_step}. adım tamamlanabilir.",
                "current_onboarding_step": current_step,
            }
        step_result = (
            get_supabase().table("seller_onboarding_steps")
            .select("*").eq("seller_id", seller_id).eq("step_order", step_order)
            .limit(1).execute()
        )
        if not step_result.data:
            return {"durum": "bulunamadı", "mesaj": "Onboarding adımı bulunamadı."}
        if step_result.data[0]["status"] == "locked":
            return {"durum": "kilitli", "mesaj": "Bu onboarding adımı henüz açık değil."}

        prepared = prepare_onboarding_step(step_order, step_data)
        if prepared.get("durum") != "başarılı":
            return prepared
        get_supabase().rpc(
            "complete_seller_onboarding_step",
            {
                "target_seller_id": seller_id,
                "completed_step_order": step_order,
                "normalized_step_data": prepared["normalized_step_data"],
                "seller_patch": prepared["seller_patch"],
                "product_info_patch": prepared["product_info_patch"],
                "rules_payload": prepared["rules_payload"],
            },
        ).execute()
        onboarding_result = get_onboarding_status(seller_id)
        if onboarding_result.get("durum") != "başarılı":
            return onboarding_result
        onboarding_result["completed_step"] = {
            "step_order": step_order,
            "step_key": prepared["step_key"],
        }
        if step_order != 10:
            return onboarding_result

        refreshed = get_seller_by_id(seller_id)
        if refreshed.get("durum") != "başarılı":
            return refreshed
        seller = refreshed["satıcı"]
        should_auto_activate = (
            seller.get("account_type") == "standard"
            and not bool(seller.get("activation_requires_admin"))
            and bool(seller.get("onboarding_completed"))
        )
        if not should_auto_activate:
            return onboarding_result

        import database
        activation_result = database.activate_seller(
            seller_id=seller_id,
            activated_by_admin=False,
        )
        if activation_result.get("durum") != "başarılı":
            return activation_result
        onboarding_result["automatic_activation"] = True
        onboarding_result["seller"] = activation_result["seller"]
        return onboarding_result
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}
