from __future__ import annotations

import json

from observability import configure_logging, init_sentry
from operational_health import report_whatsapp_operational_health
from settings import get_settings


def main() -> int:
    settings = get_settings()
    configure_logging(settings)
    init_sentry(settings)

    result = report_whatsapp_operational_health()
    print(
        json.dumps(
            {
                "status": result["status"],
                "alert_codes": [alert.code for alert in result["alerts"]],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    if result["status"] == "critical" or result.get("durum") != "başarılı":
        return 2
    if result["status"] == "degraded":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
