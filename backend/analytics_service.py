"""
analytics_service.py — Seller panel analytics özet servisi.

Supabase RPC `get_seller_analytics_summary` fonksiyonunu çağırır ve
sonucu normalize ederek route katmanına döndürür.

Dönen yapı (ok=True):
  {
    "ok": True,
    "period": "week" | "month",
    "since": "<iso>",
    "metrics": {
      "incoming_messages":     int,
      "outgoing_messages":     int,
      "auto_replied_messages": int,
      "manual_replied_msgs":   int,
      "auto_reply_rate":       float,   # 0.0 – 1.0
      "new_orders":            int,
      "completed_orders":      int,
      "open_returns":          int,
      "resolved_returns":      int,
      "unanswered_questions":  int,
    }
  }
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from database import get_supabase

logger = logging.getLogger(__name__)

AnalyticsPeriod = Literal["week", "month"]


def get_seller_analytics_summary(
    seller_id: int,
    period: AnalyticsPeriod = "week",
) -> dict[str, Any]:
    """Seller analytics özetini döndürür."""
    try:
        resp = (
            get_supabase()
            .rpc(
                "get_seller_analytics_summary",
                {"target_seller_id": seller_id, "period": period},
            )
            .execute()
        )
    except Exception:
        logger.exception("Analytics RPC çağrısı başarısız: seller_id=%s", seller_id)
        return {
            "ok": False,
            "kind": "unavailable",
            "error": {
                "code": "analytics_unavailable",
                "message": "Analitik verisi şu anda alınamadı.",
            },
        }

    payload: dict[str, Any] | None = None
    if isinstance(resp.data, list) and resp.data:
        payload = resp.data[0]
    elif isinstance(resp.data, dict):
        payload = resp.data

    if not isinstance(payload, dict):
        logger.error("Analytics RPC beklenmeyen yanıt: %r", resp.data)
        return {
            "ok": False,
            "kind": "unavailable",
            "error": {
                "code": "analytics_unavailable",
                "message": "Analitik verisi şu anda alınamadı.",
            },
        }

    status = payload.get("status")
    if status != "success":
        reason = payload.get("reason", "unknown")
        logger.error(
            "Analytics RPC hata: seller_id=%s period=%s reason=%s",
            seller_id, period, reason,
        )
        if reason in ("invalid_seller_id", "invalid_period"):
            return {
                "ok": False,
                "kind": "validation",
                "error": {
                    "code": f"analytics_{reason}",
                    "message": "Geçersiz istek parametresi.",
                },
            }
        return {
            "ok": False,
            "kind": "unavailable",
            "error": {
                "code": "analytics_unavailable",
                "message": "Analitik verisi şu anda alınamadı.",
            },
        }

    metrics = payload.get("metrics", {})

    return {
        "ok": True,
        "period": payload.get("period", period),
        "since": payload.get("since"),
        "metrics": {
            "incoming_messages":     int(metrics.get("incoming_messages") or 0),
            "outgoing_messages":     int(metrics.get("outgoing_messages") or 0),
            "auto_replied_messages": int(metrics.get("auto_replied_messages") or 0),
            "manual_replied_msgs":   int(metrics.get("manual_replied_msgs") or 0),
            "auto_reply_rate":       float(metrics.get("auto_reply_rate") or 0),
            "new_orders":            int(metrics.get("new_orders") or 0),
            "completed_orders":      int(metrics.get("completed_orders") or 0),
            "open_returns":          int(metrics.get("open_returns") or 0),
            "resolved_returns":      int(metrics.get("resolved_returns") or 0),
            "unanswered_questions":  int(metrics.get("unanswered_questions") or 0),
        },
    }
