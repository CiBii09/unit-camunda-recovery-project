package com.unit.worker;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SafetyControlClientTests {

    @Test
    void readsContractStatusAndDetectsBothBlockingControls() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        SafetyControlClient client = new SafetyControlClient(builder, "http://localhost:8080");

        server.expect(requestTo("http://localhost:8080/api/v1/safety/status"))
                .andExpect(method(GET))
                .andRespond(withSuccess(
                        "{\"killSwitchActive\":false,\"queuePaused\":true,"
                                + "\"lastUpdatedBy\":\"CB\",\"lastUpdatedAt\":\"2026-11-21T00:00:00Z\"}",
                        MediaType.APPLICATION_JSON));

        SafetyControlClient.SafetyStatus status = client.getStatus();

        assertTrue(status.blocksDispatch());
        assertFalse(status.killSwitchActive());
        server.verify();
    }

    @Test
    void rejectsMalformedSafetyStatusInsteadOfDefaultingToOpen() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        SafetyControlClient client = new SafetyControlClient(builder, "http://localhost:8080");

        server.expect(requestTo("http://localhost:8080/api/v1/safety/status"))
                .andRespond(withSuccess(
                        "{\"queuePaused\":false}",
                        MediaType.APPLICATION_JSON));

        assertThrows(IllegalStateException.class, client::getStatus);
        server.verify();
    }
}
