package com.unit.worker;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SmsGatewayClientTests {

    @Test
    void sendsStableRequestIdAndAcceptsGatewayDuplicateResponse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        SmsGatewayClient client = new SmsGatewayClient(builder, "http://localhost:4500");

        server.expect(requestTo("http://localhost:4500/api/v1/sms/adapter/send"))
                .andExpect(method(POST))
                .andExpect(content().json(
                        "{\"requestId\":\"req-1\",\"retryCount\":2,\"messageContent\":\"Reminder\"}"))
                .andRespond(withSuccess(
                        "{\"status\":\"DUPLICATE_REQUEST_IGNORED\",\"requestId\":\"req-1\"}",
                        APPLICATION_JSON));

        assertDoesNotThrow(() -> client.send("req-1", 2, "Reminder"));
        server.verify();
    }
}
