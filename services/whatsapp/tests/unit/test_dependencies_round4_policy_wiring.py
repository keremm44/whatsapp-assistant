from pathlib import Path


def test_chat_dependencies_use_seller_driven_collection_policy() -> None:
    source = Path("chat_service/dependencies.py").read_text(encoding="utf-8")
    assert (
        "from order_collection_policy import get_next_collection_step as "
        "_order_get_next_collection_step"
    ) in source
    order_service_import = source[source.index("from order_service import (") : source.index(")\nfrom quantity_limit_service")]
    assert "get_next_collection_step" not in order_service_import
