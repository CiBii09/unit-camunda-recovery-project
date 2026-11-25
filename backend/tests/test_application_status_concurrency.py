from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier

from src.application_status import ApplicationStatusProvider


def test_concurrent_updates_only_one_same_version_succeeds():
    provider = ApplicationStatusProvider()

    initial_record = {
        "bank": "BANK001",
        "applicant_key": "APP-USER-001",
        "application_id": "APPLICATION-001",
        "status": "STARTED",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "version": 1,
    }

    provider.update_status(initial_record)

    worker_count = 32
    barrier = Barrier(worker_count)

    def update_same_version():
        record = {
            "bank": "BANK001",
            "applicant_key": "APP-USER-001",
            "application_id": "APPLICATION-001",
            "status": "PROGRESSING",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "version": 2,
        }

        barrier.wait()

        try:
            provider.update_status(record)
            return "SUCCESS"
        except ValueError:
            return "REJECTED"

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(
            executor.map(
                lambda _: update_same_version(),
                range(worker_count),
            )
        )

    assert results.count("SUCCESS") == 1
    assert results.count("REJECTED") == worker_count - 1

    final_record = provider.get_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
    )

    assert final_record["version"] == 2
    assert final_record["status"] == "PROGRESSING"
