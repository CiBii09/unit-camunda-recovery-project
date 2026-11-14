package com.unit.worker;

import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.ZeebeWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DispatchSmsWorker extends BaseIdempotentWorker {

    private final SuppressionClient suppressionClient;
    private final SmsGatewayClient smsGatewayClient;

    public DispatchSmsWorker(
            IdempotencyStore idempotencyStore,
            WorkerRetryPolicy retryPolicy,
            SuppressionClient suppressionClient,
            SmsGatewayClient smsGatewayClient) {
        super(idempotencyStore, retryPolicy);
        this.suppressionClient = suppressionClient;
        this.smsGatewayClient = smsGatewayClient;
    }

    @ZeebeWorker(
            type = "dispatch-sms-task",
            autoComplete = false,
            timeout = 300_000,
            requestTimeout = 15,
            maxJobsActive = 5,
            pollInterval = 1_000)
    public void worker(JobClient client, ActivatedJob job) {
        super.handleJob(client, job);
    }

    @Override
    protected String getIdempotencyKey(ActivatedJob job) {
        Object requestId = job.getVariablesAsMap().get("requestId");
        if (!(requestId instanceof String) || ((String) requestId).isBlank()) {
            throw new IllegalArgumentException("Required variable 'requestId' is missing or blank");
        }
        return "dispatch-sms-task:" + requestId;
    }

    @Override
    protected void executeBusinessLogic(JobClient client, ActivatedJob job, String idempotencyKey)
            throws Exception {
        Object applicantKey = job.getVariablesAsMap().get("applicant_key");
        if (!(applicantKey instanceof String) || ((String) applicantKey).isBlank()) {
            throw new SafeToRetryException(
                    "Required variable 'applicant_key' is missing or blank", null);
        }

        SuppressionClient.Decision decision;
        try {
            decision = suppressionClient.checkBeforeSend((String) applicantKey);
        } catch (Exception e) {
            throw new SafeToRetryException("Suppression service check failed", e);
        }
        if (!decision.allowed()) {
            log.info("Không gửi SMS do cổng suppression từ chối [IdempotencyKey: {}, Reason: {}]",
                    idempotencyKey, decision.reason());
            return;
        }

        String requestId = (String) job.getVariablesAsMap().get("requestId");
        Object messageContent = job.getVariablesAsMap().get("messageContent");
        try {
            smsGatewayClient.send(
                    requestId,
                    job.getRetries(),
                    messageContent instanceof String ? (String) messageContent : "");
        } catch (Exception e) {
            throw new SafeToRetryException(
                    "SMS gateway request failed; retry uses the same idempotent requestId", e);
        }
        log.info("Đã gửi yêu cầu SMS [IdempotencyKey: {}, RequestId: {}]",
                idempotencyKey, requestId);
    }
}