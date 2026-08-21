from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from observability import RequestMetricsMiddleware


def test_request_metrics_returns_trace_id_and_never_logs_query_values(caplog: Any) -> None:
    app = FastAPI()
    app.add_middleware(RequestMetricsMiddleware)

    @app.get("/safe")
    def safe() -> dict[str, str]:
        return {"ok": "yes"}

    with caplog.at_level(logging.INFO):
        response = TestClient(app).get("/safe?phone=secret-value")

    assert response.status_code == 200
    request_id = response.headers.get("x-request-id")
    assert request_id is not None and len(request_id) >= 8
    metric_messages = [
        record.getMessage()
        for record in caplog.records
        if record.name == "observability"
    ]
    assert len(metric_messages) == 1
    assert "path=/safe" in metric_messages[0]
    assert "response_bytes=" in metric_messages[0]
    assert "secret-value" not in metric_messages[0]


def test_request_metrics_preserves_valid_caller_request_id() -> None:
    app = FastAPI()
    app.add_middleware(RequestMetricsMiddleware)

    @app.get("/safe")
    def safe() -> dict[str, str]:
        return {"ok": "yes"}

    response = TestClient(app).get("/safe", headers={"X-Request-ID": "trace-12345678"})

    assert response.headers["x-request-id"] == "trace-12345678"
