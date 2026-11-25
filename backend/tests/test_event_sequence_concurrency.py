from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from src.event_sequence import EventSequenceTracker


def sample_event(sequence):
    return {
        "bank": "BANK001",
        "applicant_key": "APP-USER-001",
        "application_id": "APPLICATION-CONCURRENT",
        "sequence": sequence,
    }


def test_concurrent_distinct_sequences_preserve_all_updates():
    tracker = EventSequenceTracker()

    event_count = 100
    worker_count = 32
    barrier = Barrier(worker_count)

    def process(sequence):
        if sequence <= worker_count:
            barrier.wait(timeout=10)

        return tracker.process_event(sample_event(sequence))

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(process, range(1, event_count + 1)))

    key = ("BANK001", "APP-USER-001", "APPLICATION-CONCURRENT")
    state = tracker.applications[key]

    assert len(state["received"]) == event_count
    assert state["contiguous_sequence"] == event_count
    assert state["received"] == set(range(1, event_count + 1))
    assert all(isinstance(result, dict) for result in results)


def test_concurrent_same_sequence_is_recorded_only_once():
    tracker = EventSequenceTracker()

    worker_count = 32
    barrier = Barrier(worker_count)

    def process():
        barrier.wait(timeout=10)
        return tracker.process_event(sample_event(1))

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(
            lambda _: process(),
            range(worker_count)
        ))

    duplicate_count = sum(
        result["status"] == "DUPLICATE_SEQUENCE"
        for result in results
    )

    assert duplicate_count == worker_count - 1

    key = ("BANK001", "APP-USER-001", "APPLICATION-CONCURRENT")
    state = tracker.applications[key]

    assert state["received"] == {1}
    assert state["contiguous_sequence"] == 1
