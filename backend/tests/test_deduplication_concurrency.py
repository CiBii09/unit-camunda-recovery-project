from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from src.deduplication import Deduplication


def test_concurrent_registration_accepts_same_event_only_once():
    dedup = Deduplication()
    event = {"event_id": "EVT-CONCURRENT-001"}

    worker_count = 32
    barrier = Barrier(worker_count)

    def register():
        barrier.wait(timeout=10)
        return dedup.register_event(event)

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(
            lambda _: register(),
            range(worker_count)
        ))

    assert results.count(True) == 1
    assert results.count(False) == worker_count - 1
    assert dedup.total_processed() == 1


def test_concurrent_registration_accepts_different_events():
    dedup = Deduplication()

    event_count = 100

    def register(index):
        return dedup.register_event({
            "event_id": f"EVT-{index:03d}"
        })

    with ThreadPoolExecutor(max_workers=20) as executor:
        results = list(executor.map(register, range(event_count)))

    assert all(results)
    assert dedup.total_processed() == event_count
