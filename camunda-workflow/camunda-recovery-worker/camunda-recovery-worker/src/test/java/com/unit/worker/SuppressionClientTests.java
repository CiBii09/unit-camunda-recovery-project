package com.unit.worker;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SuppressionClientTests {

    @Test
    void sendsApplicantKeyAndReturnsSuppressionDecision() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        SuppressionClient client = new SuppressionClient(builder, "http://localhost:8001");

        server.expect(requestTo("http://localhost:8001/check-before-send"))
                .andExpect(method(POST))
                .andExpect(content().json("{\"applicant_key\":\"APL-1\"}"))
                .andRespond(withSuccess(
                        "{\"allowed\":false,\"reason\":\"BLOCK_CONTROL_HOLDOUT\"}",
                        APPLICATION_JSON));

        SuppressionClient.Decision decision = client.checkBeforeSend("APL-1");

        assertFalse(decision.allowed());
        assertEquals("BLOCK_CONTROL_HOLDOUT", decision.reason());
        server.verify();
    }
}
