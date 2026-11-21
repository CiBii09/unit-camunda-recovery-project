package com.unit.worker;

import java.util.Map;

public record WorkerResult(Map<String, Object> processVariables, boolean markIdempotencyCompleted) {

    public WorkerResult {
        processVariables = Map.copyOf(processVariables);
    }

    public static WorkerResult completed() {
        return completed(Map.of());
    }

    public static WorkerResult completed(Map<String, Object> processVariables) {
        return new WorkerResult(processVariables, true);
    }

    public static WorkerResult safeHold(Map<String, Object> processVariables) {
        return new WorkerResult(processVariables, false);
    }
}
