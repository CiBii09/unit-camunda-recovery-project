package com.unit.worker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class WorkerRetryPolicy {

    private final int maxRetries;
    private final Duration initialBackoff;
    private final Duration maxBackoff;

    public WorkerRetryPolicy(
            @Value("${worker.retry.max-retries:3}") int maxRetries,
            @Value("${worker.retry.initial-backoff:2s}") Duration initialBackoff,
            @Value("${worker.retry.max-backoff:30s}") Duration maxBackoff) {
        if (maxRetries < 1) {
            throw new IllegalArgumentException("worker.retry.max-retries must be at least 1");
        }
        if (initialBackoff.isNegative() || initialBackoff.isZero()) {
            throw new IllegalArgumentException("worker.retry.initial-backoff must be positive");
        }
        if (maxBackoff.compareTo(initialBackoff) < 0) {
            throw new IllegalArgumentException("worker.retry.max-backoff must be at least initial-backoff");
        }

        this.maxRetries = maxRetries;
        this.initialBackoff = initialBackoff;
        this.maxBackoff = maxBackoff;
    }

    int retriesAfterFailure(int retriesRemaining) {
        if (retriesRemaining <= 0) {
            return 0;
        }
        return Math.min(retriesRemaining - 1, maxRetries);
    }

    Duration backoffFor(int retriesRemaining) {
        if (retriesRemaining <= 0) {
            return Duration.ZERO;
        }

        int backoffStep = maxRetries - Math.min(retriesRemaining, maxRetries);
        Duration backoff = initialBackoff;
        for (int step = 0; step < backoffStep; step++) {
            backoff = backoff.multipliedBy(2);
            if (backoff.compareTo(maxBackoff) >= 0) {
                return maxBackoff;
            }
        }
        return backoff;
    }
}
