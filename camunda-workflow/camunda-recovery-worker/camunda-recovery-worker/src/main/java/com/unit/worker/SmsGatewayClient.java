package com.unit.worker;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class SmsGatewayClient {

    private final RestClient restClient;

    public SmsGatewayClient(
            RestClient.Builder restClientBuilder,
            @Value("${worker.sms-gateway.base-url:http://localhost:4500}") String baseUrl) {
        this.restClient = restClientBuilder.baseUrl(baseUrl).build();
    }

    public void send(String requestId, int retriesRemaining, String messageContent) {
        GatewayResponse response = restClient.post()
                .uri("/api/v1/sms/adapter/send")
                .body(new GatewayRequest(requestId, retriesRemaining, messageContent))
                .retrieve()
                .body(GatewayResponse.class);
        if (response == null
                || !("ADAPTER_SUCCESS".equals(response.status())
                || "DUPLICATE_REQUEST_IGNORED".equals(response.status()))) {
            throw new IllegalStateException("SMS gateway returned an unsuccessful response");
        }
    }

    private record GatewayRequest(
            String requestId,
            @JsonProperty("retryCount") int retryCount,
            String messageContent) {
    }

    private record GatewayResponse(String status) {
    }
}
