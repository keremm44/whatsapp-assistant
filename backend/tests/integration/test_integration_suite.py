from __future__ import annotations

import pytest

from tests.integration import (
    scenario_chat_service,
    scenario_chat_service_lifecycle,
    scenario_database,
    scenario_seller_access,
)


pytestmark = pytest.mark.integration


def test_database_scenario() -> None:
    scenario_database.run_all_tests()


def test_seller_access_scenario() -> None:
    scenario_seller_access.run_all_tests()


def test_chat_service_scenario() -> None:
    scenario_chat_service.run_all_tests()


def test_chat_service_lifecycle_scenario() -> None:
    scenario_chat_service_lifecycle.run_all_tests()
