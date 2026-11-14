package com.unit.worker;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class SuppressionClient {

    private final RestClient restClient;

    public SuppressionClient(
            RestClient.Builder restClientBuilder,
            @Value("${worker.suppression.base-url:http://localhost:8001}") String baseUrl) {
        this.restClient = restClientBuilder.baseUrl(baseUrl).build();
    }

    public Decision checkBeforeSend(String applicantKey) {
        Decision decision = restClient.post()
                .uri("/check-before-send")
                .body(new CheckBeforeSendRequest(applicantKey))
                .retrieve()
                .body(Decision.class);
        if (decision == null || decision.reason() == null || decision.reason().isBlank()) {
            throw new IllegalStateException("Suppression service returned an invalid decision");
        }
        return decision;
    }

    private record CheckBeforeSendRequest(
            @JsonProperty("applicant_key") String applicantKey) {
    }

    public record Decision(boolean allowed, String reason) {
    }
}
