from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> None:
    print("\n$ " + " ".join(command), flush=True)
    subprocess.run(
        command,
        cwd=BACKEND_ROOT,
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="WhatsApp Asistan test paketlerini çalıştırır.",
    )
    parser.add_argument(
        "--integration",
        action="store_true",
        help="Gerçek Supabase entegrasyon senaryolarını da çalıştır.",
    )
    parser.add_argument(
        "--stress",
        action="store_true",
        help="100 mesaj stres senaryosunu ayrıca çalıştır.",
    )
    args = parser.parse_args()

    run([sys.executable, "-m", "pytest", "tests/unit", "-q"])

    if args.integration:
        run(
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/integration/test_integration_suite.py",
                "-q",
            ]
        )

    if args.stress:
        run(
            [
                sys.executable,
                "-m",
                "tests.integration.scenario_100_messages",
            ]
        )


if __name__ == "__main__":
    main()
