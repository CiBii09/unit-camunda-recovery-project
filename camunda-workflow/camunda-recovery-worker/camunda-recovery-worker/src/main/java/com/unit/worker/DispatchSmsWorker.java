package com.unit.worker;

import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.ZeebeWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Component
public class DispatchSmsWorker extends BaseIdempotentWorker {

    private final SuppressionClient suppressionClient;
    private final SmsGatewayClient smsGatewayClient;
    private final SafetyControlClient safetyControlClient;

    public DispatchSmsWorker(
            IdempotencyStore idempotencyStore,
            WorkerRetryPolicy retryPolicy,
            SuppressionClient suppressionClient,
            SmsGatewayClient smsGatewayClient,
            SafetyControlClient safetyControlClient) {
        super(idempotencyStore, retryPolicy);
        this.suppressionClient = suppressionClient;
        this.smsGatewayClient = smsGatewayClient;
        this.safetyControlClient = safetyControlClient;
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
    protected WorkerResult executeBusinessLogic(JobClient client, ActivatedJob job, String idempotencyKey)
            throws Exception {
        SafetyControlClient.SafetyStatus safetyStatus = checkSafetyOrHold(job, idempotencyKey);
        if (safetyStatus == null || safetyStatus.blocksDispatch()) {
            return safeHold(safetyStatus, "SAFETY_CONTROL_BLOCKED", idempotencyKey);
        }

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
            return WorkerResult.completed(Map.of(
                    "dispatchDecision", "SUPPRESSED",
                    "blockReason", decision.reason()));
        }

        safetyStatus = checkSafetyOrHold(job, idempotencyKey);
        if (safetyStatus == null || safetyStatus.blocksDispatch()) {
            return safeHold(safetyStatus, "SAFETY_CONTROL_BLOCKED", idempotencyKey);
        }

        String requestId = (String) job.getVariablesAsMap().get("requestId");
        Object messageContent = job.getVariablesAsMap().get("messageContent");
        SmsGatewayClient.GatewayReceipt receipt;
        try {
            receipt = smsGatewayClient.send(
                    requestId,
                    job.getRetries(),
                    messageContent instanceof String ? (String) messageContent : "");
        } catch (Exception e) {
            throw new SafeToRetryException(
                    "SMS gateway request failed; retry uses the same idempotent requestId", e);
        }
        log.info("Đã gửi yêu cầu SMS [IdempotencyKey: {}, RequestId: {}]",
                idempotencyKey, requestId);
        Map<String, Object> processVariables = new LinkedHashMap<>();
        processVariables.put("dispatchDecision", "SENT");
        processVariables.put("gatewayStatus", receipt.status());
        addIfPresent(processVariables, "gatewayMessageId", receipt.gatewayMessageId());
        addIfPresent(processVariables, "deliveryStatus", receipt.deliveryStatus());
        addIfPresent(processVariables, "sentAt", receipt.sentAt());
        return WorkerResult.completed(processVariables);
    }

    private SafetyControlClient.SafetyStatus checkSafetyOrHold(
            ActivatedJob job, String idempotencyKey) {
        try {
            return safetyControlClient.getStatus();
        } catch (RuntimeException e) {
            log.error("Không thể kiểm tra safety controls; chuyển sang Safe Hold "
                    + "[JobKey: {}, IdempotencyKey: {}]", job.getKey(), idempotencyKey, e);
            return null;
        }
    }

    private WorkerResult safeHold(
            SafetyControlClient.SafetyStatus status, String fallbackReason, String idempotencyKey) {
        String blockReason = status == null
                ? "SAFETY_STATUS_UNAVAILABLE"
                : status.blockReason();
        if (blockReason.isBlank()) {
            blockReason = fallbackReason;
        }

        Map<String, Object> processVariables = new LinkedHashMap<>();
        processVariables.put("dispatchDecision", "SAFE_HOLD");
        processVariables.put("blockReason", blockReason);
        processVariables.put("safeHoldTimestamp", Instant.now().toString());
        processVariables.put("resumeRequired", true);
        processVariables.put("safetyStatusAvailable", status != null);
        if (status != null) {
            processVariables.put("safetyKillSwitchActive", status.killSwitchActive());
            processVariables.put("safetyQueuePaused", status.queuePaused());
            addIfPresent(processVariables, "safetyLastUpdatedAt", status.lastUpdatedAt());
        }
        log.warn("SMS dispatch được chuyển sang Safe Hold [IdempotencyKey: {}, Reason: {}]",
                idempotencyKey, blockReason);
        return WorkerResult.safeHold(processVariables);
    }

    private static void addIfPresent(Map<String, Object> variables, String key, String value) {
        if (value != null && !value.isBlank()) {
            variables.put(key, value);
        }
    }
}