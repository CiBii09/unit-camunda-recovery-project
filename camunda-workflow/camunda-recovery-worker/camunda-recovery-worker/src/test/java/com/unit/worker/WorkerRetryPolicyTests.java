package com.unit.worker;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WorkerRetryPolicyTests {

    private final WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
            3, Duration.ofSeconds(2), Duration.ofSeconds(5));

    @Test
    void capsRetriesAndDecrementsRemainingCount() {
        assertEquals(2, retryPolicy.retriesAfterFailure(3));
        assertEquals(3, retryPolicy.retriesAfterFailure(8));
        assertEquals(0, retryPolicy.retriesAfterFailure(0));
    }

    @Test
    void increasesBackoffExponentiallyAndCapsIt() {
        assertEquals(Duration.ofSeconds(2), retryPolicy.backoffFor(3));
        assertEquals(Duration.ofSeconds(4), retryPolicy.backoffFor(2));
        assertEquals(Duration.ofSeconds(5), retryPolicy.backoffFor(1));
        assertEquals(Duration.ZERO, retryPolicy.backoffFor(0));
    }
}
