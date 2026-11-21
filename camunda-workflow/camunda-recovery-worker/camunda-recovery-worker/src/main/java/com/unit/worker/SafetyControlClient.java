package com.unit.worker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class SafetyControlClient {

    private final RestClient restClient;

    public SafetyControlClient(
            RestClient.Builder restClientBuilder,
            @Value("${worker.safety-controls.base-url:http://localhost:8080}") String baseUrl) {
        this.restClient = restClientBuilder.baseUrl(baseUrl).build();
    }

    public SafetyStatus getStatus() {
        SafetyStatus status = restClient.get()
                .uri("/api/v1/safety/status")
                .retrieve()
                .body(SafetyStatus.class);
        if (status == null || status.killSwitchActive() == null || status.queuePaused() == null) {
            throw new IllegalStateException("Safety controls API returned an invalid status");
        }
        return status;
    }

    public record SafetyStatus(
            Boolean killSwitchActive,
            Boolean queuePaused,
            String lastUpdatedBy,
            String lastUpdatedAt) {

        public boolean blocksDispatch() {
            return Boolean.TRUE.equals(killSwitchActive) || Boolean.TRUE.equals(queuePaused);
        }

        public String blockReason() {
            if (Boolean.TRUE.equals(killSwitchActive)) {
                return "KILL_SWITCH_ACTIVE";
            }
            if (Boolean.TRUE.equals(queuePaused)) {
                return "QUEUE_PAUSED";
            }
            return "";
        }
    }
}
